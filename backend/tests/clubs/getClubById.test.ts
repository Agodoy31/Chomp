import { describe, it, expect, beforeAll, afterEach, afterAll } from '@jest/globals';
import mongoose from 'mongoose';
import request from 'supertest';
import app from '../../src/app';
import { Club } from '../../src/clubs/model/clubModel';
import { clearTestDb, closeTestDb, connectTestDb } from '../helpers/db';

async function insertClub(status: 'PENDING' | 'APPROVED' | 'REJECTED' = 'APPROVED') {
  return Club.create({
    name: `${status} Club`,
    description: 'Weekly chess matches',
    category: 'ACADEMIC',
    meeting: { day: 'Monday', time: '6:30 PM', location: 'Library West' },
    proposerId: new mongoose.Types.ObjectId(),
    status,
  });
}

describe('GET /api/clubs/:clubId', () => {
  beforeAll(async () => {
    await connectTestDb();
    await Club.init();
  }, 60000);

  afterEach(async () => {
    await clearTestDb();
  });

  afterAll(async () => {
    await closeTestDb();
  });

  it('returns an approved club without review fields to a guest', async () => {
    const club = await insertClub();

    const res = await request(app).get(`/api/clubs/${club._id.toString()}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      club: {
        _id: club._id.toString(),
        name: 'APPROVED Club',
        description: 'Weekly chess matches',
        category: 'ACADEMIC',
        meeting: { day: 'Monday', time: '6:30 PM', location: 'Library West' },
      },
    });
  });

  it('returns 404 for pending, rejected, missing, and malformed club ids', async () => {
    const pending = await insertClub('PENDING');
    const rejected = await insertClub('REJECTED');
    const ids = [pending._id.toString(), rejected._id.toString(), new mongoose.Types.ObjectId().toString(), 'nope'];

    for (const clubId of ids) {
      const res = await request(app).get(`/api/clubs/${clubId}`);
      expect({ status: res.status, body: res.body }).toEqual({
        status: 404,
        body: { code: 'ERR_CLUB_NOT_FOUND', message: 'Club not found' },
      });
    }
  });
});
