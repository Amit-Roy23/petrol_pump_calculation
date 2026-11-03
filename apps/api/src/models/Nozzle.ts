import mongoose, { Schema, Document } from 'mongoose';

export interface INozzle extends Document {
  stationId: mongoose.Types.ObjectId;
  machineId: mongoose.Types.ObjectId;
  position: number; // 1 to 4
  productId: mongoose.Types.ObjectId;
  lastClosingReadingMilli: number;
  meterMaxReadingMilli: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const NozzleSchema = new Schema<INozzle>(
  {
    stationId: { type: Schema.Types.ObjectId, ref: 'Station', required: true, index: true },
    machineId: { type: Schema.Types.ObjectId, ref: 'Machine', required: true, index: true },
    position: { type: Number, required: true },
    productId: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
    lastClosingReadingMilli: { type: Number, default: 0 },
    meterMaxReadingMilli: { type: Number, default: 9999999999 },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

NozzleSchema.index({ machineId: 1, position: 1 }, { unique: true });

export const NozzleModel = mongoose.model<INozzle>('Nozzle', NozzleSchema);

