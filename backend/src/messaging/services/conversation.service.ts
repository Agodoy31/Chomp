// See Issue #98: https://github.com/Agodoy31/Chomp/issues/98
// See Issue #100: https://github.com/Agodoy31/Chomp/issues/100
// See Issue #107: https://github.com/Agodoy31/Chomp/issues/107
import mongoose, { ClientSession, Types } from 'mongoose';
import { Conversation } from '../models/Conversation';
import { ConversationParticipant } from '../models/ConversationParticipant';
import { Message } from '../models/Message';
import {
  ConversationType,
  IConversation,
  IConversationDetails,
  IConversationFeedItem,
  IConversationParticipantSummary,
  IUserSummary,
} from '../interfaces/conversation.interfaces';
import {
  IConversationParticipant,
  ParticipantPermission,
} from '../interfaces/conversationParticipant.interfaces';
import { User } from '../../user/models/User';
import { Club } from '../../clubs/model/clubModel';
import { MessagingError, MessagingErrorCode } from '../errors/messagingError';

export const DEFAULT_GROUP_CONVERSATION_TITLE = 'Group Chat';

export interface CreateDirectConversationResult {
  conversation: IConversation;
  isNew: boolean;
}

export async function createDirectConversation(
  creatorId: Types.ObjectId,
  recipientId: Types.ObjectId
): Promise<CreateDirectConversationResult> {
  if (!creatorId || !mongoose.isObjectIdOrHexString(creatorId)) {
    throw new MessagingError(
      MessagingErrorCode.INVALID_INPUT,
      'Valid creatorId is required'
    );
  }

  if (!recipientId || !mongoose.isObjectIdOrHexString(recipientId)) {
    throw new MessagingError(
      MessagingErrorCode.INVALID_INPUT,
      'Valid recipientId is required'
    );
  }

  if (creatorId.toString() === recipientId.toString()) {
    throw new MessagingError(
      MessagingErrorCode.MESSAGE_SELF,
      'Cannot start a direct message conversation with yourself'
    );
  }

  // Verify users exist once the user schema is merged to main
  const usersExist = await validateUsersExist([creatorId, recipientId]);
  if (!usersExist) {
    throw new MessagingError(
      MessagingErrorCode.USER_NOT_FOUND,
      'One or more users do not exist'
    );
  }

  // Sort IDs so user pairs share the exact same key regardless of who initiates
  const dmPairKey = [creatorId.toString(), recipientId.toString()].sort().join(':');

  // Return existing conversation if already created
  const existing = await Conversation.findOne({ dmPairKey }).lean<IConversation>().exec();
  if (existing) {
    return { conversation: existing, isNew: false };
  }

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const [conversation] = await Conversation.create(
      [
        {
          type: ConversationType.DIRECT,
          dmPairKey,
        },
      ],
      { session }
    );

    await ConversationParticipant.create(
      [
        {
          conversationId: conversation._id,
          userId: creatorId,
        },
        {
          conversationId: conversation._id,
          userId: recipientId,
        },
      ],
      { session, ordered: true }
    );

    await session.commitTransaction();

    return {
      conversation: conversation.toObject<IConversation>(),
      isNew: true,
    };
  } catch (error: any) {
    await session.abortTransaction();

    // If another request created the chat first during a race, fetch and return the winner
    if (error && error.code === 11000) {
      const winner = await Conversation.findOne({ dmPairKey }).lean<IConversation>().exec();
      if (winner) {
        return { conversation: winner, isNew: false };
      }
    }

    throw error;
  } finally {
    await session.endSession();
  }
}

function deduplicateObjectIds(ids: Types.ObjectId[]): Types.ObjectId[] {
  const seen = new Set<string>();
  const uniqueIds: Types.ObjectId[] = [];

  for (const id of ids) {
    // Set compares object references, so convert to hex strings so multiple occurrences of the same user ID are reduced to one
    const key = id.toString();
    if (!seen.has(key)) {
      seen.add(key);
      uniqueIds.push(id);
    }
  }

  return uniqueIds;
}

export async function createGroupConversation(
  creatorId: Types.ObjectId,
  participantIds: Types.ObjectId[],
  title?: string
): Promise<IConversation> {
  if (!Array.isArray(participantIds)) {
    throw new MessagingError(
      MessagingErrorCode.INVALID_INPUT,
      'participantIds must be an array'
    );
  }

  if (!creatorId || !mongoose.isObjectIdOrHexString(creatorId)) {
    throw new MessagingError(
      MessagingErrorCode.INVALID_INPUT,
      'Valid creatorId is required'
    );
  }

  for (const id of participantIds) {
    if (!id || !mongoose.isObjectIdOrHexString(id)) {
      throw new MessagingError(
        MessagingErrorCode.INVALID_INPUT,
        'Valid participantId is required'
      );
    }
  }

  const allParticipantIds = [creatorId, ...participantIds];
  const uniqueParticipants = deduplicateObjectIds(allParticipantIds);

  if (uniqueParticipants.length < 2) {
    throw new MessagingError(
      MessagingErrorCode.INSUFFICIENT_PARTICIPANTS,
      'Group conversation requires at least two distinct participants'
    );
  }

  const usersExist = await validateUsersExist(uniqueParticipants);
  if (!usersExist) {
    throw new MessagingError(
      MessagingErrorCode.USER_NOT_FOUND,
      'One or more users do not exist'
    );
  }

  // Fall back to default title when title is omitted or blank whitespace and trim custom titles
  const resolvedTitle =
    typeof title === 'string' && title.trim().length > 0
      ? title.trim()
      : DEFAULT_GROUP_CONVERSATION_TITLE;

  const creator = await User.findById(creatorId)
    .select('firstName lastName')
    .lean<IUserSummary>()
    .exec();
  const creatorName = creator ? `${creator.firstName} ${creator.lastName}`.trim() : 'Someone';

  const session = await mongoose.startSession();
  try {
    session.startTransaction();
    const [conversation] = await Conversation.create(
      [
        {
          type: ConversationType.GROUP,
          title: resolvedTitle,
        },
      ],
      { session }
    );

    const participantDocs = uniqueParticipants.map((userId) => {
      return {
        conversationId: conversation._id,
        userId,
        permission:
          userId.toString() === creatorId.toString()
            ? ParticipantPermission.MODERATE
            : ParticipantPermission.WRITE,
      };
    });

    await ConversationParticipant.create(participantDocs, {
      session,
      ordered: true,
    });

    await Message.create(
      [
        {
          conversationId: conversation._id,
          senderId: creatorId,
          text: `${creatorName} created the group`,
          isAnnouncement: false,
          isSystem: true,
        },
      ],
      { session }
    );

    await session.commitTransaction();

    return conversation.toObject<IConversation>();
  } catch (error: any) {
    if (session.inTransaction()) {
      await session.abortTransaction();
    }
    throw error;
  } finally {
    await session.endSession();
  }
}

export async function addParticipantsToConversation(
  conversationId: Types.ObjectId,
  userIds: Types.ObjectId[],
  requestingUserIdOrSession?: Types.ObjectId | ClientSession,
  session?: ClientSession
): Promise<IConversationParticipantSummary[]> {
  if (!conversationId || !mongoose.isObjectIdOrHexString(conversationId)) {
    throw new MessagingError(
      MessagingErrorCode.VALIDATION_FAILED,
      'Valid conversationId is required'
    );
  }

  let _requestingUserId: Types.ObjectId | undefined;
  let activeSession: ClientSession | undefined = session;

  if (requestingUserIdOrSession) {
    if (
      typeof requestingUserIdOrSession === 'object' &&
      'startTransaction' in requestingUserIdOrSession
    ) {
      activeSession = requestingUserIdOrSession;
    } else if (mongoose.isObjectIdOrHexString(requestingUserIdOrSession)) {
      _requestingUserId = new Types.ObjectId(requestingUserIdOrSession);
    } else {
      throw new MessagingError(
        MessagingErrorCode.VALIDATION_FAILED,
        'Valid requestingUserId is required'
      );
    }
  }

  if (!Array.isArray(userIds)) {
    throw new MessagingError(
      MessagingErrorCode.VALIDATION_FAILED,
      'userIds must be an array'
    );
  }

  for (const id of userIds) {
    if (!id || !mongoose.isObjectIdOrHexString(id)) {
      throw new MessagingError(
        MessagingErrorCode.VALIDATION_FAILED,
        'Valid participantId is required'
      );
    }
  }

  const conversationQuery = Conversation.findById(conversationId)
    .select('type')
    .lean();
  if (activeSession) {
    conversationQuery.session(activeSession);
  }
  const conversation = await conversationQuery.exec();

  if (!conversation) {
    throw new MessagingError(
      MessagingErrorCode.CONVERSATION_NOT_FOUND,
      'Conversation does not exist'
    );
  }

  if (conversation.type === ConversationType.DIRECT) {
    throw new MessagingError(
      MessagingErrorCode.PERMISSION_DENIED,
      'Cannot add participants to a direct conversation'
    );
  }

  if (conversation.type === ConversationType.GROUP) {
    if (!_requestingUserId) {
      throw new MessagingError(
        MessagingErrorCode.PERMISSION_DENIED,
        'requestingUserId is required for group conversations'
      );
    }

    const requesterQuery = ConversationParticipant.findOne({
      userId: _requestingUserId,
      conversationId,
    })
      .select('permission')
      .lean();
    if (activeSession) {
      requesterQuery.session(activeSession);
    }
    const requester = await requesterQuery.exec();

    if (!requester) {
      throw new MessagingError(
        MessagingErrorCode.PERMISSION_DENIED,
        'User is not a participant in this conversation'
      );
    }

    if (requester.permission === ParticipantPermission.READ) {
      throw new MessagingError(
        MessagingErrorCode.PERMISSION_DENIED,
        'User does not have permission to add participants'
      );
    }
  }

  const uniqueUserIds = deduplicateObjectIds(userIds);
  if (uniqueUserIds.length === 0) {
    return [];
  }

  const usersExist = await validateUsersExist(uniqueUserIds);
  if (!usersExist) {
    throw new MessagingError(
      MessagingErrorCode.USER_NOT_FOUND,
      'One or more users do not exist'
    );
  }

  const existingQuery = ConversationParticipant.find({
    userId: { $in: uniqueUserIds },
    conversationId,
  })
    .select('userId')
    .lean();
  if (activeSession) {
    existingQuery.session(activeSession);
  }
  const existing = await existingQuery.exec();

  const existingSet = new Set(existing.map((p) => p.userId.toString()));
  const usersToAdd = uniqueUserIds.filter((id) => !existingSet.has(id.toString()));

  if (usersToAdd.length === 0) {
    return [];
  }

  const docs = usersToAdd.map((userId) => {
    return {
      conversationId,
      userId,
    };
  });

  const ownsSession = !activeSession && Boolean(_requestingUserId);
  const effectiveSession = ownsSession ? await mongoose.startSession() : activeSession;
  if (ownsSession && effectiveSession) {
    effectiveSession.startTransaction();
  }

  try {
    const created = await ConversationParticipant.create(
      docs,
      effectiveSession ? { session: effectiveSession, ordered: true } : { ordered: true }
    );

    const usersQuery = User.find({ _id: { $in: usersToAdd } })
      .select('firstName lastName')
      .lean<IUserSummary[]>();
    if (effectiveSession) {
      usersQuery.session(effectiveSession);
    }
    const addedUsers = await usersQuery.exec();

    if (_requestingUserId) {
      const requesterQuery = User.findById(_requestingUserId)
        .select('firstName lastName')
        .lean<IUserSummary>();
      if (effectiveSession) {
        requesterQuery.session(effectiveSession);
      }
      const requester = await requesterQuery.exec();
      const requesterName = requester
        ? `${requester.firstName} ${requester.lastName}`.trim()
        : 'Someone';

      let text: string;
      if (usersToAdd.length === 1) {
        const addedUser = addedUsers.find(
          (u) => u._id.toString() === usersToAdd[0].toString()
        );
        const addedUserName = addedUser
          ? `${addedUser.firstName} ${addedUser.lastName}`.trim()
          : 'someone';
        text = `${requesterName} added ${addedUserName}`;
      } else {
        text = `${requesterName} added ${usersToAdd.length} people`;
      }

      await Message.create(
        [
          {
            conversationId,
            senderId: _requestingUserId,
            text,
            isAnnouncement: false,
            isSystem: true,
          },
        ],
        effectiveSession ? { session: effectiveSession } : undefined
      );
    }

    if (ownsSession && effectiveSession) {
      await effectiveSession.commitTransaction();
    }

    const userMap = new Map<string, IUserSummary>(
      addedUsers.map((u) => [u._id.toString(), u])
    );

    return created.map((doc) => {
      const userSummary = userMap.get(doc.userId.toString()) || {
        _id: doc.userId,
        firstName: '',
        lastName: '',
      };
      return {
        userId: userSummary,
        permission: doc.permission || ParticipantPermission.WRITE,
      };
    });
  } catch (error: any) {
    if (ownsSession && effectiveSession?.inTransaction()) {
      await effectiveSession.abortTransaction();
    }
    throw error;
  } finally {
    if (ownsSession && effectiveSession) {
      await effectiveSession.endSession();
    }
  }
}

export async function createChannel(
  clubId: Types.ObjectId,
  title: string,
  participantIds: Types.ObjectId[] = [],
  externalSession?: ClientSession
): Promise<IConversation> {
  if (!clubId || !mongoose.isObjectIdOrHexString(clubId)) {
    throw new MessagingError(
      MessagingErrorCode.INVALID_INPUT,
      'Valid clubId is required'
    );
  }

  if (typeof title !== 'string' || title.trim().length === 0) {
    throw new MessagingError(
      MessagingErrorCode.TITLE_REQUIRED,
      'Channel title is required'
    );
  }

  if (!Array.isArray(participantIds)) {
    throw new MessagingError(
      MessagingErrorCode.INVALID_INPUT,
      'participantIds must be an array'
    );
  }

  const clubExists = await Club.exists({ _id: clubId });
  if (!clubExists) {
    throw new MessagingError(
      MessagingErrorCode.CLUB_NOT_FOUND,
      'Club does not exist'
    );
  }

  const trimmedTitle = title.trim();

  // If caller provided an external session, run inside the caller transaction
  if (externalSession) {
    try {
      const [conversation] = await Conversation.create(
        [
          {
            type: ConversationType.CHANNEL,
            clubId,
            title: trimmedTitle,
          },
        ],
        { session: externalSession }
      );

      if (participantIds.length > 0) {
        await addParticipantsToConversation(
          conversation._id,
          participantIds,
          externalSession
        );
      }

      return conversation.toObject<IConversation>();
    } catch (error: any) {
      if (error && error.code === 11000) {
        throw new MessagingError(
          MessagingErrorCode.CHANNEL_TITLE_EXISTS,
          'A channel with this title already exists in the club'
        );
      }
      throw error;
    }
  }

  // If no participants are specified and no session passed, perform a simple write
  if (participantIds.length === 0) {
    try {
      const [conversation] = await Conversation.create([
        {
          type: ConversationType.CHANNEL,
          clubId,
          title: trimmedTitle,
        },
      ]);

      return conversation.toObject<IConversation>();
    } catch (error: any) {
      if (error && error.code === 11000) {
        throw new MessagingError(
          MessagingErrorCode.CHANNEL_TITLE_EXISTS,
          'A channel with this title already exists in the club'
        );
      }
      throw error;
    }
  }

  // If participants are specified without an external session, wrap in an internal transaction
  const session = await mongoose.startSession();
  try {
    session.startTransaction();

    const [conversation] = await Conversation.create(
      [
        {
          type: ConversationType.CHANNEL,
          clubId,
          title: trimmedTitle,
        },
      ],
      { session }
    );

    await addParticipantsToConversation(
      conversation._id,
      participantIds,
      session
    );

    await session.commitTransaction();

    return conversation.toObject<IConversation>();
  } catch (error: any) {
    if (session.inTransaction()) {
      await session.abortTransaction();
    }
    if (error && error.code === 11000) {
      throw new MessagingError(
        MessagingErrorCode.CHANNEL_TITLE_EXISTS,
        'A channel with this title already exists in the club'
      );
    }
    throw error;
  } finally {
    await session.endSession();
  }
}

// Validate that all specified user IDs exist in the users collection
export async function validateUsersExist(
  userIds: Types.ObjectId | Types.ObjectId[]
): Promise<boolean> {
  const ids = Array.isArray(userIds) ? userIds : [userIds];
  if (ids.length === 0) {
    return false;
  }

  const existingCount = await User.countDocuments({
    _id: { $in: ids },
  }).exec();

  return existingCount === ids.length;
}

export async function isUserParticipant(
  conversationId: Types.ObjectId,
  userId: Types.ObjectId
): Promise<boolean> {
  if (!conversationId || !mongoose.isObjectIdOrHexString(conversationId)) {
    throw new Error('Valid conversationId is required');
  }

  if (!userId || !mongoose.isObjectIdOrHexString(userId)) {
    throw new Error('Valid userId is required');
  }

  const participantExists = await ConversationParticipant.exists({
    userId,
    conversationId,
  });

  return Boolean(participantExists);
}

export async function getConversationParticipants(
  conversationId: Types.ObjectId
): Promise<IConversationParticipant[]> {
  if (!conversationId || !mongoose.isObjectIdOrHexString(conversationId)) {
    throw new Error('Valid conversationId is required');
  }

  return ConversationParticipant.find({ conversationId })
    .lean<IConversationParticipant[]>()
    .exec();
}

export async function getConversationDetails(
  conversationId: Types.ObjectId,
  requestingUserId: Types.ObjectId
): Promise<IConversationDetails | null> {
  if (!conversationId || !mongoose.isObjectIdOrHexString(conversationId)) {
    throw new Error('Valid conversationId is required');
  }

  if (!requestingUserId || !mongoose.isObjectIdOrHexString(requestingUserId)) {
    throw new Error('Valid requestingUserId is required');
  }

  const isParticipant = await isUserParticipant(conversationId, requestingUserId);
  if (!isParticipant) {
    return null;
  }

  const conversation = await Conversation.findById(conversationId)
    .select('type title clubId')
    .lean<IConversation>()
    .exec();

  if (!conversation) {
    return null;
  }

  const conversationObjectId = new Types.ObjectId(conversationId);

  const participants = await ConversationParticipant.aggregate<IConversationParticipantSummary>([
    {
      $match: {
        conversationId: conversationObjectId,
      },
    },
    {
      $project: {
        _id: 1,
        userId: 1,
        permission: 1,
      },
    },
    {
      $lookup: {
        from: 'users',
        localField: 'userId',
        foreignField: '_id',
        as: 'user',
      },
    },
    {
      $unwind: '$user',
    },
    {
      $project: {
        _id: 0,
        permission: 1,
        userId: {
          _id: '$user._id',
          firstName: '$user.firstName',
          lastName: '$user.lastName',
        },
      },
    },
    {
      $sort: {
        'userId.firstName': 1,
        'userId.lastName': 1,
      },
    },
  ]);

  let displayName = conversation.title ?? '';
  if (conversation.type === ConversationType.DIRECT) {
    const otherParticipant = participants.find(
      (p) => p.userId._id.toString() !== requestingUserId.toString()
    )!;
    displayName = `${otherParticipant.userId.firstName} ${otherParticipant.userId.lastName}`;
  }

  return {
    _id: conversation._id,
    type: conversation.type,
    title: conversation.title,
    clubId: conversation.clubId,
    displayName,
    participants,
  };
}

export async function updateConversationTitle(
  conversationId: Types.ObjectId,
  requestingUserId: Types.ObjectId,
  newTitle: string
): Promise<IConversation> {
  if (!conversationId || !mongoose.isObjectIdOrHexString(conversationId)) {
    throw new MessagingError(
      MessagingErrorCode.VALIDATION_FAILED,
      'Valid conversationId is required'
    );
  }

  if (!requestingUserId || !mongoose.isObjectIdOrHexString(requestingUserId)) {
    throw new MessagingError(
      MessagingErrorCode.VALIDATION_FAILED,
      'Valid requestingUserId is required'
    );
  }

  if (typeof newTitle !== 'string' || newTitle.trim().length === 0) {
    throw new MessagingError(
      MessagingErrorCode.VALIDATION_FAILED,
      'Valid conversation title is required'
    );
  }

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const conversation = await Conversation.findById(conversationId).session(session);
    if (!conversation) {
      throw new MessagingError(
        MessagingErrorCode.CONVERSATION_NOT_FOUND,
        'Conversation not found'
      );
    }

    if (conversation.type === ConversationType.DIRECT) {
      throw new MessagingError(
        MessagingErrorCode.PERMISSION_DENIED,
        'Cannot update title of a direct conversation'
      );
    }

    if (conversation.type === ConversationType.GROUP) {
      const participant = await ConversationParticipant.findOne({
        userId: requestingUserId,
        conversationId,
      })
        .select('permission')
        .session(session)
        .lean();

      if (!participant) {
        throw new MessagingError(
          MessagingErrorCode.PERMISSION_DENIED,
          'User is not a participant in this conversation'
        );
      }

      if (participant.permission === ParticipantPermission.READ) {
        throw new MessagingError(
          MessagingErrorCode.PERMISSION_DENIED,
          'User does not have permission to update conversation title'
        );
      }
    }

    const oldTitle = conversation.title;
    conversation.title = newTitle.trim();

    try {
      await conversation.save({ session });
    } catch (saveError: any) {
      if (saveError && saveError.code === 11000) {
        throw new MessagingError(
          MessagingErrorCode.CHANNEL_TITLE_EXISTS,
          'A channel with this title already exists in the club'
        );
      }
      throw saveError;
    }

    if (conversation.type === ConversationType.GROUP && oldTitle !== conversation.title) {
      const requester = await User.findById(requestingUserId)
        .select('firstName lastName')
        .session(session)
        .lean<IUserSummary>();
      const requesterName = requester
        ? `${requester.firstName} ${requester.lastName}`.trim()
        : 'Someone';

      await Message.create(
        [
          {
            conversationId,
            senderId: requestingUserId,
            text: `${requesterName} changed the group title to ${conversation.title}`,
            isAnnouncement: false,
            isSystem: true,
          },
        ],
        { session }
      );
    }

    await session.commitTransaction();
    return conversation.toObject<IConversation>();
  } catch (error: any) {
    if (session.inTransaction()) {
      await session.abortTransaction();
    }
    throw error;
  } finally {
    await session.endSession();
  }
}

export async function removeParticipantFromConversation(
  conversationId: Types.ObjectId,
  requestingUserId: Types.ObjectId,
  targetUserId: Types.ObjectId,
  externalSession?: ClientSession
): Promise<boolean> {
  if (!conversationId || !mongoose.isObjectIdOrHexString(conversationId)) {
    throw new MessagingError(
      MessagingErrorCode.VALIDATION_FAILED,
      'Valid conversationId is required'
    );
  }

  if (!requestingUserId || !mongoose.isObjectIdOrHexString(requestingUserId)) {
    throw new MessagingError(
      MessagingErrorCode.VALIDATION_FAILED,
      'Valid requestingUserId is required'
    );
  }

  if (!targetUserId || !mongoose.isObjectIdOrHexString(targetUserId)) {
    throw new MessagingError(
      MessagingErrorCode.VALIDATION_FAILED,
      'Valid targetUserId is required'
    );
  }

  if (externalSession) {
    return executeRemoveParticipantFromConversation(
      conversationId,
      requestingUserId,
      targetUserId,
      externalSession
    );
  }

  const session = await mongoose.startSession();
  try {
    session.startTransaction();
    const result = await executeRemoveParticipantFromConversation(
      conversationId,
      requestingUserId,
      targetUserId,
      session
    );
    await session.commitTransaction();
    return result;
  } catch (error: any) {
    if (session.inTransaction()) {
      await session.abortTransaction();
    }
    throw error;
  } finally {
    await session.endSession();
  }
}

async function executeRemoveParticipantFromConversation(
  conversationId: Types.ObjectId,
  requestingUserId: Types.ObjectId,
  targetUserId: Types.ObjectId,
  session: ClientSession
): Promise<boolean> {
  const conversation = await Conversation.findById(conversationId)
    .select('type')
    .session(session)
    .lean()
    .exec();
  if (!conversation) {
    throw new MessagingError(
      MessagingErrorCode.CONVERSATION_NOT_FOUND,
      'Conversation not found'
    );
  }

  if (conversation.type === ConversationType.DIRECT) {
    throw new MessagingError(
      MessagingErrorCode.PERMISSION_DENIED,
      'Cannot remove participants from a direct conversation'
    );
  }

  const requesterParticipant = await ConversationParticipant.findOne({
    userId: requestingUserId,
    conversationId,
  })
    .select('permission')
    .session(session)
    .lean()
    .exec();

  if (!requesterParticipant) {
    throw new MessagingError(
      MessagingErrorCode.PERMISSION_DENIED,
      'User is not a participant in this conversation'
    );
  }

  const isSelf = requestingUserId.toString() === targetUserId.toString();
  if (!isSelf && requesterParticipant.permission !== ParticipantPermission.MODERATE) {
    throw new MessagingError(
      MessagingErrorCode.PERMISSION_DENIED,
      'Only moderators can remove other participants'
    );
  }

  const targetParticipant = isSelf
    ? requesterParticipant
    : await ConversationParticipant.findOne({ userId: targetUserId, conversationId })
        .select('permission')
        .session(session)
        .lean()
        .exec();

  if (!targetParticipant) {
    throw new MessagingError(
      MessagingErrorCode.USER_NOT_FOUND,
      'Target user is not a participant in this conversation'
    );
  }

  if (
    conversation.type === ConversationType.GROUP &&
    targetParticipant.permission === ParticipantPermission.MODERATE
  ) {
    const totalParticipants = await ConversationParticipant.countDocuments({
      conversationId,
    }).session(session);
    if (totalParticipants > 1) {
      const remainingModerators = await ConversationParticipant.countDocuments({
        conversationId,
        permission: ParticipantPermission.MODERATE,
        userId: { $ne: targetUserId },
      }).session(session);
      if (remainingModerators === 0) {
        throw new MessagingError(
          MessagingErrorCode.PERMISSION_DENIED,
          'Cannot remove the last moderator from a group conversation with remaining participants'
        );
      }
    }
  }

  await ConversationParticipant.deleteOne(
    {
      userId: targetUserId,
      conversationId,
    },
    { session }
  ).exec();

  const requester = await User.findById(requestingUserId)
    .select('firstName lastName')
    .session(session)
    .lean<IUserSummary>()
    .exec();
  const requesterName = requester
    ? `${requester.firstName} ${requester.lastName}`.trim()
    : 'Someone';

  let text: string;
  if (isSelf) {
    text =
      conversation.type === ConversationType.CHANNEL
        ? `${requesterName} left the channel`
        : `${requesterName} left the group`;
  } else {
    const targetUser = await User.findById(targetUserId)
      .select('firstName lastName')
      .session(session)
      .lean<IUserSummary>()
      .exec();
    const targetName = targetUser
      ? `${targetUser.firstName} ${targetUser.lastName}`.trim()
      : 'someone';
    text = `${requesterName} removed ${targetName}`;
  }

  await Message.create(
    [
      {
        conversationId,
        senderId: requestingUserId,
        text,
        isAnnouncement: false,
        isSystem: true,
      },
    ],
    { session }
  );

  return true;
}

export type PermissionUpdate = [Types.ObjectId, ParticipantPermission];

function isPermissionUpdateTuple(
  update: PermissionUpdate | PermissionUpdate[]
): update is PermissionUpdate {
  return Array.isArray(update) && update.length === 2 && !Array.isArray(update[0]);
}

export async function updateParticipantPermissions(
  conversationId: Types.ObjectId,
  requestingUserId: Types.ObjectId | undefined,
  updates: PermissionUpdate | PermissionUpdate[],
  session?: ClientSession
): Promise<IConversationParticipantSummary[]> {
  if (!conversationId || !mongoose.isObjectIdOrHexString(conversationId)) {
    throw new MessagingError(
      MessagingErrorCode.VALIDATION_FAILED,
      'Valid conversationId is required'
    );
  }

  if (!updates) {
    throw new MessagingError(
      MessagingErrorCode.VALIDATION_FAILED,
      'Permission updates are required'
    );
  }

  const normalizedUpdates: PermissionUpdate[] = isPermissionUpdateTuple(updates)
    ? [updates]
    : updates;

  if (normalizedUpdates.length === 0) {
    return [];
  }

  for (const [targetUserId, newPermission] of normalizedUpdates) {
    if (!targetUserId || !mongoose.isObjectIdOrHexString(targetUserId)) {
      throw new MessagingError(
        MessagingErrorCode.VALIDATION_FAILED,
        'Valid targetUserId is required'
      );
    }
    if (!Object.values(ParticipantPermission).includes(newPermission)) {
      throw new MessagingError(
        MessagingErrorCode.VALIDATION_FAILED,
        'Valid permission is required'
      );
    }
  }

  const ownsSession = !session;
  const activeSession = ownsSession ? await mongoose.startSession() : session;
  if (ownsSession && activeSession) {
    activeSession.startTransaction();
  }

  try {
    const conversation = await Conversation.findById(conversationId)
      .select('type')
      .session(activeSession)
      .lean()
      .exec();
    if (!conversation) {
      throw new MessagingError(
        MessagingErrorCode.CONVERSATION_NOT_FOUND,
        'Conversation not found'
      );
    }

    if (conversation.type === ConversationType.DIRECT) {
      throw new MessagingError(
        MessagingErrorCode.PERMISSION_DENIED,
        'Cannot update permissions in a direct conversation'
      );
    }

    const isBulk = normalizedUpdates.length > 1;
    const isGroup = conversation.type === ConversationType.GROUP;
    const updatedParticipants: IConversationParticipant[] = [];

    if (isGroup) {
      const requesterParticipant = await ConversationParticipant.findOne({
        userId: requestingUserId,
        conversationId,
      })
        .select('permission')
        .session(activeSession)
        .lean()
        .exec();

      if (!requesterParticipant) {
        throw new MessagingError(
          MessagingErrorCode.PERMISSION_DENIED,
          'User is not a participant in this conversation'
        );
      }

      if (requesterParticipant.permission !== ParticipantPermission.MODERATE) {
        throw new MessagingError(
          MessagingErrorCode.PERMISSION_DENIED,
          'Only moderators can update participant permissions'
        );
      }

      const currentModerators = await ConversationParticipant.find({
        conversationId,
        permission: ParticipantPermission.MODERATE,
      })
        .select('userId')
        .session(activeSession)
        .lean()
        .exec();
      const moderatorIds = new Set<string>(currentModerators.map((m) => m.userId.toString()));

      for (const [targetUserId, newPermission] of normalizedUpdates) {
        const targetKey = targetUserId.toString();
        if (newPermission === ParticipantPermission.MODERATE) {
          moderatorIds.add(targetKey);
        } else {
          moderatorIds.delete(targetKey);
        }
      }

      if (moderatorIds.size === 0) {
        throw new MessagingError(
          MessagingErrorCode.PERMISSION_DENIED,
          'Group conversations must have at least one moderator'
        );
      }
    }

    for (const [targetUserId, newPermission] of normalizedUpdates) {
      const targetParticipant = await ConversationParticipant.findOne({
        userId: targetUserId,
        conversationId,
      })
        .session(activeSession)
        .exec();

      if (!targetParticipant) {
        throw new MessagingError(
          MessagingErrorCode.USER_NOT_FOUND,
          'Target user is not a participant in this conversation'
        );
      }

      const oldPermission = targetParticipant.permission;
      targetParticipant.permission = newPermission;
      await targetParticipant.save({ session: activeSession });
      updatedParticipants.push(targetParticipant.toObject<IConversationParticipant>());

      if (!isBulk && isGroup && oldPermission !== newPermission) {
        const requester = await User.findById(requestingUserId)
          .select('firstName lastName')
          .session(activeSession)
          .lean<IUserSummary>()
          .exec();
        const requesterName = requester
          ? `${requester.firstName} ${requester.lastName}`.trim()
          : 'Someone';

        const targetUser = await User.findById(targetUserId)
          .select('firstName lastName')
          .session(activeSession)
          .lean<IUserSummary>()
          .exec();
        const targetName = targetUser
          ? `${targetUser.firstName} ${targetUser.lastName}`.trim()
          : 'someone';

        let text: string;
        if (newPermission === ParticipantPermission.MODERATE) {
          text = `${requesterName} made ${targetName} a moderator`;
        } else if (
          oldPermission === ParticipantPermission.MODERATE &&
          newPermission === ParticipantPermission.WRITE
        ) {
          text = `${requesterName} removed ${targetName} as a moderator`;
        } else if (newPermission === ParticipantPermission.READ) {
          text = `${requesterName} set ${targetName} to read only`;
        } else if (
          oldPermission === ParticipantPermission.READ &&
          newPermission === ParticipantPermission.WRITE
        ) {
          text = `${requesterName} allowed ${targetName} to send messages`;
        } else {
          text = `${requesterName} changed ${targetName} permission to ${newPermission.toLowerCase()}`;
        }

        await Message.create(
          [
            {
              conversationId,
              senderId: requestingUserId,
              text,
              isAnnouncement: false,
              isSystem: true,
            },
          ],
          { session: activeSession }
        );
      }
    }

    if (ownsSession && activeSession) {
      await activeSession.commitTransaction();
    }

    const updatedUserIds = normalizedUpdates.map(([targetUserId]) => targetUserId);
    const updatedUsers = await User.find({ _id: { $in: updatedUserIds } })
      .select('firstName lastName')
      .session(activeSession)
      .lean<IUserSummary[]>()
      .exec();

    const userMap = new Map<string, IUserSummary>(
      updatedUsers.map((u) => [u._id.toString(), u])
    );

    return updatedParticipants.map((p) => {
      const userSummary = userMap.get(p.userId.toString()) || {
        _id: p.userId,
        firstName: '',
        lastName: '',
      };
      return {
        userId: userSummary,
        permission: p.permission,
      };
    });
  } catch (error: any) {
    if (ownsSession && activeSession?.inTransaction()) {
      await activeSession.abortTransaction();
    }
    throw error;
  } finally {
    if (ownsSession && activeSession) {
      await activeSession.endSession();
    }
  }
}

export async function getUserConversations(
  userId: Types.ObjectId
): Promise<IConversationFeedItem[]> {
  if (!userId || !mongoose.isObjectIdOrHexString(userId)) {
    throw new Error('Valid userId is required');
  }

  const userObjectId = new Types.ObjectId(userId);

  return ConversationParticipant.aggregate<IConversationFeedItem>([
    {
      $match: {
        userId: userObjectId,
      },
    },
    {
      $lookup: {
        from: 'conversations',
        localField: 'conversationId',
        foreignField: '_id',
        as: 'conversation',
      },
    },
    {
      $unwind: '$conversation',
    },
    {
      $lookup: {
        from: 'messages',
        let: { convId: '$conversationId' },
        pipeline: [
          {
            $match: {
              $expr: {
                $eq: ['$conversationId', '$$convId'],
              },
            },
          },
          {
            $sort: {
              createdAt: -1,
              _id: -1,
            },
          },
          {
            $limit: 1,
          },
          {
            $lookup: {
              from: 'users',
              localField: 'senderId',
              foreignField: '_id',
              as: 'sender',
            },
          },
          {
            $unwind: {
              path: '$sender',
              preserveNullAndEmptyArrays: true,
            },
          },
          {
            $project: {
              _id: 0,
              text: {
                $cond: [
                  {
                    $ne: [{ $ifNull: ['$removedAt', null] }, null],
                  },
                  'This message was deleted',
                  '$text',
                ],
              },
              senderName: {
                $trim: {
                  input: {
                    $concat: [
                      { $ifNull: ['$sender.firstName', ''] },
                      ' ',
                      { $ifNull: ['$sender.lastName', ''] },
                    ],
                  },
                },
              },
              createdAt: 1,
            },
          },
        ],
        as: 'latestMessageArray',
      },
    },
    {
      $addFields: {
        latestMessage: {
          $arrayElemAt: ['$latestMessageArray', 0],
        },
      },
    },
    // Empty group chats disappear until system messages are implemented in the messaging schema
    {
      $match: {
        latestMessage: {
          $ne: null,
        },
      },
    },
    {
      $lookup: {
        from: ConversationParticipant.collection.name,
        let: { convId: '$conversationId', currentUserId: userObjectId },
        pipeline: [
          {
            $match: {
              $expr: {
                $and: [
                  {
                    $eq: ['$conversationId', '$$convId'],
                  },
                  {
                    $ne: ['$userId', '$$currentUserId'],
                  },
                ],
              },
            },
          },
          {
            $limit: 1,
          },
          {
            $lookup: {
              from: 'users',
              localField: 'userId',
              foreignField: '_id',
              as: 'otherUser',
            },
          },
          {
            $unwind: {
              path: '$otherUser',
              preserveNullAndEmptyArrays: true,
            },
          },
          {
            $project: {
              _id: 0,
              fullName: {
                $trim: {
                  input: {
                    $concat: [
                      { $ifNull: ['$otherUser.firstName', ''] },
                      ' ',
                      { $ifNull: ['$otherUser.lastName', ''] },
                    ],
                  },
                },
              },
            },
          },
        ],
        as: 'otherParticipantArray',
      },
    },
    {
      $addFields: {
        otherParticipant: {
          $arrayElemAt: ['$otherParticipantArray', 0],
        },
      },
    },
    {
      $project: {
        _id: '$conversation._id',
        type: '$conversation.type',
        title: '$conversation.title',
        clubId: '$conversation.clubId',
        displayName: {
          $cond: [
            {
              $eq: ['$conversation.type', ConversationType.DIRECT],
            },
            {
              $cond: [
                {
                  $ne: [{ $ifNull: ['$otherParticipant.fullName', ''] }, ''],
                },
                '$otherParticipant.fullName',
                'Direct Conversation',
              ],
            },
            {
              $cond: [
                {
                  $ne: [{ $ifNull: ['$conversation.title', ''] }, ''],
                },
                '$conversation.title',
                'Group Conversation',
              ],
            },
          ],
        },
        lastActivityAt: '$latestMessage.createdAt',
        lastMessage: '$latestMessage',
      },
    },
    {
      $sort: {
        lastActivityAt: -1,
      },
    },
  ]).exec();
}

export async function getClubChannels(
  clubId: Types.ObjectId
): Promise<IConversation[]> {
  if (!clubId || !mongoose.isObjectIdOrHexString(clubId)) {
    throw new Error('Valid clubId is required');
  }

  const clubObjectId = new Types.ObjectId(clubId);
  const clubExists = await Club.exists({ _id: clubObjectId });
  if (!clubExists) {
    throw new Error('Club does not exist');
  }

  return Conversation.find({
    clubId: clubObjectId,
    type: ConversationType.CHANNEL,
  })
    .collation({ locale: 'en', strength: 2 })
    .sort({ title: 1 })
    .lean<IConversation[]>()
    .exec();
}


