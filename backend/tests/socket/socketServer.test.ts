import http from 'http';
import type { AddressInfo } from 'net';
import { afterAll, afterEach, beforeAll, describe, expect, test } from '@jest/globals';
import { io as Client, type Socket as ClientSocket } from 'socket.io-client';
import app from '../../src/app';
import { clearTestDb, closeTestDb, connectTestDb } from '../helpers/db';
import { closeSocketServer, initSocketServer } from '../../src/socket/socketServer';

describe('Socket Server Handshake Authentication', () => {
  let server: http.Server;
  let serverUrl: string;

  beforeAll(async () => {
    await connectTestDb();
    server = http.createServer(app);
    await new Promise<void>((resolve) => {
      server.listen(0, () => resolve());
    });
    const address = server.address() as AddressInfo;
    serverUrl = `http://localhost:${address.port}`;
    initSocketServer(server, serverUrl);
  }, 60000);

  afterEach(async () => {
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
    client.disconnect();
  });

  test('Rejects handshake when session cookie has invalid signature', async () => {
    const client: ClientSocket = Client(serverUrl, {
      autoConnect: false,
      transports: ['websocket'],
      extraHeaders: {
        cookie: 'chomp.sid=s%3Ainvalid_session_signature',
      },
    });

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
    client.disconnect();
  });
});
