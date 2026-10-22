// See Issue #50: https://github.com/Agodoy31/Chomp/issues/50
import { Types } from 'mongoose';

export interface IMessage {
  _id: Types.ObjectId;
  conversationId: Types.ObjectId;
  senderId: Types.ObjectId;
  text: string;
  isAnnouncement: boolean;
  isSystem: boolean;
  removedAt?: Date;
  removedBy?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}
