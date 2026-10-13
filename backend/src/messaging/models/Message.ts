// See Issue #50: https://github.com/Agodoy31/Chomp/issues/50
import { Schema, model } from 'mongoose';
import { IMessageDocument } from '../interfaces/message.interfaces';

export type { IMessageDocument } from '../interfaces/message.interfaces';

const messageSchema = new Schema<IMessageDocument>(
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

// Compound index supports efficient descending message history pagination
messageSchema.index({ conversationId: 1, createdAt: -1 });

export const Message = model<IMessageDocument>(
  'Message',
  messageSchema,
  'messages'
);
