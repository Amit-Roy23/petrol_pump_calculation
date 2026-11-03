import { z } from 'zod';
import { CreditLedgerType, PaymentMode } from '../enums.js';

export const CreditCustomerSchema = z.object({
  _id: z.string().optional(),
  stationId: z.string().min(1),
  name: z.string().min(1, 'Customer name is required'),
  phone: z.string().optional(),
  vehicleNumbers: z.array(z.string()).default([]),
  address: z.string().optional(),
  creditLimitPaise: z.number().int().default(0), // 0 = unlimited or unconstrained
  openingBalancePaise: z.number().int().default(0),
  currentBalancePaise: z.number().int().default(0),
  isActive: z.boolean().default(true),
  createdAt: z.date().optional(),
  updatedAt: z.date().optional(),
});

export const CreateCreditCustomerSchema = z.object({
  stationId: z.string().optional(),
  name: z.string().min(1, 'Customer name is required'),
  phone: z.string().optional(),
  vehicleNumbers: z.array(z.string()).default([]),
  address: z.string().optional(),
  creditLimitPaise: z.number().int().default(0),
  openingBalancePaise: z.number().int().default(0),
  isActive: z.boolean().default(true),
});

export const UpdateCreditCustomerSchema = CreateCreditCustomerSchema.partial();

export const CreditLedgerEntrySchema = z.object({
  _id: z.string().optional(),
  stationId: z.string().min(1),
  creditCustomerId: z.string().min(1),
  date: z.coerce.date(),
  type: z.nativeEnum(CreditLedgerType),
  amountPaise: z.number().int().positive('Amount must be positive'),
  sheetId: z.string().optional(),
  paymentMode: z.nativeEnum(PaymentMode).optional(),
  note: z.string().optional(),
  createdAt: z.date().optional(),
  updatedAt: z.date().optional(),
});

export const CreateCreditReceiptSchema = z.object({
  creditCustomerId: z.string().min(1),
  amountPaise: z.number().int().positive('Amount must be positive'),
  paymentMode: z.nativeEnum(PaymentMode).default(PaymentMode.CASH),
  date: z.coerce.date().default(() => new Date()),
  note: z.string().optional(),
});

export type CreditCustomer = z.infer<typeof CreditCustomerSchema>;
export type CreateCreditCustomerInput = z.infer<typeof CreateCreditCustomerSchema>;
export type UpdateCreditCustomerInput = z.infer<typeof UpdateCreditCustomerSchema>;
export type CreditLedgerEntry = z.infer<typeof CreditLedgerEntrySchema>;
export type CreateCreditReceiptInput = z.infer<typeof CreateCreditReceiptSchema>;

