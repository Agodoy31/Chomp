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


  describe('Validation error handling', () => {
    it('rejects creation when userId or conversationId is missing', async () => {
      const validId = new Types.ObjectId();

      await expect(
        ConversationParticipant.create({ conversationId: validId } as any)
      ).rejects.toThrow();

      await expect(
        ConversationParticipant.create({ userId: validId } as any)
      ).rejects.toThrow();
    });
  });

  describe('Database indexes and uniqueness constraints', () => {
    it('enforces compound uniqueness on conversationId and userId while allowing non-colliding joins', async () => {
      const conversationId1 = new Types.ObjectId();
      const conversationId2 = new Types.ObjectId();
      const user1Id = new Types.ObjectId();
      const user2Id = new Types.ObjectId();

      const part1 = await ConversationParticipant.create({
        conversationId: conversationId1,
        userId: user1Id,
      });

      const part2 = await ConversationParticipant.create({
        conversationId: conversationId1,
        userId: user2Id,
      });

      const part3 = await ConversationParticipant.create({
        conversationId: conversationId2,
        userId: user1Id,
      });

      expect(part1._id.toString()).not.toBe(part2._id.toString());
      expect(part1._id.toString()).not.toBe(part3._id.toString());

      await expect(
        ConversationParticipant.create({
          conversationId: conversationId1,
          userId: user1Id,
        })
      ).rejects.toThrow();
    });
  });
});
