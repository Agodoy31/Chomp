import http from 'http';
import type { AddressInfo } from 'net';
import { afterAll, afterEach, beforeAll, describe, expect, test } from '@jest/globals';
import request from 'supertest';
import { io as Client, type Socket as ClientSocket } from 'socket.io-client';
import type { Socket } from 'socket.io';
import app from '../../src/app';
import { clearTestDb, closeTestDb, connectTestDb } from '../helpers/db';
import { User } from '../../src/user/models/User';
import { closeSocketServer, evictUserFromRoom, getIO, getUserRoom, initSocketServer } from '../../src/socket/socketServer';
import type { SocketHandlerRegistrar } from '../../src/socket/socket.interfaces';

describe('Socket Server Handshake Authentication', () => {
  let server: http.Server;
  let serverUrl: string;
  const activeClients: ClientSocket[] = [];
  const connectedServerSockets: Socket[] = [];

  const mockRegistrar: SocketHandlerRegistrar = (socket: Socket) => {
    connectedServerSockets.push(socket);
  };

  beforeAll(async () => {
    await connectTestDb();
    await User.init();
    server = http.createServer(app);
    await new Promise<void>((resolve) => {
      server.listen(0, () => resolve());
    });
    const address = server.address() as AddressInfo;
    serverUrl = `http://localhost:${address.port}`;
    initSocketServer(server, serverUrl, [mockRegistrar]);
  }, 60000);

  afterEach(async () => {
    for (const client of activeClients) {
      if (client.connected) {
        client.disconnect();
      }
    }
    activeClients.length = 0;
    connectedServerSockets.length = 0;
    await clearTestDb();
  });

  afterAll(async () => {
    await closeSocketServer();
    await closeTestDb();
  });

  test('Rejects handshake when session cookie is missing', async () => {
    const client: ClientSocket = Client(serverUrl, {
      autoConnect: false,
      transports: ['websocket'],
    });
    activeClients.push(client);

    const errorPromise = new Promise<string>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Timed out waiting for handshake rejection')), 4000);
      client.on('connect_error', (err) => {
        clearTimeout(timer);
        resolve(err.message);
      });
      client.on('connect', () => {
        clearTimeout(timer);
        reject(new Error('Socket unexpectedly connected'));
      });
    });

    client.connect();
    const errorMessage = await errorPromise;
    expect(errorMessage).toBe('ERR_AUTHENTICATION_REQUIRED');
    expect(client.connected).toBe(false);
  });

  test('Rejects handshake when session cookie has invalid signature', async () => {
    const client: ClientSocket = Client(serverUrl, {
      autoConnect: false,
      transports: ['websocket'],
      extraHeaders: {
        cookie: 'chomp.sid=s%3Ainvalid_session_signature',
      },
    });
    activeClients.push(client);

    const errorPromise = new Promise<string>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Timed out waiting for handshake rejection')), 4000);
      client.on('connect_error', (err) => {
        clearTimeout(timer);
        resolve(err.message);
      });
      client.on('connect', () => {
        clearTimeout(timer);
        reject(new Error('Socket unexpectedly connected'));
      });
    });

    client.connect();
    const errorMessage = await errorPromise;
    expect(errorMessage).toBe('ERR_AUTHENTICATION_REQUIRED');
    expect(client.connected).toBe(false);
  });

  test('Accepts authenticated session and runs registered handler callbacks', async () => {
    const registerRes = await request(app)
      .post('/api/auth/register')
      .send({
        email: 'newell3am@ufl.edu',
        password: 'NightowlPassword123!',
        firstName: 'Newell',
        lastName: 'Nightowl',
      });

    expect(registerRes.status).toBe(201);
    const rawCookie = registerRes.headers['set-cookie'];
    expect(rawCookie).toBeDefined();
    const sessionCookie = Array.isArray(rawCookie) ? rawCookie[0].split(';')[0] : rawCookie.split(';')[0];

    const client: ClientSocket = Client(serverUrl, {
      autoConnect: false,
      transports: ['websocket'],
      extraHeaders: {
        cookie: sessionCookie,
      },
    });
    activeClients.push(client);

    const connectPromise = new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Timed out waiting for connection')), 4000);
      client.on('connect', () => {
        clearTimeout(timer);
        resolve();
      });
      client.on('connect_error', (err) => {
        clearTimeout(timer);
        reject(err);
      });
    });

    client.connect();
    await connectPromise;

    expect(client.connected).toBe(true);
    expect(connectedServerSockets.length).toBe(1);
    const registeredUserId = registerRes.body.user.id;
    expect(connectedServerSockets[0].data.userId).toBe(registeredUserId);
  });

  test('Automatically joins authenticated socket to personal user room', async () => {
    const registerRes = await request(app)
      .post('/api/auth/register')
      .send({
        email: 'albert@ufl.edu',
        password: 'AlbertPassword123!',
        firstName: 'Albert',
        lastName: 'Gator',
      });

    expect(registerRes.status).toBe(201);
    const rawCookie = registerRes.headers['set-cookie'];
    expect(rawCookie).toBeDefined();
    const sessionCookie = Array.isArray(rawCookie) ? rawCookie[0].split(';')[0] : rawCookie.split(';')[0];

    const client: ClientSocket = Client(serverUrl, {
      autoConnect: false,
      transports: ['websocket'],
      extraHeaders: {
        cookie: sessionCookie,
      },
    });
    activeClients.push(client);

    const connectPromise = new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Timed out waiting for connection')), 4000);
      client.on('connect', () => {
        clearTimeout(timer);
        resolve();
      });
      client.on('connect_error', (err) => {
        clearTimeout(timer);
        reject(err);
      });
    });

    client.connect();
    await connectPromise;

    const ioInstance = getIO();
    expect(ioInstance).not.toBeNull();
    const userId = registerRes.body.user.id;
    const userRoom = ioInstance?.sockets.adapter.rooms.get(getUserRoom(userId));
    expect(userRoom).toBeDefined();
    expect(userRoom?.has(client.id)).toBe(true);
  });

  test('Evicts user sockets from specified room', async () => {
    const registerRes = await request(app)
      .post('/api/auth/register')
      .send({
        email: 'turlington_screamer@ufl.edu',
        password: 'ScreamerPassword123!',
        firstName: 'Dennis',
        lastName: 'Heckler',
      });

    expect(registerRes.status).toBe(201);
    const rawCookie = registerRes.headers['set-cookie'];
    expect(rawCookie).toBeDefined();
    const sessionCookie = Array.isArray(rawCookie) ? rawCookie[0].split(';')[0] : rawCookie.split(';')[0];

    const client: ClientSocket = Client(serverUrl, {
      autoConnect: false,
      transports: ['websocket'],
      extraHeaders: {
        cookie: sessionCookie,
      },
    });
    activeClients.push(client);

    const connectPromise = new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Timed out waiting for connection')), 4000);
      client.on('connect', () => {
        clearTimeout(timer);
        resolve();
      });
      client.on('connect_error', (err) => {
        clearTimeout(timer);
        reject(err);
      });
    });

    client.connect();
    await connectPromise;

    const ioInstance = getIO();
    expect(ioInstance).not.toBeNull();
    const userId = registerRes.body.user.id;
    const targetRoom = 'conversation:turlington_debate';

    const serverSocket = connectedServerSockets.find(
      (socket) => socket.data.userId === userId
    );
    expect(serverSocket).toBeDefined();
    await serverSocket?.join(targetRoom);

    expect(ioInstance?.sockets.adapter.rooms.get(targetRoom)?.has(client.id)).toBe(true);

    evictUserFromRoom(userId, targetRoom);

    const roomAfterEvict = ioInstance?.sockets.adapter.rooms.get(targetRoom);
    expect(roomAfterEvict?.has(client.id) ?? false).toBe(false);
  });
});
