import { describe, it, expect, beforeAll, afterEach, afterAll } from '@jest/globals';
import { Types } from 'mongoose';
import { connectTestDb, clearTestDb, closeTestDb } from '../../helpers/db';
import { ConversationParticipant } from '../../../src/messaging/models/ConversationParticipant';

describe('ConversationParticipant Model', () => {
  beforeAll(async () => {
    await connectTestDb();
    await ConversationParticipant.init();
  }, 60000);

  afterEach(async () => {
    await clearTestDb();
  });

  afterAll(async () => {
    await closeTestDb();
  });

  describe('Happy path participant creation', () => {
    it('creates a valid participant with valid conversationId and userId', async () => {
      const conversationId = new Types.ObjectId();
      const userId = new Types.ObjectId();

      const participant = await ConversationParticipant.create({
        conversationId,
        userId,
      });

      expect(participant.conversationId.toString()).toBe(conversationId.toString());
      expect(participant.userId.toString()).toBe(userId.toString());
      expect(participant.createdAt).toBeInstanceOf(Date);
      expect(participant.updatedAt).toBeInstanceOf(Date);
    });

    it('allows distinct users to join the same conversation without collision', async () => {
      const conversationId = new Types.ObjectId();
      const user1Id = new Types.ObjectId();
      const user2Id = new Types.ObjectId();

      const participant1 = await ConversationParticipant.create({
        conversationId,
        userId: user1Id,
      });

      const participant2 = await ConversationParticipant.create({
        conversationId,
        userId: user2Id,
      });

      expect(participant1._id).toBeDefined();
      expect(participant2._id).toBeDefined();
      expect(participant1._id.toString()).not.toBe(participant2._id.toString());
    });

    it('allows the same user to join distinct conversations without collision', async () => {
      const userId = new Types.ObjectId();
      const conversation1Id = new Types.ObjectId();
      const conversation2Id = new Types.ObjectId();

      const participant1 = await ConversationParticipant.create({
        conversationId: conversation1Id,
        userId,
      });

      const participant2 = await ConversationParticipant.create({
        conversationId: conversation2Id,
        userId,
      });

      expect(participant1._id).toBeDefined();
      expect(participant2._id).toBeDefined();
      expect(participant1._id.toString()).not.toBe(participant2._id.toString());
    });
  });

  describe('Validation error handling', () => {
    it('rejects creation when userId is missing', async () => {
      const conversationId = new Types.ObjectId();
      await expect(
        ConversationParticipant.create({
          conversationId,
        } as any)
      ).rejects.toThrow();
    });

    it('rejects creation when conversationId is missing', async () => {
      const userId = new Types.ObjectId();
      await expect(
        ConversationParticipant.create({
          userId,
        } as any)
      ).rejects.toThrow();
    });
  });

  describe('Database indexes and uniqueness constraints', () => {
    it('throws duplicate key error 11000 when inserting duplicate userId and conversationId', async () => {
      const conversationId = new Types.ObjectId();
      const userId = new Types.ObjectId();

      await ConversationParticipant.create({
        conversationId,
        userId,
      });

      let duplicateError: any;
      try {
        await ConversationParticipant.create({
          conversationId,
          userId,
        });
      } catch (err) {
        duplicateError = err;
      }

      expect(duplicateError).toBeDefined();
      expect(duplicateError.code).toBe(11000);
    });

    it('returns all participants matching conversation when querying by conversationId', async () => {
      const targetConversationId = new Types.ObjectId();
      const otherConversationId = new Types.ObjectId();

      const user1Id = new Types.ObjectId();
      const user2Id = new Types.ObjectId();
      const user3Id = new Types.ObjectId();

      await ConversationParticipant.create({
        conversationId: targetConversationId,
        userId: user1Id,
      });
      await ConversationParticipant.create({
        conversationId: targetConversationId,
        userId: user2Id,
      });
      await ConversationParticipant.create({
        conversationId: otherConversationId,
        userId: user3Id,
      });

      const results = await ConversationParticipant.find({
        conversationId: targetConversationId,
      });

      expect(results).toHaveLength(2);
      const returnedUserIds = results.map((doc) => doc.userId.toString());
      expect(returnedUserIds).toContain(user1Id.toString());
      expect(returnedUserIds).toContain(user2Id.toString());
      expect(returnedUserIds).not.toContain(user3Id.toString());
    });
  });
});
