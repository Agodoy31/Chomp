import { afterAll, afterEach, beforeAll, describe, expect, it, jest } from '@jest/globals';
import { Types } from 'mongoose';
import { clearTestDb, closeTestDb, connectTestDb } from '../../helpers/db';
import { Conversation, ConversationType } from '../../../src/messaging/models/Conversation';
import { ConversationParticipant, ParticipantPermission } from '../../../src/messaging/models/ConversationParticipant';
import { Message } from '../../../src/messaging/models/Message';
import { User } from '../../../src/user/models/User';
import { Club } from '../../../src/clubs/model/clubModel';
import { createSignedInStudent } from './messagingRouteTestUtils';
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

describe('POST /api/conversations/:id/messages', () => {
  it('sends message and returns 201 with public message fields and session sender', async () => {
    const student = await createSignedInStudent({
      firstName: 'Albert',
      lastName: 'Gator',
      email: 'albert@ufl.edu',
    });

    const conversation = await Conversation.create({
      type: ConversationType.GROUP,
      title: 'French Fries Monument Preservation Society',
    });

    await ConversationParticipant.create({
      conversationId: conversation._id,
      userId: student.user._id,
      permission: ParticipantPermission.WRITE,
    });

    const spoofedSenderId = new Types.ObjectId().toString();
    const clientId = '0192c4a0-7c00-7000-8000-000000000001';

    const res = await student.agent
      .post(`/api/conversations/${conversation._id.toString()}/messages`)
      .send({
        text: '  Meeting at the sculpture at five  ',
        clientId,
        senderId: spoofedSenderId,
      });

    expect(res.status).toBe(201);
    expect(res.body._id).toBeDefined();
    expect(res.body.conversationId).toBe(conversation._id.toString());
    expect(res.body.senderId).toBe(student.user._id.toString());
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
    const student = await createSignedInStudent({
      firstName: 'Midtown',
      lastName: 'Survivor',
      email: 'gator_beverage@ufl.edu',
    });

    const conversation = await Conversation.create({
      type: ConversationType.GROUP,
      title: 'Newell Hall Late Night Debuggers',
    });

    await ConversationParticipant.create({
      conversationId: conversation._id,
      userId: student.user._id,
      permission: ParticipantPermission.WRITE,
    });

    const clientId = '0192c4a0-7c00-7000-8000-000000000002';

    const first = await student.agent
      .post(`/api/conversations/${conversation._id.toString()}/messages`)
      .send({ text: 'Anyone have spare coffee?', clientId });
    expect(first.status).toBe(201);

    const second = await student.agent
      .post(`/api/conversations/${conversation._id.toString()}/messages`)
      .send({ text: 'Altered duplicate request body', clientId });
    expect(second.status).toBe(201);
    expect(second.body._id).toBe(first.body._id);
    expect(second.body.text).toBe('Anyone have spare coffee?');

    const totalInDb = await Message.countDocuments({ conversationId: conversation._id });
    expect(totalInDb).toBe(1);
  });

  it('allows channel moderator announcement and rejects regular member announcement with 403', async () => {
    const moderator = await createSignedInStudent({
      firstName: 'Albert',
      lastName: 'Gator',
      email: 'albert@ufl.edu',
    });

    const member = await createSignedInStudent({
      firstName: 'Dennis',
      lastName: 'Heckler',
      email: 'turlington_screamer@ufl.edu',
    });

    const channel = await Conversation.create({
      type: ConversationType.CHANNEL,
      title: 'general',
      clubId: new Types.ObjectId(),
    });

    await ConversationParticipant.create([
      {
        conversationId: channel._id,
        userId: moderator.user._id,
        permission: ParticipantPermission.MODERATE,
      },
      {
        conversationId: channel._id,
        userId: member.user._id,
        permission: ParticipantPermission.WRITE,
      },
    ]);

    const modRes = await moderator.agent
      .post(`/api/conversations/${channel._id.toString()}/messages`)
      .send({ text: 'GBM starts in ten minutes', isAnnouncement: true });
    expect(modRes.status).toBe(201);
    expect(modRes.body.isAnnouncement).toBe(true);

    const memberRes = await member.agent
      .post(`/api/conversations/${channel._id.toString()}/messages`)
      .send({ text: 'Free pizza outside', isAnnouncement: true });
    expect(memberRes.status).toBe(403);
    expect(memberRes.body).toEqual({
      code: 'ERR_OFFICER_PERMISSION_REQUIRED',
      message: 'Only active club officers can post announcements',
    });
  });

  it('rejects announcements in non-channel conversation with 400', async () => {
    const student = await createSignedInStudent({
      firstName: 'Albert',
      lastName: 'Gator',
      email: 'albert@ufl.edu',
    });

    const group = await Conversation.create({
      type: ConversationType.GROUP,
      title: 'Newell Hall Late Night Debuggers',
    });

    await ConversationParticipant.create({
      conversationId: group._id,
      userId: student.user._id,
      permission: ParticipantPermission.MODERATE,
    });

    const res = await student.agent
      .post(`/api/conversations/${group._id.toString()}/messages`)
      .send({ text: 'Quiet hours announcement', isAnnouncement: true });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('ERR_INVALID_INPUT');
  });

  it('rejects non-participant with 403 and missing conversation with 404', async () => {
    const student = await createSignedInStudent({
      firstName: 'Dennis',
      lastName: 'Heckler',
      email: 'turlington_screamer@ufl.edu',
    });

    const privateGroup = await Conversation.create({
      type: ConversationType.GROUP,
      title: 'Secret Study Room',
    });

    const nonPartRes = await student.agent
      .post(`/api/conversations/${privateGroup._id.toString()}/messages`)
      .send({ text: 'Let me join please' });
    expect(nonPartRes.status).toBe(403);
    expect(nonPartRes.body).toEqual({
      code: 'ERR_NOT_PARTICIPANT',
      message: 'Sender is not a participant in this conversation',
    });

    const missingId = new Types.ObjectId().toString();
    const missingRes = await student.agent
      .post(`/api/conversations/${missingId}/messages`)
      .send({ text: 'Anyone here?' });
    expect(missingRes.status).toBe(404);
    expect(missingRes.body).toEqual({
      code: 'ERR_CONVERSATION_NOT_FOUND',
      message: 'Conversation not found',
    });
  });

  it('rejects blank text invalid client id and malformed route id with 400', async () => {
    const student = await createSignedInStudent({
      firstName: 'Midtown',
      lastName: 'Survivor',
      email: 'gator_beverage@ufl.edu',
    });

    const conversation = await Conversation.create({
      type: ConversationType.GROUP,
      title: 'French Fries Monument Preservation Society',
    });

    await ConversationParticipant.create({
      conversationId: conversation._id,
      userId: student.user._id,
      permission: ParticipantPermission.WRITE,
    });

    const emptyTextRes = await student.agent
      .post(`/api/conversations/${conversation._id.toString()}/messages`)
      .send({ text: '   ' });
    expect(emptyTextRes.status).toBe(400);
    expect(emptyTextRes.body).toEqual({
      code: 'ERR_TEXT_EMPTY',
      message: 'Message text cannot be empty',
    });

    const badClientIdRes = await student.agent
      .post(`/api/conversations/${conversation._id.toString()}/messages`)
      .send({ text: 'Valid message text', clientId: 'bad-client-id' });
    expect(badClientIdRes.status).toBe(400);
    expect(badClientIdRes.body).toEqual({
      code: 'ERR_CLIENT_ID_INVALID',
      message: 'Client ID must be a valid UUIDv7',
    });

    const badRouteIdRes = await student.agent
      .post('/api/conversations/not-a-valid-id/messages')
      .send({ text: 'Valid message text' });
    expect(badRouteIdRes.status).toBe(400);
    expect(badRouteIdRes.body).toEqual({
      code: 'ERR_INVALID_INPUT',
      message: 'Valid conversationId is required',
    });
  });

  it('returns 500 when service encounters unexpected internal failure', async () => {
    const student = await createSignedInStudent({
      firstName: 'Albert',
      lastName: 'Gator',
      email: 'albert@ufl.edu',
    });

    const conversation = await Conversation.create({
      type: ConversationType.GROUP,
      title: 'French Fries Monument Preservation Society',
    });

    await ConversationParticipant.create({
      conversationId: conversation._id,
      userId: student.user._id,
      permission: ParticipantPermission.WRITE,
    });

    jest.spyOn(messageService, 'sendMessage').mockRejectedValueOnce(new Error('MongoDB replica set connection timed out'));

    const res = await student.agent
      .post(`/api/conversations/${conversation._id.toString()}/messages`)
      .send({ text: 'Hello Century Tower' });

    expect(res.status).toBe(500);
    expect(res.body).toEqual({
      code: 'ERR_SERVER_ERROR',
      message: 'An unexpected error occurred',
    });
  });
});
