import { describe, it, expect, beforeAll, afterEach, afterAll, jest } from '@jest/globals';
import { Types } from 'mongoose';
import { connectTestDb, clearTestDb, closeTestDb } from '../../helpers/db';
import { Conversation } from '../../../src/messaging/models/Conversation';
import { ConversationParticipant } from '../../../src/messaging/models/ConversationParticipant';
import { Message } from '../../../src/messaging/models/Message';
import { User } from '../../../src/user/models/User';
import { Club } from '../../../src/clubs/model/clubModel';
import { ConversationType } from '../../../src/messaging/interfaces/conversation.interfaces';
import {
  createChannel,
  createDirectConversation,
  createGroupConversation,
  getUserConversations,
} from '../../../src/messaging/services/conversation.service';
import { createTestUser, createTestClub } from './conversationTestUtils';

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
  jest.restoreAllMocks();
  await clearTestDb();
});

afterAll(async () => {
  await closeTestDb();
});

describe('getUserConversations service', () => {
  it('returns direct message feed item with other user full name as displayName and latest message preview', async () => {
    const user1 = await createTestUser({
      firstName: 'GatorCorner',
      lastName: 'Survivor',
      email: 'soft_serve_broken@ufl.edu',
    });
    const user2 = await createTestUser({
      firstName: 'Potato',
      lastName: 'Sculpture',
      email: 'french_fries_monument@ufl.edu',
    });

    const { conversation } = await createDirectConversation(user1._id, user2._id);

    const message = await Message.create({
      conversationId: conversation._id,
      senderId: user2._id,
      text: 'Are the tenders ready at the dining hall',
    });

    const feed = await getUserConversations(user1._id);

    expect(feed).toHaveLength(1);
    expect(feed[0]._id.toString()).toBe(conversation._id.toString());
    expect(feed[0].type).toBe(ConversationType.DIRECT);
    expect(feed[0].displayName).toBe('Potato Sculpture');
    expect(feed[0].lastMessage).toBeDefined();
    expect(feed[0].lastMessage?.text).toBe('Are the tenders ready at the dining hall');
    expect(feed[0].lastMessage?.senderName).toBe('Potato Sculpture');
    expect(feed[0].lastActivityAt.getTime()).toBe(message.createdAt.getTime());
  });

  it('returns group conversation feed item with group title as displayName and sender details', async () => {
    const user1 = await createTestUser({
      firstName: 'GatorCorner',
      lastName: 'Survivor',
      email: 'soft_serve_broken@ufl.edu',
    });
    const user2 = await createTestUser({
      firstName: 'Potato',
      lastName: 'Sculpture',
      email: 'french_fries_monument@ufl.edu',
    });
    const user3 = await createTestUser({
      firstName: 'Southwest',
      lastName: 'Squatter',
      email: 'bench_waitlist@ufl.edu',
    });

    const conversation = await createGroupConversation(
      user1._id,
      [user2._id, user3._id],
      'French Fries Monument Preservation Society'
    );

    await Message.create({
      conversationId: conversation._id,
      senderId: user3._id,
      text: 'Meeting at the sculpture at 5pm',
    });

    const feed = await getUserConversations(user1._id);

    expect(feed).toHaveLength(1);
    expect(feed[0]._id.toString()).toBe(conversation._id.toString());
    expect(feed[0].type).toBe(ConversationType.GROUP);
    expect(feed[0].title).toBe('French Fries Monument Preservation Society');
    expect(feed[0].displayName).toBe('French Fries Monument Preservation Society');
    expect(feed[0].lastMessage).toBeDefined();
    expect(feed[0].lastMessage?.text).toBe('Meeting at the sculpture at 5pm');
    expect(feed[0].lastMessage?.senderName).toBe('Southwest Squatter');
  });

  it('returns club channel feed item with channel title as displayName, clubId, and latest message', async () => {
    const user1 = await createTestUser({
      firstName: 'GatorCorner',
      lastName: 'Survivor',
      email: 'soft_serve_broken@ufl.edu',
    });
    const user2 = await createTestUser({
      firstName: 'Potato',
      lastName: 'Sculpture',
      email: 'french_fries_monument@ufl.edu',
    });

    const club = await createTestClub(user1._id, {
      name: 'Reitz Union Food Court Nap Society',
    });

    const channel = await createChannel(
      club._id,
      'announcements',
      [user1._id, user2._id]
    );

    await Message.create({
      conversationId: channel._id,
      senderId: user2._id,
      text: 'Quiet hours start now',
    });

    const feed = await getUserConversations(user1._id);

    expect(feed).toHaveLength(1);
    expect(feed[0]._id.toString()).toBe(channel._id.toString());
    expect(feed[0].type).toBe(ConversationType.CHANNEL);
    expect(feed[0].clubId?.toString()).toBe(club._id.toString());
    expect(feed[0].displayName).toBe('announcements');
    expect(feed[0].lastMessage).toBeDefined();
    expect(feed[0].lastMessage?.text).toBe('Quiet hours start now');
    expect(feed[0].lastMessage?.senderName).toBe('Potato Sculpture');
  });

  it('excludes empty conversations with no messages from the inbox feed', async () => {
    const user1 = await createTestUser({
      firstName: 'GatorCorner',
      lastName: 'Survivor',
      email: 'soft_serve_broken@ufl.edu',
    });
    const user2 = await createTestUser({
      firstName: 'Potato',
      lastName: 'Sculpture',
      email: 'french_fries_monument@ufl.edu',
    });

    await createDirectConversation(user1._id, user2._id);

    const feed = await getUserConversations(user1._id);

    expect(feed).toHaveLength(0);
  });

  it('shows This message was deleted when latest message has removedAt timestamp', async () => {
    const user1 = await createTestUser({
      firstName: 'GatorCorner',
      lastName: 'Survivor',
      email: 'soft_serve_broken@ufl.edu',
    });
    const user2 = await createTestUser({
      firstName: 'Potato',
      lastName: 'Sculpture',
      email: 'french_fries_monument@ufl.edu',
    });

    const { conversation } = await createDirectConversation(user1._id, user2._id);

    await Message.create({
      conversationId: conversation._id,
      senderId: user2._id,
      text: 'Secret message that was removed',
      removedAt: new Date(),
      removedBy: user2._id,
    });

    const feed = await getUserConversations(user1._id);

    expect(feed).toHaveLength(1);
    expect(feed[0].lastMessage).toBeDefined();
    expect(feed[0].lastMessage?.text).toBe('This message was deleted');
    expect(feed[0].lastMessage?.senderName).toBe('Potato Sculpture');
  });

  it('sorts multiple active conversations descending by latest message activity timestamp', async () => {
    const user1 = await createTestUser({
      firstName: 'GatorCorner',
      lastName: 'Survivor',
      email: 'soft_serve_broken@ufl.edu',
    });
    const user2 = await createTestUser({
      firstName: 'Potato',
      lastName: 'Sculpture',
      email: 'french_fries_monument@ufl.edu',
    });
    const user3 = await createTestUser({
      firstName: 'Southwest',
      lastName: 'Squatter',
      email: 'bench_waitlist@ufl.edu',
    });

    const { conversation: conv1 } = await createDirectConversation(user1._id, user2._id);
    const conv2 = await createGroupConversation(
      user1._id,
      [user2._id, user3._id],
      'French Fries Monument Preservation Society'
    );

    const olderDate = new Date('2026-03-01T10:00:00.000Z');
    const newerDate = new Date('2026-03-01T12:00:00.000Z');

    await Message.create({
      conversationId: conv1._id,
      senderId: user2._id,
      text: 'Older message in direct chat',
      createdAt: olderDate,
    });

    await Message.create({
      conversationId: conv2._id,
      senderId: user3._id,
      text: 'Newer message in group chat',
      createdAt: newerDate,
    });

    const feed = await getUserConversations(user1._id);

    expect(feed).toHaveLength(2);
    expect(feed[0]._id.toString()).toBe(conv2._id.toString());
    expect(feed[1]._id.toString()).toBe(conv1._id.toString());
    expect(feed[0].lastActivityAt.getTime()).toBeGreaterThan(feed[1].lastActivityAt.getTime());
  });

  it('throws validation error when userId is missing or not a valid ObjectId', async () => {
    const invalidId = 'invalid-id' as unknown as Types.ObjectId;
    await expect(getUserConversations(undefined as unknown as Types.ObjectId)).rejects.toThrow('Valid userId is required');
    await expect(getUserConversations(null as unknown as Types.ObjectId)).rejects.toThrow('Valid userId is required');
    await expect(getUserConversations(invalidId)).rejects.toThrow('Valid userId is required');
  });
});
