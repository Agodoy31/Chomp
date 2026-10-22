// See Issue #68: https://github.com/Agodoy31/Chomp/issues/68
import { Schema, model } from 'mongoose';
import {
  IConversationParticipant,
  ParticipantPermission,
} from '../interfaces/conversationParticipant.interfaces';

export type { IConversationParticipant } from '../interfaces/conversationParticipant.interfaces';
export { ParticipantPermission } from '../interfaces/conversationParticipant.interfaces';

const conversationParticipantSchema = new Schema<IConversationParticipant>(
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
    permission: {
      type: String,
      enum: Object.values(ParticipantPermission),
      required: [true, 'permission is required'],
      default: ParticipantPermission.WRITE,
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

export const ConversationParticipant = model<IConversationParticipant>(
  'ConversationParticipant',
  conversationParticipantSchema,
  'conversation_participants'
);
