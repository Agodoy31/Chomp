import { afterAll, afterEach, beforeAll, describe, expect, it, jest } from '@jest/globals';
import { Types } from 'mongoose';
import { clearTestDb, closeTestDb, connectTestDb } from '../../helpers/db';
import { Conversation, ConversationType } from '../../../src/messaging/models/Conversation';
import { ConversationParticipant, ParticipantPermission } from '../../../src/messaging/models/ConversationParticipant';
import { Message } from '../../../src/messaging/models/Message';
import { User } from '../../../src/user/models/User';
import { Club } from '../../../src/clubs/model/clubModel';
import { createSignedInStudent } from './messagingRouteTestUtils';
import { deleteMessage } from '../../../src/messaging/services/message.service';
import * as messageService from '../../../src/messaging/services/message.service';

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

describe('GET /api/conversations/:id/messages', () => {
  it('returns recent messages ordered newest first capped at 50 by default', async () => {
    const student = await createSignedInStudent({
      firstName: 'Potato',
      lastName: 'Sculpture',
      email: 'french_fries_monument@ufl.edu',
    });

    const conversation = await Conversation.create({
      type: ConversationType.GROUP,
      title: 'Gator Corner Soft Serve Repair Crew',
    });

    await ConversationParticipant.create({
      conversationId: conversation._id,
      userId: student.user._id,
      permission: ParticipantPermission.MODERATE,
    });

    const baseTime = Date.now();
    const messageDocs = Array.from({ length: 55 }, (_, i) => ({
      conversationId: conversation._id,
      senderId: student.user._id,
      text: `Repair log entry ${i + 1}`,
      isAnnouncement: false,
      isSystem: false,
      createdAt: new Date(baseTime + i * 1000),
      updatedAt: new Date(baseTime + i * 1000),
    }));

    await Message.insertMany(messageDocs);

    const res = await student.agent
      .get(`/api/conversations/${conversation._id.toString()}/messages`)
      .expect(200);

    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body).toHaveLength(50);

    expect(res.body[0].text).toBe('Repair log entry 55');
    expect(res.body[49].text).toBe('Repair log entry 6');

    const firstItem = res.body[0];
    expect(firstItem._id).toBeDefined();
    expect(firstItem.conversationId).toBe(conversation._id.toString());
    expect(firstItem.senderId).toBe(student.user._id.toString());
    expect(firstItem.isAnnouncement).toBe(false);
    expect(firstItem.isSystem).toBe(false);
    expect(firstItem.createdAt).toBeDefined();
    expect(firstItem.__v).toBeUndefined();
    expect(firstItem.updatedAt).toBeUndefined();
    expect(firstItem.removedBy).toBeUndefined();
  });

  it('supports custom limit query parameter and returns empty array for empty chat', async () => {
    const student = await createSignedInStudent({
      firstName: 'Potato',
      lastName: 'Sculpture',
      email: 'french_fries_monument@ufl.edu',
    });

    const activeChat = await Conversation.create({
      type: ConversationType.GROUP,
      title: 'Gator Corner Soft Serve Repair Crew',
    });

    await ConversationParticipant.create({
      conversationId: activeChat._id,
      userId: student.user._id,
      permission: ParticipantPermission.WRITE,
    });

    const baseTime = Date.now();
    const messageDocs = Array.from({ length: 10 }, (_, i) => ({
      conversationId: activeChat._id,
      senderId: student.user._id,
      text: `Status ping ${i + 1}`,
      isAnnouncement: false,
      isSystem: false,
      createdAt: new Date(baseTime + i * 1000),
      updatedAt: new Date(baseTime + i * 1000),
    }));
    await Message.insertMany(messageDocs);

    const limitRes = await student.agent
      .get(`/api/conversations/${activeChat._id.toString()}/messages?limit=3`)
      .expect(200);

    expect(limitRes.body).toHaveLength(3);
    expect(limitRes.body[0].text).toBe('Status ping 10');
    expect(limitRes.body[1].text).toBe('Status ping 9');
    expect(limitRes.body[2].text).toBe('Status ping 8');

    const emptyChat = await Conversation.create({
      type: ConversationType.GROUP,
      title: 'Empty Study Group',
    });
    await ConversationParticipant.create({
      conversationId: emptyChat._id,
      userId: student.user._id,
      permission: ParticipantPermission.WRITE,
    });

    const emptyRes = await student.agent
      .get(`/api/conversations/${emptyChat._id.toString()}/messages`)
      .expect(200);

    expect(emptyRes.body).toEqual([]);
  });

  it('masks soft-deleted message text as tombstone while preserving removedAt and system messages', async () => {
    const student = await createSignedInStudent({
      firstName: 'Tim',
      lastName: 'Tebow',
      email: 'ttebow15@ufl.edu',
    });

    const conversation = await Conversation.create({
      type: ConversationType.GROUP,
      title: 'Gator Corner Soft Serve Repair Crew',
    });

    await ConversationParticipant.create({
      conversationId: conversation._id,
      userId: student.user._id,
      permission: ParticipantPermission.MODERATE,
    });

    const [deletedDoc] = await Message.create([
      {
        conversationId: conversation._id,
        senderId: student.user._id,
        text: 'This should be removed from view',
        isAnnouncement: false,
        isSystem: false,
      },
    ]);

    await deleteMessage(deletedDoc._id, student.user._id);

    await Message.create([
      {
        conversationId: conversation._id,
        senderId: student.user._id,
        text: 'Tim Tebow created the group',
        isAnnouncement: false,
        isSystem: true,
      },
    ]);

    const res = await student.agent
      .get(`/api/conversations/${conversation._id.toString()}/messages`)
      .expect(200);

    expect(res.body).toHaveLength(2);

    const systemMsg = res.body.find((m: { isSystem: boolean }) => m.isSystem);
    expect(systemMsg).toBeDefined();
    expect(systemMsg.text).toBe('Tim Tebow created the group');
    expect(systemMsg.isSystem).toBe(true);

    const deletedMsg = res.body.find((m: { text: string }) => m.text === 'This message was deleted');
    expect(deletedMsg).toBeDefined();
    expect(deletedMsg._id).toBe(deletedDoc._id.toString());
    expect(deletedMsg.removedAt).toBeDefined();
    expect(deletedMsg.removedBy).toBeUndefined();
  });

  it('rejects out of range or non integer limit with 400 and ERR_VALIDATION_FAILED', async () => {
    const student = await createSignedInStudent({
      firstName: 'Tim',
      lastName: 'Tebow',
      email: 'ttebow15@ufl.edu',
    });

    const conversation = await Conversation.create({
      type: ConversationType.GROUP,
      title: 'Limit Validation Group',
    });

    await ConversationParticipant.create({
      conversationId: conversation._id,
      userId: student.user._id,
      permission: ParticipantPermission.WRITE,
    });

    const invalidLimits = ['0', '101', '500', 'abc', '1.5', '-5'];

    for (const limit of invalidLimits) {
      const res = await student.agent
        .get(`/api/conversations/${conversation._id.toString()}/messages?limit=${limit}`)
        .expect(400);

      expect(res.body).toEqual({
        code: 'ERR_VALIDATION_FAILED',
        message: 'limit must be an integer between 1 and 100',
      });
    }
  });

  it('rejects malformed conversation id with 400 and ERR_INVALID_INPUT', async () => {
    const student = await createSignedInStudent({
      firstName: 'Dennis',
      lastName: 'Heckler',
      email: 'turlington_screamer@ufl.edu',
    });

    const res = await student.agent
      .get('/api/conversations/invalid-hex-id/messages')
      .expect(400);

    expect(res.body).toEqual({
      code: 'ERR_INVALID_INPUT',
      message: 'Valid conversationId is required',
    });
  });

  it('returns 404 for missing conversation or non-participant and 500 for unexpected error', async () => {
    const member = await createSignedInStudent({
      firstName: 'Potato',
      lastName: 'Sculpture',
      email: 'french_fries_monument@ufl.edu',
    });
    const outsider = await createSignedInStudent({
      firstName: 'Dennis',
      lastName: 'Heckler',
      email: 'turlington_screamer@ufl.edu',
    });

    const conversation = await Conversation.create({
      type: ConversationType.GROUP,
      title: 'Gator Corner Soft Serve Repair Crew',
    });

    await ConversationParticipant.create({
      conversationId: conversation._id,
      userId: member.user._id,
      permission: ParticipantPermission.WRITE,
    });

    const outsiderRes = await outsider.agent
      .get(`/api/conversations/${conversation._id.toString()}/messages`)
      .expect(404);

    expect(outsiderRes.body).toEqual({
      code: 'ERR_CONVERSATION_NOT_FOUND',
      message: 'Conversation not found',
    });

    const missingId = new Types.ObjectId().toString();
    const missingRes = await member.agent
      .get(`/api/conversations/${missingId}/messages`)
      .expect(404);

    expect(missingRes.body).toEqual({
      code: 'ERR_CONVERSATION_NOT_FOUND',
      message: 'Conversation not found',
    });

    jest.spyOn(messageService, 'getMessages').mockRejectedValueOnce(
      new Error('Replica set election in progress')
    );

    const errorRes = await member.agent
      .get(`/api/conversations/${conversation._id.toString()}/messages`)
      .expect(500);

    expect(errorRes.body).toEqual({
      code: 'ERR_SERVER_ERROR',
      message: 'An unexpected error occurred',
    });
  });
});
