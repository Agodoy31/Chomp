// See Issue #51: https://github.com/Agodoy31/Chomp/issues/51
import { Types } from 'mongoose';

export enum ConversationType {
  DIRECT = 'DIRECT',
  GROUP = 'GROUP',
  CHANNEL = 'CHANNEL',
}

export interface IConversation {
  _id: Types.ObjectId;
  type: ConversationType;
  dmPairKey?: string;
  title?: string;
  clubId?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

export interface IUserSummary {
  _id: Types.ObjectId;
  firstName: string;
  lastName: string;
}

export interface IConversationDetails {
  _id: Types.ObjectId;
  type: ConversationType;
  title?: string;
  clubId?: Types.ObjectId;
  displayName: string;
  participants: IUserSummary[];
}

export interface IConversationFeedItem {
  _id: Types.ObjectId;
  type: ConversationType;
  title?: string;
  clubId?: Types.ObjectId;
  displayName: string;
  lastActivityAt: Date;
  lastMessage?: {
    text: string;
    senderName: string;
    createdAt?: Date;
  };
}

