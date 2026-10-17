// See Issue #68: https://github.com/Agodoy31/Chomp/issues/68
import { Types } from 'mongoose';

export interface IConversationParticipant {
  _id: Types.ObjectId;
  conversationId: Types.ObjectId;
  userId: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}
