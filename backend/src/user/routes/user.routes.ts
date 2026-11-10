import { Router } from 'express';
import { requireAuth } from '../utils/requireAuth';
import { getUserProfile, updateBio } from '../controllers/user.controller';

const userRouter = Router();

userRouter.use(requireAuth);
userRouter.patch('/me', updateBio);
userRouter.get('/:userId', getUserProfile);

export default userRouter;
