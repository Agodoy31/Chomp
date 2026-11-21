import {
  describe,
  it,
  expect,
  beforeAll,
  afterEach,
  afterAll,
  jest,
} from '@jest/globals';
import mongoose, { Types } from 'mongoose';
import { connectTestDb, clearTestDb, closeTestDb } from '../../helpers/db';
import { Conversation, ConversationType } from '../../../src/messaging/models/Conversation';
import { ConversationParticipant } from '../../../src/messaging/models/ConversationParticipant';
import { Message } from '../../../src/messaging/models/Message';
import {
  addParticipantsToConversation,
  createChannel,
  createDirectConversation,
  createGroupConversation,
  getClubChannels,
  getConversationDetails,
  getUserConversationFeedItem,
  getUserConversations,
  removeParticipantFromConversation,
  softDeleteConversation,
  updateConversationTitle,
  updateParticipantPermissions,
} from '../../../src/messaging/services/conversation.service';
import {
  deleteMessage,
  getMessages,
  sendMessage,
} from '../../../src/messaging/services/message.service';
import { ParticipantPermission } from '../../../src/messaging/interfaces/conversationParticipant.interfaces';
import {
  MessagingError,
  MessagingErrorCode,
} from '../../../src/messaging/errors/messagingError';
import { messagingPublisher } from '../../../src/messaging/sockets/messagingPublisher';
import { createTestClub, createTestUser } from './conversationTestUtils';

describe('softDeleteConversation', () => {
  beforeAll(async () => {
    await connectTestDb();
    await Conversation.init();
    await ConversationParticipant.init();
    await Message.init();
  }, 60000);

  afterEach(async () => {
    jest.restoreAllMocks();
    await clearTestDb();
  });

  afterAll(async () => {
    await closeTestDb();
  });

  it('marks conversation deleted, removes participant seats, keeps messages intact, and returns participantUserIds without publishing', async () => {
    const officer = await createTestUser({ firstName: 'Maya', lastName: 'Patel' });
    const member = await createTestUser({ firstName: 'Devon', lastName: 'Brooks' });
    const club = await createTestClub(officer._id);
    const channel = await createChannel(club._id, 'Study Sessions', [
      officer._id,
      member._id,
    ]);

    const { message: savedMessage } = await sendMessage(
      channel._id,
      officer._id,
      'Room 204 in Marston is open until 9 PM'
    );

    const publishSpy = jest.spyOn(messagingPublisher, 'conversationDeleted');

    const result = await softDeleteConversation(channel._id);

    expect(result.conversation._id.toString()).toBe(channel._id.toString());
    expect(result.conversation.deleted).toBe(true);
    expect([...result.participantUserIds].sort()).toEqual(
      [officer._id.toString(), member._id.toString()].sort()
    );
    expect(publishSpy).not.toHaveBeenCalled();

    const storedConversation = await Conversation.findById(channel._id).lean();
    expect(storedConversation?.deleted).toBe(true);

    const remainingSeats = await ConversationParticipant.countDocuments({
      conversationId: channel._id,
    });
    expect(remainingSeats).toBe(0);

    const storedMessage = await Message.findById(savedMessage._id).lean();
    expect(storedMessage).not.toBeNull();
    expect(storedMessage?.text).toBe('Room 204 in Marston is open until 9 PM');
  });

  it('succeeds when a conversation has zero participants', async () => {
    const officer = await createTestUser();
    const club = await createTestClub(officer._id);
    const channel = await createChannel(club._id, 'Empty Channel');

    const result = await softDeleteConversation(channel._id);

    expect(result.conversation.deleted).toBe(true);
    expect(result.participantUserIds).toEqual([]);
  });

  it('participates in a caller-supplied session and rolls back on abort', async () => {
    const officer = await createTestUser();
    const club = await createTestClub(officer._id);
    const channel = await createChannel(club._id, 'Workshop Planning', [officer._id]);

    const session = await mongoose.startSession();
    try {
      session.startTransaction();
      const result = await softDeleteConversation(channel._id, session);
      expect(result.conversation.deleted).toBe(true);
      expect(result.participantUserIds).toEqual([officer._id.toString()]);
      await session.abortTransaction();
    } finally {
      await session.endSession();
    }

    const storedConversation = await Conversation.findById(channel._id).lean();
    expect(storedConversation?.deleted).toBe(false);

    const remainingSeats = await ConversationParticipant.countDocuments({
      conversationId: channel._id,
    });
    expect(remainingSeats).toBe(1);
  });

  it('throws INVALID_INPUT for an invalid conversationId', async () => {
    await expect(
      softDeleteConversation('not-an-object-id' as unknown as Types.ObjectId)
    ).rejects.toMatchObject({
      code: MessagingErrorCode.INVALID_INPUT,
    });
  });

  it('throws CONVERSATION_NOT_FOUND for a missing or already-deleted conversation', async () => {
    await expect(softDeleteConversation(new Types.ObjectId())).rejects.toMatchObject({
      code: MessagingErrorCode.CONVERSATION_NOT_FOUND,
    });

    const group = await Conversation.create({
      type: ConversationType.GROUP,
      title: 'Gator Run Club',
    });

    await softDeleteConversation(group._id);

    await expect(softDeleteConversation(group._id)).rejects.toBeInstanceOf(
      MessagingError
    );
    await expect(softDeleteConversation(group._id)).rejects.toMatchObject({
      code: MessagingErrorCode.CONVERSATION_NOT_FOUND,
    });
  });

  it('allows only one caller to succeed on concurrent soft-delete requests', async () => {
    const officer = await createTestUser();
    const club = await createTestClub(officer._id);
    const channel = await createChannel(club._id, 'Race Channel', [officer._id]);

    const settled = await Promise.allSettled([
      softDeleteConversation(channel._id),
      softDeleteConversation(channel._id),
    ]);

    const fulfilled = settled.filter((entry) => entry.status === 'fulfilled');
    const rejected = settled.filter(
      (entry): entry is PromiseRejectedResult => entry.status === 'rejected'
    );

    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(rejected[0].reason).toMatchObject({
      code: MessagingErrorCode.CONVERSATION_NOT_FOUND,
    });
  });

  it('creates a fresh active DM after an earlier DM between the same users is soft-deleted', async () => {
    const userA = await createTestUser({ firstName: 'Tim', lastName: 'Tebow' });
    const userB = await createTestUser({ firstName: 'Danny', lastName: 'Wuerffel' });

    const first = await createDirectConversation(userA._id, userB._id);
    expect(first.isNew).toBe(true);

    await softDeleteConversation(first.conversation._id);

    const second = await createDirectConversation(userA._id, userB._id);
    expect(second.isNew).toBe(true);
    expect(second.conversation._id.toString()).not.toBe(first.conversation._id.toString());
    expect(second.conversation.deleted).toBe(false);
  });

  it('excludes soft-deleted channels from getClubChannels', async () => {
    const officer = await createTestUser();
    const club = await createTestClub(officer._id);
    const general = await createChannel(club._id, 'General', [officer._id]);
    const events = await createChannel(club._id, 'Events', [officer._id]);

    await softDeleteConversation(events._id);

    const channels = await getClubChannels(club._id);
    expect(channels.map((c) => c._id.toString())).toEqual([general._id.toString()]);
  });

  it('excludes soft-deleted conversations from details and feeds even with a stale participant row', async () => {
    const userA = await createTestUser();
    const userB = await createTestUser();
    const group = await createGroupConversation(userA._id, [userB._id], 'Lake Alice Watchers');
    await sendMessage(group._id, userA._id, 'Spotted three turtles by the dock');

    await Conversation.updateOne({ _id: group._id }, { $set: { deleted: true } });

    expect(await getConversationDetails(group._id, userA._id)).toBeNull();
    expect(await getUserConversations(userA._id)).toEqual([]);
    expect(await getUserConversationFeedItem(group._id, userA._id)).toBeNull();
  });

  it('rejects participant and title mutations on a soft-deleted conversation', async () => {
    const userA = await createTestUser();
    const userB = await createTestUser();
    const userC = await createTestUser();
    const group = await createGroupConversation(userA._id, [userB._id], 'Reitz Smash Bros');

    await Conversation.updateOne({ _id: group._id }, { $set: { deleted: true } });

    await expect(
      addParticipantsToConversation(group._id, [userC._id], userA._id)
    ).rejects.toMatchObject({ code: MessagingErrorCode.CONVERSATION_NOT_FOUND });

    await expect(
      updateConversationTitle(group._id, userA._id, 'New Smash Title')
    ).rejects.toMatchObject({ code: MessagingErrorCode.CONVERSATION_NOT_FOUND });

    await expect(
      removeParticipantFromConversation(group._id, userA._id, userB._id)
    ).rejects.toMatchObject({ code: MessagingErrorCode.CONVERSATION_NOT_FOUND });

    await expect(
      updateParticipantPermissions(group._id, userA._id, [
        userB._id,
        ParticipantPermission.READ,
      ])
    ).rejects.toMatchObject({ code: MessagingErrorCode.CONVERSATION_NOT_FOUND });
  });

  it('rejects sendMessage, getMessages, and deleteMessage on a soft-deleted conversation even with a stale participant row', async () => {
    const userA = await createTestUser();
    const userB = await createTestUser();
    const group = await createGroupConversation(userA._id, [userB._id], 'Marston Basement');
    const { message } = await sendMessage(group._id, userA._id, 'Table 4 is open');

    await Conversation.updateOne({ _id: group._id }, { $set: { deleted: true } });

    await expect(
      sendMessage(group._id, userA._id, 'Still open?')
    ).rejects.toMatchObject({ code: MessagingErrorCode.CONVERSATION_NOT_FOUND });

    await expect(getMessages(group._id, userA._id)).rejects.toMatchObject({
      code: MessagingErrorCode.CONVERSATION_NOT_FOUND,
    });

    await expect(
      deleteMessage(group._id, message._id, userA._id)
    ).rejects.toMatchObject({ code: MessagingErrorCode.CONVERSATION_NOT_FOUND });
  });
});

