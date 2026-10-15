// See Issue #98: https://github.com/Agodoy31/Chomp/issues/98
import mongoose, { Types } from 'mongoose';
import { Conversation, IConversationDocument } from '../models/Conversation';
import { ConversationParticipant } from '../models/ConversationParticipant';
import { ConversationType } from '../interfaces/conversation.interfaces';
import {
  IConversation,
  CreateDirectConversationResult,
} from '../interfaces/conversation.service.interfaces';

export async function createDirectConversation(
  creatorId: Types.ObjectId,
  recipientId: Types.ObjectId
): Promise<CreateDirectConversationResult> {
  if (!creatorId || !Types.ObjectId.isValid(creatorId)) {
    throw new Error('Valid creatorId is required');
  }

  if (!recipientId || !Types.ObjectId.isValid(recipientId)) {
    throw new Error('Valid recipientId is required');
  }

  if (creatorId.toString() === recipientId.toString()) {
    throw new Error('Cannot start a direct message conversation with yourself');
  }

  // Verify users exist once user service is available
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

export async function getConversationById(
  conversationId: Types.ObjectId
): Promise<IConversation | null> {
  if (!conversationId || !Types.ObjectId.isValid(conversationId)) {
    throw new Error('Valid conversationId is required');
  }

  return Conversation.findById(conversationId).lean<IConversation>().exec();
}

export async function getConversationDocumentById(
  conversationId: Types.ObjectId
): Promise<IConversationDocument | null> {
  if (!conversationId || !Types.ObjectId.isValid(conversationId)) {
    throw new Error('Valid conversationId is required');
  }

  return Conversation.findById(conversationId).exec();
}

// Stub for user existence validation. Ideally this should be a service of the users subsystem once implemented
export async function validateUsersExist(
  userIds: Types.ObjectId | Types.ObjectId[]
): Promise<boolean> {
  const ids = Array.isArray(userIds) ? userIds : [userIds];
  if (ids.length === 0) {
    return false;
  }

  for (const id of ids) {
    if (!id || !Types.ObjectId.isValid(id)) {
      return false;
    }
  }

  return true;
}

