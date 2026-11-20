import http from 'http';
import type { AddressInfo } from 'net';
import { afterAll, afterEach, beforeAll, describe, expect, test } from '@jest/globals';
import request from 'supertest';
import { io as Client, type Socket as ClientSocket } from 'socket.io-client';
import type { Socket } from 'socket.io';
import app from '../../src/app';
import { clearTestDb, closeTestDb, connectTestDb } from '../helpers/db';
import { User } from '../../src/user/models/User';
import {
  closeSocketServer,
  evictRoom,
  evictUserFromRoom,
  getConversationRoom,
  getIO,
  getUserRoom,
  initSocketServer,
} from '../../src/socket/socketServer';
import { messagingPublisher } from '../../src/messaging/sockets/messagingPublisher';
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

  const connectAuthenticatedClient = async (
    rawCookie: string | string[]
  ): Promise<ClientSocket> => {
    const sessionCookie = Array.isArray(rawCookie)
      ? rawCookie[0].split(';')[0]
      : rawCookie.split(';')[0];
    const client: ClientSocket = Client(serverUrl, {
      autoConnect: false,
      transports: ['websocket'],
      extraHeaders: { cookie: sessionCookie },
    });
    activeClients.push(client);
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error('Timed out waiting for connection')),
        4000
      );
      client.on('connect', () => {
        clearTimeout(timer);
        resolve();
      });
      client.on('connect_error', (err) => {
        clearTimeout(timer);
        reject(err);
      });
      client.connect();
    });
    return client;
  };

  test('Evicts all sockets from a room while leaving other rooms intact', async () => {
    const [firstRes, secondRes] = await Promise.all([
      request(app).post('/api/auth/register').send({
        email: 'reitz_bowler@ufl.edu',
        password: 'BowlerPassword123!',
        firstName: 'Reitz',
        lastName: 'Bowler',
      }),
      request(app).post('/api/auth/register').send({
        email: 'sw_rec_lifter@ufl.edu',
        password: 'LifterPassword123!',
        firstName: 'Southwest',
        lastName: 'Lifter',
      }),
    ]);

    expect(firstRes.status).toBe(201);
    expect(secondRes.status).toBe(201);

    const [client1, client2] = await Promise.all([
      connectAuthenticatedClient(firstRes.headers['set-cookie']),
      connectAuthenticatedClient(secondRes.headers['set-cookie']),
    ]);

    const targetRoom = 'conversation:marston_study_room';
    const otherRoom = 'conversation:lib_west_quiet_floor';
    const socket1 = connectedServerSockets.find((s) => s.data.userId === firstRes.body.user.id);
    const socket2 = connectedServerSockets.find((s) => s.data.userId === secondRes.body.user.id);
    await socket1?.join(targetRoom);
    await socket2?.join(targetRoom);
    await socket2?.join(otherRoom);

    evictRoom(targetRoom);

    const ioInstance = getIO();
    expect(ioInstance?.sockets.adapter.rooms.get(targetRoom)?.size ?? 0).toBe(0);
    expect(ioInstance?.sockets.adapter.rooms.get(otherRoom)?.has(client2.id)).toBe(true);
    expect(ioInstance?.sockets.adapter.rooms.get(getUserRoom(firstRes.body.user.id))?.has(client1.id)).toBe(true);
  });

  test('conversationDeleted evicts room and emits inbox:conversation_removed without participant:removed', async () => {
    const [firstRes, secondRes] = await Promise.all([
      request(app).post('/api/auth/register').send({
        email: 'plaza_hammock@ufl.edu',
        password: 'HammockPassword123!',
        firstName: 'Plaza',
        lastName: 'Student',
      }),
      request(app).post('/api/auth/register').send({
        email: 'century_tower@ufl.edu',
        password: 'TowerPassword123!',
        firstName: 'Century',
        lastName: 'Bell',
      }),
    ]);

    expect(firstRes.status).toBe(201);
    expect(secondRes.status).toBe(201);

    const [client1, client2] = await Promise.all([
      connectAuthenticatedClient(firstRes.headers['set-cookie']),
      connectAuthenticatedClient(secondRes.headers['set-cookie']),
    ]);

    const conversationId = '507f1f77bcf86cd799439099';
    const conversationRoom = getConversationRoom(conversationId);
    const socket1 = connectedServerSockets.find((s) => s.data.userId === firstRes.body.user.id);
    const socket2 = connectedServerSockets.find((s) => s.data.userId === secondRes.body.user.id);
    await socket1?.join(conversationRoom);
    await socket2?.join(conversationRoom);

    let participantRemovedFired = false;
    client1.on('participant:removed', () => {
      participantRemovedFired = true;
    });
    client2.on('participant:removed', () => {
      participantRemovedFired = true;
    });

    const inboxPromises = Promise.all([
      waitForInboxRemoved(client1),
      waitForInboxRemoved(client2),
    ]);

    messagingPublisher.conversationDeleted(conversationId, [
      firstRes.body.user.id,
      secondRes.body.user.id,
    ]);

    const [payload1, payload2] = await inboxPromises;
    expect(payload1).toEqual({ conversationId });
    expect(payload2).toEqual({ conversationId });
    expect(participantRemovedFired).toBe(false);

    const ioInstance = getIO();
    expect(ioInstance?.sockets.adapter.rooms.get(conversationRoom)?.size ?? 0).toBe(0);
  });
});

function waitForInboxRemoved(client: ClientSocket): Promise<{ conversationId: string }> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error('Timed out waiting for inbox:conversation_removed')),
      4000
    );
    client.once('inbox:conversation_removed', (payload: { conversationId: string }) => {
      clearTimeout(timer);
      resolve(payload);
    });
  });
}


