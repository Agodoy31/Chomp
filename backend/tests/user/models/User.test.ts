import { describe, test, expect, beforeAll, afterEach, afterAll } from '@jest/globals';
import { connectTestDb, clearTestDb, closeTestDb } from '../../helpers/db';
import { User } from '../../../src/user/models/User';

describe('User Model Testing', () => {
  beforeAll(async () => {
    await connectTestDb();
    await User.init();
  }, 60000); // 60s timeout limit

  afterEach(async () => {
    await clearTestDb();
  });

  afterAll(async () => {
    await closeTestDb();
  });

  describe('Happy path & defaults', () => {
    test('creates a user with valid required fields and applies defaults', async () => {
      const user = await User.create({
        email: 'albert@ufl.edu',
        hashedPassword: 'hashedPassword123',
        firstName: 'Albert',
        lastName: 'Gator',
      });

      expect(user.email).toBe('albert@ufl.edu');
      expect(user.firstName).toBe('Albert');
      expect(user.lastName).toBe('Gator');
      expect(user.bio).toBe("This user doesn't have a bio yet!");
      expect(user.isAdmin).toBe(false);
      expect(user.createdAt).toBeInstanceOf(Date);
      expect(user.updatedAt).toBeInstanceOf(Date);
    });

    test('rejects email with double at sign', async () => {
      await expect(User.create({
        email: 'altert@@ufl.edu',
        hashedPassword: 'hashedPassword123',
        firstName: 'Albert',
        lastName: 'Gator',
      })).rejects.toThrow(/email must be a ufl email/i);
    });

    test('rejects email with double at sign', async () => {
      await expect(User.create({
        email: 'altert gator@ufl.edu',
        hashedPassword: 'hashedPassword123',
        firstName: 'Albert',
        lastName: 'Gator',
      })).rejects.toThrow(/email must be a ufl email/i);
    });

    test('creates a user with custom bio and isAdmin explicitly set', async () => {
      const user = await User.create({
        email: 'alberta@ufl.edu',
        hashedPassword: 'hashedPassword456',
        firstName: 'Alberta',
        lastName: 'Gator',
        bio: 'Official mascot of UF',
        isAdmin: true,
      });

      expect(user.bio).toBe('Official mascot of UF');
      expect(user.isAdmin).toBe(true);
    });
  });

  describe('Sanitization (trim & lowercase)', () => {
    test('converts uppercase email to lowercase', async () => {
      const user = await User.create({
        email: 'ALBERT@UFL.EDU',
        hashedPassword: 'hashedPassword123',
        firstName: 'Albert',
        lastName: 'Gator',
      });

      expect(user.email).toBe('albert@ufl.edu');
    });

    test('trims surrounding whitespace from email, firstName, and lastName', async () => {
      const user = await User.create({
        email: '  albert@ufl.edu  ',
        hashedPassword: 'hashedPassword123',
        firstName: '   Albert   ',
        lastName: '   Gator   ',
      });

      expect(user.email).toBe('albert@ufl.edu');
      expect(user.firstName).toBe('Albert');
      expect(user.lastName).toBe('Gator');
    });
  });

  describe('Required field validations', () => {
    test('rejects user creation when email is missing', async () => {
      await expect(
        User.create({
          hashedPassword: 'hashedPassword123',
          firstName: 'Albert',
          lastName: 'Gator',
        } as any)
      ).rejects.toThrow(/an email is required/i);
    });

    test('rejects user creation when hashedPassword is missing', async () => {
      await expect(
        User.create({
          email: 'albert@ufl.edu',
          firstName: 'Albert',
          lastName: 'Gator',
        } as any)
      ).rejects.toThrow(/a password is required/i);
    });

    test('rejects user creation when firstName is missing', async () => {
      await expect(
        User.create({
          email: 'albert@ufl.edu',
          hashedPassword: 'hashedPassword123',
          lastName: 'Gator',
        } as any)
      ).rejects.toThrow(/first name is required/i);
    });

    test('rejects user creation when lastName is missing', async () => {
      await expect(
        User.create({
          email: 'albert@ufl.edu',
          hashedPassword: 'hashedPassword123',
          firstName: 'Albert',
        } as any)
      ).rejects.toThrow(/last name is required/i);
    });
  });

  describe('Custom email validator', () => {
    test('rejects email not ending with @ufl.edu', async () => {
      await expect(
        User.create({
          email: 'albert@gmail.com',
          hashedPassword: 'hashedPassword123',
          firstName: 'Albert',
          lastName: 'Gator',
        })
      ).rejects.toThrow(/email must be a ufl email/i);
    });

    test('rejects email if length is not greater than 8 characters', async () => {
      // '@ufl.edu' has length 8, which fails length > 8
      await expect(
        User.create({
          email: '@ufl.edu',
          hashedPassword: 'hashedPassword123',
          firstName: 'Albert',
          lastName: 'Gator',
        })
      ).rejects.toThrow(/email must be a ufl email/i);
    });

    test('accepts valid ufl email with length greater than 8', async () => {
      // 'a@ufl.edu' has length 9 (> 8) and ends with '@ufl.edu'
      const user = await User.create({
        email: 'a@ufl.edu',
        hashedPassword: 'hashedPassword123',
        firstName: 'Albert',
        lastName: 'Gator',
      });

      expect(user.email).toBe('a@ufl.edu');
    });
  });

  describe('Unique email constraint', () => {
    test('rejects duplicate email registration', async () => {
      await User.create({
        email: 'albert@ufl.edu',
        hashedPassword: 'hashedPassword123',
        firstName: 'Albert',
        lastName: 'Gator',
      });

      // Attempt to register a duplicate email
      await expect(
        User.create({
          email: 'albert@ufl.edu',
          hashedPassword: 'differentPassword456',
          firstName: 'Another',
          lastName: 'User',
        })
      ).rejects.toThrow();
    });
  });

  describe('Password field projection (select: false)', () => {
    test('does not return hashedPassword by default when queried', async () => {
      await User.create({
        email: 'albert@ufl.edu',
        hashedPassword: 'superSecretPasswordHash',
        firstName: 'Albert',
        lastName: 'Gator',
      });

      const foundUser = await User.findOne({ email: 'albert@ufl.edu' });
      expect(foundUser).not.toBeNull();
      expect(foundUser?.hashedPassword).toBeUndefined();
    });

    test('returns hashedPassword when explicitly selected', async () => {
      await User.create({
        email: 'albert@ufl.edu',
        hashedPassword: 'superSecretPasswordHash',
        firstName: 'Albert',
        lastName: 'Gator',
      });

      const foundUser = await User.findOne({ email: 'albert@ufl.edu' }).select('+hashedPassword');
      expect(foundUser).not.toBeNull();
      expect(foundUser?.hashedPassword).toBe('superSecretPasswordHash');
    });
  });
});