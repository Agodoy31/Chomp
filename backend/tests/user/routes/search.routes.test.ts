import request from 'supertest';
import app from '../../../src/app';
import { afterAll, beforeAll, describe, expect, test } from '@jest/globals';
import { clearTestDb, closeTestDb, connectTestDb } from '../../helpers/db';
import { User } from '../../../src/user/models/User';
import { createUser, logIn, LoggedInAgent } from '../../helpers/auth';

beforeAll(async () => {
  await connectTestDb();
  await User.init();
  await clearTestDb();
}, 60000);

afterAll(async () => {
  await closeTestDb();
});

describe('User Search Routes GET /api/users/search', () => {
  let currentUserId: string;
  let agent: LoggedInAgent;

  beforeAll(async () => {
    const user = await createUser();
    currentUserId = user._id.toString();
    agent = await logIn({ email: user.email });

    await User.create([
      {
        email: 'albert.gator@ufl.edu',
        hashedPassword: 'hashedPasswordPlaceholder',
        firstName: 'Albert',
        lastName: 'Gator',
      },
      {
        email: 'alberta.gator@ufl.edu',
        hashedPassword: 'hashedPasswordPlaceholder',
        firstName: 'Alberta',
        lastName: 'Gator',
      },
      {
        email: 'charlie.brown@ufl.edu',
        hashedPassword: 'hashedPasswordPlaceholder',
        firstName: 'Charlie',
        lastName: 'Brown',
      },
    ]);
  });

  describe('Authentication & Validation', () => {
    test('Rejects request without session cookie', async () => {
      const res = await request(app).get('/api/users/search?search=Albert');

      expect(res.status).toBe(401);
      expect(res.body.message).toBe('ERR_REQUIRE_AUTH');
      expect(res.body.redirectTo).toBe('/login');
    });

    test('Rejects missing search query parameter', async () => {
      const res = await agent.get('/api/users/search');

      expect(res.status).toBe(400);
      expect(res.body.message).toBe('ERR_SEARCH_REQUIRED');
    });

    test('Rejects empty or whitespace-only search query', async () => {
      const res = await agent.get('/api/users/search?search=   ');

      expect(res.status).toBe(400);
      expect(res.body.message).toBe('ERR_SEARCH_REQUIRED');
    });

    test('Rejects search query with invalid characters', async () => {
      const res = await agent.get('/api/users/search?search=Albert<script>');

      expect(res.status).toBe(400);
      expect(res.body.message).toBe('ERR_SEARCH_INVALID_CHARACTERS');
    });

    test('Rejects search query exceeding 100 characters', async () => {
      const longQuery = 'a'.repeat(101);
      const res = await agent.get(`/api/users/search?search=${longQuery}`);

      expect(res.status).toBe(400);
      expect(res.body.message).toBe('ERR_SEARCH_TOO_LONG');
    });
  });

  describe('Search Functionality', () => {
    test('Matches by first name (case-insensitive)', async () => {
      const res = await agent.get('/api/users/search?search=alb');

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBe(2);

      const firstNames = res.body.map((u: { firstName: string }) => u.firstName);
      expect(firstNames).toContain('Albert');
      expect(firstNames).toContain('Alberta');
    });

    test('Matches by last name (case-insensitive)', async () => {
      const res = await agent.get('/api/users/search?search=brown');

      expect(res.status).toBe(200);
      expect(res.body.length).toBe(1);
      expect(res.body[0].firstName).toBe('Charlie');
      expect(res.body[0].lastName).toBe('Brown');
    });

    test('Matches by email (case-insensitive)', async () => {
      const res = await agent.get('/api/users/search?search=charlie.brown');

      expect(res.status).toBe(200);
      expect(res.body.length).toBe(1);
      expect(res.body[0].email).toBe('charlie.brown@ufl.edu');
    });

    test('Matches by full name across first and last name', async () => {
      const res = await agent.get('/api/users/search?search=Albert Gat');

      expect(res.status).toBe(200);
      expect(res.body.length).toBe(1);
      expect(res.body[0].firstName).toBe('Albert');
      expect(res.body[0].lastName).toBe('Gator');
    });

    test('Excludes currently logged-in user from results', async () => {
      const res = await agent.get('/api/users/search?search=Albert');

      expect(res.status).toBe(200);
      const userIds = res.body.map((u: { _id: string }) => u._id);
      expect(userIds).not.toContain(currentUserId);
    });

    test('Excludes sensitive fields (no hashedPassword leaked)', async () => {
      const res = await agent.get('/api/users/search?search=Charlie');

      expect(res.status).toBe(200);
      expect(res.body.length).toBe(1);
      const user = res.body[0];
      expect(Object.keys(user).sort()).toEqual(['_id', 'email', 'firstName', 'lastName']);
    });

    test('Limits results to maximum of 10 users', async () => {
      const batch = Array.from({ length: 12 }, (_, i) => ({
        email: `match_user_${i}@ufl.edu`,
        hashedPassword: 'hashedPasswordPlaceholder',
        firstName: `Match${i}`,
        lastName: 'Test',
      }));
      await User.insertMany(batch);

      try {
        const res = await agent.get('/api/users/search?search=Match');

        expect(res.status).toBe(200);
        expect(res.body.length).toBe(10);
      } finally {
        await User.deleteMany({ firstName: /^Match/ });
      }
    });
  });
});
