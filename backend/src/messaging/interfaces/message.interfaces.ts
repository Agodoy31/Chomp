import { Types } from 'mongoose';
import type { IUserSummary } from './conversation.interfaces';

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

export interface IHydratedMessage extends Omit<IMessage, 'senderId'> {
  sender: IUserSummary;
}
