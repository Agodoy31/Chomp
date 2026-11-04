import mongoose from 'mongoose';
import { z } from 'zod';
import { ParticipantPermission } from '../interfaces/conversationParticipant.interfaces';

export const CONVERSATION_TITLE_REGEX = /^[a-zA-Z0-9 ._\-+&/'!?:,#]+$/;

export const createConversationBodySchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('DIRECT'),
    recipientId: z.string().min(1),
  }),
  z.object({
    type: z.literal('GROUP'),
    title: z
      .string()
      .trim()
      .min(1)
      .max(100)
      .regex(CONVERSATION_TITLE_REGEX, 'Title contains invalid characters or newlines'),
    participantIds: z.array(z.string()).min(1),
  }),
]);

export type CreateConversationBodyInput = z.infer<typeof createConversationBodySchema>;

export const addParticipantsBodySchema = z.object({
  userIds: z
    .array(
      z.string().refine((val) => mongoose.isObjectIdOrHexString(val), {
        message: 'Valid userIds are required',
      })
    )
    .min(1, 'At least one userId is required'),
});

export type AddParticipantsBodyInput = z.infer<typeof addParticipantsBodySchema>;

export const updateParticipantPermissionBodySchema = z.object({
  permission: z.nativeEnum(ParticipantPermission, {
    message: 'Invalid permission value',
  }),
});

export type UpdateParticipantPermissionBodyInput = z.infer<
  typeof updateParticipantPermissionBodySchema
>;

export const updateConversationTitleBodySchema = z.object({
  title: z
    .string()
    .trim()
    .min(1, 'Valid conversation title is required')
    .max(100, 'Title cannot exceed 100 characters')
    .regex(CONVERSATION_TITLE_REGEX, 'Title contains invalid characters or newlines'),
});

export type UpdateConversationTitleBodyInput = z.infer<
  typeof updateConversationTitleBodySchema
>;
