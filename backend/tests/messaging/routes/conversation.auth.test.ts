import { afterAll, afterEach, beforeAll, describe, expect, it } from '@jest/globals';
import request from 'supertest';
import app from '../../../src/app';
import { clearTestDb, closeTestDb, connectTestDb } from '../../helpers/db';
import { Conversation } from '../../../src/messaging/models/Conversation';
import { ConversationParticipant } from '../../../src/messaging/models/ConversationParticipant';
import { Message } from '../../../src/messaging/models/Message';
import { User } from '../../../src/user/models/User';
import { Club } from '../../../src/clubs/model/clubModel';
import { createSignedInStudent } from './messagingRouteTestUtils';

beforeAll(async () => {
  await connectTestDb();
  await Promise.all([
    Club.init(),
    Conversation.init(),
    ConversationParticipant.init(),
    Message.init(),
    User.init(),
  ]);
}, 60000);

afterEach(async () => {
  await clearTestDb();
});

afterAll(async () => {
  await closeTestDb();
});

describe('conversation route authentication guards', () => {
  it('rejects unauthenticated GET /api/conversations with 401', async () => {
    const res = await request(app).get('/api/conversations');

    expect(res.status).toBe(401);
    expect(res.body).toEqual({
      message: 'ERR_REQUIRE_AUTH',
      redirectTo: '/login',
    });
  });

  it('rejects unauthenticated POST /api/conversations with 401', async () => {
    const res = await request(app)
      .post('/api/conversations')
      .send({ type: 'DIRECT', recipientId: '507f1f77bcf86cd799439011' });

    expect(res.status).toBe(401);
    expect(res.body).toEqual({
      message: 'ERR_REQUIRE_AUTH',
      redirectTo: '/login',
    });
  });

  it('rejects unauthenticated GET /api/conversations/:id with 401', async () => {
    const res = await request(app).get('/api/conversations/507f1f77bcf86cd799439011');

    expect(res.status).toBe(401);
    expect(res.body).toEqual({
      message: 'ERR_REQUIRE_AUTH',
      redirectTo: '/login',
    });
  });

  it('rejects unauthenticated GET and POST message routes with 401', async () => {
    const getRes = await request(app).get('/api/conversations/507f1f77bcf86cd799439011/messages');
    expect(getRes.status).toBe(401);
    expect(getRes.body).toEqual({
      message: 'ERR_REQUIRE_AUTH',
      redirectTo: '/login',
    });

    const postRes = await request(app)
      .post('/api/conversations/507f1f77bcf86cd799439011/messages')
      .send({ text: 'Hello from unauthenticated client' });
    expect(postRes.status).toBe(401);
    expect(postRes.body).toEqual({
      message: 'ERR_REQUIRE_AUTH',
      redirectTo: '/login',
    });
  });

  it('allows authenticated session past requireAuth to reach conversation router', async () => {
    const { agent } = await createSignedInStudent({
      firstName: 'Century',
      lastName: 'Tower',
      email: 'carillon@ufl.edu',
    });

    const res = await agent.get('/api/conversations');
    expect(res.status).not.toBe(401);
    expect(res.status).toBe(404);
  });
});
