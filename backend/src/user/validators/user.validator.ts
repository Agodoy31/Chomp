import { z } from 'zod';

export const updateBioSchema = z.object({
  bio: z.string().trim().max(500),
});

export type UpdateBioInput = z.infer<typeof updateBioSchema>;
