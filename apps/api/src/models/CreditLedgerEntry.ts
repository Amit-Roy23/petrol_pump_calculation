import mongoose, { Schema, Document } from 'mongoose';
import { CreditLedgerType, PaymentMode } from '@petrolpump/shared';

export interface ICreditLedgerEntry extends Document {
  stationId: mongoose.Types.ObjectId;
  creditCustomerId: mongoose.Types.ObjectId;
  date: Date;
  type: CreditLedgerType;
  amountPaise: number;
  sheetId?: mongoose.Types.ObjectId;
  paymentMode?: PaymentMode;
  note?: string;
  createdAt: Date;
  updatedAt: Date;
}

const CreditLedgerEntrySchema = new Schema<ICreditLedgerEntry>(
  {
    stationId: { type: Schema.Types.ObjectId, ref: 'Station', required: true, index: true },
    creditCustomerId: { type: Schema.Types.ObjectId, ref: 'CreditCustomer', required: true, index: true },
    date: { type: Date, required: true, index: true },
    type: { type: String, enum: Object.values(CreditLedgerType), required: true },
    amountPaise: { type: Number, required: true },
    sheetId: { type: Schema.Types.ObjectId, ref: 'DailySheet' },
    paymentMode: { type: String, enum: Object.values(PaymentMode) },
    note: { type: String },
  },
  { timestamps: true }
);

CreditLedgerEntrySchema.index({ creditCustomerId: 1, date: -1 });

export const CreditLedgerEntryModel = mongoose.model<ICreditLedgerEntry>(
  'CreditLedgerEntry',
  CreditLedgerEntrySchema
);

