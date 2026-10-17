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
