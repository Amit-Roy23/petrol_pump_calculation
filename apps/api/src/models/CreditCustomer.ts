import mongoose, { Schema, Document } from 'mongoose';

export interface ICreditCustomer extends Document {
  stationId: mongoose.Types.ObjectId;
  name: string;
  phone?: string;
  vehicleNumbers: string[];
  address?: string;
  creditLimitPaise: number;
  openingBalancePaise: number;
  currentBalancePaise: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const CreditCustomerSchema = new Schema<ICreditCustomer>(
  {
    stationId: { type: Schema.Types.ObjectId, ref: 'Station', required: true, index: true },
    name: { type: String, required: true },
    phone: { type: String },
    vehicleNumbers: [{ type: String }],
    address: { type: String },
    creditLimitPaise: { type: Number, default: 0 },
    openingBalancePaise: { type: Number, default: 0 },
    currentBalancePaise: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

CreditCustomerSchema.index({ stationId: 1, name: 1 });

export const CreditCustomerModel = mongoose.model<ICreditCustomer>('CreditCustomer', CreditCustomerSchema);

