import './demoEnv.js';
import http from 'http';
import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { Server, Socket } from 'socket.io';
import app from '../app.js';
import { seedDatabase } from './seed.js';

const PORT = Number(process.env.PORT) || 5000;
const CLIENT_URL = process.env.CLIENT_URL || 'http://localhost:5173';

async function startDemo(): Promise<void> {
  console.log('=== CHOMP PRESENTATION DEMO MODE ===');
  console.log('Spinning up in-memory MongoDB replica set for live demo...');

  const replSet = await MongoMemoryReplSet.create({
    replSet: {
      count: 1,
      storageEngine: 'wiredTiger',
    },
  });

  const mongoUri = replSet.getUri();
  process.env.MONGO_URI = mongoUri;

  console.log('Connecting Mongoose to in-memory replica set...');
  await mongoose.connect(mongoUri);

  console.log('Pre-seeding 24 campus clubs and 10 demo accounts...');
  await seedDatabase(false);

  const server = http.createServer(app);
  const io = new Server(server, {
    cors: {
      origin: CLIENT_URL,
      credentials: true,
      methods: ['GET', 'POST'],
    },
  });

  io.on('connection', (socket: Socket) => {
    console.log(`Socket client connected: ${socket.id}`);
    socket.on('disconnect', () => {
      console.log(`Socket client disconnected: ${socket.id}`);
    });
  });

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(PORT, () => {
      server.off('error', reject);
      resolve();
    });
  });

  console.log(`Chomp demo backend is running on http://localhost:${PORT}`);
  console.log(`Connected to in-memory MongoDB replica set`);
  console.log(`Allowed frontend origin: ${CLIENT_URL}`);
  console.log('Ready for live presentation. Press Ctrl+C to terminate.');

  let isCleaningUp = false;
  async function cleanup(): Promise<void> {
    if (isCleaningUp) return;
    isCleaningUp = true;
    console.log('\nStopping in-memory demo server...');
    await io.close().catch(() => {});
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await mongoose.disconnect().catch(() => {});
    await replSet.stop().catch(() => {});
    console.log('In-memory database and server stopped cleanly. Goodbye!');
    process.exit(0);
  }

  process.on('SIGINT', () => {
    void cleanup();
  });
  process.on('SIGTERM', () => {
    void cleanup();
  });
}

startDemo().catch((error: unknown) => {
  console.error('Demo server startup failed with error:', error);
  process.exit(1);
});
