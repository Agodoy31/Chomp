import { z } from 'zod';

const UUID_V7_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const postMessageBodySchema = z.object({
  text: z.string({ message: 'ERR_TEXT_EMPTY' }).trim().min(1, 'ERR_TEXT_EMPTY').max(2000, 'ERR_VALIDATION_FAILED'),
  clientId: z.string().regex(UUID_V7_REGEX, 'ERR_CLIENT_ID_INVALID').optional(),
  isAnnouncement: z.boolean().default(false),
});

export type PostMessageBodyInput = z.infer<typeof postMessageBodySchema>;
