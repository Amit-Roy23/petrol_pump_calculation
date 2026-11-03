import mongoose, { Schema, Document } from 'mongoose';
import { SheetStatus, Shift, PaymentMode } from '@petrolpump/shared';

export interface INozzleReadingSubdoc {
  nozzleId: mongoose.Types.ObjectId;
  productId: mongoose.Types.ObjectId;
  openingMilli: number;
  closingMilli: number;
  testingLitresCenti: number;
  isMeterReset: boolean;
  resetNote?: string;
  resetLitresCenti?: number;
  litresCenti: number;
}

export interface IProductTotalSubdoc {
  productId: mongoose.Types.ObjectId;
  litresCenti: number;
  ratePaise: number;
  amountPaise: number;
}

export interface IPaymentSubdoc {
  mode: PaymentMode;
  amountPaise: number;
  reference?: string;
  creditCustomerId?: mongoose.Types.ObjectId;
  time?: string;
  note?: string;
}

export interface IDailySheet extends Document {
  stationId: mongoose.Types.ObjectId;
  businessDate: string; // YYYY-MM-DD
  shift: Shift;
  machineId: mongoose.Types.ObjectId;
  staffId: mongoose.Types.ObjectId;
  status: SheetStatus;
  nozzleReadings: INozzleReadingSubdoc[];
  productTotals: IProductTotalSubdoc[];
  totalAmountPaise: number;
  payments: IPaymentSubdoc[];
  cashTotalPaise: number;
  onlineTotalPaise: number;
  cardTotalPaise: number;
  creditTotalPaise: number;
  totalCollectedPaise: number;
  shortExcessPaise: number;
  closedAtTime?: string;
  remarks?: string;
  submittedBy?: mongoose.Types.ObjectId;
  submittedAt?: Date;
  approvedBy?: mongoose.Types.ObjectId;
  approvedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const NozzleReadingSubSchema = new Schema<INozzleReadingSubdoc>(
  {
    nozzleId: { type: Schema.Types.ObjectId, ref: 'Nozzle', required: true },
    productId: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
    openingMilli: { type: Number, required: true },
    closingMilli: { type: Number, required: true },
    testingLitresCenti: { type: Number, default: 0 },
    isMeterReset: { type: Boolean, default: false },
    resetNote: { type: String },
    resetLitresCenti: { type: Number },
    litresCenti: { type: Number, default: 0 },
  },
  { _id: false }
);

const ProductTotalSubSchema = new Schema<IProductTotalSubdoc>(
  {
    productId: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
    litresCenti: { type: Number, required: true },
    ratePaise: { type: Number, required: true },
    amountPaise: { type: Number, required: true },
  },
  { _id: false }
);

const PaymentSubSchema = new Schema<IPaymentSubdoc>(
  {
    mode: { type: String, enum: Object.values(PaymentMode), required: true },
    amountPaise: { type: Number, required: true },
    reference: { type: String },
    creditCustomerId: { type: Schema.Types.ObjectId, ref: 'CreditCustomer' },
    time: { type: String },
    note: { type: String },
  },
  { _id: false }
);

const DailySheetSchema = new Schema<IDailySheet>(
  {
    stationId: { type: Schema.Types.ObjectId, ref: 'Station', required: true, index: true },
    businessDate: { type: String, required: true, index: true },
    shift: { type: String, enum: Object.values(Shift), default: Shift.DAY },
    machineId: { type: Schema.Types.ObjectId, ref: 'Machine', required: true, index: true },
    staffId: { type: Schema.Types.ObjectId, ref: 'Staff', required: true, index: true },
    status: { type: String, enum: Object.values(SheetStatus), default: SheetStatus.DRAFT, index: true },
    nozzleReadings: [NozzleReadingSubSchema],
    productTotals: [ProductTotalSubSchema],
    totalAmountPaise: { type: Number, default: 0 },
    payments: [PaymentSubSchema],
    cashTotalPaise: { type: Number, default: 0 },
    onlineTotalPaise: { type: Number, default: 0 },
    cardTotalPaise: { type: Number, default: 0 },
    creditTotalPaise: { type: Number, default: 0 },
    totalCollectedPaise: { type: Number, default: 0 },
    shortExcessPaise: { type: Number, default: 0 },
    closedAtTime: { type: String },
    remarks: { type: String },
    submittedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    submittedAt: { type: Date },
    approvedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    approvedAt: { type: Date },
  },
  { timestamps: true }
);

DailySheetSchema.index(
  { stationId: 1, businessDate: 1, machineId: 1, shift: 1 },
  { unique: true }
);

export const DailySheetModel = mongoose.model<IDailySheet>('DailySheet', DailySheetSchema);

