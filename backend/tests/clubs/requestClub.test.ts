import { describe, it, expect, beforeAll, afterEach, afterAll } from '@jest/globals';
import mongoose from 'mongoose';
import request from 'supertest';
import app from '../../src/app';
import { Club } from '../../src/clubs/model/clubModel';
import { User } from '../../src/user/models/User';
import { createUser, logIn, type LoggedInAgent } from '../helpers/auth';
import { clearTestDb, closeTestDb, connectTestDb } from '../helpers/db';

function clubInput(overrides: Record<string, unknown> = {}) {
  return {
    name: 'Chess Club',
    description: 'Weekly chess matches',
    ...overrides,
  };
}

describe('POST /api/clubs', () => {
  let student: LoggedInAgent;
  let studentId: string;
  let otherStudentId: mongoose.Types.ObjectId;

  beforeAll(async () => {
    await connectTestDb();
    await Promise.all([Club.init(), User.init()]);
    const [user, otherUser] = await Promise.all([createUser(), createUser()]);
    studentId = user._id.toString();
    otherStudentId = otherUser._id;
    student = await logIn(user);
  }, 60000);

  afterEach(async () => {
    await clearTestDb(['users']);
  });

  afterAll(async () => {
    await closeTestDb();
  });

  it('saves a pending request with trimmed fields and the logged-in student as proposer', async () => {
    const res = await student
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
    expect(res.body).toMatchObject({ ...expected, proposerId: studentId });

    const stored = await Club.findById(res.body._id).lean();
    expect(stored).toMatchObject(expected);
    expect(stored?.proposerId.toString()).toBe(studentId);
  });

  it('defaults the category to OTHER and stores no meeting when both are omitted', async () => {
    const res = await student.post('/api/clubs').send(clubInput());

    expect(res.status).toBe(201);
    expect(res.body.category).toBe('OTHER');
    expect(res.body.meeting).toBeUndefined();
  });

  it('stores only the meeting fields that were sent', async () => {
    const res = await student
      .post('/api/clubs')
      .send(clubInput({ meeting: { day: 'Monday' } }));

    expect(res.status).toBe(201);
    const stored = await Club.findById(res.body._id).lean();
    expect(stored?.meeting).toEqual({ day: 'Monday' });
  });

  it('accepts each field at its max length', async () => {
    const res = await student
      .post('/api/clubs')
      .send({
        name: 'a'.repeat(100),
        description: 'a'.repeat(1000),
        meeting: { day: 'Wednesday', time: '12:30 PM', location: 'a'.repeat(120) },
      });

    expect(res.status).toBe(201);
  });

  it('ignores a status or proposerId sent in the body', async () => {
    const res = await student
      .post('/api/clubs')
      .send(clubInput({ status: 'APPROVED', proposerId: new mongoose.Types.ObjectId().toString() }));

    expect(res.status).toBe(201);
    expect(res.body.status).toBe('PENDING');
    expect(res.body.proposerId).toBe(studentId);
  });

  it('accepts a name that another pending request already uses', async () => {
    await Club.create({ ...clubInput(), proposerId: otherStudentId });

    const res = await student.post('/api/clubs').send(clubInput());

    expect(res.status).toBe(201);
    expect(await Club.countDocuments({ status: 'PENDING' })).toBe(2);
  });

  it('returns 409 when an approved club already uses the name in any letter case', async () => {
    await Club.create({ ...clubInput(), proposerId: otherStudentId, status: 'APPROVED' });

    const res = await student
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
    expect(res.body).toEqual({ message: 'ERR_REQUIRE_AUTH', redirectTo: '/login' });
    expect(await Club.countDocuments()).toBe(0);
  });

  it('returns 400 when the body, name, or description is missing or blank', async () => {
    const cases: [string | object | undefined, string][] = [
      [undefined, 'Club name is required'],
      [['Chess Club'], 'Club name is required'],
      [{ description: 'Weekly chess matches' }, 'Club name is required'],
      [clubInput({ name: '   ' }), 'Club name is required'],
      [{ name: 'Chess Club' }, 'Club description is required'],
      [clubInput({ description: '   ' }), 'Club description is required'],
    ];

    for (const [body, message] of cases) {
      const res = await student.post('/api/clubs').send(body);
      expect({ status: res.status, body: res.body }).toEqual({
        status: 400,
        body: { code: 'ERR_INVALID_CLUB_REQUEST', message },
      });
    }
    expect(await Club.countDocuments()).toBe(0);
  });

  it('returns 400 with the field error for wrong types, long text, and bad formats', async () => {
    const hexDump = Array.from({ length: 4000 }, (_, i) => '0x' + (0xdeadbeef + i).toString(16)).join('_');
    const cases: [Record<string, unknown>, string][] = [
      [
        { name: hexDump, description: false, meeting: { day: 999999, time: true, location: 404 } },
        'Club name must be 100 characters or fewer',
      ],
      [{ name: 'a'.repeat(101) }, 'Club name must be 100 characters or fewer'],
      [{ name: 'Chess Club <3' }, "Club name can only use letters, numbers, spaces, and & ' . , -"],
      [{ name: 42 }, 'Club name must be text'],
      [{ description: false }, 'Club description must be text'],
      [{ description: 'a'.repeat(1001) }, 'Club description must be 1000 characters or fewer'],
      [{ meeting: 'Wednesday' }, 'Meeting details must be an object'],
      [{ meeting: ['Wednesday'] }, 'Meeting details must be an object'],
      [{ meeting: { day: { at: 'noon' } } }, 'Meeting day must be text'],
      [{ meeting: { day: 'Someday' } }, 'Meeting day must be a day of the week'],
      [{ meeting: { time: true } }, 'Meeting time must be text'],
      [{ meeting: { time: '25:00' } }, 'Meeting time must look like 6:30 PM'],
      [{ meeting: { location: 404 } }, 'Meeting location must be text'],
      [{ meeting: { location: 'a'.repeat(121) } }, 'Meeting location must be 120 characters or fewer'],
    ];

    for (const [overrides, message] of cases) {
      const res = await student.post('/api/clubs').send(clubInput(overrides));
      expect({ status: res.status, body: res.body }).toEqual({
        status: 400,
        body: { code: 'ERR_INVALID_CLUB_REQUEST', message },
      });
    }
    expect(await Club.countDocuments()).toBe(0);
  });

  it('returns 400 with ERR_INVALID_CATEGORY for an unknown, blank, or non-text category', async () => {
    for (const category of ['GAMING', '', '   ', 42, null]) {
      const res = await student.post('/api/clubs').send(clubInput({ category }));
      expect({ status: res.status, body: res.body }).toEqual({
        status: 400,
        body: { code: 'ERR_INVALID_CATEGORY', message: 'Invalid Category' },
      });
    }
    expect(await Club.countDocuments()).toBe(0);
  });
});
