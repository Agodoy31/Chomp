import { z } from 'zod';

const UUID_V7_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const postMessageBodySchema = z.object({
  text: z
    .string({ message: 'Message text cannot be empty' })
    .trim()
    .min(1, 'Message text cannot be empty')
    .max(2000, 'Message text exceeds 2000 characters'),
  clientId: z.string().regex(UUID_V7_REGEX, 'Client ID must be a valid UUIDv7').optional(),
  isAnnouncement: z.boolean({ message: 'isAnnouncement must be a boolean' }).default(false),
});

export type PostMessageBodyInput = z.infer<typeof postMessageBodySchema>;

export const messageHistoryQuerySchema = z.object({
  limit: z
    .string()
    .optional()
    .refine(
      (val) => {
        if (val === undefined) {
          return true;
        }
        const num = Number(val);
        return Number.isInteger(num) && num >= 1 && num <= 100 && String(num) === val.trim();
      },
      {
        message: 'limit must be an integer between 1 and 100',
      }
    )
    .transform((val) => (val === undefined ? 50 : parseInt(val, 10))),
});

export type MessageHistoryQueryInput = z.infer<typeof messageHistoryQuerySchema>;
