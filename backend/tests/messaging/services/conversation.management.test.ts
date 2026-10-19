import { describe, it, expect, beforeAll, afterEach, afterAll, jest } from '@jest/globals';
import { Types } from 'mongoose';
import { connectTestDb, clearTestDb, closeTestDb } from '../../helpers/db';
import { Conversation } from '../../../src/messaging/models/Conversation';
import { ConversationParticipant } from '../../../src/messaging/models/ConversationParticipant';
import { User, IUserDocument } from '../../../src/user/models/User';
import { Club } from '../../../src/clubs/model/clubModel';
import {
  addParticipantsToConversation,
  createChannel,
  createDirectConversation,
  createGroupConversation,
  getConversationParticipants,
  isUserParticipant,
  leaveConversation,
  removeParticipantFromConversation,
  updateConversationTitle,
} from '../../../src/messaging/services/conversation.service';

beforeAll(async () => {
  await connectTestDb();
  await Promise.all([
    Club.init(),
    Conversation.init(),
    ConversationParticipant.init(),
    User.init(),
  ]);
}, 60000);

async function createTestUser(
  overrides: Partial<IUserDocument> = {}
): Promise<IUserDocument> {
  const userId = overrides._id ?? new Types.ObjectId();
  return User.create({
    _id: userId,
    email: `student_${userId.toString()}@ufl.edu`,
    hashedPassword: 'hashedPassword123',
    firstName: 'Albert',
    lastName: 'Gator',
    ...overrides,
  });
}

async function createTestClub(
  proposerId: Types.ObjectId,
  overrides: Partial<any> = {}
): Promise<any> {
  const clubId = overrides._id ?? new Types.ObjectId();
  return Club.create({
    _id: clubId,
    name: `Test Club ${clubId.toString()}`,
    description: 'A test club description',
    category: 'ACADEMIC',
    proposerId,
    status: 'APPROVED',
    ...overrides,
  });
}

afterEach(async () => {
  jest.restoreAllMocks();
  await clearTestDb();
});

afterAll(async () => {
  await closeTestDb();
});

describe('addParticipantsToConversation service', () => {
  it('adds participants to group conversation and returns plain objects', async () => {
    const user1 = await createTestUser();
    const user2 = await createTestUser();
    const group = await createGroupConversation(user1._id, [user2._id], 'Add Participants Group');

    const user3 = await createTestUser();
    const user4 = await createTestUser();

    const added = await addParticipantsToConversation(group._id, [user3._id, user4._id]);

    expect(added).toHaveLength(2);
    expect(added[0] instanceof ConversationParticipant).toBe(false);
    expect((added[0] as any).save).toBeUndefined();

    const addedIds = added.map((p) => {
      return p.userId.toString();
    });
    expect(addedIds).toContain(user3._id.toString());
    expect(addedIds).toContain(user4._id.toString());

    const allInDb = await ConversationParticipant.find({
      conversationId: group._id,
    }).lean().exec();
    expect(allInDb).toHaveLength(4);
  });

  it('ignores users who are already participants without throwing duplicate key errors', async () => {
    const user1 = await createTestUser();
    const user2 = await createTestUser();
    const group = await createGroupConversation(user1._id, [user2._id], 'Duplicate Ignore Group');

    const user3 = await createTestUser();

    const firstAdd = await addParticipantsToConversation(group._id, [
      user1._id,
      user2._id,
      user3._id,
    ]);
    expect(firstAdd).toHaveLength(1);
    expect(firstAdd[0].userId.toString()).toBe(user3._id.toString());

    const secondAdd = await addParticipantsToConversation(group._id, [
      user1._id,
      user3._id,
    ]);
    expect(secondAdd).toHaveLength(0);

    const allInDb = await ConversationParticipant.find({
      conversationId: group._id,
    }).lean().exec();
    expect(allInDb).toHaveLength(3);
  });

  it('throws error when attempting to add participants to a direct conversation', async () => {
    const user1 = await createTestUser();
    const user2 = await createTestUser();
    const directResult = await createDirectConversation(user1._id, user2._id);
    const user3 = await createTestUser();

    await expect(
      addParticipantsToConversation(directResult.conversation._id, [user3._id])
    ).rejects.toThrow('Cannot add participants to a direct conversation');
  });

  it('throws error when conversation does not exist', async () => {
    const nonExistentConversationId = new Types.ObjectId();
    const user = await createTestUser();

    await expect(
      addParticipantsToConversation(nonExistentConversationId, [user._id])
    ).rejects.toThrow('Conversation does not exist');
  });

  it('throws error when conversationId is missing or invalid', async () => {
    const user = await createTestUser();

    await expect(
      addParticipantsToConversation(null as unknown as Types.ObjectId, [user._id])
    ).rejects.toThrow('Valid conversationId is required');

    await expect(
      addParticipantsToConversation(undefined as unknown as Types.ObjectId, [user._id])
    ).rejects.toThrow('Valid conversationId is required');

    await expect(
      addParticipantsToConversation('invalid-id' as unknown as Types.ObjectId, [user._id])
    ).rejects.toThrow('Valid conversationId is required');
  });

  it('throws error when userIds is not an array', async () => {
    const user1 = await createTestUser();
    const user2 = await createTestUser();
    const group = await createGroupConversation(user1._id, [user2._id], 'Array Check Group');

    await expect(
      addParticipantsToConversation(group._id, null as unknown as Types.ObjectId[])
    ).rejects.toThrow('userIds must be an array');

    await expect(
      addParticipantsToConversation(group._id, undefined as unknown as Types.ObjectId[])
    ).rejects.toThrow('userIds must be an array');

    await expect(
      addParticipantsToConversation(group._id, 'not-an-array' as unknown as Types.ObjectId[])
    ).rejects.toThrow('userIds must be an array');
  });

  it('throws error when any userId is invalid', async () => {
    const user1 = await createTestUser();
    const user2 = await createTestUser();
    const group = await createGroupConversation(user1._id, [user2._id], 'Valid User ID Check Group');
    const validUser = await createTestUser();

    await expect(
      addParticipantsToConversation(group._id, [validUser._id, null as unknown as Types.ObjectId])
    ).rejects.toThrow('Valid participantId is required');

    await expect(
      addParticipantsToConversation(group._id, [validUser._id, undefined as unknown as Types.ObjectId])
    ).rejects.toThrow('Valid participantId is required');

    await expect(
      addParticipantsToConversation(group._id, [validUser._id, 'invalid-id' as unknown as Types.ObjectId])
    ).rejects.toThrow('Valid participantId is required');
  });

  it('throws error when one or more users do not exist', async () => {
    const user1 = await createTestUser();
    const user2 = await createTestUser();
    const group = await createGroupConversation(user1._id, [user2._id], 'Existence Check Group');
    const existingUser = await createTestUser();
    const nonExistentUserId = new Types.ObjectId();

    await expect(
      addParticipantsToConversation(group._id, [existingUser._id, nonExistentUserId])
    ).rejects.toThrow('One or more users do not exist');
  });

  it('returns empty array when userIds array is empty', async () => {
    const user1 = await createTestUser();
    const user2 = await createTestUser();
    const group = await createGroupConversation(user1._id, [user2._id], 'Empty Array Check Group');

    const added = await addParticipantsToConversation(group._id, []);

    expect(added).toEqual([]);
  });
});

describe('updateConversationTitle service', () => {
  it('updates group conversation title when requested by a participant', async () => {
    const user1 = await createTestUser({
      firstName: 'Marston',
      lastName: 'Dweller',
      email: 'basement.coder@ufl.edu',
    });
    const user2 = await createTestUser({
      firstName: 'Newell',
      lastName: 'Nightowl',
      email: 'newell3am@ufl.edu',
    });

    const group = await createGroupConversation(user1._id, [user2._id], 'Marston Basement Study Group');
    const updated = await updateConversationTitle(group._id, user1._id, 'Turlington Plaza Frisbee');

    expect(updated.title).toBe('Turlington Plaza Frisbee');
    const fromDb = await Conversation.findById(group._id).lean();
    expect(fromDb?.title).toBe('Turlington Plaza Frisbee');
  });

  it('trims whitespace from new conversation title', async () => {
    const user1 = await createTestUser();
    const user2 = await createTestUser();

    const group = await createGroupConversation(user1._id, [user2._id], 'Marston Basement Study Group');
    const updated = await updateConversationTitle(group._id, user1._id, '   Trimmed Title   ');

    expect(updated.title).toBe('Trimmed Title');
  });

  it('updates channel title when requested by a channel participant', async () => {
    const proposer = await createTestUser();
    const user1 = await createTestUser();
    const club = await createTestClub(proposer._id);
    const channel = await createChannel(club._id, 'announcements', [user1._id]);

    const updated = await updateConversationTitle(channel._id, user1._id, 'general');

    expect(updated.title).toBe('general');
    const fromDb = await Conversation.findById(channel._id).lean();
    expect(fromDb?.title).toBe('general');
  });

  it('rejects updating title of a direct conversation', async () => {
    const user1 = await createTestUser();
    const user2 = await createTestUser();
    const direct = await createDirectConversation(user1._id, user2._id);

    await expect(
      updateConversationTitle(direct.conversation._id, user1._id, 'New Title')
    ).rejects.toThrow('Cannot update title of a direct conversation');
  });

  it('rejects when requesting user is not a participant in the conversation', async () => {
    const user1 = await createTestUser();
    const user2 = await createTestUser();
    const nonParticipant = await createTestUser({
      firstName: 'Potato',
      lastName: 'Sculpture',
      email: 'french_fries_monument@ufl.edu',
    });

    const group = await createGroupConversation(user1._id, [user2._id], 'Marston Basement Study Group');

    await expect(
      updateConversationTitle(group._id, nonParticipant._id, 'Hacked Title')
    ).rejects.toThrow('User is not a participant in this conversation');
  });

  it('throws validation error on invalid parameters or duplicate channel title', async () => {
    const user1 = await createTestUser();
    const proposer = await createTestUser();
    const club = await createTestClub(proposer._id);
    const channel1 = await createChannel(club._id, 'announcements', [user1._id]);
    await createChannel(club._id, 'general', [user1._id]);

    await expect(
      updateConversationTitle(null as unknown as Types.ObjectId, user1._id, 'New Title')
    ).rejects.toThrow('Valid conversationId is required');

    await expect(
      updateConversationTitle(channel1._id, null as unknown as Types.ObjectId, 'New Title')
    ).rejects.toThrow('Valid requestingUserId is required');

    await expect(
      updateConversationTitle(channel1._id, user1._id, '   ')
    ).rejects.toThrow('Valid conversation title is required');

    await expect(
      updateConversationTitle(channel1._id, user1._id, 'general')
    ).rejects.toThrow('A channel with this title already exists in the club');
  });
});

describe('removeParticipantFromConversation and leaveConversation services', () => {
  it('removes target participant from group conversation when requested by a member', async () => {
    const user1 = await createTestUser({
      firstName: 'Dennis',
      lastName: 'Heckler',
      email: 'turlington_screamer@ufl.edu',
    });
    const user2 = await createTestUser({
      firstName: 'Midtown',
      lastName: 'Survivor',
      email: 'gator_beverage@ufl.edu',
    });
    const user3 = await createTestUser({
      firstName: 'Reitz',
      lastName: 'FoodCourter',
      email: 'subway_line_eternal@ufl.edu',
    });

    const group = await createGroupConversation(
      user1._id,
      [user2._id, user3._id],
      'French Fries Monument Preservation Society'
    );
    const result = await removeParticipantFromConversation(group._id, user1._id, user2._id);

    expect(result).toBe(true);

    const isUser2StillParticipant = await isUserParticipant(group._id, user2._id);
    expect(isUser2StillParticipant).toBe(false);

    const isUser1StillParticipant = await isUserParticipant(group._id, user1._id);
    expect(isUser1StillParticipant).toBe(true);

    const isUser3StillParticipant = await isUserParticipant(group._id, user3._id);
    expect(isUser3StillParticipant).toBe(true);
  });

  it('removes requesting user when calling leaveConversation', async () => {
    const user1 = await createTestUser({
      firstName: 'Dennis',
      lastName: 'Heckler',
      email: 'turlington_screamer@ufl.edu',
    });
    const user2 = await createTestUser({
      firstName: 'Midtown',
      lastName: 'Survivor',
      email: 'gator_beverage@ufl.edu',
    });

    const group = await createGroupConversation(
      user1._id,
      [user2._id],
      'Marston Basement Study Group'
    );
    const result = await leaveConversation(group._id, user1._id);

    expect(result).toBe(true);

    const isUser1StillParticipant = await isUserParticipant(group._id, user1._id);
    expect(isUser1StillParticipant).toBe(false);

    const isUser2StillParticipant = await isUserParticipant(group._id, user2._id);
    expect(isUser2StillParticipant).toBe(true);
  });

  it('retains conversation document when the last participant leaves', async () => {
    const user1 = await createTestUser();
    const user2 = await createTestUser();

    const group = await createGroupConversation(
      user1._id,
      [user2._id],
      'Marston Basement Study Group'
    );
    await leaveConversation(group._id, user1._id);
    await leaveConversation(group._id, user2._id);

    const remainingParticipants = await getConversationParticipants(group._id);
    expect(remainingParticipants).toHaveLength(0);

    const conversationInDb = await Conversation.findById(group._id).lean();
    expect(conversationInDb).not.toBeNull();
    expect(conversationInDb?._id.toString()).toBe(group._id.toString());
  });

  it('rejects removing participant from a direct conversation', async () => {
    const user1 = await createTestUser();
    const user2 = await createTestUser();
    const direct = await createDirectConversation(user1._id, user2._id);

    await expect(
      removeParticipantFromConversation(direct.conversation._id, user1._id, user2._id)
    ).rejects.toThrow('Cannot remove participants from a direct conversation');
  });

  it('rejects when requesting user is not a participant in the conversation', async () => {
    const user1 = await createTestUser();
    const user2 = await createTestUser();
    const nonMember = await createTestUser();

    const group = await createGroupConversation(
      user1._id,
      [user2._id],
      'Marston Basement Study Group'
    );

    await expect(
      removeParticipantFromConversation(group._id, nonMember._id, user2._id)
    ).rejects.toThrow('User is not a participant in this conversation');
  });

  it('rejects when target user is not a participant in the conversation', async () => {
    const user1 = await createTestUser();
    const user2 = await createTestUser();
    const outsider = await createTestUser();

    const group = await createGroupConversation(
      user1._id,
      [user2._id],
      'Marston Basement Study Group'
    );

    await expect(
      removeParticipantFromConversation(group._id, user1._id, outsider._id)
    ).rejects.toThrow('Target user is not a participant in this conversation');
  });

  it('throws validation error on missing or invalid parameters', async () => {
    const user1 = await createTestUser();
    const user2 = await createTestUser();
    const group = await createGroupConversation(
      user1._id,
      [user2._id],
      'Marston Basement Study Group'
    );
    const fakeId = new Types.ObjectId();

    await expect(
      removeParticipantFromConversation(null as unknown as Types.ObjectId, user1._id, user2._id)
    ).rejects.toThrow('Valid conversationId is required');

    await expect(
      removeParticipantFromConversation(group._id, null as unknown as Types.ObjectId, user2._id)
    ).rejects.toThrow('Valid requestingUserId is required');

    await expect(
      removeParticipantFromConversation(group._id, user1._id, null as unknown as Types.ObjectId)
    ).rejects.toThrow('Valid targetUserId is required');

    await expect(
      removeParticipantFromConversation(fakeId, user1._id, user2._id)
    ).rejects.toThrow('Conversation not found');

    await expect(
      leaveConversation(null as unknown as Types.ObjectId, user1._id)
    ).rejects.toThrow('Valid conversationId is required');

    await expect(
      leaveConversation(group._id, null as unknown as Types.ObjectId)
    ).rejects.toThrow('Valid userId is required');
  });
});


