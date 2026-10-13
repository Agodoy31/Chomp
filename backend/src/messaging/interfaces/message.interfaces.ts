// See Issue #50: https://github.com/Agodoy31/Chomp/issues/50
import { Document, Types } from 'mongoose';

export interface IMessageDocument extends Document {
  _id: Types.ObjectId;
  conversationId: Types.ObjectId;
  senderId: Types.ObjectId;
  text: string;
  isAnnouncement: boolean;
  removedAt?: Date;
  removedBy?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}
