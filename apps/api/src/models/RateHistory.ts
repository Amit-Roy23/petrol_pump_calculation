import mongoose, { Schema, Document } from 'mongoose';

export interface IRateHistory extends Document {
  stationId: mongoose.Types.ObjectId;
  productId: mongoose.Types.ObjectId;
  ratePaise: number;
  effectiveFrom: Date;
  setBy?: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const RateHistorySchema = new Schema<IRateHistory>(
  {
    stationId: { type: Schema.Types.ObjectId, ref: 'Station', required: true, index: true },
    productId: { type: Schema.Types.ObjectId, ref: 'Product', required: true, index: true },
    ratePaise: { type: Number, required: true },
    effectiveFrom: { type: Date, required: true, index: true },
    setBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

RateHistorySchema.index({ stationId: 1, productId: 1, effectiveFrom: -1 });

export const RateHistoryModel = mongoose.model<IRateHistory>('RateHistory', RateHistorySchema);

