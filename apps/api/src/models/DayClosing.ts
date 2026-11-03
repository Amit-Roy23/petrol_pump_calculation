import mongoose, { Schema, Document } from 'mongoose';
import { DayClosingStatus } from '@petrolpump/shared';

export interface IDayClosing extends Document {
  stationId: mongoose.Types.ObjectId;
  businessDate: string; // YYYY-MM-DD
  sheetIds: mongoose.Types.ObjectId[];
  productTotals: Array<{
    productId: mongoose.Types.ObjectId;
    litresCenti: number;
    amountPaise: number;
  }>;
  cashTotalPaise: number;
  onlineTotalPaise: number;
  cardTotalPaise: number;
  creditTotalPaise: number;
  totalCollectedPaise: number;
  cashHandovers: Array<{
    label: string;
    staffId?: mongoose.Types.ObjectId;
    amountPaise: number;
  }>;
  denominations: Array<{
    note: number | string;
    count: number;
  }>;
  denominationTotalPaise: number;
  cashDifferencePaise: number;
  status: DayClosingStatus;
  closedBy?: mongoose.Types.ObjectId;
  closedAt?: Date;
  remarks?: string;
  createdAt: Date;
  updatedAt: Date;
}

const DayClosingSchema = new Schema<IDayClosing>(
  {
    stationId: { type: Schema.Types.ObjectId, ref: 'Station', required: true, index: true },
    businessDate: { type: String, required: true, index: true },
    sheetIds: [{ type: Schema.Types.ObjectId, ref: 'DailySheet' }],
    productTotals: [
      {
        productId: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
        litresCenti: { type: Number, required: true },
        amountPaise: { type: Number, required: true },
        _id: false,
      },
    ],
    cashTotalPaise: { type: Number, default: 0 },
    onlineTotalPaise: { type: Number, default: 0 },
    cardTotalPaise: { type: Number, default: 0 },
    creditTotalPaise: { type: Number, default: 0 },
    totalCollectedPaise: { type: Number, default: 0 },
    cashHandovers: [
      {
        label: { type: String, required: true },
        staffId: { type: Schema.Types.ObjectId, ref: 'Staff' },
        amountPaise: { type: Number, required: true },
        _id: false,
      },
    ],
    denominations: [
      {
        note: { type: Schema.Types.Mixed, required: true },
        count: { type: Number, required: true },
        _id: false,
      },
    ],
    denominationTotalPaise: { type: Number, default: 0 },
    cashDifferencePaise: { type: Number, default: 0 },
    status: { type: String, enum: Object.values(DayClosingStatus), default: DayClosingStatus.OPEN },
    closedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    closedAt: { type: Date },
    remarks: { type: String },
  },
  { timestamps: true }
);

DayClosingSchema.index({ stationId: 1, businessDate: 1 }, { unique: true });

export const DayClosingModel = mongoose.model<IDayClosing>('DayClosing', DayClosingSchema);

