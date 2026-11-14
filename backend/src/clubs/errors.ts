import { Response } from 'express';
import { type ClientError } from './interfaces/clubs.interface';
//general errors
export function sendError(res: Response, error: ClientError): void {
    res.status(error.status).json({ code: error.code, message: error.message });
}
export function isDuplicateKey(error: unknown): boolean {
    return typeof error === 'object' && error !== null && 'code' in error && error.code === 11000;
}
export function adminRequired(): ClientError {
    return { status: 403, code: 'ERR_ADMIN_REQUIRED', message: 'Admin access required' };
}
export function officerRequired(): ClientError {
    return { status: 403, code: 'ERR_OFFICER_REQUIRED', message: 'Club officer access required' };
}
export function memberRequired(): ClientError {
    return { status: 403, code: 'ERR_MEMBER_REQUIRED', message: 'Club membership required' };
}
//club errors
export function clubNotFound(): ClientError {
    return { status: 404, code: 'ERR_CLUB_NOT_FOUND', message: 'Club not found' };
}
export function invalidCategory(): ClientError {
    return { status: 400, code: 'ERR_INVALID_CATEGORY', message: 'Invalid Category' };
}
export function invalidClubRequest(message: string): ClientError {
    return { status: 400, code: 'ERR_INVALID_CLUB_REQUEST', message };
}
export function clubNameExists(): ClientError {
    return { status: 409, code: 'ERR_CLUB_NAME_EXISTS', message: 'An approved club already uses this name' };
}
export function clubNotPending(action: 'approved' | 'rejected'): ClientError {
    return { status: 409, code: 'ERR_CLUB_NOT_PENDING', message: `Only pending club requests can be ${action}` };
}
export function clubPendingApproval(): ClientError {
    return { status: 403, code: 'ERR_CLUB_NOT_APPROVED', message: 'This club is pending approval and cannot be joined yet' };
}
export function clubRejected(): ClientError {
    return { status: 403, code: 'ERR_CLUB_NOT_APPROVED', message: 'This club was rejected and cannot be joined' };
}
//membership errors
export function memberNotFound(): ClientError {
    return { status: 404, code: 'ERR_MEMBER_NOT_FOUND', message: 'Active member not found in this club' };
}
export function notActiveMember(): ClientError {
    return { status: 409, code: 'ERR_NOT_MEMBER', message: 'Not an active member of this club' };
}
export function alreadyMember(): ClientError {
    return { status: 409, code: 'ERR_ALREADY_MEMBER', message: 'Already an active member of this club' };
}
export function memberRemoved(): ClientError {
    return { status: 403, code: 'ERR_MEMBER_REMOVED', message: 'Removed members cannot rejoin this club' };
}
export function membershipPending(): ClientError {
    return { status: 409, code: 'ERR_MEMBERSHIP_PENDING', message: 'A request to join this club is already pending' };
}
export function membershipRejected(): ClientError {
    return { status: 403, code: 'ERR_MEMBERSHIP_REJECTED', message: 'Rejected members cannot rejoin this club' };
}
export function lastOfficer(): ClientError {
    return { status: 409, code: 'ERR_LAST_OFFICER', message: 'A club must keep at least one active officer' };
}
export function invalidRole(): ClientError {
    return { status: 400, code: 'ERR_INVALID_ROLE', message: 'Role must be MEMBER or OFFICER' };
}
export function cannotRemoveSelf(): ClientError {
    return { status: 400, code: 'ERR_CANNOT_REMOVE_SELF', message: 'Use leave to exit a club instead of removing yourself' };
}
