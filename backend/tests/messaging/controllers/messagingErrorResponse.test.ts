import { describe, it, expect, jest } from '@jest/globals';
import { Response } from 'express';
import { MessagingError, MessagingErrorCode } from '../../../src/messaging/errors/messagingError';
import { sendMessagingError } from '../../../src/messaging/controllers/messagingErrorResponse';

function createMockResponse() {
  const res: Partial<Response> = {};
  res.status = jest.fn().mockReturnValue(res) as unknown as Response['status'];
  res.json = jest.fn().mockReturnValue(res) as unknown as Response['json'];
  return res as Response & { status: jest.Mock; json: jest.Mock };
}

describe('sendMessagingError helper', () => {
  it('translates INVALID_INPUT to 400 with code and message', () => {
    const res = createMockResponse();
    const error = new MessagingError(MessagingErrorCode.INVALID_INPUT, 'Valid identifier is required');

    sendMessagingError(res, error);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      code: 'ERR_INVALID_INPUT',
      message: 'Valid identifier is required',
    });
  });

  it('translates USER_NOT_FOUND and CONVERSATION_NOT_FOUND to 404', () => {
    const resUser = createMockResponse();
    sendMessagingError(resUser, new MessagingError(MessagingErrorCode.USER_NOT_FOUND, 'One or more users do not exist'));
    expect(resUser.status).toHaveBeenCalledWith(404);
    expect(resUser.json).toHaveBeenCalledWith({
      code: 'ERR_USER_NOT_FOUND',
      message: 'One or more users do not exist',
    });

    const resConv = createMockResponse();
    sendMessagingError(resConv, new MessagingError(MessagingErrorCode.CONVERSATION_NOT_FOUND, 'Conversation not found'));
    expect(resConv.status).toHaveBeenCalledWith(404);
    expect(resConv.json).toHaveBeenCalledWith({
      code: 'ERR_CONVERSATION_NOT_FOUND',
      message: 'Conversation not found',
    });
  });

  it('translates NOT_PARTICIPANT and OFFICER_PERMISSION_REQUIRED to 403', () => {
    const resPart = createMockResponse();
    sendMessagingError(resPart, new MessagingError(MessagingErrorCode.NOT_PARTICIPANT, 'User is not a participant in this conversation'));
    expect(resPart.status).toHaveBeenCalledWith(403);
    expect(resPart.json).toHaveBeenCalledWith({
      code: 'ERR_NOT_PARTICIPANT',
      message: 'User is not a participant in this conversation',
    });

    const resOfficer = createMockResponse();
    sendMessagingError(resOfficer, new MessagingError(MessagingErrorCode.OFFICER_PERMISSION_REQUIRED, 'Custom officer text'));
    expect(resOfficer.status).toHaveBeenCalledWith(403);
    expect(resOfficer.json).toHaveBeenCalledWith({
      code: 'ERR_OFFICER_PERMISSION_REQUIRED',
      message: 'Only active club officers can post announcements',
    });
  });

  it('translates unexpected errors to 500 without leaking internal messages', () => {
    const res = createMockResponse();
    sendMessagingError(res, new Error('Database disk connection timed out'));

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({
      code: 'ERR_SERVER_ERROR',
      message: 'An unexpected error occurred',
    });
  });
});
