// See Issue #51: https://github.com/Agodoy31/Chomp/issues/51
import { Schema, model } from 'mongoose';
import {
  ConversationType,
  IConversationDocument,
} from '../interfaces/conversation.interfaces';

export { ConversationType } from '../interfaces/conversation.interfaces';
export type { IConversationDocument } from '../interfaces/conversation.interfaces';

const conversationSchema = new Schema<IConversationDocument>(
  {
    type: {
      type: String,
      required: [true, 'type is required'],
      enum: {
        values: Object.values(ConversationType),
        message: '{VALUE} is not a valid conversation type',
      },
    },
    dmPairKey: {
      type: String,
      trim: true,
      default: undefined,
    },
    title: {
      type: String,
      trim: true,
      default: undefined,
    },
    clubId: {
      type: Schema.Types.ObjectId,
      ref: 'Club',
      default: undefined,
    },
  },
  {
    timestamps: true,
  }
);

// Mongoose skips field validators when optional fields are omitted.
// Validate cross-field requirements and mutual exclusivity here before persistence.
conversationSchema.pre('validate', function (next) {
  if (this.type === ConversationType.DIRECT) {
    if (!this.dmPairKey || this.dmPairKey.trim().length === 0) {
      this.invalidate('dmPairKey', 'dmPairKey is required for DIRECT conversations');
    }
    if (this.title !== undefined && this.title !== null) {
      this.invalidate('title', 'title is rejected for DIRECT conversations');
    }
    if (this.clubId !== undefined && this.clubId !== null) {
      this.invalidate('clubId', 'clubId is rejected for DIRECT conversations');
    }
  } else if (this.type === ConversationType.GROUP) {
    if (this.dmPairKey !== undefined && this.dmPairKey !== null) {
      this.invalidate('dmPairKey', 'dmPairKey is rejected for GROUP conversations');
    }
    if (this.clubId !== undefined && this.clubId !== null) {
      this.invalidate('clubId', 'clubId is rejected for GROUP conversations');
    }
  } else if (this.type === ConversationType.CHANNEL) {
    if (this.dmPairKey !== undefined && this.dmPairKey !== null) {
      this.invalidate('dmPairKey', 'dmPairKey is rejected for CHANNEL conversations');
    }
    if (!this.title || this.title.trim().length === 0) {
      this.invalidate('title', 'title is required for CHANNEL conversations');
    }
    if (!this.clubId) {
      this.invalidate('clubId', 'clubId is required for CHANNEL conversations');
    }
  }
  next();
});

// Reject duplicate direct chats if both users initiate simultaneously
conversationSchema.index(
  { dmPairKey: 1 },
  {
    unique: true,
    partialFilterExpression: { type: 'DIRECT' },
  }
);

// Prevent duplicate channel names within the same club, case-insensitive
conversationSchema.index(
  { clubId: 1, title: 1 },
  {
    unique: true,
    partialFilterExpression: { type: 'CHANNEL' },
    collation: { locale: 'en', strength: 2 },
  }
);

export const Conversation = model<IConversationDocument>(
  'Conversation',
  conversationSchema,
  'conversations'
);
