import 'dotenv/config';
import http from 'http';
import mongoose from 'mongoose';
import { closeSocketServer, initSocketServer } from './socket/socketServer';
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

async function shutdown(exitCode: number): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;

  const forceShutdown = setTimeout(() => {
    httpServer?.closeAllConnections();
    process.exit(exitCode);
  }, 10000);
  try {
    await closeSocketServer().catch((error: unknown) => {
      console.error('Failed to close socket server: ', error);
    });
    if (httpServer && httpServer.listening) {
      await new Promise<void>((resolve, reject) => {
        httpServer!.close((error) => (error ? reject(error) : resolve()));
      });
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
  initSocketServer(server, CLIENT_URL);

  try {
    await listen(server, port);
  } catch (error) {
    console.error('Failed to listen on port: ', error);
    void shutdown(1);
    return;
  }

  console.log(`Server listening on port ${port}`);

  server.on('error', (error: Error) => {
    console.error('Server error:', error);
    void shutdown(1);
  });

  process.on('SIGINT', () => {
    void shutdown(0);
  });
  process.on('SIGTERM', () => {
    void shutdown(0);
  });
}

start().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
