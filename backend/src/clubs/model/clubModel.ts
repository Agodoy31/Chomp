import { InferSchemaType, Schema, model } from 'mongoose';
import { CLUB_CATEGORIES, CLUB_STATUSES } from '../interfaces/clubs.interface';
const meetingSchema = new Schema(
  {
    day: { type: String, trim: true, maxlength: 15 },
    time: { type: String, trim: true, maxlength: 8 },
    location: { type: String, trim: true, maxlength: 120 },
  },
  { _id: false }
);

const clubSchema = new Schema(
  {
    name: { 
      type: String, 
      required: [true, 'Club name is required'], 
      trim: true,
      maxlength: 100,
    },
    description: { type: String, required: [true, 'Club description is required'], trim: true, maxlength: 1000},
    category: { 
      type: String, 
      enum: CLUB_CATEGORIES,
      default: 'OTHER',
      required: [true, 'Club category is required'],
    },
    meeting: { type: meetingSchema },
    proposerId: { type: Schema.Types.ObjectId, ref: 'User', required: [true, 'proposerId is required'] },
    status: {
      type: String,
      enum: CLUB_STATUSES,
      default: 'PENDING',
      required: [true, 'status is required'],
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
