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
export function clubNotFound(): ClientError {
    return { status: 404, code: 'ERR_CLUB_NOT_FOUND', message: 'Club not found' };
}
export function notActiveMember(): ClientError {
    return { status: 409, code: 'ERR_NOT_MEMBER', message: 'Not an active member of this club' };
}
export function lastOfficer(): ClientError {
    return { status: 409, code: 'ERR_LAST_OFFICER', message: 'A club must keep at least one active officer' };
}
