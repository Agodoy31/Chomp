import type { Socket } from 'socket.io';

export interface AuthenticatedSocketData {
  userId: string;
}

export type AuthenticatedSocket = Socket<
  Record<string, never>,
  Record<string, never>,
  Record<string, never>,
  AuthenticatedSocketData
>;

export type SocketHandlerRegistrar = (socket: Socket) => void;
