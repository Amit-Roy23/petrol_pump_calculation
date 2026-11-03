import mongoose, { Schema, Document } from 'mongoose';

export interface IStaff extends Document {
  stationId: mongoose.Types.ObjectId;
  name: string;
  phone?: string;
  code: string;
  userId?: mongoose.Types.ObjectId;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const StaffSchema = new Schema<IStaff>(
  {
    stationId: { type: Schema.Types.ObjectId, ref: 'Station', required: true, index: true },
    name: { type: String, required: true },
    phone: { type: String },
    code: { type: String, required: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User' },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

StaffSchema.index({ stationId: 1, code: 1 }, { unique: true });

export const StaffModel = mongoose.model<IStaff>('Staff', StaffSchema);

