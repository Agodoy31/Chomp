import mongoose from 'mongoose';
import request from 'supertest';
import app from '../../src/app';
import { User } from '../../src/user/models/User';
import { hashPassword } from '../../src/user/utils/passwordHashing';

const PASSWORD = 'password123';
let hashedPassword: Promise<string> | undefined;

export type LoggedInAgent = ReturnType<typeof request.agent>;

/**
 * Create a stored user who can log in with the shared test password.
 * The password is hashed once per test file to keep setup fast.
 */
export async function createUser(isAdmin = false) {
  hashedPassword ??= hashPassword(PASSWORD);
  const userId = new mongoose.Types.ObjectId();
  return User.create({
    _id: userId,
    email: `student_${userId.toString()}@ufl.edu`,
    hashedPassword: await hashedPassword,
    firstName: 'Albert',
    lastName: 'Gator',
    isAdmin,
  });
}

/**
 * Log a user in through /api/auth/login and return an agent that sends the session cookie.
 */
export async function logIn(user: { email: string }): Promise<LoggedInAgent> {
  const agent = request.agent(app);
  await agent.post('/api/auth/login').send({ email: user.email, password: PASSWORD }).expect(200);
  return agent;
}
