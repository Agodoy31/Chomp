import { Router } from 'express';
import { requireAuth } from '../user/utils/requireAuth';
import {
  approveClub,
  getClub,
  getClubs,
  getPendingClubs,
  rejectClub,
  requestClub,
  updateClub,
} from './controllers/clubController';
import { getClubMembers, getMyClubs, joinClub, leaveClub } from './controllers/membershipController';

const clubRoutes = Router();

clubRoutes.get('/', getClubs);
clubRoutes.post('/', requireAuth, requestClub);
clubRoutes.get('/me', requireAuth, getMyClubs);
clubRoutes.get('/pending', requireAuth, getPendingClubs);
clubRoutes.get('/:clubId', getClub);
clubRoutes.patch('/:clubId', requireAuth, updateClub);
clubRoutes.post('/:clubId/approve', requireAuth, approveClub);
clubRoutes.post('/:clubId/reject', requireAuth, rejectClub);
clubRoutes.post('/:clubId/join', requireAuth, joinClub);
clubRoutes.post('/:clubId/leave', requireAuth, leaveClub);
clubRoutes.get('/:clubId/members', requireAuth, getClubMembers);

export default clubRoutes;
