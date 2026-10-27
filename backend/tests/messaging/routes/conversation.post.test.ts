import { afterAll, afterEach, beforeAll, describe, expect, it, jest } from '@jest/globals';
import { Types } from 'mongoose';
import { clearTestDb, closeTestDb, connectTestDb } from '../../helpers/db';
import { Conversation, ConversationType } from '../../../src/messaging/models/Conversation';
import { ConversationParticipant, ParticipantPermission } from '../../../src/messaging/models/ConversationParticipant';
import { Message } from '../../../src/messaging/models/Message';
import { User } from '../../../src/user/models/User';
import { Club } from '../../../src/clubs/model/clubModel';
import { createSignedInStudent } from './messagingRouteTestUtils';
import * as conversationService from '../../../src/messaging/services/conversation.service';

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
