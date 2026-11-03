import { describe, it, expect, beforeAll, afterEach, afterAll } from '@jest/globals';
import mongoose from 'mongoose';
import request from 'supertest';
import app from '../../src/app';
import { Club } from '../../src/clubs/model/clubModel';
import { User } from '../../src/user/models/User';
import { createUser, logIn, type LoggedInAgent } from '../helpers/auth';
import { clearTestDb, closeTestDb, connectTestDb } from '../helpers/db';

async function insertClub(name: string, status: 'PENDING' | 'APPROVED' | 'REJECTED', createdAt: Date) {
  return Club.create({
    name,
    description: `${name} description`,
    proposerId: new mongoose.Types.ObjectId(),
    status,
    createdAt,
  });
}

describe('GET /api/clubs/pending', () => {
  let admin: LoggedInAgent;
  let student: LoggedInAgent;

  beforeAll(async () => {
    await connectTestDb();
    await Promise.all([Club.init(), User.init()]);
    const [adminUser, studentUser] = await Promise.all([createUser(true), createUser()]);
    [admin, student] = await Promise.all([logIn(adminUser), logIn(studentUser)]);
  }, 60000);

  afterEach(async () => {
    await clearTestDb(['users']);
  });

  afterAll(async () => {
    await closeTestDb();
  });

  it('returns only pending clubs, oldest first, with proposerId and timestamps', async () => {
    const newer = await insertClub('Newer Club', 'PENDING', new Date('2026-02-01'));
    const older = await insertClub('Older Club', 'PENDING', new Date('2026-01-01'));
    await insertClub('Approved Club', 'APPROVED', new Date('2025-12-01'));
    await insertClub('Rejected Club', 'REJECTED', new Date('2025-12-01'));

    const res = await admin.get('/api/clubs/pending');

    expect(res.status).toBe(200);
    expect(res.body.clubs.map((club: { _id: string }) => club._id)).toEqual([
      older._id.toString(),
      newer._id.toString(),
    ]);
    expect(res.body.clubs[0]).toMatchObject({
      name: 'Older Club',
      status: 'PENDING',
      proposerId: older.proposerId.toString(),
    });
    expect(res.body.clubs[0].createdAt).toBeDefined();
    expect(res.body.clubs[0].updatedAt).toBeDefined();
  });

  it('returns an empty clubs array when nothing is pending', async () => {
    const res = await admin.get('/api/clubs/pending');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ clubs: [] });
  });

  it('returns 403 when the user is not an admin', async () => {
    const res = await student.get('/api/clubs/pending');

    expect(res.status).toBe(403);
    expect(res.body).toEqual({ code: 'ERR_ADMIN_REQUIRED', message: 'Admin access required' });
  });

  it('returns 401 when the user is not logged in', async () => {
    const res = await request(app).get('/api/clubs/pending');

    expect(res.status).toBe(401);
    expect(res.body).toEqual({ message: 'ERR_REQUIRE_AUTH', redirectTo: '/login' });
  });
});
