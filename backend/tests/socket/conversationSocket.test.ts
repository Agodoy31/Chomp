import http from 'http';
import type { AddressInfo } from 'net';
import { afterAll, afterEach, beforeAll, describe, expect, test, jest } from '@jest/globals';
import { io as Client, type Socket as ClientSocket } from 'socket.io-client';
import { Types } from 'mongoose';
import app from '../../src/app';
import { connectTestDb, clearTestDb, closeTestDb } from '../helpers/db';
import { createSignedInStudent, TEST_STUDENT_PASSWORD } from '../messaging/routes/messagingRouteTestUtils';
import { User } from '../../src/user/models/User';
import { Conversation } from '../../src/messaging/models/Conversation';
import { ConversationParticipant } from '../../src/messaging/models/ConversationParticipant';
import { Message } from '../../src/messaging/models/Message';
import { closeSocketServer, getIO, initSocketServer } from '../../src/socket/socketServer';
import { registerConversationSocketHandlers } from '../../src/messaging/sockets/conversationSocket';
import type { JoinConversationRoomAck, LeaveConversationRoomAck } from '../../src/messaging/interfaces/messaging.events';

function nextEvent(client: ClientSocket, event: string): Promise<any> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      client.off(event, receive);
      reject(new Error(`missing event ${event}`));
    }, 4000);
    function receive(payload: unknown) {
      clearTimeout(timer);
      resolve(payload);
    }
    client.once(event, receive);
  });
}

async function join(client: ClientSocket, conversationId: string): Promise<JoinConversationRoomAck> {
  return client.timeout(4000).emitWithAck('chat:join_room', { conversationId });
}

describe('real conversation sockets', () => {
  let serverUrl: string;
  const clients: ClientSocket[] = [];

  beforeAll(async () => {
    await connectTestDb();
    await Promise.all([User.init(), Conversation.init(), ConversationParticipant.init(), Message.init()]);
    const server = http.createServer(app);
    initSocketServer(server, 'http://localhost:5173', [registerConversationSocketHandlers]);
    await new Promise<void>((resolve) => server.listen(0, () => resolve()));
    serverUrl = `http://localhost:${(server.address() as AddressInfo).port}`;
  }, 60000);

  afterEach(async () => {
    for (const client of clients) client.disconnect();
    clients.length = 0;
    getIO()?.disconnectSockets(true);
    await clearTestDb();
  });

  afterAll(async () => {
    await closeSocketServer();
    await closeTestDb();
  });

  async function connect(student: Awaited<ReturnType<typeof createSignedInStudent>>) {
    const login = await student.agent.post('/api/auth/login').send({
      email: student.user.email,
      password: TEST_STUDENT_PASSWORD,
    }).expect(200);
    const raw = login.headers['set-cookie'];
    const cookie = (Array.isArray(raw) ? raw[0] : raw).split(';')[0];
    const client = Client(serverUrl, {
      autoConnect: false,
      reconnection: false,
      transports: ['websocket'],
      extraHeaders: { cookie },
    });
    clients.push(client);
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('socket connection timed out')), 4000);
      client.once('connect', () => {
        clearTimeout(timer);
        resolve();
      });
      client.once('connect_error', (err) => {
        clearTimeout(timer);
        reject(err);
      });
      client.connect();
    });
    return client;
  }

  test('coordinates campus chat and evicts all removed student tabs', async () => {
    const danny = await createSignedInStudent({
      firstName: 'Danny',
      lastName: 'Wuerffel',
      email: 'dwuerffel@ufl.edu',
    });
    const alejandro = await createSignedInStudent({
      firstName: 'Alejandro',
      lastName: 'Gimenez',
      email: 'alejandro@ufl.edu',
    });
    const albert = await createSignedInStudent({
      firstName: 'Albert',
      lastName: 'Gator',
      email: 'albert@ufl.edu',
    });
    const created = await danny.agent.post('/api/conversations').send({
      type: 'GROUP',
      title: 'Marston Basement Study Group',
      participantIds: [alejandro.user._id.toString()],
    }).expect(201);
    const conversationId: string = created.body._id;
    const base = `/api/conversations/${conversationId}`;
    const room = `conversation:${conversationId}`;
    const d = await connect(danny);
    const m1 = await connect(alejandro);
    const m2 = await connect(alejandro);
    const a = await connect(albert);
    const unauthorized = { ok: false, code: 'ERR_CONVERSATION_NOT_FOUND', message: 'Conversation not found' };
    expect(await join(a, conversationId)).toEqual(unauthorized);
    expect(await join(a, new Types.ObjectId().toString())).toEqual(unauthorized);
    for (const client of [d, m1, m2]) {
      expect(await join(client, conversationId)).toEqual({ ok: true, conversationId });
    }
    expect(await join(d, conversationId)).toEqual({ ok: true, conversationId });
    expect(getIO()!.sockets.adapter.rooms.get(room)?.size).toBe(3);

    const outsiderMessages = jest.fn();
    a.on('message:created', outsiderMessages);
    const messageEvents = [d, m1, m2].map((client) => nextEvent(client, 'message:created'));
    const posted = await danny.agent.post(`${base}/messages`)
      .send({ text: 'Room 301 is available at noon' }).expect(201);
    expect(await Promise.all(messageEvents)).toEqual([posted.body, posted.body, posted.body]);
    expect(await Message.exists({ _id: posted.body._id })).not.toBeNull();

    const deletionEvent = nextEvent(m1, 'message:deleted');
    const removed = await danny.agent.delete(`${base}/messages/${posted.body._id}`).expect(200);
    expect(await deletionEvent).toEqual(removed.body);
    expect(removed.body.text).toBe('This message was deleted');
    expect(removed.body.removedAt).toEqual(expect.any(String));

    const renameEvent = nextEvent(m1, 'conversation:renamed');
    await danny.agent.patch(base).send({ title: '  Lake Alice Turtle Watchers  ' }).expect(200);
    expect(await renameEvent).toEqual({ conversationId, title: 'Lake Alice Turtle Watchers' });
    expect((await Conversation.findById(conversationId))?.title).toBe('Lake Alice Turtle Watchers');

    const additionEvent = nextEvent(d, 'participant:added');
    const inboxAdded = nextEvent(a, 'inbox:conversation_added');
    const addition = await danny.agent.post(`${base}/participants`)
      .send({ userIds: [albert.user._id.toString()] }).expect(200);
    expect(await additionEvent).toEqual({ conversationId, participants: addition.body });
    expect(await inboxAdded).toEqual({ conversationId });
    expect(outsiderMessages).not.toHaveBeenCalled();
    expect(getIO()!.sockets.adapter.rooms.get(room)?.has(a.id!)).toBe(false);
    expect(await join(a, conversationId)).toEqual({ ok: true, conversationId });

    const removalEvent = nextEvent(d, 'participant:removed');
    const inboxRemoved = [m1, m2].map((client) => nextEvent(client, 'inbox:conversation_removed'));
    const forbidden = jest.fn();
    for (const client of [m1, m2]) {
      client.on('participant:removed', forbidden);
      client.on('message:created', forbidden);
    }
    const targetId = alejandro.user._id.toString();
    await danny.agent.delete(`${base}/participants/${targetId}`).expect(200);
    expect(await removalEvent).toEqual({ conversationId, userId: targetId });
    expect(await Promise.all(inboxRemoved)).toEqual([{ conversationId }, { conversationId }]);
    for (const client of [m1, m2]) {
      const serverSocket = getIO()!.sockets.sockets.get(client.id!)!;
      expect(serverSocket.rooms.has(room)).toBe(false);
      expect(serverSocket.rooms.has(`user:${targetId}`)).toBe(true);
      expect(await join(client, conversationId)).toEqual(unauthorized);
    }
    expect(await ConversationParticipant.exists({ conversationId, userId: targetId })).toBeNull();
    const remainingMessage = nextEvent(a, 'message:created');
    await danny.agent.post(`${base}/messages`).send({ text: 'Meet by Lake Alice' }).expect(201);
    expect(await remainingMessage).toMatchObject({ text: 'Meet by Lake Alice' });
    for (const client of [m1, m2]) expect(await join(client, conversationId)).toEqual(unauthorized);
    expect(forbidden).not.toHaveBeenCalled();

    const leave: LeaveConversationRoomAck = await a.timeout(4000)
      .emitWithAck('chat:leave_room', { conversationId });
    expect(leave).toEqual({ ok: true, conversationId });
    expect(getIO()!.sockets.adapter.rooms.get(room)?.has(a.id!)).toBe(false);
    a.emit('chat:leave_room', { conversationId });
    expect(await join(a, conversationId)).toEqual({ ok: true, conversationId });
    a.disconnect();
    const reconnected = await connect(albert);
    expect(getIO()!.sockets.sockets.get(reconnected.id!)!.rooms.has(room)).toBe(false);
    expect(await join(reconnected, conversationId)).toEqual({ ok: true, conversationId });
  }, 60000);
});
