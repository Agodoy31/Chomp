import { describe, it, expect, beforeAll, afterEach, afterAll } from '@jest/globals';
import mongoose from 'mongoose';
import request from 'supertest';
import app from '../../src/app';
import { Club } from '../../src/clubs/model/clubModel';
import { Membership } from '../../src/clubs/model/membershipModel';
import { User } from '../../src/user/models/User';
import { createUser, logIn, type LoggedInAgent } from '../helpers/auth';
import { clearTestDb, closeTestDb, connectTestDb } from '../helpers/db';

async function insertClub(status: 'PENDING' | 'APPROVED' | 'REJECTED' = 'APPROVED') {
  return Club.create({
    name: `Club ${new mongoose.Types.ObjectId().toHexString()}`,
    description: 'Weekly meetings',
    proposerId: new mongoose.Types.ObjectId(),
    status,
  });
}

async function insertUser(firstName: string, lastName: string) {
  const userId = new mongoose.Types.ObjectId();
  return User.create({
    _id: userId,
    email: `member_${userId.toString()}@ufl.edu`,
    hashedPassword: 'not-used',
    firstName,
    lastName,
  });
}

describe('GET /api/clubs/:clubId/members', () => {
  let admin: LoggedInAgent;
  let student: LoggedInAgent;
  let studentId: mongoose.Types.ObjectId;

  beforeAll(async () => {
    await connectTestDb();
    await Promise.all([Club.init(), Membership.init(), User.init()]);
    const [adminUser, studentUser] = await Promise.all([createUser(true), createUser()]);
    studentId = studentUser._id;
    [admin, student] = await Promise.all([logIn(adminUser), logIn(studentUser)]);
  }, 60000);

  afterEach(async () => {
    await clearTestDb(['users']);
  });

  afterAll(async () => {
    await closeTestDb();
  });

  it('lists active members with officers first, then by last and first name', async () => {
    const club = await insertClub();
    const [zoe, adam, owen, gone] = await Promise.all([
      insertUser('Zoe', 'Brown'),
      insertUser('Adam', 'Brown'),
      insertUser('Owen', 'Young'),
      insertUser('Gone', 'Away'),
    ]);
    await Membership.create([
      { userId: studentId, clubId: club._id, role: 'MEMBER', status: 'ACTIVE' },
      { userId: zoe._id, clubId: club._id, role: 'MEMBER', status: 'ACTIVE' },
      { userId: adam._id, clubId: club._id, role: 'MEMBER', status: 'ACTIVE' },
      { userId: owen._id, clubId: club._id, role: 'OFFICER', status: 'ACTIVE' },
      { userId: gone._id, clubId: club._id, role: 'MEMBER', status: 'INACTIVE' },
    ]);

    const res = await student.get(`/api/clubs/${club._id.toString()}/members`);

    expect(res.status).toBe(200);
    expect(res.body.members).toEqual([
      { userId: owen._id.toString(), firstName: 'Owen', lastName: 'Young', role: 'OFFICER' },
      { userId: adam._id.toString(), firstName: 'Adam', lastName: 'Brown', role: 'MEMBER' },
      { userId: zoe._id.toString(), firstName: 'Zoe', lastName: 'Brown', role: 'MEMBER' },
      { userId: studentId.toString(), firstName: 'Albert', lastName: 'Gator', role: 'MEMBER' },
    ]);
  });

  it('lets an admin who is not a member read the roster', async () => {
    const club = await insertClub();
    await Membership.create({ userId: studentId, clubId: club._id, role: 'OFFICER', status: 'ACTIVE' });

    const res = await admin.get(`/api/clubs/${club._id.toString()}/members`);

    expect(res.status).toBe(200);
    expect(res.body.members).toHaveLength(1);
  });

  it('returns 403 when the user is not an active member', async () => {
    const club = await insertClub();
    await Membership.create({ userId: studentId, clubId: club._id, status: 'INACTIVE' });

    const res = await student.get(`/api/clubs/${club._id.toString()}/members`);

    expect(res.status).toBe(403);
    expect(res.body).toEqual({ code: 'ERR_MEMBER_REQUIRED', message: 'Club membership required' });
  });

  it('returns 404 for a pending, missing, or malformed club', async () => {
    const pending = await insertClub('PENDING');

    for (const clubId of [pending._id.toString(), new mongoose.Types.ObjectId().toString(), 'nope']) {
      const res = await admin.get(`/api/clubs/${clubId}/members`);
      expect({ status: res.status, body: res.body }).toEqual({
        status: 404,
        body: { code: 'ERR_CLUB_NOT_FOUND', message: 'Club not found' },
      });
    }
  });

  it('returns 401 when the user is not logged in', async () => {
    const club = await insertClub();

    const res = await request(app).get(`/api/clubs/${club._id.toString()}/members`);

    expect(res.status).toBe(401);
    expect(res.body).toEqual({ message: 'ERR_REQUIRE_AUTH', redirectTo: '/login' });
  });
});
