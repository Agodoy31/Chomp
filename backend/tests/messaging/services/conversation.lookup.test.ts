import { describe, it, expect, beforeAll, afterEach, afterAll, jest } from '@jest/globals';
import { Types } from 'mongoose';
import { connectTestDb, clearTestDb, closeTestDb } from '../../helpers/db';
import { Conversation } from '../../../src/messaging/models/Conversation';
import { ConversationParticipant } from '../../../src/messaging/models/ConversationParticipant';
import { Message } from '../../../src/messaging/models/Message';
import { ConversationType } from '../../../src/messaging/interfaces/conversation.interfaces';
import { ParticipantPermission } from '../../../src/messaging/interfaces/conversationParticipant.interfaces';
import { User } from '../../../src/user/models/User';
import { Club } from '../../../src/clubs/model/clubModel';
import {
  createChannel,
  createDirectConversation,
  createGroupConversation,
  getClubChannels,
  getConversationById,
  getConversationDetails,
  getConversationParticipants,
  isUserParticipant,
  validateUsersExist,
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

describe('getConversationById service', () => {
  it('returns conversation plain object when valid conversation exists', async () => {
    const user1 = new Types.ObjectId();
    const user2 = new Types.ObjectId();
    const dmPairKey = [user1.toString(), user2.toString()].sort().join(':');

    const created = await Conversation.create({
      type: ConversationType.DIRECT,
      dmPairKey,
    });

    const result = await getConversationById(created._id);

    expect(result).not.toBeNull();
    expect(result?._id.toString()).toBe(created._id.toString());
    expect(result?.type).toBe(ConversationType.DIRECT);
    expect(result?.dmPairKey).toBe(dmPairKey);
    expect(result instanceof Conversation).toBe(false);
    expect((result as any).save).toBeUndefined();
  });

  it('returns null when valid ObjectId is not in database', async () => {
    const nonExistentId = new Types.ObjectId();
    const result = await getConversationById(nonExistentId);
    expect(result).toBeNull();
  });

  it('throws error when conversationId is missing or invalid', async () => {
    await expect(
      getConversationById(null as unknown as Types.ObjectId)
    ).rejects.toThrow('Valid conversationId is required');

    await expect(
      getConversationById(undefined as unknown as Types.ObjectId)
    ).rejects.toThrow('Valid conversationId is required');

    await expect(
      getConversationById('invalid-id' as unknown as Types.ObjectId)
    ).rejects.toThrow('Valid conversationId is required');
  });
});

describe('validateUsersExist service', () => {
  it('returns true when a single user exists', async () => {
    const user = await createTestUser();
    const result = await validateUsersExist([user._id]);
    expect(result).toBe(true);
  });

  it('returns true when single user object id is passed directly as scalar', async () => {
    const user = await createTestUser();
    const result = await validateUsersExist(user._id);
    expect(result).toBe(true);
  });

  it('returns true when all multiple users exist', async () => {
    const user1 = await createTestUser();
    const user2 = await createTestUser();
    const user3 = await createTestUser();

    const result = await validateUsersExist([user1._id, user2._id, user3._id]);
    expect(result).toBe(true);
  });

  it('returns false when a single user does not exist', async () => {
    const missingUserId = new Types.ObjectId();
    const result = await validateUsersExist([missingUserId]);
    expect(result).toBe(false);
  });

  it('returns false when single missing user object id is passed directly as scalar', async () => {
    const missingUserId = new Types.ObjectId();
    const result = await validateUsersExist(missingUserId);
    expect(result).toBe(false);
  });

  it('returns false when one user exists and another does not', async () => {
    const existingUser = await createTestUser();
    const missingUserId = new Types.ObjectId();

    const result = await validateUsersExist([existingUser._id, missingUserId]);
    expect(result).toBe(false);
  });

  it('returns false when input is an empty array', async () => {
    const result = await validateUsersExist([]);
    expect(result).toBe(false);
  });

  it('does not query database and returns false when input is an empty array', async () => {
    const countDocumentsSpy = jest.spyOn(User, 'countDocuments');
    const result = await validateUsersExist([]);
    expect(result).toBe(false);
    expect(countDocumentsSpy).not.toHaveBeenCalled();
  });
});

describe('isUserParticipant service', () => {
  it('returns true when user is participant in conversation', async () => {
    const user1 = await createTestUser();
    const user2 = await createTestUser();
    const group = await createGroupConversation(user1._id, [user2._id], 'Participant Check Group');

    const isUser1Participant = await isUserParticipant(group._id, user1._id);
    const isUser2Participant = await isUserParticipant(group._id, user2._id);

    expect(isUser1Participant).toBe(true);
    expect(isUser2Participant).toBe(true);
  });

  it('returns false when user is not participant in conversation', async () => {
    const user1 = await createTestUser();
    const user2 = await createTestUser();
    const outsider = await createTestUser();
    const group = await createGroupConversation(user1._id, [user2._id], 'Participant Check Group');

    const isOutsiderParticipant = await isUserParticipant(group._id, outsider._id);

    expect(isOutsiderParticipant).toBe(false);
  });

  it('throws error when conversationId is missing or invalid', async () => {
    const user = await createTestUser();

    await expect(
      isUserParticipant(null as unknown as Types.ObjectId, user._id)
    ).rejects.toThrow('Valid conversationId is required');

    await expect(
      isUserParticipant(undefined as unknown as Types.ObjectId, user._id)
    ).rejects.toThrow('Valid conversationId is required');

    await expect(
      isUserParticipant('invalid-id' as unknown as Types.ObjectId, user._id)
    ).rejects.toThrow('Valid conversationId is required');
  });

  it('throws error when userId is missing or invalid', async () => {
    const user1 = await createTestUser();
    const user2 = await createTestUser();
    const group = await createGroupConversation(user1._id, [user2._id], 'Participant Check Group');

    await expect(
      isUserParticipant(group._id, null as unknown as Types.ObjectId)
    ).rejects.toThrow('Valid userId is required');

    await expect(
      isUserParticipant(group._id, undefined as unknown as Types.ObjectId)
    ).rejects.toThrow('Valid userId is required');

    await expect(
      isUserParticipant(group._id, 'invalid-id' as unknown as Types.ObjectId)
    ).rejects.toThrow('Valid userId is required');
  });
});

describe('getConversationParticipants service', () => {
  it('returns all participant records for conversation as plain objects', async () => {
    const user1 = await createTestUser();
    const user2 = await createTestUser();
    const group = await createGroupConversation(user1._id, [user2._id], 'Participants Query Group');

    const participants = await getConversationParticipants(group._id);

    expect(participants).toHaveLength(2);
    expect(participants[0] instanceof ConversationParticipant).toBe(false);
    expect((participants[0] as any).save).toBeUndefined();

    const participantUserIds = participants.map((p) => {
      return p.userId.toString();
    });
    expect(participantUserIds).toContain(user1._id.toString());
    expect(participantUserIds).toContain(user2._id.toString());
  });

  it('returns empty array when conversation has no participants', async () => {
    const creator = await createTestUser();
    const club = await createTestClub(creator._id);
    const channel = await createChannel(club._id, 'empty-participants-channel');

    const participants = await getConversationParticipants(channel._id);

    expect(participants).toEqual([]);
  });

  it('throws error when conversationId is missing or invalid', async () => {
    await expect(
      getConversationParticipants(null as unknown as Types.ObjectId)
    ).rejects.toThrow('Valid conversationId is required');

    await expect(
      getConversationParticipants(undefined as unknown as Types.ObjectId)
    ).rejects.toThrow('Valid conversationId is required');

    await expect(
      getConversationParticipants('invalid-id' as unknown as Types.ObjectId)
    ).rejects.toThrow('Valid conversationId is required');
  });
});

describe('getConversationDetails service', () => {
  it('returns direct conversation details with other participant full name as display name and sorted participants', async () => {
    const user1 = await createTestUser({ firstName: 'Tim', lastName: 'Tebow', email: 'ttebow15@ufl.edu' });
    const user2 = await createTestUser({ firstName: 'Broward', lastName: 'Freshman', email: 'broward.dining@ufl.edu' });

    const directResult = await createDirectConversation(user1._id, user2._id);
    const conversationId = directResult.conversation._id;

    const detailsForUser1 = await getConversationDetails(conversationId, user1._id);
    expect(detailsForUser1).not.toBeNull();
    expect(detailsForUser1?._id.toString()).toBe(conversationId.toString());
    expect(detailsForUser1?.type).toBe(ConversationType.DIRECT);
    expect(detailsForUser1?.displayName).toBe('Broward Freshman');

    const detailsForUser2 = await getConversationDetails(conversationId, user2._id);
    expect(detailsForUser2).not.toBeNull();
    expect(detailsForUser2?._id.toString()).toBe(conversationId.toString());
    expect(detailsForUser2?.type).toBe(ConversationType.DIRECT);
    expect(detailsForUser2?.displayName).toBe('Tim Tebow');

    expect(detailsForUser1?.participants).toHaveLength(2);
    expect(detailsForUser1?.participants[0].userId._id.toString()).toBe(user2._id.toString());
    expect(detailsForUser1?.participants[0].userId.firstName).toBe('Broward');
    expect(detailsForUser1?.participants[0].userId.lastName).toBe('Freshman');
    expect(detailsForUser1?.participants[0].permission).toBe(ParticipantPermission.WRITE);

    expect(detailsForUser1?.participants[1].userId._id.toString()).toBe(user1._id.toString());
    expect(detailsForUser1?.participants[1].userId.firstName).toBe('Tim');
    expect(detailsForUser1?.participants[1].userId.lastName).toBe('Tebow');
    expect(detailsForUser1?.participants[1].permission).toBe(ParticipantPermission.WRITE);
  });

  it('returns group conversation details with group title as display name and sorted participants', async () => {
    const user1 = await createTestUser({ firstName: 'Southwest', lastName: 'Squatter', email: 'bench_waitlist@ufl.edu' });
    const user2 = await createTestUser({ firstName: 'Broward', lastName: 'Freshman', email: 'broward.dining@ufl.edu' });
    const user3 = await createTestUser({ firstName: 'Tim', lastName: 'Tebow', email: 'ttebow15@ufl.edu' });
    const groupTitle = 'Norman Hall Coffee Club';

    const group = await createGroupConversation(user1._id, [user2._id, user3._id], groupTitle);

    const details = await getConversationDetails(group._id, user1._id);
    expect(details).not.toBeNull();
    expect(details?._id.toString()).toBe(group._id.toString());
    expect(details?.type).toBe(ConversationType.GROUP);
    expect(details?.title).toBe(groupTitle);
    expect(details?.displayName).toBe(groupTitle);

    expect(details?.participants).toHaveLength(3);
    expect(details?.participants[0].userId.firstName).toBe('Broward');
    expect(details?.participants[0].userId.lastName).toBe('Freshman');
    expect(details?.participants[0].permission).toBe(ParticipantPermission.WRITE);

    expect(details?.participants[1].userId.firstName).toBe('Southwest');
    expect(details?.participants[1].userId.lastName).toBe('Squatter');
    expect(details?.participants[1].permission).toBe(ParticipantPermission.MODERATE);

    expect(details?.participants[2].userId.firstName).toBe('Tim');
    expect(details?.participants[2].userId.lastName).toBe('Tebow');
    expect(details?.participants[2].permission).toBe(ParticipantPermission.WRITE);
  });

  it('returns channel conversation details with channel title as display name and sorted participants', async () => {
    const clubCreator = await createTestUser({ firstName: 'Southwest', lastName: 'Squatter', email: 'bench_waitlist@ufl.edu' });
    const member1 = await createTestUser({ firstName: 'Broward', lastName: 'Freshman', email: 'broward.dining@ufl.edu' });
    const member2 = await createTestUser({ firstName: 'Tim', lastName: 'Tebow', email: 'ttebow15@ufl.edu' });
    const club = await createTestClub(clubCreator._id);
    const channelTitle = 'announcements';

    const channel = await createChannel(club._id, channelTitle, [member1._id, member2._id]);

    const details = await getConversationDetails(channel._id, member1._id);
    expect(details).not.toBeNull();
    expect(details?._id.toString()).toBe(channel._id.toString());
    expect(details?.type).toBe(ConversationType.CHANNEL);
    expect(details?.title).toBe(channelTitle);
    expect(details?.displayName).toBe(channelTitle);
    expect(details?.clubId?.toString()).toBe(club._id.toString());

    expect(details?.participants).toHaveLength(2);
    expect(details?.participants[0].userId.firstName).toBe('Broward');
    expect(details?.participants[0].userId.lastName).toBe('Freshman');
    expect(details?.participants[0].permission).toBe(ParticipantPermission.WRITE);

    expect(details?.participants[1].userId.firstName).toBe('Tim');
    expect(details?.participants[1].userId.lastName).toBe('Tebow');
    expect(details?.participants[1].permission).toBe(ParticipantPermission.WRITE);
  });

  it('returns null when requesting user is not a participant in the conversation', async () => {
    const user1 = await createTestUser();
    const user2 = await createTestUser();
    const nonParticipant = await createTestUser();

    const group = await createGroupConversation(user1._id, [user2._id], 'Newell Hall Late Night Debuggers');

    const result = await getConversationDetails(group._id, nonParticipant._id);
    expect(result).toBeNull();
  });

  it('returns null when conversation does not exist', async () => {
    const user1 = await createTestUser();
    const nonExistentId = new Types.ObjectId();

    const result = await getConversationDetails(nonExistentId, user1._id);
    expect(result).toBeNull();
  });

  it('throws validation error when conversationId is invalid or missing', async () => {
    const user1 = await createTestUser();

    await expect(
      getConversationDetails(null as unknown as Types.ObjectId, user1._id)
    ).rejects.toThrow('Valid conversationId is required');

    await expect(
      getConversationDetails(undefined as unknown as Types.ObjectId, user1._id)
    ).rejects.toThrow('Valid conversationId is required');

    await expect(
      getConversationDetails('invalid-id' as unknown as Types.ObjectId, user1._id)
    ).rejects.toThrow('Valid conversationId is required');
  });

  it('throws validation error when requestingUserId is invalid or missing', async () => {
    const user1 = await createTestUser();
    const user2 = await createTestUser();
    const direct = await createDirectConversation(user1._id, user2._id);
    const conversationId = direct.conversation._id;

    await expect(
      getConversationDetails(conversationId, null as unknown as Types.ObjectId)
    ).rejects.toThrow('Valid requestingUserId is required');

    await expect(
      getConversationDetails(conversationId, undefined as unknown as Types.ObjectId)
    ).rejects.toThrow('Valid requestingUserId is required');

    await expect(
      getConversationDetails(conversationId, 'invalid-id' as unknown as Types.ObjectId)
    ).rejects.toThrow('Valid requestingUserId is required');
  });

  it('returns plain objects without timestamps or Mongoose document methods', async () => {
    const user1 = await createTestUser({ firstName: 'Broward', lastName: 'Freshman' });
    const user2 = await createTestUser({ firstName: 'Tim', lastName: 'Tebow' });

    const direct = await createDirectConversation(user1._id, user2._id);
    const conversationId = direct.conversation._id;

    const details = await getConversationDetails(conversationId, user1._id);
    expect(details).not.toBeNull();

    expect((details as any).save).toBeUndefined();
    expect((details as any).toObject).toBeUndefined();
    expect((details as any).createdAt).toBeUndefined();
    expect((details as any).updatedAt).toBeUndefined();

    expect(details?.participants).toHaveLength(2);
    for (const participant of details!.participants) {
      expect(participant._id).toBeDefined();
      expect(participant.permission).toBe(ParticipantPermission.WRITE);
      expect(participant.userId._id).toBeDefined();
      expect(participant.userId.firstName).toBeDefined();
      expect(participant.userId.lastName).toBeDefined();
      expect((participant as any).save).toBeUndefined();
      expect((participant as any).toObject).toBeUndefined();
      expect((participant as any).createdAt).toBeUndefined();
      expect((participant as any).updatedAt).toBeUndefined();
      expect((participant as any).joinedAt).toBeUndefined();
      const participantKeys = Object.keys(participant).sort();
      expect(participantKeys).toEqual(['_id', 'permission', 'userId']);
      const userKeys = Object.keys(participant.userId).sort();
      expect(userKeys).toEqual(['_id', 'firstName', 'lastName']);
    }
  });

  it('returns conversation details when conversationId is passed as a hex string', async () => {
    const user1 = await createTestUser();
    const user2 = await createTestUser();

    const direct = await createDirectConversation(user1._id, user2._id);
    const hexStringId = direct.conversation._id.toString() as unknown as Types.ObjectId;

    const details = await getConversationDetails(hexStringId, user1._id);
    expect(details).not.toBeNull();
    expect(details?.participants).toHaveLength(2);
  });
});

describe('getClubChannels service', () => {
  it('returns all channels for a club sorted alphabetically by title', async () => {
    const user = await createTestUser({
      firstName: 'Reitz',
      lastName: 'Bowler',
      email: 'game.room@ufl.edu',
    });
    const club = await createTestClub(user._id, {
      name: 'Swamp Launch Rocketry',
    });

    await createChannel(club._id, 'telemetry', [user._id]);
    await createChannel(club._id, 'Avionics', [user._id]);
    await createChannel(club._id, 'propulsion', [user._id]);
    await createChannel(club._id, 'Zebra', [user._id]);
    await createChannel(club._id, 'rhino', [user._id]);

    const channels = await getClubChannels(club._id);

    expect(channels).toHaveLength(5);
    expect(channels.map((c) => c.title)).toEqual([
      'Avionics',
      'propulsion',
      'rhino',
      'telemetry',
      'Zebra',
    ]);
    for (const channel of channels) {
      expect(channel.type).toBe(ConversationType.CHANNEL);
      expect(channel.clubId?.toString()).toBe(club._id.toString());
      expect((channel as any).save).toBeUndefined();
    }
  });

  it('returns an empty array when a club has no channels', async () => {
    const user = await createTestUser({
      firstName: 'Danny',
      lastName: 'Wuerffel',
      email: 'dwuerffel@ufl.edu',
    });
    const club = await createTestClub(user._id, {
      name: 'Chomp Streetwear Collective',
    });

    const channels = await getClubChannels(club._id);

    expect(channels).toEqual([]);
  });

  it('throws an error when club does not exist', async () => {
    const nonExistentClubId = new Types.ObjectId();
    await expect(getClubChannels(nonExistentClubId)).rejects.toThrow('Club does not exist');
  });

  it('throws a validation error when clubId is missing or invalid', async () => {
    const invalidId = 'invalid-id' as unknown as Types.ObjectId;
    await expect(getClubChannels(undefined as unknown as Types.ObjectId)).rejects.toThrow('Valid clubId is required');
    await expect(getClubChannels(null as unknown as Types.ObjectId)).rejects.toThrow('Valid clubId is required');
    await expect(getClubChannels(invalidId)).rejects.toThrow('Valid clubId is required');
  });
});


