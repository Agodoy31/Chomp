import { Types } from 'mongoose';

export interface IMessage {
  _id: Types.ObjectId;
  conversationId: Types.ObjectId;
  senderId: Types.ObjectId;
  clientId?: string;
  text: string;
  isAnnouncement: boolean;
  isSystem: boolean;
  removedAt?: Date;
  removedBy?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}
