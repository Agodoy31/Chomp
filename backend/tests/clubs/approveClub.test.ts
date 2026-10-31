import { describe, it, expect, beforeAll, afterEach, afterAll, jest } from '@jest/globals';
import mongoose from 'mongoose';
import request from 'supertest';
import app from '../../src/app';
import { Club } from '../../src/clubs/model/clubModel';
import { Membership } from '../../src/clubs/model/membershipModel';
import { ConversationType } from '../../src/messaging/interfaces/conversation.interfaces';
import { Conversation } from '../../src/messaging/models/Conversation';
import { ConversationParticipant } from '../../src/messaging/models/ConversationParticipant';
import { User } from '../../src/user/models/User';
import { createUser, logIn, type LoggedInAgent } from '../helpers/auth';
import { clearTestDb, closeTestDb, connectTestDb } from '../helpers/db';

async function insertClub(proposerId: mongoose.Types.ObjectId, overrides: Record<string, unknown> = {}) {
  return Club.create({ name: 'Chess Club', description: 'Weekly chess matches', proposerId, ...overrides });
}

async function expectNotProvisioned(clubId: mongoose.Types.ObjectId, status = 'PENDING') {
  expect((await Club.findById(clubId).lean())?.status).toBe(status);
  expect(await Membership.countDocuments()).toBe(0);
  expect(await Conversation.countDocuments()).toBe(0);
  expect(await ConversationParticipant.countDocuments()).toBe(0);
}

describe('POST /api/clubs/:clubId/approve', () => {
  let admin: LoggedInAgent;
  let proposer: LoggedInAgent;
  let proposerId: mongoose.Types.ObjectId;

  beforeAll(async () => {
    await connectTestDb();
    await Promise.all([
      Club.init(),
      Membership.init(),
      Conversation.init(),
      ConversationParticipant.init(),
      User.init(),
    ]);
    const [adminUser, proposerUser] = await Promise.all([createUser(true), createUser()]);
    proposerId = proposerUser._id;
    [admin, proposer] = await Promise.all([logIn(adminUser), logIn(proposerUser)]);
  }, 60000);

  afterEach(async () => {
    jest.restoreAllMocks();
    await clearTestDb(['users']);
  });

  afterAll(async () => {
    await closeTestDb();
  });

  it('approves the club and makes the proposer the only officer and member of a General channel', async () => {
    const club = await insertClub(proposerId);

    const res = await admin.post(`/api/clubs/${club._id.toString()}/approve`);

    expect(res.status).toBe(201);
    expect((await Club.findById(club._id).lean())?.status).toBe('APPROVED');

    const memberships = await Membership.find().lean();
    expect(memberships).toHaveLength(1);
    expect(memberships[0].clubId.toString()).toBe(club._id.toString());
    expect(memberships[0].userId.toString()).toBe(proposerId.toString());
    expect(memberships[0].role).toBe('OFFICER');
    expect(memberships[0].status).toBe('ACTIVE');

    const channels = await Conversation.find().lean();
    expect(channels).toHaveLength(1);
    expect(channels[0].type).toBe(ConversationType.CHANNEL);
    expect(channels[0].title).toBe('General');
    expect(channels[0].clubId?.toString()).toBe(club._id.toString());

    const participants = await ConversationParticipant.find().lean();
    expect(participants).toHaveLength(1);
    expect(participants[0].conversationId.toString()).toBe(channels[0]._id.toString());
    expect(participants[0].userId.toString()).toBe(proposerId.toString());

    expect(res.body.club).toMatchObject({ _id: club._id.toString(), status: 'APPROVED' });
    expect(res.body.membership._id).toBe(memberships[0]._id.toString());
    expect(res.body.conversation._id).toBe(channels[0]._id.toString());
  });

  it('returns 401 when the user is not logged in', async () => {
    const club = await insertClub(proposerId);

    const res = await request(app).post(`/api/clubs/${club._id.toString()}/approve`);

    expect(res.status).toBe(401);
    expect(res.body).toEqual({ message: 'ERR_REQUIRE_AUTH', redirectTo: '/login' });
    await expectNotProvisioned(club._id);
  });

  it('returns 403 when the user is not an admin', async () => {
    const club = await insertClub(proposerId);

    const res = await proposer.post(`/api/clubs/${club._id.toString()}/approve`);

    expect(res.status).toBe(403);
    expect(res.body).toEqual({ code: 'ERR_ADMIN_REQUIRED', message: 'Admin access required' });
    await expectNotProvisioned(club._id);
  });

  it('returns 404 for a club that does not exist or a malformed club id', async () => {
    for (const clubId of [new mongoose.Types.ObjectId().toString(), 'not-a-club-id']) {
      const res = await admin.post(`/api/clubs/${clubId}/approve`);
      expect({ status: res.status, body: res.body }).toEqual({
        status: 404,
        body: { code: 'ERR_CLUB_NOT_FOUND', message: 'Club not found' },
      });
    }
  });

  it('returns 409 when the club is already approved or rejected', async () => {
    for (const status of ['APPROVED', 'REJECTED']) {
      const club = await insertClub(proposerId, { status });

      const res = await admin.post(`/api/clubs/${club._id.toString()}/approve`);

      expect({ status: res.status, body: res.body }).toEqual({
        status: 409,
        body: { code: 'ERR_CLUB_NOT_PENDING', message: 'Only pending club requests can be approved' },
      });
      await expectNotProvisioned(club._id, status);
    }
  });

  it('returns 404 when the student who requested the club no longer exists', async () => {
    const departed = await createUser();
    await User.deleteOne({ _id: departed._id });
    const club = await insertClub(departed._id);

    const res = await admin.post(`/api/clubs/${club._id.toString()}/approve`);

    expect(res.status).toBe(404);
    expect(res.body).toEqual({
      code: 'ERR_PROPOSER_NOT_FOUND',
      message: 'The student who requested this club no longer exists',
    });
    await expectNotProvisioned(club._id);
  });

  it('returns 409 and keeps the request pending when an approved club already uses the name', async () => {
    await insertClub(proposerId, { status: 'APPROVED' });
    const club = await insertClub(proposerId, { name: 'CHESS CLUB' });

    const res = await admin.post(`/api/clubs/${club._id.toString()}/approve`);

    expect(res.status).toBe(409);
    expect(res.body).toEqual({
      code: 'ERR_CLUB_NAME_EXISTS',
      message: 'An approved club already uses this name',
    });
    await expectNotProvisioned(club._id);
  });

  it('rolls back the approval and membership when the channel cannot be created', async () => {
    const club = await insertClub(proposerId);
    jest
      .spyOn(ConversationParticipant, 'create')
      .mockRejectedValueOnce(new Error('Simulated participant creation failure'));

    const res = await admin.post(`/api/clubs/${club._id.toString()}/approve`);

    expect(res.status).toBe(500);
    await expectNotProvisioned(club._id);
  });
});
