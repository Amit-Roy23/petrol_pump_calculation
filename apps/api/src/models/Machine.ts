import mongoose, { Schema, Document } from 'mongoose';

export interface IMachine extends Document {
  stationId: mongoose.Types.ObjectId;
  number: string; // e.g. "219", "285"
  name?: string;
  displayOrder: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const MachineSchema = new Schema<IMachine>(
  {
    stationId: { type: Schema.Types.ObjectId, ref: 'Station', required: true, index: true },
    number: { type: String, required: true },
    name: { type: String },
    displayOrder: { type: Number, default: 1 },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

MachineSchema.index({ stationId: 1, number: 1 }, { unique: true });

export const MachineModel = mongoose.model<IMachine>('Machine', MachineSchema);

