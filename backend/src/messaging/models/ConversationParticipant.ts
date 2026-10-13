// See Issue #68: https://github.com/Agodoy31/Chomp/issues/68
import { Schema, model } from 'mongoose';
import { IConversationParticipantDocument } from '../interfaces/conversationParticipant.interfaces';

export type { IConversationParticipantDocument } from '../interfaces/conversationParticipant.interfaces';

const conversationParticipantSchema = new Schema<IConversationParticipantDocument>(
  {
    conversationId: {
      type: Schema.Types.ObjectId,
      ref: 'Conversation',
      required: [true, 'conversationId is required'],
    },
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'userId is required'],
    },
  },
  {
    timestamps: true,
  }
);

// Compound unique index prevents duplicate chat memberships for a user
conversationParticipantSchema.index({ userId: 1, conversationId: 1 }, { unique: true });

// Index supports looking up all participants within a conversation
conversationParticipantSchema.index({ conversationId: 1 });

export const ConversationParticipant = model<IConversationParticipantDocument>(
  'ConversationParticipant',
  conversationParticipantSchema,
  'conversation_participants'
);
