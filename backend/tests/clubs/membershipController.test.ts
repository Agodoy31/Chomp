import { describe, it, expect, beforeAll, afterEach, afterAll } from '@jest/globals';
import express, { NextFunction, Request, Response } from 'express';
import mongoose from 'mongoose';
import request from 'supertest';
import app from '../../src/app';
import { Club } from '../../src/clubs/model/clubModel';
import { Membership } from '../../src/clubs/model/membershipModel';
import { clearTestDb, closeTestDb, connectTestDb } from '../helpers/db';

function asUser(userId: string) {
  const wrapper = express();
  wrapper.use((req: Request, _res: Response, next: NextFunction) => {
    (req as Request & { session?: { userId?: string } }).session = { userId };
    next();
  });
  wrapper.use(app);
  return wrapper;
}

async function createClub(status: 'PENDING' | 'APPROVED' | 'REJECTED' = 'APPROVED') {
  return Club.create({
    name: `Club ${new mongoose.Types.ObjectId().toHexString()}`,
    description: 'Weekly meetings',
    proposerId: new mongoose.Types.ObjectId(),
    status,
  });
}

describe('POST /api/clubs/:clubId/join', () => {
  beforeAll(async () => {
    await connectTestDb();
    await Promise.all([Club.init(), Membership.init()]);
  }, 60000);

  afterEach(async () => {
    await clearTestDb();
  });

  afterAll(async () => {
    await closeTestDb();
  });

  it('creates an active member membership and returns 201', async () => {
    const club = await createClub();
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

  it('reactivates an inactive membership as an active member', async () => {
    const club = await createClub();
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
    const club = await createClub(status);
    const userId = new mongoose.Types.ObjectId().toHexString();

    const res = await request(asUser(userId)).post(`/api/clubs/${club._id.toString()}/join`);

    expect(res.status).toBe(403);
    expect(res.body.code).toBe('ERR_CLUB_NOT_APPROVED');
    expect(res.body.message).toBe(message);
    expect(await Membership.countDocuments()).toBe(0);
  });

  it('returns 401 when the student is not logged in', async () => {
    const club = await createClub();

    const res = await request(app).post(`/api/clubs/${club._id.toString()}/join`);

    expect(res.status).toBe(401);
    expect(res.body.code).toBe('ERR_AUTHENTICATION_REQUIRED');
    expect(res.body.message).toBe('Authentication required');
    expect(await Membership.countDocuments()).toBe(0);
  });

  it('returns 403 when a removed student tries to rejoin', async () => {
    const club = await createClub();
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
    const club = await createClub();
    const userId = new mongoose.Types.ObjectId();
    await Membership.create({ userId, clubId: club._id, status: 'ACTIVE' });

    const res = await request(asUser(userId.toHexString())).post(`/api/clubs/${club._id.toString()}/join`);

    expect(res.status).toBe(409);
    expect(res.body.code).toBe('ERR_ALREADY_MEMBER');
    expect(res.body.message).toBe('Already an active member of this club');
    expect(await Membership.countDocuments({ userId, clubId: club._id })).toBe(1);
  });

  it.each([
    ['PENDING', 'A request to join this club is already pending'],
    ['REJECTED', 'A previous request to join this club was rejected'],
  ] as const)('returns 409 when the existing membership is %s', async (status, message) => {
    const club = await createClub();
    const userId = new mongoose.Types.ObjectId();
    await Membership.create({ userId, clubId: club._id, status });

    const res = await request(asUser(userId.toHexString())).post(`/api/clubs/${club._id.toString()}/join`);

    expect(res.status).toBe(409);
    expect(res.body.code).toBe('ERR_ALREADY_MEMBER');
    expect(res.body.message).toBe(message);
    expect(await Membership.countDocuments({ userId, clubId: club._id })).toBe(1);
  });
});
