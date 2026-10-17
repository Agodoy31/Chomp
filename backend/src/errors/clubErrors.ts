import { CustomError } from './customError';

export class AuthenticationRequiredError extends CustomError {
  constructor(message = 'Authentication required') {
    super(message, 401, 'ERR_AUTHENTICATION_REQUIRED');
  }
}

export class ClubNotFoundError extends CustomError {
  constructor(message = 'Club not found') {
    super(message, 404, 'ERR_CLUB_NOT_FOUND');
  }
}

export class ClubNotApprovedError extends CustomError {
  constructor(message = 'Club is not approved') {
    super(message, 403, 'ERR_CLUB_NOT_APPROVED');
  }
}

export class MemberRemovedError extends CustomError {
  constructor(message = 'Removed members cannot rejoin this club') {
    super(message, 403, 'ERR_MEMBER_REMOVED');
  }
}

export class AlreadyMemberError extends CustomError {
  constructor(message = 'Already an active member of this club') {
    super(message, 409, 'ERR_ALREADY_MEMBER');
  }
}
