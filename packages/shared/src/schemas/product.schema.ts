import { z } from 'zod';
import { ProductUnit } from '../enums.js';

export const ProductSchema = z.object({
  _id: z.string().optional(),
  stationId: z.string().min(1),
  name: z.string().min(1, 'Product name is required'),
  shortCode: z.string().min(1, 'Product short code is required'),
  unit: z.nativeEnum(ProductUnit).default(ProductUnit.L),
  colourTag: z.string().default('#059669'),
  currentRatePaise: z.number().int().optional(),
  isActive: z.boolean().default(true),
  createdAt: z.date().optional(),
  updatedAt: z.date().optional(),
});

export const CreateProductSchema = z.object({
  stationId: z.string().optional(),
  name: z.string().min(1, 'Product name is required'),
  shortCode: z.string().min(1, 'Product short code is required'),
  unit: z.nativeEnum(ProductUnit).default(ProductUnit.L),
  colourTag: z.string().default('#059669'),
  initialRatePaise: z.number().int().positive('Initial rate must be positive'),
  isActive: z.boolean().default(true),
});

export const UpdateProductSchema = z.object({
  name: z.string().min(1).optional(),
  shortCode: z.string().min(1).optional(),
  colourTag: z.string().optional(),
  isActive: z.boolean().optional(),
});

export type Product = z.infer<typeof ProductSchema>;
export type CreateProductInput = z.infer<typeof CreateProductSchema>;
export type UpdateProductInput = z.infer<typeof UpdateProductSchema>;

