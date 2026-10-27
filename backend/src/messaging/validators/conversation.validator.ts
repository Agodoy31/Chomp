import { z } from 'zod';

export const createConversationBodySchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('DIRECT'),
    recipientId: z.string().min(1),
  }),
  z.object({
    type: z.literal('GROUP'),
    title: z.string().trim().min(1).max(100),
    participantIds: z.array(z.string()).min(1),
  }),
]);

export type CreateConversationBodyInput = z.infer<typeof createConversationBodySchema>;
