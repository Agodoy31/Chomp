import { afterAll, beforeAll, describe, expect, it, jest } from '@jest/globals';
import request from 'supertest';
import { Types } from 'mongoose';
import app from '../../../src/app';
import { clearTestDb, closeTestDb, connectTestDb } from '../../helpers/db';
import { Conversation, ConversationType } from '../../../src/messaging/models/Conversation';
import { ConversationParticipant, ParticipantPermission } from '../../../src/messaging/models/ConversationParticipant';
import { Message } from '../../../src/messaging/models/Message';
import { User } from '../../../src/user/models/User';
import { Club } from '../../../src/clubs/model/clubModel';
import { createSignedInStudent, SignedInStudent } from './messagingRouteTestUtils';
import * as conversationService from '../../../src/messaging/services/conversation.service';
import * as messageService from '../../../src/messaging/services/message.service';
import { deleteMessage } from '../../../src/messaging/services/message.service';

let studentA: SignedInStudent;
let studentB: SignedInStudent;
let studentC: SignedInStudent;

let directConversationId: string;
let groupConversationId: string;
let channelConversationId: string;
let clubId: string;

beforeAll(async () => {
  await connectTestDb();
  await Promise.all([
    Club.init(),
    Conversation.init(),
    ConversationParticipant.init(),
    Message.init(),
    User.init(),
  ]);

  studentA = await createSignedInStudent({
    firstName: 'Century',
    lastName: 'Tower',
    email: 'carillon@ufl.edu',
  });
  studentB = await createSignedInStudent({
    firstName: 'Dennis',
    lastName: 'Heckler',
    email: 'turlington_screamer@ufl.edu',
  });
  studentC = await createSignedInStudent({
    firstName: 'Newell',
    lastName: 'Nightowl',
    email: 'newell3am@ufl.edu',
  });
}, 60000);

afterAll(async () => {
  await clearTestDb();
  await closeTestDb();
});

describe('conversation route authentication guards', () => {
  it('rejects unauthenticated GET /api/conversations with 401', async () => {
    const res = await request(app).get('/api/conversations');
    expect(res.status).toBe(401);
    expect(res.body).toEqual({
      message: 'ERR_REQUIRE_AUTH',
      redirectTo: '/login',
    });
  });

  it('rejects unauthenticated POST /api/conversations with 401', async () => {
    const res = await request(app)
      .post('/api/conversations')
      .send({ type: 'DIRECT', recipientId: '507f1f77bcf86cd799439011' });
    expect(res.status).toBe(401);
    expect(res.body).toEqual({
      message: 'ERR_REQUIRE_AUTH',
      redirectTo: '/login',
    });
  });

  it('rejects unauthenticated GET /api/conversations/:id with 401', async () => {
    const res = await request(app).get('/api/conversations/507f1f77bcf86cd799439011');
    expect(res.status).toBe(401);
    expect(res.body).toEqual({
      message: 'ERR_REQUIRE_AUTH',
      redirectTo: '/login',
    });
  });

  it('rejects unauthenticated GET and POST message routes with 401', async () => {
    const getRes = await request(app).get('/api/conversations/507f1f77bcf86cd799439011/messages');
    expect(getRes.status).toBe(401);
    expect(getRes.body).toEqual({
      message: 'ERR_REQUIRE_AUTH',
      redirectTo: '/login',
    });

    const postRes = await request(app)
      .post('/api/conversations/507f1f77bcf86cd799439011/messages')
      .send({ text: 'Hello from unauthenticated client' });
    expect(postRes.status).toBe(401);
    expect(postRes.body).toEqual({
      message: 'ERR_REQUIRE_AUTH',
      redirectTo: '/login',
    });
  });
});

describe('empty conversation inbox', () => {
  it('returns empty array when student has no active conversations', async () => {
    const res = await studentA.agent
      .get('/api/conversations')
      .expect(200);

    expect(res.body).toEqual([]);
  });
});

describe('POST /api/conversations', () => {
  it('creates new direct conversation returning 201 and reopens existing returning 200 without isNew', async () => {
    const first = await studentA.agent
      .post('/api/conversations')
      .send({
        type: 'DIRECT',
        recipientId: studentB.user._id.toString(),
      });

    expect(first.status).toBe(201);
    expect(first.body._id).toBeDefined();
    expect(first.body.type).toBe('DIRECT');
    expect(first.body.displayName).toBe('Dennis Heckler');
    expect(first.body.isNew).toBeUndefined();
    expect(first.body.dmPairKey).toBeUndefined();
    expect(first.body.__v).toBeUndefined();
    expect(first.body.participants).toHaveLength(2);

    directConversationId = first.body._id;

    const second = await studentB.agent
      .post('/api/conversations')
      .send({
        type: 'DIRECT',
        recipientId: studentA.user._id.toString(),
      });

    expect(second.status).toBe(200);
    expect(second.body._id).toBe(directConversationId);
    expect(second.body.displayName).toBe('Century Tower');
    expect(second.body.isNew).toBeUndefined();
  });

  it('creates group conversation returning 201 with moderator role for creator and distinct ids on duplicate requests', async () => {
    const payload = {
      type: 'GROUP',
      title: '  French Fries Monument Preservation Society  ',
      participantIds: [
        studentB.user._id.toString(),
        studentC.user._id.toString(),
      ],
    };

    const first = await studentA.agent
      .post('/api/conversations')
      .send(payload);

    expect(first.status).toBe(201);
    expect(first.body._id).toBeDefined();
    expect(first.body.type).toBe('GROUP');
    expect(first.body.displayName).toBe('French Fries Monument Preservation Society');
    expect(first.body.isNew).toBeUndefined();
    expect(first.body.participants).toHaveLength(3);

    groupConversationId = first.body._id;

    const creatorEntry = first.body.participants.find(
      (p: { userId: { _id: string } }) => p.userId._id === studentA.user._id.toString()
    );
    expect(creatorEntry?.permission).toBe(ParticipantPermission.MODERATE);

    const second = await studentA.agent
      .post('/api/conversations')
      .send(payload);

    expect(second.status).toBe(201);
    expect(second.body._id).not.toBe(first.body._id);
  });

  it('rejects missing or whitespace group title with 400 and ERR_TITLE_REQUIRED', async () => {
    const res = await studentA.agent
      .post('/api/conversations')
      .send({
        type: 'GROUP',
        title: '   ',
        participantIds: [studentB.user._id.toString()],
      });

    expect(res.status).toBe(400);
    expect(res.body).toEqual({
      code: 'ERR_TITLE_REQUIRED',
      message: 'Title is required',
    });
  });

  it('rejects channel creation attempt with 400 and ERR_CHANNEL_CREATION_NOT_SUPPORTED', async () => {
    const res = await studentA.agent
      .post('/api/conversations')
      .send({
        type: 'CHANNEL',
        title: 'announcements',
      });

    expect(res.status).toBe(400);
    expect(res.body).toEqual({
      code: 'ERR_CHANNEL_CREATION_NOT_SUPPORTED',
      message: 'Club channels cannot be created through this endpoint',
    });
  });

  it('rejects self dm with ERR_MESSAGE_SELF solo group with ERR_INSUFFICIENT_PARTICIPANTS and missing user with ERR_USER_NOT_FOUND', async () => {
    const selfRes = await studentA.agent
      .post('/api/conversations')
      .send({
        type: 'DIRECT',
        recipientId: studentA.user._id.toString(),
      });
    expect(selfRes.status).toBe(400);
    expect(selfRes.body.code).toBe('ERR_MESSAGE_SELF');

    const soloRes = await studentA.agent
      .post('/api/conversations')
      .send({
        type: 'GROUP',
        title: 'Norman Hall Coffee Club',
        participantIds: [studentA.user._id.toString()],
      });
    expect(soloRes.status).toBe(400);
    expect(soloRes.body.code).toBe('ERR_INSUFFICIENT_PARTICIPANTS');

    const missingId = new Types.ObjectId().toString();
    const missingRes = await studentA.agent
      .post('/api/conversations')
      .send({
        type: 'DIRECT',
        recipientId: missingId,
      });
    expect(missingRes.status).toBe(404);
    expect(missingRes.body.code).toBe('ERR_USER_NOT_FOUND');
  });

  it('returns 500 when service encounters unexpected internal failure', async () => {
    jest.spyOn(conversationService, 'createDirectConversation').mockRejectedValueOnce(
      new Error('Replica set primary failover')
    );

    const res = await studentA.agent
      .post('/api/conversations')
      .send({
        type: 'DIRECT',
        recipientId: studentB.user._id.toString(),
      });

    expect(res.status).toBe(500);
    expect(res.body.code).toBe('ERR_SERVER_ERROR');
    jest.restoreAllMocks();
  });
});

describe('GET /api/conversations/:id', () => {
  it('returns direct and group conversation details with participants and permissions', async () => {
    const directRes = await studentA.agent
      .get(`/api/conversations/${directConversationId}`)
      .expect(200);

    expect(directRes.body._id).toBe(directConversationId);
    expect(directRes.body.type).toBe('DIRECT');
    expect(directRes.body.displayName).toBe('Dennis Heckler');
    expect(directRes.body.participants).toHaveLength(2);

    const groupRes = await studentA.agent
      .get(`/api/conversations/${groupConversationId}`)
      .expect(200);

    expect(groupRes.body._id).toBe(groupConversationId);
    expect(groupRes.body.type).toBe('GROUP');
    expect(groupRes.body.displayName).toBe('French Fries Monument Preservation Society');
    expect(groupRes.body.participants).toHaveLength(3);
  });

  it('rejects non-participant with 404 and ERR_CONVERSATION_NOT_FOUND', async () => {
    const res = await studentC.agent
      .get(`/api/conversations/${directConversationId}`)
      .expect(404);

    expect(res.body).toEqual({
      code: 'ERR_CONVERSATION_NOT_FOUND',
      message: 'Conversation not found',
    });
  });

  it('rejects malformed conversation id with 400 and ERR_INVALID_INPUT', async () => {
    const res = await studentA.agent
      .get('/api/conversations/not-a-valid-object-id')
      .expect(400);

    expect(res.body).toEqual({
      code: 'ERR_INVALID_INPUT',
      message: 'Valid conversationId is required',
    });
  });

  it('returns 500 when service encounters unexpected internal failure', async () => {
    jest.spyOn(conversationService, 'getConversationDetails').mockRejectedValueOnce(
      new Error('Replica set primary election')
    );

    const res = await studentA.agent
      .get(`/api/conversations/${groupConversationId}`)
      .expect(500);

    expect(res.body.code).toBe('ERR_SERVER_ERROR');
    jest.restoreAllMocks();
  });
});

describe('channel helper setup', () => {
  it('provisions club and channel with studentA as moderator and studentB as member', async () => {
    const club = await Club.create({
      name: 'Chomp Streetwear Collective',
      description: 'Campus fashion and thrifting club',
      proposerId: studentA.user._id,
    });
    clubId = club._id.toString();

    const channel = await Conversation.create({
      type: ConversationType.CHANNEL,
      clubId: club._id,
      title: 'announcements',
    });
    channelConversationId = channel._id.toString();

    await ConversationParticipant.create([
      {
        conversationId: channel._id,
        userId: studentA.user._id,
        permission: ParticipantPermission.MODERATE,
      },
      {
        conversationId: channel._id,
        userId: studentB.user._id,
        permission: ParticipantPermission.WRITE,
      },
    ]);

    expect(channelConversationId).toBeDefined();
  });
});

describe('POST /api/conversations/:id/messages', () => {
  it('sends message and returns 201 with public message fields and session sender', async () => {
    const spoofedSenderId = new Types.ObjectId().toString();
    const clientId = '0192c4a0-7c00-7000-8000-000000000001';

    const res = await studentA.agent
      .post(`/api/conversations/${groupConversationId}/messages`)
      .send({
        text: '  Meeting at the sculpture at five  ',
        clientId,
        senderId: spoofedSenderId,
      });

    expect(res.status).toBe(201);
    expect(res.body._id).toBeDefined();
    expect(res.body.conversationId).toBe(groupConversationId);
    expect(res.body.senderId).toBe(studentA.user._id.toString());
    expect(res.body.text).toBe('Meeting at the sculpture at five');
    expect(res.body.clientId).toBe(clientId);
    expect(res.body.isAnnouncement).toBe(false);
    expect(res.body.isSystem).toBe(false);
    expect(res.body.createdAt).toBeDefined();
    expect(res.body.updatedAt).toBeUndefined();
    expect(res.body.__v).toBeUndefined();
    expect(res.body.removedBy).toBeUndefined();
  });

  it('deduplicates sends with identical client id and does not create second document', async () => {
    const clientId = '0192c4a0-7c00-7000-8000-000000000002';

    const first = await studentA.agent
      .post(`/api/conversations/${groupConversationId}/messages`)
      .send({ text: 'Anyone have spare coffee?', clientId });
    expect(first.status).toBe(201);

    const second = await studentA.agent
      .post(`/api/conversations/${groupConversationId}/messages`)
      .send({ text: 'Altered duplicate request body', clientId });
    expect(second.status).toBe(201);
    expect(second.body._id).toBe(first.body._id);
    expect(second.body.text).toBe('Anyone have spare coffee?');
  });

  it('allows channel moderator announcement and rejects regular member announcement with 403', async () => {
    const modRes = await studentA.agent
      .post(`/api/conversations/${channelConversationId}/messages`)
      .send({ text: 'GBM starts in ten minutes', isAnnouncement: true });
    expect(modRes.status).toBe(201);
    expect(modRes.body.isAnnouncement).toBe(true);

    const memberRes = await studentB.agent
      .post(`/api/conversations/${channelConversationId}/messages`)
      .send({ text: 'Free pizza outside', isAnnouncement: true });
    expect(memberRes.status).toBe(403);
    expect(memberRes.body).toEqual({
      code: 'ERR_OFFICER_PERMISSION_REQUIRED',
      message: 'Only active club officers can post announcements',
    });
  });

  it('rejects announcements in non-channel conversation with 400', async () => {
    const res = await studentA.agent
      .post(`/api/conversations/${groupConversationId}/messages`)
      .send({ text: 'Quiet hours announcement', isAnnouncement: true });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('ERR_INVALID_INPUT');
  });

  it('rejects non-participant with 403 and missing conversation with 404', async () => {
    const nonPartRes = await studentC.agent
      .post(`/api/conversations/${channelConversationId}/messages`)
      .send({ text: 'Let me join please' });
    expect(nonPartRes.status).toBe(403);
    expect(nonPartRes.body).toEqual({
      code: 'ERR_NOT_PARTICIPANT',
      message: 'Sender is not a participant in this conversation',
    });

    const missingId = new Types.ObjectId().toString();
    const missingRes = await studentA.agent
      .post(`/api/conversations/${missingId}/messages`)
      .send({ text: 'Anyone here?' });
    expect(missingRes.status).toBe(404);
    expect(missingRes.body).toEqual({
      code: 'ERR_CONVERSATION_NOT_FOUND',
      message: 'Conversation not found',
    });
  });

  it('rejects blank text invalid client id bad announcement and malformed route id with 400', async () => {
    const emptyTextRes = await studentA.agent
      .post(`/api/conversations/${groupConversationId}/messages`)
      .send({ text: '   ' });
    expect(emptyTextRes.status).toBe(400);
    expect(emptyTextRes.body).toEqual({
      code: 'ERR_VALIDATION_FAILED',
      message: 'Message text cannot be empty',
      field: 'text',
    });

    const badClientIdRes = await studentA.agent
      .post(`/api/conversations/${groupConversationId}/messages`)
      .send({ text: 'Valid message text', clientId: 'bad-client-id' });
    expect(badClientIdRes.status).toBe(400);
    expect(badClientIdRes.body).toEqual({
      code: 'ERR_VALIDATION_FAILED',
      message: 'Client ID must be a valid UUIDv7',
      field: 'clientId',
    });

    const badAnnouncementRes = await studentA.agent
      .post(`/api/conversations/${groupConversationId}/messages`)
      .send({ text: 'Valid message text', isAnnouncement: 'not-a-boolean' });
    expect(badAnnouncementRes.status).toBe(400);
    expect(badAnnouncementRes.body).toEqual({
      code: 'ERR_VALIDATION_FAILED',
      message: 'isAnnouncement must be a boolean',
      field: 'isAnnouncement',
    });

    const badRouteIdRes = await studentA.agent
      .post('/api/conversations/not-a-valid-id/messages')
      .send({ text: 'Valid message text' });
    expect(badRouteIdRes.status).toBe(400);
    expect(badRouteIdRes.body.code).toBe('ERR_INVALID_INPUT');
  });

  it('returns 500 when service encounters unexpected internal failure', async () => {
    jest.spyOn(messageService, 'sendMessage').mockRejectedValueOnce(
      new Error('MongoDB replica set connection timed out')
    );

    const res = await studentA.agent
      .post(`/api/conversations/${groupConversationId}/messages`)
      .send({ text: 'Hello Century Tower' });

    expect(res.status).toBe(500);
    expect(res.body.code).toBe('ERR_SERVER_ERROR');
    jest.restoreAllMocks();
  });
});

describe('GET /api/conversations/:id/messages', () => {
  it('returns recent messages ordered newest first capped at 50 by default', async () => {
    const baseTime = Date.now();
    const bulkDocs = Array.from({ length: 50 }, (_, i) => ({
      conversationId: new Types.ObjectId(groupConversationId),
      senderId: studentA.user._id,
      text: `Extra message entry ${i + 1}`,
      isAnnouncement: false,
      isSystem: false,
      createdAt: new Date(baseTime + (i + 10) * 1000),
      updatedAt: new Date(baseTime + (i + 10) * 1000),
    }));
    await Message.insertMany(bulkDocs);

    const res = await studentA.agent
      .get(`/api/conversations/${groupConversationId}/messages`)
      .expect(200);

    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body).toHaveLength(50);
    expect(res.body[0].text).toBe('Extra message entry 50');
    expect(res.body[0].senderId).toBe(studentA.user._id.toString());
  });

  it('supports custom limit query parameter and returns empty array for empty chat', async () => {
    const limitRes = await studentA.agent
      .get(`/api/conversations/${groupConversationId}/messages?limit=3`)
      .expect(200);

    expect(limitRes.body).toHaveLength(3);
    expect(limitRes.body[0].text).toBe('Extra message entry 50');
    expect(limitRes.body[1].text).toBe('Extra message entry 49');
    expect(limitRes.body[2].text).toBe('Extra message entry 48');

    const emptyRes = await studentA.agent
      .get(`/api/conversations/${directConversationId}/messages`)
      .expect(200);

    expect(emptyRes.body).toEqual([]);
  });

  it('masks soft-deleted message text as tombstone while preserving removedAt and system messages', async () => {
    await Message.create([
      {
        conversationId: new Types.ObjectId(groupConversationId),
        senderId: studentA.user._id,
        text: 'Century Tower updated the group',
        isAnnouncement: false,
        isSystem: true,
        createdAt: new Date(Date.now() + 200000),
      },
    ]);

    const [msgToSoftDelete] = await Message.create([
      {
        conversationId: new Types.ObjectId(groupConversationId),
        senderId: studentA.user._id,
        text: 'This secret should be deleted',
        isAnnouncement: false,
        isSystem: false,
        createdAt: new Date(Date.now() + 300000),
      },
    ]);

    await deleteMessage(msgToSoftDelete._id, studentA.user._id);

    const res = await studentA.agent
      .get(`/api/conversations/${groupConversationId}/messages?limit=5`)
      .expect(200);

    const deletedMsg = res.body.find((m: { text: string }) => m.text === 'This message was deleted');
    expect(deletedMsg).toBeDefined();
    expect(deletedMsg._id).toBe(msgToSoftDelete._id.toString());
    expect(deletedMsg.removedAt).toBeDefined();
    expect(deletedMsg.removedBy).toBeUndefined();

    const systemMsg = res.body.find((m: { isSystem: boolean }) => m.isSystem);
    expect(systemMsg).toBeDefined();
    expect(systemMsg.isSystem).toBe(true);
  });

  it('rejects out of range or non integer limit with 400 and ERR_VALIDATION_FAILED', async () => {
    const invalidLimits = ['0', '101', '500', 'abc', '1.5', '-5'];

    for (const limit of invalidLimits) {
      const res = await studentA.agent
        .get(`/api/conversations/${groupConversationId}/messages?limit=${limit}`)
        .expect(400);

      expect(res.body).toEqual({
        code: 'ERR_VALIDATION_FAILED',
        message: 'limit must be an integer between 1 and 100',
      });
    }
  });

  it('rejects malformed conversation id with 400 and ERR_INVALID_INPUT', async () => {
    const res = await studentA.agent
      .get('/api/conversations/invalid-hex-id/messages')
      .expect(400);

    expect(res.body).toEqual({
      code: 'ERR_INVALID_INPUT',
      message: 'Valid conversationId is required',
    });
  });

  it('returns 404 for missing conversation or non-participant and 500 for unexpected error', async () => {
    const outsiderRes = await studentC.agent
      .get(`/api/conversations/${channelConversationId}/messages`)
      .expect(404);

    expect(outsiderRes.body).toEqual({
      code: 'ERR_CONVERSATION_NOT_FOUND',
      message: 'Conversation not found',
    });

    const missingId = new Types.ObjectId().toString();
    const missingRes = await studentA.agent
      .get(`/api/conversations/${missingId}/messages`)
      .expect(404);

    expect(missingRes.body).toEqual({
      code: 'ERR_CONVERSATION_NOT_FOUND',
      message: 'Conversation not found',
    });

    jest.spyOn(messageService, 'getMessages').mockRejectedValueOnce(
      new Error('Replica set election in progress')
    );

    const errorRes = await studentA.agent
      .get(`/api/conversations/${groupConversationId}/messages`)
      .expect(500);

    expect(errorRes.body.code).toBe('ERR_SERVER_ERROR');
    jest.restoreAllMocks();
  });
});

describe('GET /api/conversations', () => {
  it('returns active group and channel conversations ordered by lastActivityAt descending and omits empty chats', async () => {
    const res = await studentA.agent
      .get('/api/conversations')
      .expect(200);

    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body).toHaveLength(3);

    const groupItem = res.body.find((c: { _id: string }) => c._id === groupConversationId);
    expect(groupItem).toBeDefined();
    expect(groupItem.type).toBe('GROUP');
    expect(groupItem.displayName).toBe('French Fries Monument Preservation Society');
    expect(groupItem.clubId).toBeUndefined();
    expect(groupItem.lastMessage).toBeDefined();

    const channelItem = res.body.find((c: { _id: string }) => c._id === channelConversationId);
    expect(channelItem).toBeDefined();
    expect(channelItem.type).toBe('CHANNEL');
    expect(channelItem.displayName).toBe('announcements');
    expect(channelItem.clubId).toBe(clubId);
    expect(channelItem.lastMessage).toBeDefined();

    const emptyDirectItem = res.body.find((c: { _id: string }) => c._id === directConversationId);
    expect(emptyDirectItem).toBeUndefined();
  });

  it('masks soft-deleted latest message text in inbox preview', async () => {
    const res = await studentA.agent
      .get('/api/conversations')
      .expect(200);

    const groupItem = res.body.find((c: { _id: string }) => c._id === groupConversationId);
    expect(groupItem.lastMessage.text).toBe('This message was deleted');
  });

  it('prevents viewing other students chats and handles service failure with 500', async () => {
    const res = await studentA.agent
      .get(`/api/conversations?userId=${studentB.user._id.toString()}`)
      .expect(200);

    expect(res.body).toHaveLength(3);

    jest.spyOn(conversationService, 'getUserConversations').mockRejectedValueOnce(
      new Error('Replica set failover')
    );

    const errorRes = await studentA.agent
      .get('/api/conversations')
      .expect(500);

    expect(errorRes.body.code).toBe('ERR_SERVER_ERROR');
    jest.restoreAllMocks();
  });
});
