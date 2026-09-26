const http = require('http');
require('dotenv').config();
const { Server } = require('socket.io');
const app = require('./app');

const PORT = process.env.PORT || 5000;
const server = http.createServer(app);

// Socket.io initialization
const io = new Server(server, {
  cors: {
    origin: process.env.CLIENT_URL || 'http://localhost:5173',
    methods: ['GET', 'POST'],
  },
});

io.on('connection', (socket) => {
  console.log(`Socket client connected: ${socket.id}`);

  socket.on('disconnect', () => {
    console.log(`Socket client disconnected: ${socket.id}`);
  });
});

server.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
