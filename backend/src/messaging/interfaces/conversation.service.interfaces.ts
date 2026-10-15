// See Issue #98: https://github.com/Agodoy31/Chomp/issues/98
import { Types } from 'mongoose';
import { ConversationType } from './conversation.interfaces';

export interface IConversation {
  _id: Types.ObjectId;
  type: ConversationType;
  dmPairKey?: string;
  title?: string;
  clubId?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateDirectConversationResult {
  conversation: IConversation;
  isNew: boolean;
}
