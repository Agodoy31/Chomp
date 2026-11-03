import { describe, it, expect, beforeAll, afterEach, afterAll } from '@jest/globals';
import mongoose from 'mongoose';
import request from 'supertest';
import app from '../../src/app';
import { Club } from '../../src/clubs/model/clubModel';
import { Membership } from '../../src/clubs/model/membershipModel';
import { User } from '../../src/user/models/User';
import { createUser, logIn, type LoggedInAgent } from '../helpers/auth';
import { clearTestDb, closeTestDb, connectTestDb } from '../helpers/db';

async function insertClub(name: string, status: 'PENDING' | 'APPROVED' | 'REJECTED' = 'APPROVED') {
  return Club.create({
    name,
    description: `${name} description`,
    proposerId: new mongoose.Types.ObjectId(),
    status,
  });
}

describe('GET /api/clubs/me', () => {
  let student: LoggedInAgent;
  let studentId: mongoose.Types.ObjectId;

  beforeAll(async () => {
    await connectTestDb();
    await Promise.all([Club.init(), Membership.init(), User.init()]);
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

  it('returns active approved clubs sorted by name with the role and without review fields', async () => {
    const zebra = await insertClub('Zebra Club');
    const alpha = await insertClub('alpha Club');
    await Membership.create([
      { userId: studentId, clubId: zebra._id, role: 'MEMBER', status: 'ACTIVE' },
      { userId: studentId, clubId: alpha._id, role: 'OFFICER', status: 'ACTIVE' },
    ]);

    const res = await student.get('/api/clubs/me');

    expect(res.status).toBe(200);
    expect(res.body.clubs.map((club: { name: string; role: string }) => [club.name, club.role])).toEqual([
      ['alpha Club', 'OFFICER'],
      ['Zebra Club', 'MEMBER'],
    ]);
    for (const club of res.body.clubs) {
      expect(club.proposerId).toBeUndefined();
      expect(club.status).toBeUndefined();
      expect(club.createdAt).toBeUndefined();
      expect(club.__v).toBeUndefined();
    }
  });

  it('omits memberships that are not active', async () => {
    for (const status of ['INACTIVE', 'REMOVED', 'REJECTED', 'PENDING'] as const) {
      const club = await insertClub(`${status} Club`);
      await Membership.create({ userId: studentId, clubId: club._id, status });
    }

    const res = await student.get('/api/clubs/me');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ clubs: [] });
  });

  it('omits clubs that are not approved and clubs of other users', async () => {
    const pending = await insertClub('Pending Club', 'PENDING');
    const other = await insertClub('Other Club');
    await Membership.create([
      { userId: studentId, clubId: pending._id, status: 'ACTIVE' },
      { userId: new mongoose.Types.ObjectId(), clubId: other._id, status: 'ACTIVE' },
    ]);

    const res = await student.get('/api/clubs/me');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ clubs: [] });
  });

  it('returns 401 when the user is not logged in', async () => {
    const res = await request(app).get('/api/clubs/me');

    expect(res.status).toBe(401);
    expect(res.body).toEqual({ message: 'ERR_REQUIRE_AUTH', redirectTo: '/login' });
  });
});
