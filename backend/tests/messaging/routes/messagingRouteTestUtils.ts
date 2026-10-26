import request from 'supertest';
import app from '../../../src/app';
import { IUserDocument } from '../../../src/user/models/User';
import { hashPassword } from '../../../src/user/utils/passwordHashing';
import { createTestUser } from '../services/conversationTestUtils';

export const TEST_STUDENT_PASSWORD = 'GatorStudySession2026!';

let cachedHashedPassword = '';

export async function getTestPasswordHash(): Promise<string> {
  if (!cachedHashedPassword) {
    cachedHashedPassword = await hashPassword(TEST_STUDENT_PASSWORD);
  }
  return cachedHashedPassword;
}

export interface SignedInStudent {
  user: IUserDocument;
  agent: ReturnType<typeof request.agent>;
}

export async function createSignedInStudent(
  overrides: Partial<IUserDocument> = {}
): Promise<SignedInStudent> {
  const hashedPassword = await getTestPasswordHash();
  const user = await createTestUser({
    hashedPassword,
    ...overrides,
  });

  const agent = request.agent(app);
  const loginRes = await agent
    .post('/api/auth/login')
    .send({
      email: user.email,
      password: TEST_STUDENT_PASSWORD,
    });

  if (loginRes.status !== 200) {
    throw new Error(
      `createSignedInStudent login failed with status ${loginRes.status}: ${JSON.stringify(loginRes.body)}`
    );
  }

  return { user, agent };
}
