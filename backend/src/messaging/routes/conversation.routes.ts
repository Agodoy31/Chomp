import { Router } from 'express';
import {
  deleteMessageHandler,
  getMessageHistoryHandler,
  postMessageHandler,
} from '../controllers/message.controller';
import {
  getConversationDetailsHandler,
  getUserConversationsHandler,
  postConversationHandler,
  updateConversationTitleHandler,
} from '../controllers/conversation.controller';

const router = Router();

router.get('/', getUserConversationsHandler);
router.post('/', postConversationHandler);
router.get('/:id', getConversationDetailsHandler);
router.patch('/:id', updateConversationTitleHandler);
router.post('/:id/messages', postMessageHandler);
router.get('/:id/messages', getMessageHistoryHandler);
router.delete('/:id/messages/:messageId', deleteMessageHandler);

export default router;

