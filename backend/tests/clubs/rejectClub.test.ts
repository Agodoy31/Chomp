import { describe, it, expect, beforeAll, afterEach, afterAll } from '@jest/globals';
import mongoose from 'mongoose';
import request from 'supertest';
import app from '../../src/app';
import { Club } from '../../src/clubs/model/clubModel';
import { Membership } from '../../src/clubs/model/membershipModel';
import { User } from '../../src/user/models/User';
import { createUser, logIn, type LoggedInAgent } from '../helpers/auth';
import { clearTestDb, closeTestDb, connectTestDb } from '../helpers/db';
import { createTestClub } from '../messaging/services/conversationTestUtils';

function insertClub(proposerId: mongoose.Types.ObjectId, overrides: Record<string, unknown> = {}) {
  return createTestClub(proposerId, {
    name: 'Chess Club',
    description: 'Weekly chess matches',
    category: 'OTHER',
    status: 'PENDING',
    ...overrides,
  });
}

describe('POST /api/clubs/:clubId/reject', () => {
  let admin: LoggedInAgent;
  let proposer: LoggedInAgent;
  let proposerId: mongoose.Types.ObjectId;

  beforeAll(async () => {
    await connectTestDb();
    await Promise.all([Club.init(), Membership.init(), User.init()]);
    const [adminUser, proposerUser] = await Promise.all([createUser(true), createUser()]);
    proposerId = proposerUser._id;
    [admin, proposer] = await Promise.all([logIn(adminUser), logIn(proposerUser)]);
  }, 60000);

  afterEach(async () => {
    await clearTestDb(['users']);
  });

  afterAll(async () => {
    await closeTestDb();
  });

  it('rejects a pending club without creating a membership', async () => {
    const club = await insertClub(proposerId);

    const res = await admin.post(`/api/clubs/${club._id.toString()}/reject`);

    expect(res.status).toBe(200);
    expect(res.body.club).toMatchObject({
      _id: club._id.toString(),
      proposerId: proposerId.toString(),
      status: 'REJECTED',
    });
    expect(res.body.club).not.toHaveProperty('__v');
    expect(res.body.club.createdAt).toEqual(expect.any(String));
    expect(res.body.club.updatedAt).toEqual(expect.any(String));
    expect((await Club.findById(club._id).lean())?.status).toBe('REJECTED');
    expect(await Membership.countDocuments()).toBe(0);
  });

  it('lets the proposer request the same name again after a rejection', async () => {
    const club = await insertClub(proposerId);
    await admin.post(`/api/clubs/${club._id.toString()}/reject`);

    const res = await proposer.post('/api/clubs').send({ name: 'Chess Club', description: 'Second try' });

    expect(res.status).toBe(201);
    expect(res.body.status).toBe('PENDING');
  });

  it('returns 409 when the club is already approved or rejected', async () => {
    for (const status of ['APPROVED', 'REJECTED']) {
      const club = await insertClub(proposerId, { name: `${status} Club`, status });

      const res = await admin.post(`/api/clubs/${club._id.toString()}/reject`);

      expect({ status: res.status, body: res.body }).toEqual({
        status: 409,
        body: { code: 'ERR_CLUB_NOT_PENDING', message: 'Only pending club requests can be rejected' },
      });
      expect((await Club.findById(club._id).lean())?.status).toBe(status);
    }
  });

  it('returns 404 for a club that does not exist or a malformed club id', async () => {
    for (const clubId of [new mongoose.Types.ObjectId().toString(), 'not-a-club-id']) {
      const res = await admin.post(`/api/clubs/${clubId}/reject`);
      expect({ status: res.status, body: res.body }).toEqual({
        status: 404,
        body: { code: 'ERR_CLUB_NOT_FOUND', message: 'Club not found' },
      });
    }
  });

  it('returns 403 when the user is not an admin', async () => {
    const club = await insertClub(proposerId);

    const res = await proposer.post(`/api/clubs/${club._id.toString()}/reject`);

    expect(res.status).toBe(403);
    expect(res.body).toEqual({ code: 'ERR_ADMIN_REQUIRED', message: 'Admin access required' });
    expect((await Club.findById(club._id).lean())?.status).toBe('PENDING');
  });

  it('returns 401 when the user is not logged in', async () => {
    const club = await insertClub(proposerId);

    const res = await request(app).post(`/api/clubs/${club._id.toString()}/reject`);

    expect(res.status).toBe(401);
    expect(res.body).toEqual({ message: 'ERR_REQUIRE_AUTH', redirectTo: '/login' });
  });
});
