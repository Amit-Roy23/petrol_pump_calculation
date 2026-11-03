import { z } from 'zod';

export const StaffSchema = z.object({
  _id: z.string().optional(),
  stationId: z.string().min(1),
  name: z.string().min(1, 'Staff name is required'),
  phone: z.string().optional(),
  code: z.string().min(1, 'Staff code is required'),
  userId: z.string().optional(), // optional link to User document
  isActive: z.boolean().default(true),
  createdAt: z.date().optional(),
  updatedAt: z.date().optional(),
});

export const CreateStaffSchema = z.object({
  stationId: z.string().optional(),
  name: z.string().min(1, 'Staff name is required'),
  phone: z.string().optional(),
  code: z.string().min(1, 'Staff code is required'),
  userId: z.string().optional(),
  isActive: z.boolean().default(true),
});

export const UpdateStaffSchema = CreateStaffSchema.partial();

export type Staff = z.infer<typeof StaffSchema>;
export type CreateStaffInput = z.infer<typeof CreateStaffSchema>;
export type UpdateStaffInput = z.infer<typeof UpdateStaffSchema>;

