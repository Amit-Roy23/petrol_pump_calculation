import mongoose, { Schema, Document } from 'mongoose';
import { ProductUnit } from '@petrolpump/shared';

export interface IProduct extends Document {
  stationId: mongoose.Types.ObjectId;
  name: string;
  shortCode: string;
  unit: ProductUnit;
  colourTag: string;
  currentRatePaise?: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const ProductSchema = new Schema<IProduct>(
  {
    stationId: { type: Schema.Types.ObjectId, ref: 'Station', required: true, index: true },
    name: { type: String, required: true },
    shortCode: { type: String, required: true },
    unit: { type: String, enum: Object.values(ProductUnit), default: ProductUnit.L },
    colourTag: { type: String, default: '#059669' },
    currentRatePaise: { type: Number },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

ProductSchema.index({ stationId: 1, shortCode: 1 }, { unique: true });

export const ProductModel = mongoose.model<IProduct>('Product', ProductSchema);

