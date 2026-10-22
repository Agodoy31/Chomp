// See Issue #68: https://github.com/Agodoy31/Chomp/issues/68
import { Types } from 'mongoose';

export enum ParticipantPermission {
  READ = 'READ',
  WRITE = 'WRITE',
  MODERATE = 'MODERATE',
}

export interface IConversationParticipant {
  _id: Types.ObjectId;
  conversationId: Types.ObjectId;
  userId: Types.ObjectId;
  permission: ParticipantPermission;
  createdAt: Date;
  updatedAt: Date;
}
