import 'dotenv/config';
import http from 'http';
import mongoose from 'mongoose';
import { Server, Socket } from 'socket.io';
import app from './app';

const CLIENT_URL = process.env.CLIENT_URL || 'http://localhost:5173';
const MONGO_URI = process.env.MONGO_URI || '';
const PORT = process.env.PORT || 5000;

let httpServer: http.Server | undefined;
let shuttingDown = false;

function readPort(): number {
  if (PORT === undefined) return 5000;

  const port = Number(PORT);
  if (port < 1 || port > 65535) {
    throw new Error('PORT must be an integer from 1 through 65535');
  }

  return port;
}

function listen(server: http.Server, port: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const onError = (error: Error) => {
      reject(error);
    };

    server.once('error', onError);
    server.listen(port, () => {
      server.off('error', onError);
      resolve();
    });
  });
}

async function shutdown(exitCode: number, io: Server | undefined): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;

  const forceShutdown = setTimeout(() => {
    httpServer?.closeAllConnections();
    process.exit(exitCode);
  }, 10000);
  try {
    if (io) {
      await io.close().catch((error) => {
        console.error('Failed to close socket.io: ', error);
      });
    } else if (httpServer) {
      await new Promise((resolve, reject) => httpServer!.close((error)=>error ? reject(error) : resolve(void 0)));
    }
    await mongoose.disconnect();
  } catch (error) {
    console.error('Failed to shutdown server: ', error);
  }
  clearTimeout(forceShutdown);
  process.exit(exitCode);
}

async function start(): Promise<void> {
  const port = readPort();
  mongoose.connection.on('error', (error: Error) => {
    console.error('MongoDB connection error: ', error);
  });
  mongoose.connection.on('connected', () => {
    console.log('Connected to MongoDB');
  });
  mongoose.connection.on('disconnected', () => {
    console.log('Disconnected from MongoDB');
  });
  try {
    await mongoose.connect(MONGO_URI);
  } catch (error) {
    console.error('Failed to connect to MongoDB: ', error);
    process.exit(1);
  }
  console.log('Connected to MongoDB successfully');

  const server = http.createServer(app);
  httpServer = server;
  const io = new Server(server, {
    cors: {
      origin: CLIENT_URL || 'http://localhost:5173',
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

  try {
    await listen(server, port);
  } catch (error) {
    console.error('Failed to listen on port: ', error);
    void shutdown(1, io);
    return;
  }

  console.log(`Server listening on port ${port}`);

  server.on('error', (error: Error) => {
    console.error('Server error:', error);
    void shutdown(1, io);
  });

  process.on('SIGINT', () => {
    void shutdown(0, io);
  });
  process.on('SIGTERM', () => {
    void shutdown(0, io);
  });
}

start().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
