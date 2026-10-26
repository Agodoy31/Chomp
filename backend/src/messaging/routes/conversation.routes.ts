import { Router } from 'express';
import { postMessageHandler } from '../controllers/message.controller';

const router = Router();

router.post('/:id/messages', postMessageHandler);

export default router;
