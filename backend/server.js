const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
app.use(cors());

// Health check & status endpoints
app.get('/', (req, res) => {
  res.status(200).send('P2P Web Share Signaling Server is running.');
});

app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', timestamp: new Date() });
});

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*', // In production, replace with specific frontend domains
    methods: ['GET', 'POST']
  }
});

// Map to track rooms and their connected sockets
const socketRooms = new Map();

io.on('connection', (socket) => {
  console.log(`[Socket] Connected: ${socket.id}`);

  // Join a file sharing room
  socket.on('join-room', (roomId) => {
    if (!roomId) return;
    
    console.log(`[Socket] ${socket.id} joining room: ${roomId}`);
    socket.join(roomId);
    socketRooms.set(socket.id, roomId);

    // Notify other peers in the room that a new peer has joined
    socket.to(roomId).emit('peer-joined', { peerId: socket.id });

    // Send the list of existing peers in the room back to the sender
    const room = io.sockets.adapter.rooms.get(roomId);
    const peerIds = room ? Array.from(room).filter(id => id !== socket.id) : [];
    socket.emit('room-peers', { peerIds });
  });

  // Relay WebRTC signaling messages (offer, answer, candidate) to a specific target peer
  socket.on('signal', ({ targetId, data }) => {
    if (!targetId || !data) return;
    
    console.log(`[Socket] Relay signal from ${socket.id} to ${targetId}`);
    io.to(targetId).emit('signal', {
      senderId: socket.id,
      data
    });
  });

  // Handle client disconnection
  socket.on('disconnect', () => {
    console.log(`[Socket] Disconnected: ${socket.id}`);
    const roomId = socketRooms.get(socket.id);
    if (roomId) {
      // Notify other peers in the room
      socket.to(roomId).emit('peer-disconnected', { peerId: socket.id });
      socketRooms.delete(socket.id);
    }
  });
});

const PORT = process.env.PORT || 4000;
server.listen(PORT, () => {
  console.log(`[Server] WebRTC Signaling Server listening on port ${PORT}`);
});
