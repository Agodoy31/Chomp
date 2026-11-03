import { Router } from 'express';
import { requireAuth } from '../user/utils/requireAuth';
import {
  approveClub,
  getClub,
  getClubs,
  getPendingClubs,
  rejectClub,
  requestClub,
} from './controllers/clubController';
import { getMyClubs, joinClub, leaveClub } from './controllers/membershipController';

const clubRoutes = Router();

clubRoutes.get('/', getClubs);
clubRoutes.post('/', requireAuth, requestClub);
clubRoutes.get('/me', requireAuth, getMyClubs);
clubRoutes.get('/pending', requireAuth, getPendingClubs);
clubRoutes.get('/:clubId', getClub);
clubRoutes.post('/:clubId/approve', requireAuth, approveClub);
clubRoutes.post('/:clubId/reject', requireAuth, rejectClub);
clubRoutes.post('/:clubId/join', requireAuth, joinClub);
clubRoutes.post('/:clubId/leave', requireAuth, leaveClub);

export default clubRoutes;
