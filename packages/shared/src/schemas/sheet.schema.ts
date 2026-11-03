import { z } from 'zod';
import { SheetStatus, Shift, PaymentMode } from '../enums.js';

export const SheetNozzleReadingItemSchema = z.object({
  nozzleId: z.string().min(1),
  productId: z.string().min(1),
  openingMilli: z.number().int().nonnegative(),
  closingMilli: z.number().int().nonnegative(),
  testingLitresCenti: z.number().int().nonnegative().default(0),
  isMeterReset: z.boolean().default(false),
  resetNote: z.string().optional(),
  resetLitresCenti: z.number().int().optional(),
  litresCenti: z.number().int().nonnegative().optional(), // server computed
});

export const SheetProductTotalItemSchema = z.object({
  productId: z.string().min(1),
  litresCenti: z.number().int().nonnegative(),
  ratePaise: z.number().int().positive(),
  amountPaise: z.number().int().nonnegative(),
});

export const SheetPaymentItemSchema = z.object({
  mode: z.nativeEnum(PaymentMode),
  amountPaise: z.number().int().positive('Payment amount must be positive'),
  reference: z.string().optional(),
  creditCustomerId: z.string().optional(),
  time: z.string().optional(),
  note: z.string().optional(),
}).refine(
  (data) => (data.mode === PaymentMode.CREDIT ? Boolean(data.creditCustomerId) : true),
  { message: 'creditCustomerId is required when mode is CREDIT', path: ['creditCustomerId'] }
);

export const DailySheetSchema = z.object({
  _id: z.string().optional(),
  stationId: z.string().min(1),
  businessDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Format YYYY-MM-DD'),
  shift: z.nativeEnum(Shift).default(Shift.DAY),
  machineId: z.string().min(1),
  staffId: z.string().min(1),
  status: z.nativeEnum(SheetStatus).default(SheetStatus.DRAFT),
  nozzleReadings: z.array(SheetNozzleReadingItemSchema),
  productTotals: z.array(SheetProductTotalItemSchema).default([]),
  totalAmountPaise: z.number().int().default(0),
  payments: z.array(SheetPaymentItemSchema).default([]),
  cashTotalPaise: z.number().int().default(0),
  onlineTotalPaise: z.number().int().default(0),
  cardTotalPaise: z.number().int().default(0),
  creditTotalPaise: z.number().int().default(0),
  totalCollectedPaise: z.number().int().default(0),
  shortExcessPaise: z.number().int().default(0),
  closedAtTime: z.string().optional(),
  remarks: z.string().optional(),
  submittedBy: z.string().optional(),
  submittedAt: z.coerce.date().optional(),
  approvedBy: z.string().optional(),
  approvedAt: z.coerce.date().optional(),
  createdAt: z.date().optional(),
  updatedAt: z.date().optional(),
});

export const CreateDailySheetSchema = z.object({
  stationId: z.string().optional(),
  businessDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Format YYYY-MM-DD'),
  shift: z.nativeEnum(Shift).default(Shift.DAY),
  machineId: z.string().min(1),
  staffId: z.string().min(1),
  closedAtTime: z.string().optional(),
  remarks: z.string().optional(),
});

export const UpdateDailySheetSchema = z.object({
  staffId: z.string().optional(),
  nozzleReadings: z.array(SheetNozzleReadingItemSchema).optional(),
  payments: z.array(SheetPaymentItemSchema).optional(),
  closedAtTime: z.string().optional(),
  remarks: z.string().optional(),
});

export const PreviewSheetSchema = z.object({
  nozzleReadings: z.array(SheetNozzleReadingItemSchema),
  payments: z.array(SheetPaymentItemSchema).default([]),
  rates: z.array(
    z.object({
      productId: z.string().min(1),
      ratePaise: z.number().int().positive(),
    })
  ),
  roundingMode: z.string().optional(),
});

export type DailySheet = z.infer<typeof DailySheetSchema>;
export type SheetNozzleReadingItem = z.infer<typeof SheetNozzleReadingItemSchema>;
export type SheetProductTotalItem = z.infer<typeof SheetProductTotalItemSchema>;
export type SheetPaymentItem = z.infer<typeof SheetPaymentItemSchema>;
export type CreateDailySheetInput = z.infer<typeof CreateDailySheetSchema>;
export type UpdateDailySheetInput = z.infer<typeof UpdateDailySheetSchema>;
export type PreviewSheetInput = z.infer<typeof PreviewSheetSchema>;

