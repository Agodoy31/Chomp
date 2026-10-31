import { describe, it, expect, beforeAll, afterEach, afterAll, jest } from '@jest/globals';
import express, { NextFunction, Request, Response } from 'express';
import mongoose from 'mongoose';
import request from 'supertest';
import app from '../../src/app';
import { Club } from '../../src/clubs/model/clubModel';
import { Membership } from '../../src/clubs/model/membershipModel';
import { ConversationType } from '../../src/messaging/interfaces/conversation.interfaces';
import { Conversation } from '../../src/messaging/models/Conversation';
import { ConversationParticipant } from '../../src/messaging/models/ConversationParticipant';
import { sessionMiddleware } from '../../src/sessions/session';
import { User } from '../../src/user/models/User';
import { hashPassword } from '../../src/user/utils/passwordHashing';
import { clearTestDb, closeTestDb, connectTestDb } from '../helpers/db';

function asUser(userId: string) {
  const wrapper = express();
  wrapper.use(sessionMiddleware);
  wrapper.use((req: Request, _res: Response, next: NextFunction) => {
    req.session.userId = userId;
    next();
  });
  wrapper.use(app);
  return wrapper;
}

async function insertClub(status: 'PENDING' | 'APPROVED' | 'REJECTED' = 'APPROVED') {
  return Club.create({
    name: `Club ${new mongoose.Types.ObjectId().toHexString()}`,
    description: 'Weekly meetings',
    proposerId: new mongoose.Types.ObjectId(),
    status,
  });
}

async function createUser(isAdmin = false) {
  const userId = new mongoose.Types.ObjectId();
  return User.create({
    _id: userId,
    email: `student_${userId.toString()}@ufl.edu`,
    hashedPassword: 'hashedPassword123',
    firstName: 'Albert',
    lastName: 'Gator',
    isAdmin,
  });
}

async function insertClubWithChannel() {
  const club = await insertClub();
  const channel = await Conversation.create({ type: ConversationType.CHANNEL, clubId: club._id, title: 'General' });
  return { club, channel };
}

describe('POST /api/clubs/:clubId/join', () => {
  beforeAll(async () => {
    await connectTestDb();
    await Promise.all([
      Club.init(),
      Membership.init(),
      Conversation.init(),
      ConversationParticipant.init(),
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

  it('creates an active member membership and returns 201', async () => {
    const club = await insertClub();
    const userId = new mongoose.Types.ObjectId().toHexString();

    const res = await request(asUser(userId)).post(`/api/clubs/${club._id.toString()}/join`);

    expect(res.status).toBe(201);
    expect(res.body.userId).toBe(userId);
    expect(res.body.clubId).toBe(club._id.toString());
    expect(res.body.role).toBe('MEMBER');
    expect(res.body.status).toBe('ACTIVE');

    const stored = await Membership.find({ userId, clubId: club._id });
    expect(stored).toHaveLength(1);
    expect(stored[0].status).toBe('ACTIVE');
    expect(stored[0].role).toBe('MEMBER');
  });

  it('adds the student to the General channel of a club approved through the API', async () => {
    const [proposer, admin, joiner] = await Promise.all([createUser(), createUser(true), createUser()]);
    const reqRes = await request(asUser(proposer._id.toString()))
      .post('/api/clubs')
      .send({ name: 'Gator Lettuce Eating Club', description: 'Eat a whole head of lettuce at Plaza' });
    const appRes = await request(asUser(admin._id.toString())).post(`/api/clubs/${reqRes.body._id}/approve`);

    const joinRes = await request(asUser(joiner._id.toString())).post(`/api/clubs/${reqRes.body._id}/join`);

    expect(joinRes.status).toBe(201);
    const participants = await ConversationParticipant.find({
      conversationId: appRes.body.conversation._id,
    }).lean();
    expect(participants.map((p) => p.userId.toString()).sort()).toEqual(
      [proposer._id.toString(), joiner._id.toString()].sort()
    );
  });

  it('creates one membership and one channel seat when the same student joins twice at once', async () => {
    const { club, channel } = await insertClubWithChannel();
    const student = await createUser();
    const joinUrl = `/api/clubs/${club._id.toString()}/join`;

    const responses = await Promise.all([
      request(asUser(student._id.toString())).post(joinUrl),
      request(asUser(student._id.toString())).post(joinUrl),
    ]);

    expect(responses.map((res) => res.status).sort((a, b) => a - b)).toEqual([201, 409]);
    expect(await Membership.countDocuments({ userId: student._id, clubId: club._id })).toBe(1);
    expect(await ConversationParticipant.countDocuments({ conversationId: channel._id })).toBe(1);
  });

  it('rolls back the membership when the student cannot be added to a channel', async () => {
    const { club } = await insertClubWithChannel();
    const student = await createUser();
    jest
      .spyOn(ConversationParticipant, 'create')
      .mockRejectedValueOnce(new Error('Simulated participant creation failure'));

    const res = await request(asUser(student._id.toString())).post(`/api/clubs/${club._id.toString()}/join`);

    expect(res.status).toBe(500);
    expect(await Membership.countDocuments()).toBe(0);
    expect(await ConversationParticipant.countDocuments()).toBe(0);
  });

  it('reactivates an inactive membership as an active member', async () => {
    const club = await insertClub();
    const userId = new mongoose.Types.ObjectId();
    const inactive = await Membership.create({
      userId,
      clubId: club._id,
      role: 'OFFICER',
      status: 'INACTIVE',
    });

    const res = await request(asUser(userId.toHexString())).post(`/api/clubs/${club._id.toString()}/join`);

    expect(res.status).toBe(201);
    expect(res.body._id).toBe(inactive._id.toString());
    expect(res.body.role).toBe('MEMBER');
    expect(res.body.status).toBe('ACTIVE');

    const stored = await Membership.findById(inactive._id);
    expect(stored?.status).toBe('ACTIVE');
    expect(stored?.role).toBe('MEMBER');
    expect(await Membership.countDocuments({ userId, clubId: club._id })).toBe(1);
  });

  it('returns 404 when the club does not exist', async () => {
    const userId = new mongoose.Types.ObjectId().toHexString();
    const missingId = new mongoose.Types.ObjectId().toHexString();

    const res = await request(asUser(userId)).post(`/api/clubs/${missingId}/join`);

    expect(res.status).toBe(404);
    expect(res.body.code).toBe('ERR_CLUB_NOT_FOUND');
    expect(res.body.message).toBe('Club not found');
    expect(await Membership.countDocuments()).toBe(0);
  });

  it.each([
    ['PENDING', 'This club is pending approval and cannot be joined yet'],
    ['REJECTED', 'This club was rejected and cannot be joined'],
  ] as const)('rejects a join when the club is %s', async (status, message) => {
    const club = await insertClub(status);
    const userId = new mongoose.Types.ObjectId().toHexString();

    const res = await request(asUser(userId)).post(`/api/clubs/${club._id.toString()}/join`);

    expect(res.status).toBe(403);
    expect(res.body.code).toBe('ERR_CLUB_NOT_APPROVED');
    expect(res.body.message).toBe(message);
    expect(await Membership.countDocuments()).toBe(0);
  });

  it('returns 401 when the student is not logged in', async () => {
    const club = await insertClub();

    const res = await request(app).post(`/api/clubs/${club._id.toString()}/join`);

    expect(res.status).toBe(401);
    expect(res.body).toEqual({ message: 'ERR_REQUIRE_AUTH', redirectTo: '/login' });
    expect(await Membership.countDocuments()).toBe(0);
  });

  it('accepts the session cookie set by login', async () => {
    const club = await insertClub();
    const user = await User.create({
      email: 'albert@ufl.edu',
      hashedPassword: await hashPassword('password'),
      firstName: 'Albert',
      lastName: 'Gator',
    });
    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ email: 'albert@ufl.edu', password: 'password' });

    const res = await request(app)
      .post(`/api/clubs/${club._id.toString()}/join`)
      .set('Cookie', loginRes.headers['set-cookie']);

    expect(res.status).toBe(201);
    expect(res.body.userId).toBe(user._id.toString());
  });

  it('returns 403 when a removed student tries to rejoin', async () => {
    const club = await insertClub();
    const userId = new mongoose.Types.ObjectId();
    await Membership.create({ userId, clubId: club._id, status: 'REMOVED' });

    const res = await request(asUser(userId.toHexString())).post(`/api/clubs/${club._id.toString()}/join`);

    expect(res.status).toBe(403);
    expect(res.body.code).toBe('ERR_MEMBER_REMOVED');
    expect(res.body.message).toBe('Removed members cannot rejoin this club');

    const stored = await Membership.findOne({ userId, clubId: club._id });
    expect(stored?.status).toBe('REMOVED');
  });

  it('returns 409 when the student is already an active member', async () => {
    const club = await insertClub();
    const userId = new mongoose.Types.ObjectId();
    await Membership.create({ userId, clubId: club._id, status: 'ACTIVE' });

    const res = await request(asUser(userId.toHexString())).post(`/api/clubs/${club._id.toString()}/join`);

    expect(res.status).toBe(409);
    expect(res.body.code).toBe('ERR_ALREADY_MEMBER');
    expect(res.body.message).toBe('Already an active member of this club');
    expect(await Membership.countDocuments({ userId, clubId: club._id })).toBe(1);
  });

  it('returns 409 when a join request is already pending', async () => {
  const club = await insertClub();
  const userId = new mongoose.Types.ObjectId();
  await Membership.create({ userId, clubId: club._id, status: 'PENDING' });

  const res = await request(asUser(userId.toHexString())).post(`/api/clubs/${club._id.toString()}/join`);

  expect(res.status).toBe(409);
  expect(res.body.code).toBe('ERR_MEMBERSHIP_PENDING');
  expect(res.body.message).toBe('A request to join this club is already pending');
  expect(await Membership.countDocuments({ userId, clubId: club._id })).toBe(1);
});

it('returns 403 when a previous join request was rejected', async () => {
  const club = await insertClub();
  const userId = new mongoose.Types.ObjectId();
  await Membership.create({ userId, clubId: club._id, status: 'REJECTED' });

  const res = await request(asUser(userId.toHexString())).post(`/api/clubs/${club._id.toString()}/join`);

  expect(res.status).toBe(403);
  expect(res.body.code).toBe('ERR_MEMBERSHIP_REJECTED');
  expect(res.body.message).toBe('Rejected members cannot rejoin this club');
  expect(await Membership.countDocuments({ userId, clubId: club._id })).toBe(1);
});
});
