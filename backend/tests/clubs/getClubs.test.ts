import { describe, it, expect, beforeAll, afterEach, afterAll } from '@jest/globals';
import mongoose from 'mongoose';
import request from 'supertest';
import app from '../../src/app';
import { Club } from '../../src/clubs/model/clubModel';
import { clearTestDb, closeTestDb, connectTestDb } from '../helpers/db';

function clubInput(name: string, status: 'PENDING' | 'APPROVED' | 'REJECTED', category = 'OTHER') {
  return {
    name,
    description: `${name} description`,
    category,
    proposerId: new mongoose.Types.ObjectId(),
    status,
  };
}

describe('GET /api/clubs', () => {
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

  it('returns approved clubs sorted by name and omits review fields', async () => {
    await Club.create(clubInput('Zebra Club', 'APPROVED', 'ACADEMIC'));
    await Club.create(clubInput('Alpha Club', 'APPROVED', 'CULTURAL'));
    await Club.create(clubInput('Pending Club', 'PENDING', 'SPORTS'));
    await Club.create(clubInput('Rejected Club', 'REJECTED', 'OTHER'));

    const res = await request(app).get('/api/clubs');

    expect(res.status).toBe(200);
    expect(res.body.clubs.map((club: { name: string }) => club.name)).toEqual(['Alpha Club', 'Zebra Club']);
    for (const club of res.body.clubs) {
      expect(club.proposerId).toBeUndefined();
      expect(club.status).toBeUndefined();
      expect(club.createdAt).toBeUndefined();
      expect(club.updatedAt).toBeUndefined();
      expect(club.__v).toBeUndefined();
    }
  });

  it('returns 200 and an empty clubs array when nothing is approved', async () => {
    await Club.create(clubInput('Pending Club', 'PENDING'));
    await Club.create(clubInput('Rejected Club', 'REJECTED'));

    const res = await request(app).get('/api/clubs');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ clubs: [] });
  });

  it('filters approved clubs by category', async () => {
    await Club.create(clubInput('Soccer Club', 'APPROVED', 'SPORTS'));
    await Club.create(clubInput('Chess Club', 'APPROVED', 'ACADEMIC'));
    await Club.create(clubInput('Pending Sports', 'PENDING', 'SPORTS'));

    const res = await request(app).get('/api/clubs').query({ category: 'SPORTS' });

    expect(res.status).toBe(200);
    expect(res.body.clubs).toHaveLength(1);
    expect(res.body.clubs[0].name).toBe('Soccer Club');
    expect(res.body.clubs[0].category).toBe('SPORTS');
  });

  it('matches a category without regard to case or surrounding spaces', async () => {
    await Club.create(clubInput('Soccer Club', 'APPROVED', 'SPORTS'));
    await Club.create(clubInput('Chess Club', 'APPROVED', 'ACADEMIC'));

    const res = await request(app).get('/api/clubs').query({ category: ' sports ' });

    expect(res.status).toBe(200);
    expect(res.body.clubs.map((club: { name: string }) => club.name)).toEqual(['Soccer Club']);
  });

  it('returns approved clubs in any of the requested categories', async () => {
    await Club.create(clubInput('Soccer Club', 'APPROVED', 'SPORTS'));
    await Club.create(clubInput('Chess Club', 'APPROVED', 'ACADEMIC'));
    await Club.create(clubInput('Film Club', 'APPROVED', 'CULTURAL'));
    await Club.create(clubInput('Pending Sports', 'PENDING', 'SPORTS'));

    const res = await request(app).get('/api/clubs').query({ category: ['sports', 'Academic'] });

    expect(res.status).toBe(200);
    expect(res.body.clubs.map((club: { name: string }) => club.name)).toEqual([
      'Chess Club',
      'Soccer Club',
    ]);
  });

  it('returns 400 when the requested category is unknown', async () => {
    await Club.create(clubInput('Soccer Club', 'APPROVED', 'SPORTS'));

    const res = await request(app).get('/api/clubs').query({ category: 'banana' });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('ERR_INVALID_CATEGORY');
    expect(res.body.message).toBe('Invalid Category');
  });

  it('returns 400 when any requested category is unknown', async () => {
    await Club.create(clubInput('Soccer Club', 'APPROVED', 'SPORTS'));
    await Club.create(clubInput('Chess Club', 'APPROVED', 'ACADEMIC'));

    const res = await request(app).get('/api/clubs').query({ category: ['banana', ' sports '] });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('ERR_INVALID_CATEGORY');
    expect(res.body.message).toBe('Invalid Category');
  });

  it('excludes pending and rejected clubs from the public list', async () => {
    await Club.create(clubInput('Approved Club', 'APPROVED'));
    await Club.create(clubInput('Pending Club', 'PENDING'));
    await Club.create(clubInput('Rejected Club', 'REJECTED'));

    const res = await request(app).get('/api/clubs');
    const names = res.body.clubs.map((club: { name: string }) => club.name);

    expect(names).toEqual(['Approved Club']);
    expect(names).not.toContain('Pending Club');
    expect(names).not.toContain('Rejected Club');
  });
});
