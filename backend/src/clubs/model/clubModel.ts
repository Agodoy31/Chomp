import { InferSchemaType, Schema, model } from 'mongoose';
import { CLUB_CATEGORIES, CLUB_STATUSES } from '../interfaces/clubs.interface';
const meetingSchema = new Schema(
  {
    day: { type: String, trim: true },
    time: { type: String, trim: true },
    location: { type: String, trim: true },
  },
  { _id: false }
);

const clubSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    description: { type: String, required: true, trim: true, maxlength: 1000},
    category: { 
      type: String, 
      enum: CLUB_CATEGORIES,
      default: 'OTHER',
      required: true,
    },
    meeting: { type: meetingSchema },
    proposerId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    status: {
      type: String,
      enum: CLUB_STATUSES,
      default: 'PENDING',
      required: true,
    },
  },
  { timestamps: true }
);

// One approved club per name, compared without regard to letter case.
clubSchema.index(
  { name: 1 },
  {
    unique: true,
    partialFilterExpression: { status: 'APPROVED' },
    collation: { locale: 'en', strength: 2 },
  }
);
clubSchema.index({ status: 1, category: 1 });

export type Club = InferSchemaType<typeof clubSchema>;
export const Club = model('Club', clubSchema);
