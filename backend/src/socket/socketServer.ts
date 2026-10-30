import http from 'http';
import mongoose from 'mongoose';
import { Server } from 'socket.io';
import { sessionMiddleware } from '../sessions/session';
import type { SocketHandlerRegistrar } from './socket.interfaces';

let io: Server | null = null;

export const getUserRoom = (userId: string): string => `user:${userId}`;

export const getIO = (): Server | null => io;

export const closeSocketServer = async (): Promise<void> => {
  if (io) {
    const activeServer = io;
    io = null;
    await activeServer.close();
  }
};

export const evictUserFromRoom = (userId: string, room: string): void => {
  if (!io) {
    return;
  }
  io.in(getUserRoom(userId)).socketsLeave(room);
};

export const initSocketServer = (
  httpServer: http.Server,
  clientUrl: string,
  registrars: SocketHandlerRegistrar[] = []
): Server => {
  if (io) {
    return io;
  }

  const server = new Server(httpServer, {
    cors: {
      origin: clientUrl,
      credentials: true,
      methods: ['GET', 'POST'],
    },
  });

  server.engine.use(sessionMiddleware);

  server.use((socket, next) => {
    const userId = socket.request.session?.userId;
    if (!userId || !mongoose.isObjectIdOrHexString(userId)) {
      return next(new Error('ERR_AUTHENTICATION_REQUIRED'));
    }
    socket.data.userId = userId;
    next();
  });

  server.on('connection', (socket) => {
    const userRoom = getUserRoom(socket.data.userId);
    void socket.join(userRoom);
    for (const registrar of registrars) {
      registrar(socket);
    }
  });

  io = server;
  return io;
};
