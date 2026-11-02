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