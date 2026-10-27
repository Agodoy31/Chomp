import { Router } from 'express';
import {
  getMessageHistoryHandler,
  postMessageHandler,
} from '../controllers/message.controller';
import {
  getConversationDetailsHandler,
  getUserConversationsHandler,
  postConversationHandler,
} from '../controllers/conversation.controller';

const router = Router();

router.get('/', getUserConversationsHandler);
router.post('/', postConversationHandler);
router.get('/:id', getConversationDetailsHandler);
router.post('/:id/messages', postMessageHandler);
router.get('/:id/messages', getMessageHistoryHandler);

export default router;

