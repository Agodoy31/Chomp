import { describe, it, expect, beforeAll, afterEach, afterAll } from '@jest/globals';
import express, { NextFunction, Request, Response } from 'express';
import mongoose from 'mongoose';
import request from 'supertest';
import app from '../../src/app';
import { Club } from '../../src/clubs/model/clubModel';
import { sessionMiddleware } from '../../src/sessions/session';
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

function clubInput(overrides: Record<string, unknown> = {}) {
  return {
    name: 'Chess Club',
    description: 'Weekly chess matches',
    ...overrides,
  };
}

describe('POST /api/clubs', () => {
  const userId = new mongoose.Types.ObjectId().toString();

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

  it('saves a pending request with trimmed fields and the logged-in student as proposer', async () => {
    const res = await request(asUser(userId))
      .post('/api/clubs')
      .send({
        name: '  Chess Club  ',
        description: '  Weekly chess matches  ',
        category: ' academic ',
        meeting: { day: ' Wednesday ', time: '6:30 PM ', location: ' Turlington Hall 2304' },
      });

    const expected = {
      name: 'Chess Club',
      description: 'Weekly chess matches',
      category: 'ACADEMIC',
      meeting: { day: 'Wednesday', time: '6:30 PM', location: 'Turlington Hall 2304' },
      status: 'PENDING',
    };
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ ...expected, proposerId: userId });

    const stored = await Club.findById(res.body._id).lean();
    expect(stored).toMatchObject(expected);
    expect(stored?.proposerId.toString()).toBe(userId);
  });

  it('defaults the category to OTHER and stores no meeting when both are omitted', async () => {
    const res = await request(asUser(userId)).post('/api/clubs').send(clubInput());

    expect(res.status).toBe(201);
    expect(res.body.category).toBe('OTHER');
    expect(res.body.meeting).toBeUndefined();
  });

  it('stores only the meeting fields that were sent', async () => {
    const res = await request(asUser(userId))
      .post('/api/clubs')
      .send(clubInput({ meeting: { day: 'Monday' } }));

    expect(res.status).toBe(201);
    const stored = await Club.findById(res.body._id).lean();
    expect(stored?.meeting).toEqual({ day: 'Monday' });
  });

  it('accepts a description of exactly 1000 characters', async () => {
    const res = await request(asUser(userId))
      .post('/api/clubs')
      .send(clubInput({ description: 'a'.repeat(1000) }));

    expect(res.status).toBe(201);
  });

  it('ignores a status or proposerId sent in the body', async () => {
    const res = await request(asUser(userId))
      .post('/api/clubs')
      .send(clubInput({ status: 'APPROVED', proposerId: new mongoose.Types.ObjectId().toString() }));

    expect(res.status).toBe(201);
    expect(res.body.status).toBe('PENDING');
    expect(res.body.proposerId).toBe(userId);
  });

  it('accepts a name that another pending request already uses', async () => {
    await Club.create({ ...clubInput(), proposerId: new mongoose.Types.ObjectId() });

    const res = await request(asUser(userId)).post('/api/clubs').send(clubInput());

    expect(res.status).toBe(201);
    expect(await Club.countDocuments({ status: 'PENDING' })).toBe(2);
  });

  it('returns 409 when an approved club already uses the name in any letter case', async () => {
    await Club.create({ ...clubInput(), proposerId: new mongoose.Types.ObjectId(), status: 'APPROVED' });

    const res = await request(asUser(userId))
      .post('/api/clubs')
      .send(clubInput({ name: ' CHESS club ' }));

    expect(res.status).toBe(409);
    expect(res.body).toEqual({
      code: 'ERR_CLUB_NAME_EXISTS',
      message: 'An approved club already uses this name',
    });
    expect(await Club.countDocuments()).toBe(1);
  });

  it('returns 401 when the student is not logged in', async () => {
    const res = await request(app).post('/api/clubs').send(clubInput());

    expect(res.status).toBe(401);
    expect(res.body.code).toBe('ERR_AUTHENTICATION_REQUIRED');
    expect(await Club.countDocuments()).toBe(0);
  });

  it('returns 400 when no body is sent', async () => {
    const res = await request(asUser(userId)).post('/api/clubs');

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ code: 'ERR_INVALID_CLUB_REQUEST', message: 'Club name is required' });
    expect(await Club.countDocuments()).toBe(0);
  });

  it.each([
    ['the body is not an object', ['Chess Club'], 'Club name is required'],
    ['the name is missing', { description: 'Weekly chess matches' }, 'Club name is required'],
    ['the name is blank', clubInput({ name: '   ' }), 'Club name is required'],
    ['the description is missing', { name: 'Chess Club' }, 'Club description is required'],
    ['the description is blank', clubInput({ description: '   ' }), 'Club description is required'],
  ])('returns 400 when %s', async (_case, body, message) => {
    const res = await request(asUser(userId)).post('/api/clubs').send(body);

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ code: 'ERR_INVALID_CLUB_REQUEST', message });
    expect(await Club.countDocuments()).toBe(0);
  });

  it.each([
    ['the description is over 1000 characters', { description: 'a'.repeat(1001) }, 'description'],
    ['the meeting details are text', { meeting: 'Wednesday' }, 'meeting'],
    ['the meeting details are a list', { meeting: ['Wednesday'] }, 'meeting'],
    ['a meeting field cannot be stored as text', { meeting: { day: { at: 'noon' } } }, 'day'],
  ])('returns 400 with the schema message when %s', async (_case, overrides, field) => {
    const res = await request(asUser(userId)).post('/api/clubs').send(clubInput(overrides));

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('ERR_INVALID_CLUB_REQUEST');
    expect(res.body.message).toContain(field);
    expect(await Club.countDocuments()).toBe(0);
  });

  it.each(['GAMING', '', '   ', 42, null])('returns 400 with ERR_INVALID_CATEGORY for category %p', async (category) => {
    const res = await request(asUser(userId)).post('/api/clubs').send(clubInput({ category }));

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ code: 'ERR_INVALID_CATEGORY', message: 'Invalid Category' });
    expect(await Club.countDocuments()).toBe(0);
  });
});
