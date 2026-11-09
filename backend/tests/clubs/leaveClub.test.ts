import { describe, it, expect, beforeAll, afterEach, afterAll } from '@jest/globals';
import mongoose from 'mongoose';
import request from 'supertest';
import app from '../../src/app';
import { Club } from '../../src/clubs/model/clubModel';
import { Membership } from '../../src/clubs/model/membershipModel';
import { ConversationType } from '../../src/messaging/interfaces/conversation.interfaces';
import { Conversation } from '../../src/messaging/models/Conversation';
import { ConversationParticipant, ParticipantPermission } from '../../src/messaging/models/ConversationParticipant';
import { User } from '../../src/user/models/User';
import { createUser, logIn, type LoggedInAgent } from '../helpers/auth';
import { clearTestDb, closeTestDb, connectTestDb } from '../helpers/db';

async function insertClub() {
  return Club.create({
    name: `Club ${new mongoose.Types.ObjectId().toHexString()}`,
    description: 'Weekly meetings',
    proposerId: new mongoose.Types.ObjectId(),
    status: 'APPROVED',
  });
}

describe('POST /api/clubs/:clubId/leave', () => {
  let student: LoggedInAgent;
  let studentId: mongoose.Types.ObjectId;

  beforeAll(async () => {
    await connectTestDb();
    await Promise.all([Club.init(), Membership.init(), Conversation.init(), ConversationParticipant.init(), User.init()]);
    const user = await createUser();
    studentId = user._id;
    student = await logIn(user);
  }, 60000);

  afterEach(async () => {
    await clearTestDb(['users']);
  });

  afterAll(async () => {
    await closeTestDb();
  });

  it('marks an active member as inactive and keeps the role', async () => {
    const club = await insertClub();
    const membership = await Membership.create({ userId: studentId, clubId: club._id, status: 'ACTIVE' });

    const res = await student.post(`/api/clubs/${club._id.toString()}/leave`);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ _id: membership._id.toString(), status: 'INACTIVE', role: 'MEMBER' });
    expect((await Membership.findById(membership._id).lean())?.status).toBe('INACTIVE');
  });

  it('keeps the channel seat and marks it read-only', async () => {
    const club = await insertClub();
    await Membership.create({ userId: studentId, clubId: club._id, status: 'ACTIVE' });
    const channel = await Conversation.create({
      type: ConversationType.CHANNEL,
      clubId: club._id,
      title: 'General',
    });
    await ConversationParticipant.create({
      conversationId: channel._id,
      userId: studentId,
      permission: ParticipantPermission.WRITE,
    });

    const res = await student.post(`/api/clubs/${club._id.toString()}/leave`);

    expect(res.status).toBe(200);
    const seats = await ConversationParticipant.find({ conversationId: channel._id, userId: studentId }).lean();
    expect(seats).toHaveLength(1);
    expect(seats[0].permission).toBe(ParticipantPermission.READ);
  });

  it('lets an officer leave when another active officer remains, and rejoin as an officer', async () => {
    const club = await insertClub();
    await Membership.create([
      { userId: studentId, clubId: club._id, role: 'OFFICER', status: 'ACTIVE' },
      { userId: new mongoose.Types.ObjectId(), clubId: club._id, role: 'OFFICER', status: 'ACTIVE' },
    ]);

    const leaveRes = await student.post(`/api/clubs/${club._id.toString()}/leave`);
    expect(leaveRes.status).toBe(200);
    expect(leaveRes.body).toMatchObject({ status: 'INACTIVE', role: 'OFFICER' });

    const joinRes = await student.post(`/api/clubs/${club._id.toString()}/join`);
    expect(joinRes.status).toBe(201);
    expect(joinRes.body).toMatchObject({ status: 'ACTIVE', role: 'OFFICER' });
  });

  it('returns 409 when the only active officer tries to leave', async () => {
    const club = await insertClub();
    await Membership.create([
      { userId: studentId, clubId: club._id, role: 'OFFICER', status: 'ACTIVE' },
      { userId: new mongoose.Types.ObjectId(), clubId: club._id, role: 'OFFICER', status: 'INACTIVE' },
      { userId: new mongoose.Types.ObjectId(), clubId: club._id, role: 'MEMBER', status: 'ACTIVE' },
    ]);

    const res = await student.post(`/api/clubs/${club._id.toString()}/leave`);

    expect(res.status).toBe(409);
    expect(res.body).toEqual({ code: 'ERR_LAST_OFFICER', message: 'A club must keep at least one active officer' });
    expect((await Membership.findOne({ userId: studentId }).lean())?.status).toBe('ACTIVE');
  });

  it('returns 409 when the user is not an active member', async () => {
    const club = await insertClub();
    const otherClub = await insertClub();
    await Membership.create([
      { userId: studentId, clubId: otherClub._id, status: 'INACTIVE' },
      { userId: studentId, clubId: club._id, status: 'REMOVED' },
    ]);

    for (const clubId of [club._id, otherClub._id, (await insertClub())._id]) {
      const res = await student.post(`/api/clubs/${clubId.toString()}/leave`);
      expect({ status: res.status, body: res.body }).toEqual({
        status: 409,
        body: { code: 'ERR_NOT_MEMBER', message: 'Not an active member of this club' },
      });
    }
    expect((await Membership.findOne({ clubId: club._id }).lean())?.status).toBe('REMOVED');
  });

  it('returns 404 for a club that does not exist or a malformed club id', async () => {
    for (const clubId of [new mongoose.Types.ObjectId().toString(), 'not-a-club-id']) {
      const res = await student.post(`/api/clubs/${clubId}/leave`);
      expect({ status: res.status, body: res.body }).toEqual({
        status: 404,
        body: { code: 'ERR_CLUB_NOT_FOUND', message: 'Club not found' },
      });
    }
  });

  it('returns 401 when the user is not logged in', async () => {
    const club = await insertClub();

    const res = await request(app).post(`/api/clubs/${club._id.toString()}/leave`);

    expect(res.status).toBe(401);
    expect(res.body).toEqual({ message: 'ERR_REQUIRE_AUTH', redirectTo: '/login' });
  });
});
