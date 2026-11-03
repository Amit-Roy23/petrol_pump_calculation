import { z } from 'zod';
import { RoundingMode, Currency } from '../enums.js';

export const StationSettingsSchema = z.object({
  roundingMode: z.nativeEnum(RoundingMode).default(RoundingMode.TRUNCATE),
  currency: z.nativeEnum(Currency).default(Currency.INR),
  shortExcessTolerancePaise: z.number().int().default(1000), // Default ₹10 tolerance
  dayStartTime: z.string().default('06:00'),
});

export const StationSchema = z.object({
  _id: z.string().optional(),
  name: z.string().min(1, 'Station name is required'),
  address: z.string().optional(),
  gstin: z.string().optional(),
  settings: StationSettingsSchema.default({}),
  createdAt: z.date().optional(),
  updatedAt: z.date().optional(),
});

export type Station = z.infer<typeof StationSchema>;
export type StationSettings = z.infer<typeof StationSettingsSchema>;

