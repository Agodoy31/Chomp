import { InferSchemaType, Schema, model } from 'mongoose';

const membershipSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    clubId: { type: Schema.Types.ObjectId, ref: 'Club', required: true },
    role: {
      type: String,
      enum: ['MEMBER', 'OFFICER'] as const,
      default: 'MEMBER',
      required: true,
    },
    status: {
      type: String,
      enum: ['ACTIVE', 'PENDING', 'INACTIVE', 'REMOVED', 'REJECTED'] as const,
      default: 'ACTIVE',
      required: true,
    },
  },
  { timestamps: true }
);

membershipSchema.index({ userId: 1, clubId: 1 }, { unique: true });
membershipSchema.index({ clubId: 1, status: 1 });

export type Membership = InferSchemaType<typeof membershipSchema>;
export const Membership = model('Membership', membershipSchema);
