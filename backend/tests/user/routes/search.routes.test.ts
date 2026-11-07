import request from 'supertest';
import app from '../../../src/app';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from '@jest/globals';
import { clearTestDb, closeTestDb, connectTestDb } from '../../helpers/db';
import { User } from '../../../src/user/models/User';
import { hashPassword } from '../../../src/user/utils/passwordHashing';
import { logIn, LoggedInAgent } from '../../helpers/auth';

beforeAll(async () => {
  await connectTestDb();
  await User.init();
}, 60000);

afterEach(async () => {
  await clearTestDb();
});

afterAll(async () => {
  await closeTestDb();
});

describe('User Search Routes GET /api/search', () => {
  let loggedInUser: { email: string; _id: unknown };
  let agent: LoggedInAgent;

  beforeEach(async () => {
    loggedInUser = await User.create({
      email: 'currentuser@ufl.edu',
      hashedPassword: await hashPassword('password123'),
      firstName: 'Current',
      lastName: 'User',
    });

    agent = await logIn({ email: loggedInUser.email });
  });

  describe('Authentication & Validation', () => {
    test('Rejects request without session cookie', async () => {
      const res = await request(app).get('/api/search?search=Albert');

      expect(res.status).toBe(401);
      expect(res.body.message).toBe('ERR_REQUIRE_AUTH');
      expect(res.body.redirectTo).toBe('/login');
    });

    test('Rejects missing search query parameter', async () => {
      const res = await agent.get('/api/search');

      expect(res.status).toBe(400);
      expect(res.body.message).toBe('ERR_SEARCH_REQUIRED');
    });

    test('Rejects empty or whitespace-only search query', async () => {
      const res = await agent.get('/api/search?search=   ');

      expect(res.status).toBe(400);
      expect(res.body.message).toBe('ERR_SEARCH_REQUIRED');
    });

    test('Rejects search query with invalid characters', async () => {
      const res = await agent.get('/api/search?search=Albert<script>');

      expect(res.status).toBe(400);
      expect(res.body.message).toBe('ERR_SEARCH_INVALID_CHARACTERS');
    });

    test('Rejects search query exceeding 100 characters', async () => {
      const longQuery = 'a'.repeat(101);
      const res = await agent.get(`/api/search?search=${longQuery}`);

      expect(res.status).toBe(400);
      expect(res.body.message).toBe('ERR_SEARCH_TOO_LONG');
    });
  });

  describe('Search Functionality', () => {
    beforeEach(async () => {
      await User.create([
        {
          email: 'albert.gator@ufl.edu',
          hashedPassword: await hashPassword('password123'),
          firstName: 'Albert',
          lastName: 'Gator',
        },
        {
          email: 'alberta.gator@ufl.edu',
          hashedPassword: await hashPassword('password123'),
          firstName: 'Alberta',
          lastName: 'Gator',
        },
        {
          email: 'charlie.brown@ufl.edu',
          hashedPassword: await hashPassword('password123'),
          firstName: 'Charlie',
          lastName: 'Brown',
        },
      ]);
    });

    test('Matches by first name (case-insensitive)', async () => {
      const res = await agent.get('/api/search?search=alb');

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBe(2);

      const firstNames = res.body.map((u: { firstName: string }) => u.firstName);
      expect(firstNames).toContain('Albert');
      expect(firstNames).toContain('Alberta');
    });

    test('Matches by last name (case-insensitive)', async () => {
      const res = await agent.get('/api/search?search=brown');

      expect(res.status).toBe(200);
      expect(res.body.length).toBe(1);
      expect(res.body[0].firstName).toBe('Charlie');
      expect(res.body[0].lastName).toBe('Brown');
    });

    test('Matches by email (case-insensitive)', async () => {
      const res = await agent.get('/api/search?search=charlie.brown');

      expect(res.status).toBe(200);
      expect(res.body.length).toBe(1);
      expect(res.body[0].email).toBe('charlie.brown@ufl.edu');
    });

    test('Matches by full name across first and last name', async () => {
      const res = await agent.get('/api/search?search=Albert Gat');

      expect(res.status).toBe(200);
      expect(res.body.length).toBe(1);
      expect(res.body[0].firstName).toBe('Albert');
      expect(res.body[0].lastName).toBe('Gator');
    });

    test('Excludes currently logged-in user from results', async () => {
      const res = await agent.get('/api/search?search=User');

      expect(res.status).toBe(200);
      // 'Current User' should not appear in search results
      const userIds = res.body.map((u: { _id: string }) => u._id);
      expect(userIds).not.toContain(String(loggedInUser._id));
    });

    test('Excludes sensitive fields (no hashedPassword leaked)', async () => {
      const res = await agent.get('/api/search?search=Charlie');

      expect(res.status).toBe(200);
      expect(res.body.length).toBe(1);
      const user = res.body[0];
      expect(user._id).toBeDefined();
      expect(user.firstName).toBe('Charlie');
      expect(user.lastName).toBe('Brown');
      expect(user.email).toBe('charlie.brown@ufl.edu');
      expect(user.hashedPassword).toBeUndefined();
      expect(user.__v).toBeUndefined();
    });

    test('Limits results to maximum of 10 users', async () => {
      // Create 12 more users that all share "Match" in their first name
      const batch = Array.from({ length: 12 }, (_, i) => ({
        email: `match_user_${i}@ufl.edu`,
        hashedPassword: 'hashedPasswordPlaceholder',
        firstName: `Match${i}`,
        lastName: 'Test',
      }));
      await User.insertMany(batch);

      const res = await agent.get('/api/search?search=Match');

      expect(res.status).toBe(200);
      expect(res.body.length).toBe(10);
    });
  });
});
