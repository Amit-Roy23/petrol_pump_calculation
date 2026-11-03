import { z } from 'zod';

export const RateHistorySchema = z.object({
  _id: z.string().optional(),
  stationId: z.string().min(1),
  productId: z.string().min(1, 'Product ID is required'),
  ratePaise: z.number().int().positive('Rate must be positive'),
  effectiveFrom: z.coerce.date(),
  setBy: z.string().optional(),
  createdAt: z.date().optional(),
  updatedAt: z.date().optional(),
});

export const SetRateSchema = z.object({
  stationId: z.string().optional(),
  productId: z.string().min(1, 'Product ID is required'),
  ratePaise: z.number().int().positive('Rate in paise must be positive'),
  effectiveFrom: z.coerce.date().default(() => new Date()),
});

export type RateHistory = z.infer<typeof RateHistorySchema>;
export type SetRateInput = z.infer<typeof SetRateSchema>;

