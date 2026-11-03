import { z } from 'zod';
import { DayClosingStatus, DENOMINATION_VALUES } from '../enums.js';

export const CashHandoverSchema = z.object({
  label: z.string().min(1),
  staffId: z.string().optional(),
  amountPaise: z.number().int(),
});

export const DenominationEntrySchema = z.object({
  note: z.union([
    z.literal(2000),
    z.literal(500),
    z.literal(200),
    z.literal(100),
    z.literal(50),
    z.literal(20),
    z.literal(10),
    z.literal(5),
    z.literal(2),
    z.literal(1),
    z.literal('coins'),
  ]),
  count: z.number().int().nonnegative(),
});

export const DayClosingSchema = z.object({
  _id: z.string().optional(),
  stationId: z.string().min(1),
  businessDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Format YYYY-MM-DD'),
  sheetIds: z.array(z.string()).default([]),
  productTotals: z
    .array(
      z.object({
        productId: z.string().min(1),
        litresCenti: z.number().int().nonnegative(),
        amountPaise: z.number().int().nonnegative(),
      })
    )
    .default([]),
  cashTotalPaise: z.number().int().default(0),
  onlineTotalPaise: z.number().int().default(0),
  cardTotalPaise: z.number().int().default(0),
  creditTotalPaise: z.number().int().default(0),
  totalCollectedPaise: z.number().int().default(0),
  cashHandovers: z.array(CashHandoverSchema).default([]),
  denominations: z.array(DenominationEntrySchema).default([]),
  denominationTotalPaise: z.number().int().default(0),
  cashDifferencePaise: z.number().int().default(0),
  status: z.nativeEnum(DayClosingStatus).default(DayClosingStatus.OPEN),
  closedBy: z.string().optional(),
  closedAt: z.coerce.date().optional(),
  remarks: z.string().optional(),
  createdAt: z.date().optional(),
  updatedAt: z.date().optional(),
});

export const UpdateDayClosingSchema = z.object({
  cashHandovers: z.array(CashHandoverSchema).optional(),
  denominations: z.array(DenominationEntrySchema).optional(),
  remarks: z.string().optional(),
});

export type DayClosing = z.infer<typeof DayClosingSchema>;
export type CashHandover = z.infer<typeof CashHandoverSchema>;
export type DenominationEntry = z.infer<typeof DenominationEntrySchema>;
export type UpdateDayClosingInput = z.infer<typeof UpdateDayClosingSchema>;

