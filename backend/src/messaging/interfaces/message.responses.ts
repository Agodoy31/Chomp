export interface IUserSummaryResponse {
  _id: string;
  firstName: string;
  lastName: string;
}

export interface IMessageResponse {
  _id: string;
  conversationId: string;
  sender: IUserSummaryResponse;
  text: string;
  clientId?: string;
  isAnnouncement: boolean;
  isSystem: boolean;
  createdAt: string;
  removedAt?: string;
}
