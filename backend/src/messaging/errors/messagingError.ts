export enum MessagingErrorCode {
  INVALID_INPUT = 'ERR_INVALID_INPUT',
  USER_NOT_FOUND = 'ERR_USER_NOT_FOUND',
  CONVERSATION_NOT_FOUND = 'ERR_CONVERSATION_NOT_FOUND',
  NOT_PARTICIPANT = 'ERR_NOT_PARTICIPANT',
  PERMISSION_DENIED = 'ERR_PERMISSION_DENIED',
  OFFICER_PERMISSION_REQUIRED = 'ERR_OFFICER_PERMISSION_REQUIRED',
}

export class MessagingError extends Error {
  constructor(public readonly code: MessagingErrorCode, message: string) {
    super(message);
    this.name = 'MessagingError';
  }
}
