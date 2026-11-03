import { z } from 'zod';
import { Role } from '../enums.js';

export const UserSchema = z.object({
  _id: z.string().optional(),
  stationId: z.string().min(1),
  name: z.string().min(1, 'Name is required'),
  phone: z.string().min(10, 'Valid 10-digit phone number is required'),
  email: z.string().email().optional().or(z.literal('')),
  role: z.nativeEnum(Role).default(Role.ATTENDANT),
  isActive: z.boolean().default(true),
  hasPin: z.boolean().optional(),
  createdAt: z.date().optional(),
  updatedAt: z.date().optional(),
});

export const LoginSchema = z.object({
  phone: z.string().min(10, 'Phone must be at least 10 digits'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
});

export const PinLoginSchema = z.object({
  phone: z.string().min(10, 'Phone must be at least 10 digits'),
  pin: z.string().regex(/^\d{4,6}$/, 'PIN must be 4 to 6 digits'),
});

export const RefreshTokenSchema = z.object({
  refreshToken: z.string().min(1, 'Refresh token required'),
});

export const CreateUserSchema = z.object({
  stationId: z.string().min(1).optional(),
  name: z.string().min(1),
  phone: z.string().min(10),
  email: z.string().email().optional(),
  password: z.string().min(6),
  pin: z.string().regex(/^\d{4,6}$/).optional(),
  role: z.nativeEnum(Role),
  isActive: z.boolean().default(true),
});

export const UpdateUserSchema = CreateUserSchema.partial();

export type User = z.infer<typeof UserSchema>;
export type LoginInput = z.infer<typeof LoginSchema>;
export type PinLoginInput = z.infer<typeof PinLoginSchema>;
export type CreateUserInput = z.infer<typeof CreateUserSchema>;
export type UpdateUserInput = z.infer<typeof UpdateUserSchema>;

