import { afterAll, afterEach, beforeAll, describe, expect, it, jest } from '@jest/globals';
import request from 'supertest';
import { Types } from 'mongoose';
import app from '../../../src/app';
import { clearTestDb, closeTestDb, connectTestDb } from '../../helpers/db';
import { Conversation, ConversationType } from '../../../src/messaging/models/Conversation';
import { ConversationParticipant, ParticipantPermission } from '../../../src/messaging/models/ConversationParticipant';
import { Message } from '../../../src/messaging/models/Message';
import { User } from '../../../src/user/models/User';
import { Club } from '../../../src/clubs/model/clubModel';
import { createSignedInStudent } from './messagingRouteTestUtils';
import * as conversationService from '../../../src/messaging/services/conversation.service';
import { deleteMessage } from '../../../src/messaging/services/message.service';

beforeAll(async () => {
  await connectTestDb();
  await Promise.all([
    Club.init(),
    Conversation.init(),
    ConversationParticipant.init(),
    Message.init(),
    User.init(),
  ]);
}, 60000);

afterEach(async () => {
  jest.restoreAllMocks();
  await clearTestDb();
});

afterAll(async () => {
  await closeTestDb();
});

describe('POST /api/conversations', () => {
  it('creates new direct conversation returning 201 with details at root without isNew or dmPairKey', async () => {
    const studentA = await createSignedInStudent({
      firstName: 'Midtown',
      lastName: 'Survivor',
      email: 'gator_beverage@ufl.edu',
    });
    const studentB = await createSignedInStudent({
      firstName: 'Krishna',
      lastName: 'Regular',
      email: 'lunch_line@ufl.edu',
    });

    const res = await studentA.agent
      .post('/api/conversations')
      .send({
        type: 'DIRECT',
        recipientId: studentB.user._id.toString(),
      });

    expect(res.status).toBe(201);
    expect(res.body._id).toBeDefined();
    expect(res.body.type).toBe('DIRECT');
    expect(res.body.displayName).toBe('Krishna Regular');
    expect(res.body.isNew).toBeUndefined();
    expect(res.body.dmPairKey).toBeUndefined();
    expect(res.body.__v).toBeUndefined();

    expect(res.body.participants).toHaveLength(2);
    expect(res.body.participants[0].userId._id).toBeDefined();
    expect(res.body.participants[0].userId.firstName).toBeDefined();
    expect(res.body.participants[0].userId.lastName).toBeDefined();
    expect(res.body.participants[0].permission).toBe(ParticipantPermission.WRITE);
    expect(res.body.participants[0]._id).toBeUndefined();

    expect(res.body.participants[1].userId._id).toBeDefined();
    expect(res.body.participants[1].permission).toBe(ParticipantPermission.WRITE);
    expect(res.body.participants[1]._id).toBeUndefined();
  });

  it('opens existing direct conversation returning 200 with identical id without isNew', async () => {
    const studentA = await createSignedInStudent({
      firstName: 'Midtown',
      lastName: 'Survivor',
      email: 'gator_beverage@ufl.edu',
    });
    const studentB = await createSignedInStudent({
      firstName: 'Krishna',
      lastName: 'Regular',
      email: 'lunch_line@ufl.edu',
    });

    const first = await studentA.agent
      .post('/api/conversations')
      .send({
        type: 'DIRECT',
        recipientId: studentB.user._id.toString(),
      });
    expect(first.status).toBe(201);

    const second = await studentB.agent
      .post('/api/conversations')
      .send({
        type: 'DIRECT',
        recipientId: studentA.user._id.toString(),
      });
    expect(second.status).toBe(200);
    expect(second.body._id).toBe(first.body._id);
    expect(second.body.isNew).toBeUndefined();
    expect(second.body.displayName).toBe('Midtown Survivor');
  });

  it('creates group conversation returning 201 with moderator role for creator and distinct ids on duplicate requests', async () => {
    const studentA = await createSignedInStudent({
      firstName: 'Midtown',
      lastName: 'Survivor',
      email: 'gator_beverage@ufl.edu',
    });
    const studentB = await createSignedInStudent({
      firstName: 'Krishna',
      lastName: 'Regular',
      email: 'lunch_line@ufl.edu',
    });
    const studentC = await createSignedInStudent({
      firstName: 'Broward',
      lastName: 'Freshman',
      email: 'broward.dining@ufl.edu',
    });

    const payload = {
      type: 'GROUP',
      title: '  Reitz Union Smash Bros  ',
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
    expect(first.body.displayName).toBe('Reitz Union Smash Bros');
    expect(first.body.isNew).toBeUndefined();

    expect(first.body.participants).toHaveLength(3);
    const creatorEntry = first.body.participants.find(
      (p: { userId: { _id: string } }) => p.userId._id === studentA.user._id.toString()
    );
    expect(creatorEntry).toBeDefined();
    expect(creatorEntry.permission).toBe(ParticipantPermission.MODERATE);

    const memberEntry = first.body.participants.find(
      (p: { userId: { _id: string } }) => p.userId._id === studentB.user._id.toString()
    );
    expect(memberEntry).toBeDefined();
    expect(memberEntry.permission).toBe(ParticipantPermission.WRITE);

    const second = await studentA.agent
      .post('/api/conversations')
      .send(payload);

    expect(second.status).toBe(201);
    expect(second.body._id).not.toBe(first.body._id);
    expect(second.body.displayName).toBe('Reitz Union Smash Bros');

    const totalGroups = await Conversation.countDocuments({ type: ConversationType.GROUP });
    expect(totalGroups).toBe(2);
  });

  it('rejects missing or whitespace group title with 400 and ERR_TITLE_REQUIRED', async () => {
    const studentA = await createSignedInStudent({
      firstName: 'Midtown',
      lastName: 'Survivor',
      email: 'gator_beverage@ufl.edu',
    });
    const studentB = await createSignedInStudent({
      firstName: 'Krishna',
      lastName: 'Regular',
      email: 'lunch_line@ufl.edu',
    });

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
    const studentA = await createSignedInStudent({
      firstName: 'Midtown',
      lastName: 'Survivor',
      email: 'gator_beverage@ufl.edu',
    });

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
    const studentA = await createSignedInStudent({
      firstName: 'Midtown',
      lastName: 'Survivor',
      email: 'gator_beverage@ufl.edu',
    });

    const selfRes = await studentA.agent
      .post('/api/conversations')
      .send({
        type: 'DIRECT',
        recipientId: studentA.user._id.toString(),
      });
    expect(selfRes.status).toBe(400);
    expect(selfRes.body).toEqual({
      code: 'ERR_MESSAGE_SELF',
      message: 'Cannot start a direct message conversation with yourself',
    });

    const soloRes = await studentA.agent
      .post('/api/conversations')
      .send({
        type: 'GROUP',
        title: 'Norman Hall Coffee Club',
        participantIds: [studentA.user._id.toString()],
      });
    expect(soloRes.status).toBe(400);
    expect(soloRes.body).toEqual({
      code: 'ERR_INSUFFICIENT_PARTICIPANTS',
      message: 'Group conversation requires at least two distinct participants',
    });

    const missingId = new Types.ObjectId().toString();
    const missingRes = await studentA.agent
      .post('/api/conversations')
      .send({
        type: 'DIRECT',
        recipientId: missingId,
      });
    expect(missingRes.status).toBe(404);
    expect(missingRes.body).toEqual({
      code: 'ERR_USER_NOT_FOUND',
      message: 'One or more users do not exist',
    });
  });

  it('returns 500 when service encounters unexpected internal failure', async () => {
    const studentA = await createSignedInStudent({
      firstName: 'Midtown',
      lastName: 'Survivor',
      email: 'gator_beverage@ufl.edu',
    });
    const studentB = await createSignedInStudent({
      firstName: 'Krishna',
      lastName: 'Regular',
      email: 'lunch_line@ufl.edu',
    });

    jest.spyOn(conversationService, 'createDirectConversation').mockRejectedValueOnce(
      new Error('Replica set primary stepdown in progress')
    );

    const res = await studentA.agent
      .post('/api/conversations')
      .send({
        type: 'DIRECT',
        recipientId: studentB.user._id.toString(),
      });

    expect(res.status).toBe(500);
    expect(res.body).toEqual({
      code: 'ERR_SERVER_ERROR',
      message: 'An unexpected error occurred',
    });
  });
});

describe('GET /api/conversations', () => {
  it('returns direct group and channel conversations ordered by lastActivityAt descending', async () => {
    const studentA = await createSignedInStudent({
      firstName: 'Marston',
      lastName: 'Dweller',
      email: 'basement.coder@ufl.edu',
    });
    const studentB = await createSignedInStudent({
      firstName: 'Alberta',
      lastName: 'Gator',
      email: 'alberta@ufl.edu',
    });

    const directChat = await Conversation.create({
      type: ConversationType.DIRECT,
      dmPairKey: [studentA.user._id.toString(), studentB.user._id.toString()].sort().join(':'),
    });
    await ConversationParticipant.create([
      {
        conversationId: directChat._id,
        userId: studentA.user._id,
        permission: ParticipantPermission.WRITE,
      },
      {
        conversationId: directChat._id,
        userId: studentB.user._id,
        permission: ParticipantPermission.WRITE,
      },
    ]);

    const groupChat = await Conversation.create({
      type: ConversationType.GROUP,
      title: 'Norman Hall Coffee Club',
    });
    await ConversationParticipant.create([
      {
        conversationId: groupChat._id,
        userId: studentA.user._id,
        permission: ParticipantPermission.MODERATE,
      },
      {
        conversationId: groupChat._id,
        userId: studentB.user._id,
        permission: ParticipantPermission.WRITE,
      },
    ]);

    const club = await Club.create({
      name: 'Southwest Rec Bench Press Waitlist',
      description: 'Lifting team coordinating bench rotations',
      proposerId: studentA.user._id,
    });
    const channelChat = await Conversation.create({
      type: ConversationType.CHANNEL,
      clubId: club._id,
      title: 'announcements',
    });
    await ConversationParticipant.create([
      {
        conversationId: channelChat._id,
        userId: studentA.user._id,
        permission: ParticipantPermission.MODERATE,
      },
      {
        conversationId: channelChat._id,
        userId: studentB.user._id,
        permission: ParticipantPermission.WRITE,
      },
    ]);

    const baseTime = Date.now();
    const t1 = new Date(baseTime + 1000);
    const t2 = new Date(baseTime + 2000);
    const t3 = new Date(baseTime + 3000);

    await Message.create([
      {
        conversationId: directChat._id,
        senderId: studentB.user._id,
        text: 'Studying in the Marston basement stacks',
        isAnnouncement: false,
        isSystem: false,
        createdAt: t1,
        updatedAt: t1,
      },
      {
        conversationId: channelChat._id,
        senderId: studentA.user._id,
        text: 'Bench racks free at Southwest right now',
        isAnnouncement: true,
        isSystem: false,
        createdAt: t2,
        updatedAt: t2,
      },
      {
        conversationId: groupChat._id,
        senderId: studentB.user._id,
        text: 'Pouring fresh cold brew at Norman',
        isAnnouncement: false,
        isSystem: false,
        createdAt: t3,
        updatedAt: t3,
      },
    ]);

    const res = await studentA.agent
      .get('/api/conversations')
      .expect(200);

    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body).toHaveLength(3);

    expect(res.body[0]._id).toBe(groupChat._id.toString());
    expect(res.body[0].type).toBe(ConversationType.GROUP);
    expect(res.body[0].displayName).toBe('Norman Hall Coffee Club');
    expect(res.body[0].clubId).toBeUndefined();
    expect(res.body[0].lastMessage).toEqual({
      text: 'Pouring fresh cold brew at Norman',
      senderName: 'Alberta Gator',
      createdAt: t3.toISOString(),
    });

    expect(res.body[1]._id).toBe(channelChat._id.toString());
    expect(res.body[1].type).toBe(ConversationType.CHANNEL);
    expect(res.body[1].displayName).toBe('announcements');
    expect(res.body[1].clubId).toBe(club._id.toString());
    expect(res.body[1].lastMessage).toEqual({
      text: 'Bench racks free at Southwest right now',
      senderName: 'Marston Dweller',
      createdAt: t2.toISOString(),
    });

    expect(res.body[2]._id).toBe(directChat._id.toString());
    expect(res.body[2].type).toBe(ConversationType.DIRECT);
    expect(res.body[2].displayName).toBe('Alberta Gator');
    expect(res.body[2].clubId).toBeUndefined();
    expect(res.body[2].lastMessage).toEqual({
      text: 'Studying in the Marston basement stacks',
      senderName: 'Alberta Gator',
      createdAt: t1.toISOString(),
    });
  });

  it('omits empty conversations that have no messages', async () => {
    const studentA = await createSignedInStudent({
      firstName: 'Marston',
      lastName: 'Dweller',
      email: 'basement.coder@ufl.edu',
    });
    const studentB = await createSignedInStudent({
      firstName: 'Alberta',
      lastName: 'Gator',
      email: 'alberta@ufl.edu',
    });

    const activeGroup = await Conversation.create({
      type: ConversationType.GROUP,
      title: 'Active Study Crew',
    });
    await ConversationParticipant.create({
      conversationId: activeGroup._id,
      userId: studentA.user._id,
      permission: ParticipantPermission.WRITE,
    });
    await Message.create({
      conversationId: activeGroup._id,
      senderId: studentA.user._id,
      text: 'Active discussion ping',
      isAnnouncement: false,
      isSystem: false,
    });

    const emptyDirect = await Conversation.create({
      type: ConversationType.DIRECT,
      dmPairKey: [studentA.user._id.toString(), studentB.user._id.toString()].sort().join(':'),
    });
    await ConversationParticipant.create({
      conversationId: emptyDirect._id,
      userId: studentA.user._id,
      permission: ParticipantPermission.WRITE,
    });

    const club = await Club.create({
      name: 'Quiet Reading Society',
      description: 'Silent reading sessions on campus',
      proposerId: studentA.user._id,
    });
    const emptyChannel = await Conversation.create({
      type: ConversationType.CHANNEL,
      clubId: club._id,
      title: 'quiet-channel',
    });
    await ConversationParticipant.create({
      conversationId: emptyChannel._id,
      userId: studentA.user._id,
      permission: ParticipantPermission.WRITE,
    });

    const res = await studentA.agent
      .get('/api/conversations')
      .expect(200);

    expect(res.body).toHaveLength(1);
    expect(res.body[0]._id).toBe(activeGroup._id.toString());
  });

  it('masks soft-deleted latest message text as tombstone preview', async () => {
    const studentA = await createSignedInStudent({
      firstName: 'Marston',
      lastName: 'Dweller',
      email: 'basement.coder@ufl.edu',
    });

    const group = await Conversation.create({
      type: ConversationType.GROUP,
      title: 'Norman Hall Coffee Club',
    });
    await ConversationParticipant.create({
      conversationId: group._id,
      userId: studentA.user._id,
      permission: ParticipantPermission.MODERATE,
    });

    const [msg] = await Message.create([
      {
        conversationId: group._id,
        senderId: studentA.user._id,
        text: 'Secret study coordinates',
        isAnnouncement: false,
        isSystem: false,
      },
    ]);

    await deleteMessage(msg._id, studentA.user._id);

    const res = await studentA.agent
      .get('/api/conversations')
      .expect(200);

    expect(res.body).toHaveLength(1);
    expect(res.body[0].lastMessage.text).toBe('This message was deleted');
    expect(res.body[0].lastMessage.senderName).toBe('Marston Dweller');
    expect(res.body[0].lastMessage.createdAt).toBeDefined();
  });

  it('returns empty array when student has no active conversations and prevents viewing other students chats', async () => {
    const studentA = await createSignedInStudent({
      firstName: 'Marston',
      lastName: 'Dweller',
      email: 'basement.coder@ufl.edu',
    });
    const studentB = await createSignedInStudent({
      firstName: 'Alberta',
      lastName: 'Gator',
      email: 'alberta@ufl.edu',
    });
    const studentC = await createSignedInStudent({
      firstName: 'GatorCorner',
      lastName: 'Survivor',
      email: 'soft_serve_broken@ufl.edu',
    });

    const privateGroup = await Conversation.create({
      type: ConversationType.GROUP,
      title: 'Secret Officer Lounge',
    });
    await ConversationParticipant.create([
      {
        conversationId: privateGroup._id,
        userId: studentB.user._id,
        permission: ParticipantPermission.WRITE,
      },
      {
        conversationId: privateGroup._id,
        userId: studentC.user._id,
        permission: ParticipantPermission.WRITE,
      },
    ]);
    await Message.create({
      conversationId: privateGroup._id,
      senderId: studentB.user._id,
      text: 'Only for B and C',
      isAnnouncement: false,
      isSystem: false,
    });

    const res = await studentA.agent
      .get(`/api/conversations?userId=${studentB.user._id.toString()}`)
      .expect(200);

    expect(res.body).toEqual([]);

    jest.spyOn(conversationService, 'getUserConversations').mockRejectedValueOnce(
      new Error('Replica set primary failover')
    );

    const errorRes = await studentA.agent
      .get('/api/conversations')
      .expect(500);

    expect(errorRes.body).toEqual({
      code: 'ERR_SERVER_ERROR',
      message: 'An unexpected error occurred',
    });
  });
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


