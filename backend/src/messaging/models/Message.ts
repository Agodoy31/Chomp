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
