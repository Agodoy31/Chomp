import { Router } from 'express';
import {
  getMessageHistoryHandler,
  postMessageHandler,
} from '../controllers/message.controller';
import { postConversationHandler } from '../controllers/conversation.controller';

const router = Router();

router.post('/', postConversationHandler);
router.post('/:id/messages', postMessageHandler);
router.get('/:id/messages', getMessageHistoryHandler);

export default router;

