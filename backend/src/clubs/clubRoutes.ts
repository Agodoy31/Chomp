import { Router } from 'express';
import { requireAuth } from '../user/utils/requireAuth';
import { approveClub, getClubs, requestClub } from './controllers/clubController';
import { joinClub } from './controllers/membershipController';

const clubRoutes = Router();

clubRoutes.get('/', getClubs);
clubRoutes.post('/', requireAuth, requestClub);
clubRoutes.post('/:clubId/approve', requireAuth, approveClub);
clubRoutes.post('/:clubId/join', requireAuth, joinClub);

export default clubRoutes;
