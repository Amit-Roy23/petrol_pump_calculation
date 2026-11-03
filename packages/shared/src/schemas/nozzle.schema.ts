import { z } from 'zod';

export const NozzleSchema = z.object({
  _id: z.string().optional(),
  stationId: z.string().min(1),
  machineId: z.string().min(1, 'Machine ID is required'),
  position: z.number().int().min(1).max(8), // typically 1-4
  productId: z.string().min(1, 'Product ID is required'),
  lastClosingReadingMilli: z.number().int().default(0), // in thousandths e.g. 2127209495
  meterMaxReadingMilli: z.number().int().default(9999999999), // default 9,999,999.999
  isActive: z.boolean().default(true),
  createdAt: z.date().optional(),
  updatedAt: z.date().optional(),
});

export const CreateNozzleSchema = z.object({
  stationId: z.string().optional(),
  machineId: z.string().min(1),
  position: z.number().int().min(1).max(8),
  productId: z.string().min(1),
  initialReadingMilli: z.number().int().default(0),
  meterMaxReadingMilli: z.number().int().default(9999999999),
  isActive: z.boolean().default(true),
});

export const UpdateNozzleSchema = z.object({
  productId: z.string().optional(),
  lastClosingReadingMilli: z.number().int().optional(),
  meterMaxReadingMilli: z.number().int().optional(),
  isActive: z.boolean().optional(),
});

export type Nozzle = z.infer<typeof NozzleSchema>;
export type CreateNozzleInput = z.infer<typeof CreateNozzleSchema>;
export type UpdateNozzleInput = z.infer<typeof UpdateNozzleSchema>;

