import { describe, it, expect, beforeAll, afterEach, afterAll, jest } from '@jest/globals';
import { Types } from 'mongoose';
import { connectTestDb, clearTestDb, closeTestDb } from '../../helpers/db';
import { Conversation } from '../../../src/messaging/models/Conversation';
import { ConversationParticipant } from '../../../src/messaging/models/ConversationParticipant';
import { Message } from '../../../src/messaging/models/Message';
import { User } from '../../../src/user/models/User';
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
  updateParticipantPermission,
  updateParticipantPermissions,
} from '../../../src/messaging/services/conversation.service';
import { ParticipantPermission } from '../../../src/messaging/interfaces/conversationParticipant.interfaces';
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

describe('addParticipantsToConversation service', () => {
  it('adds participants to group conversation ignoring duplicates and returns plain objects', async () => {
    const user1 = await createTestUser({
      firstName: 'Potato',
      lastName: 'Sculpture',
      email: 'french_fries_monument@ufl.edu',
    });
    const user2 = await createTestUser({
      firstName: 'GatorCorner',
      lastName: 'Survivor',
      email: 'soft_serve_broken@ufl.edu',
    });
    const group = await createGroupConversation(user1._id, [user2._id], 'Chomp Streetwear Collective');

    const user3 = await createTestUser({
      firstName: 'Danny',
      lastName: 'Wuerffel',
      email: 'dwuerffel@ufl.edu',
    });
    const user4 = await createTestUser();

    const added = await addParticipantsToConversation(group._id, [user3._id, user4._id], user1._id);
    expect(added).toHaveLength(2);
    expect(added[0] instanceof ConversationParticipant).toBe(false);
    expect((added[0] as any).save).toBeUndefined();

    const secondAdd = await addParticipantsToConversation(group._id, [user1._id, user3._id], user1._id);
    expect(secondAdd).toHaveLength(0);

    const emptyAdd = await addParticipantsToConversation(group._id, [], user1._id);
    expect(emptyAdd).toEqual([]);

    const allInDb = await ConversationParticipant.find({
      conversationId: group._id,
    }).lean().exec();
    expect(allInDb).toHaveLength(4);
  });

  it('inserts system messages when adding single or multiple participants', async () => {
    const creator = await createTestUser({
      firstName: 'Potato',
      lastName: 'Sculpture',
      email: 'french_fries_monument@ufl.edu',
    });
    const user2 = await createTestUser({
      firstName: 'GatorCorner',
      lastName: 'Survivor',
      email: 'soft_serve_broken@ufl.edu',
    });
    const group = await createGroupConversation(creator._id, [user2._id], 'Lake Alice Turtle Watchers');

    const newUser1 = await createTestUser({
      firstName: 'Danny',
      lastName: 'Wuerffel',
      email: 'dwuerffel@ufl.edu',
    });
    await addParticipantsToConversation(group._id, [newUser1._id], creator._id);

    const singleSysMessage = await Message.findOne({
      conversationId: group._id,
      text: /Danny Wuerffel/,
    }).lean().exec();
    expect(singleSysMessage).not.toBeNull();
    expect(singleSysMessage?.text).toBe('Potato Sculpture added Danny Wuerffel');
    expect(singleSysMessage?.isSystem).toBe(true);

    const newUser2 = await createTestUser();
    const newUser3 = await createTestUser();
    await addParticipantsToConversation(group._id, [newUser2._id, newUser3._id], creator._id);

    const multiSysMessage = await Message.findOne({
      conversationId: group._id,
      text: /added 2 people/,
    }).lean().exec();
    expect(multiSysMessage).not.toBeNull();
    expect(multiSysMessage?.text).toBe('Potato Sculpture added 2 people');
  });

  it('enforces caller permissions on group conversations and allows channels without requester', async () => {
    const creator = await createTestUser({
      firstName: 'Potato',
      lastName: 'Sculpture',
      email: 'french_fries_monument@ufl.edu',
    });
    const writeMember = await createTestUser({
      firstName: 'Krishna',
      lastName: 'Regular',
      email: 'lunch_line@ufl.edu',
    });
    const group = await createGroupConversation(
      creator._id,
      [writeMember._id],
      'Krishna Lunch Line Appreciators'
    );

    const outsideUser = await createTestUser({
      firstName: 'Tim',
      lastName: 'Tebow',
      email: 'ttebow15@ufl.edu',
    });
    const candidate = await createTestUser();

    await expect(
      addParticipantsToConversation(group._id, [candidate._id])
    ).rejects.toThrow('requestingUserId is required for group conversations');

    await expect(
      addParticipantsToConversation(group._id, [candidate._id], outsideUser._id)
    ).rejects.toThrow('User is not a participant in this conversation');

    await updateParticipantPermission(
      group._id,
      creator._id,
      writeMember._id,
      ParticipantPermission.READ
    );

    await expect(
      addParticipantsToConversation(group._id, [candidate._id], writeMember._id)
    ).rejects.toThrow('User does not have permission to add participants');

    await updateParticipantPermission(
      group._id,
      creator._id,
      writeMember._id,
      ParticipantPermission.WRITE
    );

    const addedByWrite = await addParticipantsToConversation(
      group._id,
      [candidate._id],
      writeMember._id
    );
    expect(addedByWrite).toHaveLength(1);

    const club = await createTestClub(creator._id);
    const channel = await createChannel(club._id, 'announcements', [creator._id]);
    const channelCandidate = await createTestUser();

    const addedToChannel = await addParticipantsToConversation(
      channel._id,
      [channelCandidate._id]
    );
    expect(addedToChannel).toHaveLength(1);
  });

  it('rejects adding participants on direct conversations non-existent conversations or invalid inputs', async () => {
    const user1 = await createTestUser();
    const user2 = await createTestUser();
    const directResult = await createDirectConversation(user1._id, user2._id);
    const validId = new Types.ObjectId();
    const nonExistentId = new Types.ObjectId();

    await expect(
      addParticipantsToConversation(directResult.conversation._id, [user1._id])
    ).rejects.toThrow('Cannot add participants to a direct conversation');

    await expect(
      addParticipantsToConversation(nonExistentId, [user1._id])
    ).rejects.toThrow('Conversation does not exist');

    await expect(
      addParticipantsToConversation(null as unknown as Types.ObjectId, [user1._id])
    ).rejects.toThrow('Valid conversationId is required');

    await expect(
      addParticipantsToConversation(validId, null as unknown as Types.ObjectId[])
    ).rejects.toThrow('userIds must be an array');

    await expect(
      addParticipantsToConversation(validId, [validId, 'invalid-id' as unknown as Types.ObjectId])
    ).rejects.toThrow('Valid participantId is required');

    const group = await createGroupConversation(user1._id, [user2._id], 'Rejection Test Group');

    await expect(
      addParticipantsToConversation(group._id, [user1._id, nonExistentId], user1._id)
    ).rejects.toThrow('One or more users do not exist');
  });
});

describe('updateConversationTitle service', () => {
  it('updates title for group conversations and channels with whitespace trimming', async () => {
    const user1 = await createTestUser({
      firstName: 'Potato',
      lastName: 'Sculpture',
      email: 'french_fries_monument@ufl.edu',
    });
    const user2 = await createTestUser({
      firstName: 'GatorCorner',
      lastName: 'Survivor',
      email: 'soft_serve_broken@ufl.edu',
    });

    const group = await createGroupConversation(user1._id, [user2._id], 'Chomp Streetwear Collective');
    const updatedGroup = await updateConversationTitle(group._id, user1._id, '   Reitz Union Smash Bros   ');
    expect(updatedGroup.title).toBe('Reitz Union Smash Bros');

    const club = await createTestClub(user1._id);
    const channel = await createChannel(club._id, 'announcements', [user1._id]);
    await ConversationParticipant.updateOne(
      { conversationId: channel._id, userId: user1._id },
      { permission: ParticipantPermission.MODERATE }
    );
    const updatedChannel = await updateConversationTitle(channel._id, user1._id, 'general');
    expect(updatedChannel.title).toBe('general');
  });

  it('enforces caller permissions when updating titles on groups and channels', async () => {
    const creator = await createTestUser({
      firstName: 'Century',
      lastName: 'Tower',
      email: 'carillon@ufl.edu',
    });
    const writeMember = await createTestUser({
      firstName: 'Turlington',
      lastName: 'Tabler',
      email: 'flyer.dodger@ufl.edu',
    });
    const group = await createGroupConversation(
      creator._id,
      [writeMember._id],
      'Turlington Preacher Debate Society'
    );

    const updatedByWrite = await updateConversationTitle(
      group._id,
      writeMember._id,
      'Lake Alice Turtle Watchers'
    );
    expect(updatedByWrite.title).toBe('Lake Alice Turtle Watchers');

    await updateParticipantPermission(
      group._id,
      creator._id,
      writeMember._id,
      ParticipantPermission.READ
    );
    await expect(
      updateConversationTitle(group._id, writeMember._id, 'Muted Member Title')
    ).rejects.toThrow('User does not have permission to update conversation title');

    const club = await createTestClub(creator._id);
    const channel = await createChannel(club._id, 'general', [creator._id, writeMember._id]);

    await expect(
      updateConversationTitle(channel._id, writeMember._id, 'new-general')
    ).rejects.toThrow('User does not have permission to update conversation title');

    await ConversationParticipant.updateOne(
      { conversationId: channel._id, userId: creator._id },
      { permission: ParticipantPermission.MODERATE }
    );
    const updatedChannelByMod = await updateConversationTitle(
      channel._id,
      creator._id,
      'announcements-chat'
    );
    expect(updatedChannelByMod.title).toBe('announcements-chat');
  });

  it('rejects direct conversations non participants and invalid title parameters', async () => {
    const user1 = await createTestUser();
    const user2 = await createTestUser();
    const outsider = await createTestUser();
    const direct = await createDirectConversation(user1._id, user2._id);
    const group = await createGroupConversation(user1._id, [user2._id], 'Study Group');
    const club = await createTestClub(user1._id);
    const channel = await createChannel(club._id, 'announcements', [user1._id]);
    await createChannel(club._id, 'general', [user1._id]);
    await ConversationParticipant.updateOne(
      { conversationId: channel._id, userId: user1._id },
      { permission: ParticipantPermission.MODERATE }
    );

    await expect(
      updateConversationTitle(direct.conversation._id, user1._id, 'New Title')
    ).rejects.toThrow('Cannot update title of a direct conversation');

    await expect(
      updateConversationTitle(group._id, outsider._id, 'Hacked Title')
    ).rejects.toThrow('User is not a participant in this conversation');

    await expect(
      updateConversationTitle(null as unknown as Types.ObjectId, user1._id, 'Title')
    ).rejects.toThrow('Valid conversationId is required');

    await expect(
      updateConversationTitle(group._id, null as unknown as Types.ObjectId, 'Title')
    ).rejects.toThrow('Valid requestingUserId is required');

    await expect(
      updateConversationTitle(group._id, user1._id, '   ')
    ).rejects.toThrow('Valid conversation title is required');

    await expect(
      updateConversationTitle(channel._id, user1._id, 'general')
    ).rejects.toThrow('A channel with this title already exists in the club');
  });
});

describe('removeParticipantFromConversation and leaveConversation services', () => {
  it('removes member when requested by moderator or when participant leaves with system messages', async () => {
    const moderator = await createTestUser({
      firstName: 'Potato',
      lastName: 'Sculpture',
      email: 'french_fries_monument@ufl.edu',
    });
    const member1 = await createTestUser({
      firstName: 'GatorCorner',
      lastName: 'Survivor',
      email: 'soft_serve_broken@ufl.edu',
    });
    const member2 = await createTestUser({
      firstName: 'Danny',
      lastName: 'Wuerffel',
      email: 'dwuerffel@ufl.edu',
    });

    const group = await createGroupConversation(
      moderator._id,
      [member1._id, member2._id],
      'Chomp Streetwear Collective'
    );

    const removeResult = await removeParticipantFromConversation(group._id, moderator._id, member1._id);
    expect(removeResult).toBe(true);
    expect(await isUserParticipant(group._id, member1._id)).toBe(false);

    const removeMsg = await Message.findOne({ conversationId: group._id, text: /removed/ }).lean().exec();
    expect(removeMsg).not.toBeNull();
    expect(removeMsg?.text).toBe('Potato Sculpture removed GatorCorner Survivor');

    const leaveResult = await leaveConversation(group._id, member2._id);
    expect(leaveResult).toBe(true);
    expect(await isUserParticipant(group._id, member2._id)).toBe(false);

    const leaveMsg = await Message.findOne({ conversationId: group._id, text: /left the group/ }).lean().exec();
    expect(leaveMsg).not.toBeNull();
    expect(leaveMsg?.text).toBe('Danny Wuerffel left the group');

    const club = await createTestClub(moderator._id);
    const channel = await createChannel(club._id, 'announcements', [moderator._id, member1._id]);
    await leaveConversation(channel._id, member1._id);

    const channelLeaveMsg = await Message.findOne({ conversationId: channel._id, text: /left the channel/ }).lean().exec();
    expect(channelLeaveMsg).not.toBeNull();
    expect(channelLeaveMsg?.text).toBe('GatorCorner Survivor left the channel');
  });

  it('retains conversation document when the last participant leaves', async () => {
    const user1 = await createTestUser();
    const user2 = await createTestUser();
    const group = await createGroupConversation(user1._id, [user2._id], 'Empty After Leave Group');

    await leaveConversation(group._id, user2._id);
    await leaveConversation(group._id, user1._id);

    const participants = await getConversationParticipants(group._id);
    expect(participants).toHaveLength(0);

    const fromDb = await Conversation.findById(group._id).lean();
    expect(fromDb).not.toBeNull();
  });

  it('rejects sole moderator departure when other members remain in group conversation', async () => {
    const moderator = await createTestUser({
      firstName: 'Broward',
      lastName: 'Freshman',
      email: 'broward.dining@ufl.edu',
    });
    const member = await createTestUser({
      firstName: 'Reitz',
      lastName: 'Bowler',
      email: 'game.room@ufl.edu',
    });
    const group = await createGroupConversation(
      moderator._id,
      [member._id],
      'Marston Basement Study Group'
    );

    await expect(
      leaveConversation(group._id, moderator._id)
    ).rejects.toThrow(
      'Cannot remove the last moderator from a group conversation with remaining participants'
    );

    await expect(
      removeParticipantFromConversation(group._id, moderator._id, moderator._id)
    ).rejects.toThrow(
      'Cannot remove the last moderator from a group conversation with remaining participants'
    );
  });

  it('allows sole moderator departure when no other members remain in group conversation', async () => {
    const creator = await createTestUser({
      firstName: 'Broward',
      lastName: 'Freshman',
      email: 'broward.dining@ufl.edu',
    });
    const member = await createTestUser({
      firstName: 'Reitz',
      lastName: 'Bowler',
      email: 'game.room@ufl.edu',
    });
    const group = await createGroupConversation(
      creator._id,
      [member._id],
      'Marston Basement Study Group'
    );

    await leaveConversation(group._id, member._id);
    const result = await leaveConversation(group._id, creator._id);
    expect(result).toBe(true);

    const remaining = await getConversationParticipants(group._id);
    expect(remaining).toHaveLength(0);
  });

  it('rejects unauthorized removals direct conversations and non participant requests', async () => {
    const creator = await createTestUser();
    const regularMember = await createTestUser();
    const targetMember = await createTestUser();
    const outsider = await createTestUser();
    const group = await createGroupConversation(creator._id, [regularMember._id, targetMember._id], 'Group');
    const direct = await createDirectConversation(creator._id, regularMember._id);

    await expect(
      removeParticipantFromConversation(group._id, regularMember._id, targetMember._id)
    ).rejects.toThrow('Only moderators can remove other participants');

    await expect(
      removeParticipantFromConversation(direct.conversation._id, creator._id, regularMember._id)
    ).rejects.toThrow('Cannot remove participants from a direct conversation');

    await expect(
      removeParticipantFromConversation(group._id, outsider._id, targetMember._id)
    ).rejects.toThrow('User is not a participant in this conversation');

    await expect(
      removeParticipantFromConversation(group._id, creator._id, outsider._id)
    ).rejects.toThrow('Target user is not a participant in this conversation');
  });

  it('validates input parameters on participant removal and departure', async () => {
    const validId = new Types.ObjectId();
    const fakeId = new Types.ObjectId();

    await expect(
      removeParticipantFromConversation(null as unknown as Types.ObjectId, validId, validId)
    ).rejects.toThrow('Valid conversationId is required');

    await expect(
      removeParticipantFromConversation(validId, null as unknown as Types.ObjectId, validId)
    ).rejects.toThrow('Valid requestingUserId is required');

    await expect(
      removeParticipantFromConversation(validId, validId, null as unknown as Types.ObjectId)
    ).rejects.toThrow('Valid targetUserId is required');

    await expect(
      removeParticipantFromConversation(fakeId, validId, validId)
    ).rejects.toThrow('Conversation not found');

    await expect(
      leaveConversation(null as unknown as Types.ObjectId, validId)
    ).rejects.toThrow('Valid conversationId is required');

    await expect(
      leaveConversation(validId, null as unknown as Types.ObjectId)
    ).rejects.toThrow('Valid userId is required');
  });
});

describe('updateParticipantPermissions service', () => {
  it('updates permissions with transition system messages across promote demote and restriction', async () => {
    const moderator = await createTestUser({
      firstName: 'Potato',
      lastName: 'Sculpture',
      email: 'french_fries_monument@ufl.edu',
    });
    const member = await createTestUser({
      firstName: 'GatorCorner',
      lastName: 'Survivor',
      email: 'soft_serve_broken@ufl.edu',
    });

    const group = await createGroupConversation(
      moderator._id,
      [member._id],
      'Chomp Streetwear Collective'
    );

    const promoted = await updateParticipantPermission(
      group._id,
      moderator._id,
      member._id,
      ParticipantPermission.MODERATE
    );
    expect(promoted.permission).toBe(ParticipantPermission.MODERATE);

    const demoted = await updateParticipantPermission(
      group._id,
      moderator._id,
      member._id,
      ParticipantPermission.WRITE
    );
    expect(demoted.permission).toBe(ParticipantPermission.WRITE);

    const restricted = await updateParticipantPermission(
      group._id,
      moderator._id,
      member._id,
      ParticipantPermission.READ
    );
    expect(restricted.permission).toBe(ParticipantPermission.READ);

    const systemMessages = await Message.find({
      conversationId: group._id,
      isSystem: true,
    }).lean().exec();

    const texts = systemMessages.map((m) => m.text);
    expect(texts).toContain('Potato Sculpture made GatorCorner Survivor a moderator');
    expect(texts).toContain('Potato Sculpture removed GatorCorner Survivor as a moderator');
    expect(texts).toContain('Potato Sculpture set GatorCorner Survivor to read only');
  });

  it('updates permissions in bulk without creating system messages', async () => {
    const moderator = await createTestUser();
    const member1 = await createTestUser();
    const member2 = await createTestUser();

    const group = await createGroupConversation(
      moderator._id,
      [member1._id, member2._id],
      'Bulk Permission Group'
    );

    const updatedList = await updateParticipantPermissions(
      group._id,
      moderator._id,
      [
        [member1._id, ParticipantPermission.MODERATE],
        [member2._id, ParticipantPermission.READ],
      ]
    );

    expect(updatedList).toHaveLength(2);
    expect(updatedList[0].permission).toBe(ParticipantPermission.MODERATE);
    expect(updatedList[1].permission).toBe(ParticipantPermission.READ);

    const systemMessages = await Message.find({
      conversationId: group._id,
      isSystem: true,
      text: /moderator|read only|messages/,
    }).lean().exec();
    expect(systemMessages).toHaveLength(0);
  });

  it('updates channel permissions silently and rejects non moderator changes', async () => {
    const moderator = await createTestUser();
    const member = await createTestUser();
    const club = await createTestClub(moderator._id);
    const channel = await createChannel(club._id, 'announcements', [moderator._id, member._id]);

    await ConversationParticipant.updateOne(
      { conversationId: channel._id, userId: moderator._id },
      { permission: ParticipantPermission.MODERATE }
    );

    const updated = await updateParticipantPermission(
      channel._id,
      moderator._id,
      member._id,
      ParticipantPermission.READ
    );
    expect(updated.permission).toBe(ParticipantPermission.READ);

    const channelMessages = await Message.find({
      conversationId: channel._id,
    }).lean().exec();
    expect(channelMessages).toHaveLength(0);

    await expect(
      updateParticipantPermission(
        channel._id,
        member._id,
        moderator._id,
        ParticipantPermission.WRITE
      )
    ).rejects.toThrow('Only moderators can update participant permissions');
  });

  it('rejects permission updates on direct conversations non members and invalid arguments', async () => {
    const user1 = await createTestUser();
    const user2 = await createTestUser();
    const outsider = await createTestUser();
    const direct = await createDirectConversation(user1._id, user2._id);
    const group = await createGroupConversation(user1._id, [user2._id], 'Group');
    const fakeId = new Types.ObjectId();

    await expect(
      updateParticipantPermission(
        direct.conversation._id,
        user1._id,
        user2._id,
        ParticipantPermission.MODERATE
      )
    ).rejects.toThrow('Cannot update permissions in a direct conversation');

    await expect(
      updateParticipantPermission(
        group._id,
        outsider._id,
        user2._id,
        ParticipantPermission.MODERATE
      )
    ).rejects.toThrow('User is not a participant in this conversation');

    await expect(
      updateParticipantPermission(
        group._id,
        user1._id,
        outsider._id,
        ParticipantPermission.MODERATE
      )
    ).rejects.toThrow('Target user is not a participant in this conversation');

    await expect(
      updateParticipantPermission(
        null as unknown as Types.ObjectId,
        user1._id,
        user2._id,
        ParticipantPermission.MODERATE
      )
    ).rejects.toThrow('Valid conversationId is required');

    await expect(
      updateParticipantPermission(
        group._id,
        null as unknown as Types.ObjectId,
        user2._id,
        ParticipantPermission.MODERATE
      )
    ).rejects.toThrow('Valid requestingUserId is required');

    await expect(
      updateParticipantPermission(
        fakeId,
        user1._id,
        user2._id,
        ParticipantPermission.MODERATE
      )
    ).rejects.toThrow('Conversation not found');
  });

  it('rejects demoting sole moderator to write permissions in group conversation', async () => {
    const moderator = await createTestUser({
      firstName: 'Newell',
      lastName: 'Nightowl',
      email: 'newell3am@ufl.edu',
    });
    const member = await createTestUser({
      firstName: 'GatorCorner',
      lastName: 'Survivor',
      email: 'soft_serve_broken@ufl.edu',
    });
    const group = await createGroupConversation(
      moderator._id,
      [member._id],
      'Turlington Plaza Frisbee'
    );

    await expect(
      updateParticipantPermission(
        group._id,
        moderator._id,
        moderator._id,
        ParticipantPermission.WRITE
      )
    ).rejects.toThrow('Group conversations must have at least one moderator');
  });

  it('permits batch permission update that demotes one moderator while promoting another', async () => {
    const mod1 = await createTestUser({
      firstName: 'Newell',
      lastName: 'Nightowl',
      email: 'newell3am@ufl.edu',
    });
    const member = await createTestUser({
      firstName: 'GatorCorner',
      lastName: 'Survivor',
      email: 'soft_serve_broken@ufl.edu',
    });
    const group = await createGroupConversation(
      mod1._id,
      [member._id],
      'Turlington Plaza Frisbee'
    );

    const updatedList = await updateParticipantPermissions(
      group._id,
      mod1._id,
      [
        [mod1._id, ParticipantPermission.WRITE],
        [member._id, ParticipantPermission.MODERATE],
      ]
    );

    expect(updatedList).toHaveLength(2);
    const mod1Updated = updatedList.find((p) => p.userId.toString() === mod1._id.toString());
    const memberUpdated = updatedList.find((p) => p.userId.toString() === member._id.toString());
    expect(mod1Updated?.permission).toBe(ParticipantPermission.WRITE);
    expect(memberUpdated?.permission).toBe(ParticipantPermission.MODERATE);
  });
});

