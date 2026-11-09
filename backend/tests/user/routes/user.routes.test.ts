import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import mongoose from 'mongoose';
import request from 'supertest';
import app from '../../../src/app';
import { closeTestDb, connectTestDb } from '../../helpers/db';
import { logIn, type LoggedInAgent } from '../../helpers/auth';
import { User } from '../../../src/user/models/User';
import { Club } from '../../../src/clubs/model/clubModel';
import { Membership } from '../../../src/clubs/model/membershipModel';
import { hashPassword } from '../../../src/user/utils/passwordHashing';

let dannyAgent: LoggedInAgent;
let marstonDweller: InstanceType<typeof User>;

describe('GET /api/users/:userId', () => {
  beforeAll(async () => {
    await connectTestDb();
    await User.init();
    await Club.init();
    await Membership.init();

    const danny = await User.create({
      email: 'dwuerffel@ufl.edu',
      firstName: 'Danny',
      lastName: 'Wuerffel',
      hashedPassword: await hashPassword('password123'),
      isAdmin: false,
    });
    marstonDweller = await User.create({
      email: 'basement.coder@ufl.edu',
      firstName: 'Marston',
      lastName: 'Dweller',
      bio: 'Camping in the basement until operating systems finals end.',
      hashedPassword: await hashPassword('password123'),
      isAdmin: false,
    });
    await User.create({
      email: 'newell3am@ufl.edu',
      firstName: 'Newell',
      lastName: 'Nightowl',
      hashedPassword: await hashPassword('password123'),
      isAdmin: false,
    });

    dannyAgent = await logIn({ email: 'dwuerffel@ufl.edu' });

    const cucumberClub = await Club.create({
      name: 'Cucumber Appreciation Club',
      status: 'APPROVED',
      category: 'OTHER',
      description: 'Pickling nights every other Friday.',
      proposerId: danny._id,
    });
    const marstonStudyGroup = await Club.create({
      name: 'Marston Basement Study Group',
      status: 'APPROVED',
      category: 'ACADEMIC',
      description: 'Late night study sessions on the basement floor.',
      proposerId: danny._id,
    });
    const pendingClub = await Club.create({
      name: 'Pending Club',
      status: 'PENDING',
      category: 'OTHER',
      description: 'Pending club description',
      proposerId: danny._id,
    });

    await Membership.create({
      userId: marstonDweller._id,
      clubId: cucumberClub._id,
      role: 'MEMBER',
      status: 'ACTIVE',
    });
    await Membership.create({
      userId: marstonDweller._id,
      clubId: marstonStudyGroup._id,
      role: 'OFFICER',
      status: 'ACTIVE',
    });
    await Membership.create({
      userId: marstonDweller._id,
      clubId: pendingClub._id,
      role: 'MEMBER',
      status: 'PENDING',
    });
  });

  afterAll(async () => {
    await closeTestDb();
  });

  it('returns 200 with user profile and sorted active approved clubs', async () => {
    const res = await dannyAgent.get('/api/users/' + marstonDweller._id.toString());

    expect(res.status).toBe(200);
    expect(res.body.id).toBe(marstonDweller._id.toString());
    expect(res.body.firstName).toBe('Marston');
    expect(res.body.lastName).toBe('Dweller');
    expect(res.body.email).toBe('basement.coder@ufl.edu');
    expect(res.body.bio).toBe('Camping in the basement until operating systems finals end.');
    expect(res.body.hashedPassword).toBeUndefined();
    expect(res.body.isAdmin).toBeUndefined();
    expect(res.body.clubs).toHaveLength(2);
    expect(res.body.clubs[0].name).toBe('Cucumber Appreciation Club');
    expect(res.body.clubs[0].role).toBe('MEMBER');
    expect(res.body.clubs[1].name).toBe('Marston Basement Study Group');
    expect(res.body.clubs[1].role).toBe('OFFICER');
    for (const club of res.body.clubs) {
      expect(club).toHaveProperty('_id');
      expect(club).toHaveProperty('name');
      expect(club).toHaveProperty('description');
      expect(club).toHaveProperty('category');
      expect(club).toHaveProperty('role');
    }
  });

  it('returns 401 when request is unauthenticated', async () => {
    const res = await request(app).get('/api/users/' + marstonDweller._id.toString());

    expect(res.status).toBe(401);
    expect(res.body.message).toBe('ERR_REQUIRE_AUTH');
  });

  it('returns 400 with ERR_INVALID_INPUT when userId is not a valid 24-char hex ObjectId', async () => {
    const res = await dannyAgent.get('/api/users/not-a-valid-id');

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ code: 'ERR_INVALID_INPUT', message: 'Valid userId is required' });
  });

  it('returns 404 with ERR_USER_NOT_FOUND when user does not exist', async () => {
    const res = await dannyAgent.get('/api/users/' + new mongoose.Types.ObjectId().toString());

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ code: 'ERR_USER_NOT_FOUND', message: 'User not found' });
  });
});
