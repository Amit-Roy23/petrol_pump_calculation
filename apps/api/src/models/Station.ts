import mongoose, { Schema, Document } from 'mongoose';
import { RoundingMode, Currency } from '@petrolpump/shared';

export interface IStation extends Document {
  name: string;
  address?: string;
  gstin?: string;
  settings: {
    roundingMode: RoundingMode;
    currency: Currency;
    shortExcessTolerancePaise: number;
    dayStartTime: string;
  };
  createdAt: Date;
  updatedAt: Date;
}

const StationSchema = new Schema<IStation>(
  {
    name: { type: String, required: true },
    address: { type: String },
    gstin: { type: String },
    settings: {
      roundingMode: {
        type: String,
        enum: Object.values(RoundingMode),
        default: RoundingMode.TRUNCATE,
      },
      currency: {
        type: String,
        enum: Object.values(Currency),
        default: Currency.INR,
      },
      shortExcessTolerancePaise: { type: Number, default: 1000 }, // ₹10 default tolerance
      dayStartTime: { type: String, default: '06:00' },
    },
  },
  { timestamps: true }
);

export const StationModel = mongoose.model<IStation>('Station', StationSchema);

