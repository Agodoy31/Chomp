// See Issue #98: https://github.com/Agodoy31/Chomp/issues/98
// See Issue #100: https://github.com/Agodoy31/Chomp/issues/100
// See Issue #107: https://github.com/Agodoy31/Chomp/issues/107
import mongoose, { ClientSession, HydratedDocument, Types } from 'mongoose';
import { Conversation } from '../models/Conversation';
import { ConversationParticipant } from '../models/ConversationParticipant';
import {
  ConversationType,
  IConversation,
  IConversationDetails,
  IConversationFeedItem,
  IUserSummary,
} from '../interfaces/conversation.interfaces';
import {
  IConversationParticipant,
  ParticipantPermission,
} from '../interfaces/conversationParticipant.interfaces';
import { User } from '../../user/models/User';
import { Club } from '../../clubs/model/clubModel';

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
    throw new Error('Valid creatorId is required');
  }

  if (!recipientId || !mongoose.isObjectIdOrHexString(recipientId)) {
    throw new Error('Valid recipientId is required');
  }

  if (creatorId.toString() === recipientId.toString()) {
    throw new Error('Cannot start a direct message conversation with yourself');
  }

  // Verify users exist once the user schema is merged to main
  const usersExist = await validateUsersExist([creatorId, recipientId]);
  if (!usersExist) {
    throw new Error('One or more users do not exist');
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
    throw new Error('participantIds must be an array');
  }

  if (!creatorId || !mongoose.isObjectIdOrHexString(creatorId)) {
    throw new Error('Valid creatorId is required');
  }

  for (const id of participantIds) {
    if (!id || !mongoose.isObjectIdOrHexString(id)) {
      throw new Error('Valid participantId is required');
    }
  }

  const allParticipantIds = [creatorId, ...participantIds];
  const uniqueParticipants = deduplicateObjectIds(allParticipantIds);

  if (uniqueParticipants.length < 2) {
    throw new Error('Group conversation requires at least two distinct participants');
  }

  const usersExist = await validateUsersExist(uniqueParticipants);
  if (!usersExist) {
    throw new Error('One or more users do not exist');
  }

  // Fall back to default title when title is omitted or blank whitespace and trim custom titles
  const resolvedTitle =
    typeof title === 'string' && title.trim().length > 0
      ? title.trim()
      : DEFAULT_GROUP_CONVERSATION_TITLE;

  // Wrap both writes in a transaction so if participant creation fails, the conversation is rolled back instead of left orphaned
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

    // Build membership records linking each user to this chat so we can batch insert them in one database call
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
): Promise<IConversationParticipant[]> {
  if (!conversationId || !mongoose.isObjectIdOrHexString(conversationId)) {
    throw new Error('Valid conversationId is required');
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
      throw new Error('Valid requestingUserId is required');
    }
  }

  if (!Array.isArray(userIds)) {
    throw new Error('userIds must be an array');
  }

  for (const id of userIds) {
    if (!id || !mongoose.isObjectIdOrHexString(id)) {
      throw new Error('Valid participantId is required');
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
    throw new Error('Conversation does not exist');
  }

  if (conversation.type === ConversationType.DIRECT) {
    throw new Error('Cannot add participants to a direct conversation');
  }

  const uniqueUserIds = deduplicateObjectIds(userIds);
  if (uniqueUserIds.length === 0) {
    return [];
  }

  const usersExist = await validateUsersExist(uniqueUserIds);
  if (!usersExist) {
    throw new Error('One or more users do not exist');
  }

  const existingQuery = ConversationParticipant.find({
    conversationId,
    userId: { $in: uniqueUserIds },
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

  const created = await ConversationParticipant.create(
    docs,
    activeSession ? { session: activeSession, ordered: true } : { ordered: true }
  );

  // System message hook for when requestingUserId adds users to the conversation

  return created.map((doc) => doc.toObject<IConversationParticipant>());
}

export async function createChannel(
  clubId: Types.ObjectId,
  title: string,
  participantIds: Types.ObjectId[] = [],
  externalSession?: ClientSession
): Promise<IConversation> {
  if (!clubId || !mongoose.isObjectIdOrHexString(clubId)) {
    throw new Error('Valid clubId is required');
  }

  if (typeof title !== 'string' || title.trim().length === 0) {
    throw new Error('Channel title is required');
  }

  if (!Array.isArray(participantIds)) {
    throw new Error('participantIds must be an array');
  }

  const clubExists = await Club.exists({ _id: clubId });
  if (!clubExists) {
    throw new Error('Club does not exist');
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
        throw new Error('A channel with this title already exists in the club', { cause: error });
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
        throw new Error('A channel with this title already exists in the club', { cause: error });
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
      throw new Error('A channel with this title already exists in the club', { cause: error });
    }
    throw error;
  } finally {
    await session.endSession();
  }
}

export async function getConversationById(
  conversationId: Types.ObjectId
): Promise<IConversation | null> {
  if (!conversationId || !mongoose.isObjectIdOrHexString(conversationId)) {
    throw new Error('Valid conversationId is required');
  }

  return Conversation.findById(conversationId).lean<IConversation>().exec();
}

export async function getConversationDocumentById(
  conversationId: Types.ObjectId
): Promise<HydratedDocument<IConversation> | null> {
  if (!conversationId || !mongoose.isObjectIdOrHexString(conversationId)) {
    throw new Error('Valid conversationId is required');
  }

  return Conversation.findById(conversationId).exec();
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
    conversationId,
    userId,
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

  const participants = await ConversationParticipant.aggregate<IUserSummary>([
    {
      $match: {
        conversationId: conversationObjectId,
      },
    },
    {
      $project: {
        _id: 0,
        userId: 1,
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
        _id: '$user._id',
        firstName: '$user.firstName',
        lastName: '$user.lastName',
      },
    },
    {
      $sort: {
        firstName: 1,
        lastName: 1,
      },
    },
  ]);

  let displayName = conversation.title ?? '';
  if (conversation.type === ConversationType.DIRECT) {
    const otherUser = participants.find(
      (p) => p._id.toString() !== requestingUserId.toString()
    )!;
    displayName = `${otherUser.firstName} ${otherUser.lastName}`;
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
    throw new Error('Valid conversationId is required');
  }

  if (!requestingUserId || !mongoose.isObjectIdOrHexString(requestingUserId)) {
    throw new Error('Valid requestingUserId is required');
  }

  if (typeof newTitle !== 'string' || newTitle.trim().length === 0) {
    throw new Error('Valid conversation title is required');
  }

  const isParticipant = await isUserParticipant(conversationId, requestingUserId);
  if (!isParticipant) {
    throw new Error('User is not a participant in this conversation');
  }

  const conversation = await Conversation.findById(conversationId);
  if (!conversation) {
    throw new Error('Conversation not found');
  }

  if (conversation.type === ConversationType.DIRECT) {
    throw new Error('Cannot update title of a direct conversation');
  }

  conversation.title = newTitle.trim();

  try {
    await conversation.save();
    return conversation.toObject<IConversation>();
  } catch (error: any) {
    if (error && error.code === 11000) {
      throw new Error('A channel with this title already exists in the club', { cause: error });
    }
    throw error;
  }
}

export async function removeParticipantFromConversation(
  conversationId: Types.ObjectId,
  requestingUserId: Types.ObjectId,
  targetUserId: Types.ObjectId
): Promise<boolean> {
  if (!conversationId || !mongoose.isObjectIdOrHexString(conversationId)) {
    throw new Error('Valid conversationId is required');
  }

  if (!requestingUserId || !mongoose.isObjectIdOrHexString(requestingUserId)) {
    throw new Error('Valid requestingUserId is required');
  }

  if (!targetUserId || !mongoose.isObjectIdOrHexString(targetUserId)) {
    throw new Error('Valid targetUserId is required');
  }

  const conversation = await Conversation.findById(conversationId)
    .select('type')
    .lean();
  if (!conversation) {
    throw new Error('Conversation not found');
  }

  if (conversation.type === ConversationType.DIRECT) {
    throw new Error('Cannot remove participants from a direct conversation');
  }

  const requesterParticipant = await ConversationParticipant.findOne({
    conversationId,
    userId: requestingUserId,
  })
    .select('permission')
    .lean();

  if (!requesterParticipant) {
    throw new Error('User is not a participant in this conversation');
  }

  const isSelf = requestingUserId.toString() === targetUserId.toString();
  if (!isSelf && requesterParticipant.permission !== ParticipantPermission.MODERATE) {
    throw new Error('Only moderators can remove other participants');
  }

  const isTargetParticipant = await isUserParticipant(conversationId, targetUserId);
  if (!isTargetParticipant) {
    throw new Error('Target user is not a participant in this conversation');
  }

  await ConversationParticipant.deleteOne({
    conversationId,
    userId: targetUserId,
  }).exec();

  return true;
}

export async function leaveConversation(
  conversationId: Types.ObjectId,
  userId: Types.ObjectId
): Promise<boolean> {
  if (!conversationId || !mongoose.isObjectIdOrHexString(conversationId)) {
    throw new Error('Valid conversationId is required');
  }

  if (!userId || !mongoose.isObjectIdOrHexString(userId)) {
    throw new Error('Valid userId is required');
  }

  return removeParticipantFromConversation(conversationId, userId, userId);
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


