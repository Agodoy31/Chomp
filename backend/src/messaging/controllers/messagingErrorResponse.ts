import { Response } from 'express';
import { MessagingError, MessagingErrorCode } from '../errors/messagingError';

export function sendMessagingError(res: Response, error: unknown): void {
  if (error instanceof MessagingError) {
    switch (error.code) {
      case MessagingErrorCode.INVALID_INPUT:
        res.status(400).json({ code: error.code, message: error.message });
        return;
      case MessagingErrorCode.USER_NOT_FOUND:
      case MessagingErrorCode.CONVERSATION_NOT_FOUND:
        res.status(404).json({ code: error.code, message: error.message });
        return;
      case MessagingErrorCode.NOT_PARTICIPANT:
      case MessagingErrorCode.PERMISSION_DENIED:
        res.status(403).json({ code: error.code, message: error.message });
        return;
      case MessagingErrorCode.OFFICER_PERMISSION_REQUIRED:
        res.status(403).json({
          code: error.code,
          message: 'Only active club officers can post announcements',
        });
        return;
    }
  }

  res.status(500).json({
    code: 'ERR_SERVER_ERROR',
    message: 'An unexpected error occurred',
  });
}
