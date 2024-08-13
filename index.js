const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const { v4: uuidv4 } = require('uuid');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

app.use(express.static('public'));

const users = new Map();
const rooms = new Map();

io.on('connection', (socket) => {
    console.log('A user connected:', socket.id);

    socket.on('register', ({ username, profilePic }) => {
        console.log('User registered:', username);
        users.set(socket.id, { username, profilePic, room: null });
        socket.emit('registered', { id: socket.id, username, profilePic });
    });

    socket.on('createRoom', ({ name, background }) => {
        const roomId = uuidv4();
        rooms.set(roomId, { 
            id: roomId,
            name: name,
            users: new Set(), 
            seats: new Array(5).fill(null),
            background: background
        });
        console.log('Room created:', roomId);
        socket.emit('roomCreated', roomId);
    });

    socket.on('getRooms', () => {
        const roomsList = Array.from(rooms.entries()).map(([id, room]) => ({
            id,
            name: room.name,
            usersCount: room.users.size
        }));
        socket.emit('roomsList', roomsList);
    });

    socket.on('joinRoom', (roomId) => {
        console.log('User joining room:', socket.id, roomId);
        const user = users.get(socket.id);
        const room = rooms.get(roomId);
        if (room && user) {
            user.room = roomId;
            room.users.add(socket.id);
            socket.join(roomId);
            io.to(roomId).emit('userJoined', { userId: socket.id, username: user.username });
            socket.emit('roomJoined', { 
                roomId, 
                roomName: room.name,
                users: Array.from(room.users).map(id => ({ id, ...users.get(id) })), 
                seats: room.seats,
                background: room.background
            });
        } else {
            socket.emit('error', 'Unable to join room');
        }
    });

    socket.on('takeSeat', (seatIndex) => {
        const user = users.get(socket.id);
        if (user && user.room) {
            const room = rooms.get(user.room);
            if (room && room.seats[seatIndex] === null) {
                room.seats[seatIndex] = socket.id;
                io.to(user.room).emit('seatTaken', { seatIndex, userId: socket.id });
            }
        }
    });

    socket.on('leaveSeat', () => {
        const user = users.get(socket.id);
        if (user && user.room) {
            const room = rooms.get(user.room);
            if (room) {
                const seatIndex = room.seats.indexOf(socket.id);
                if (seatIndex !== -1) {
                    room.seats[seatIndex] = null;
                    io.to(user.room).emit('seatLeft', { seatIndex, userId: socket.id });
                }
            }
        }
    });

    socket.on('sendMessage', (message) => {
        const user = users.get(socket.id);
        if (user && user.room) {
            console.log('Message sent:', user.username, message);
            io.to(user.room).emit('newMessage', { 
                userId: socket.id, 
                username: user.username, 
                message,
                profilePic: user.profilePic
            });
        }
    });

    socket.on('leaveRoom', () => {
        const user = users.get(socket.id);
        if (user && user.room) {
            const room = rooms.get(user.room);
            if (room) {
                room.users.delete(socket.id);
                const seatIndex = room.seats.indexOf(socket.id);
                if (seatIndex !== -1) {
                    room.seats[seatIndex] = null;
                    io.to(user.room).emit('seatLeft', { seatIndex, userId: socket.id });
                }
                io.to(user.room).emit('userLeft', { userId: socket.id, username: user.username });
                socket.leave(user.room);
                user.room = null;
            }
        }
    });

    socket.on('disconnect', () => {
        console.log('User disconnected:', socket.id);
        const user = users.get(socket.id);
        if (user && user.room) {
            const room = rooms.get(user.room);
            if (room) {
                room.users.delete(socket.id);
                const seatIndex = room.seats.indexOf(socket.id);
                if (seatIndex !== -1) {
                    room.seats[seatIndex] = null;
                    io.to(user.room).emit('seatLeft', { seatIndex, userId: socket.id });
                }
                io.to(user.room).emit('userLeft', { userId: socket.id, username: user.username });
            }
        }
        users.delete(socket.id);
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));