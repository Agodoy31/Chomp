import { Router } from 'express';
import { requireAuth } from '../user/utils/requireAuth';
import { approveClub, getClubs, getPendingClubs, rejectClub, requestClub } from './controllers/clubController';
import { getMyClubs, joinClub } from './controllers/membershipController';

const clubRoutes = Router();

clubRoutes.get('/', getClubs);
clubRoutes.post('/', requireAuth, requestClub);
clubRoutes.get('/me', requireAuth, getMyClubs);
clubRoutes.get('/pending', requireAuth, getPendingClubs);
clubRoutes.post('/:clubId/approve', requireAuth, approveClub);
clubRoutes.post('/:clubId/reject', requireAuth, rejectClub);
clubRoutes.post('/:clubId/join', requireAuth, joinClub);

export default clubRoutes;
