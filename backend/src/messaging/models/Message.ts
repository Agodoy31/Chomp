import { Schema, model } from 'mongoose';
import { IMessage } from '../interfaces/message.interfaces';

export type { IMessage } from '../interfaces/message.interfaces';

const messageSchema = new Schema<IMessage>(
  {
    conversationId: {
      type: Schema.Types.ObjectId,
      ref: 'Conversation',
      required: [true, 'conversationId is required'],
    },
    senderId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'senderId is required'],
    },
    clientId: {
      type: String,
      default: undefined,
    },
    text: {
      type: String,
      required: [true, 'text is required'],
      trim: true,
      validate: {
        validator: function (value: string): boolean {
          if (!value || value.trim().length === 0) {
            return false;
          }
          return true;
        },
        message: 'text cannot be empty',
      },
    },
    isAnnouncement: {
      type: Boolean,
      required: true,
      default: false,
    },
    isSystem: {
      type: Boolean,
      required: true,
      default: false,
    },
    removedAt: {
      type: Date,
      default: undefined,
    },
    removedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      default: undefined,
    },
  },
  {
    timestamps: true,
  }
);

messageSchema.index({ conversationId: 1, createdAt: -1, _id: -1 });

// UUIDv7 embeds a millisecond timestamp in the top bits, so tokens from different milliseconds never match.
// If two users send at the exact same millisecond, the remaining 74 random bits prevent collisions.
// This index safely catches retry attempts from the same client without cross sender collisions.
messageSchema.index(
  { conversationId: 1, clientId: 1 },
  {
    unique: true,
    partialFilterExpression: { clientId: { $type: 'string' } },
  }
);

export const Message = model<IMessage>(
  'Message',
  messageSchema,
  'messages'
);
