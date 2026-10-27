import { Router } from 'express';
import { postMessageHandler } from '../controllers/message.controller';
import { postConversationHandler } from '../controllers/conversation.controller';

const router = Router();

router.post('/', postConversationHandler);
router.post('/:id/messages', postMessageHandler);

export default router;
