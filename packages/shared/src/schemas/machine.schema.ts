import { z } from 'zod';

export const MachineSchema = z.object({
  _id: z.string().optional(),
  stationId: z.string().min(1),
  number: z.string().min(1, 'Machine number/label is required (e.g. 219, 285)'),
  name: z.string().optional(),
  displayOrder: z.number().int().default(1),
  isActive: z.boolean().default(true),
  createdAt: z.date().optional(),
  updatedAt: z.date().optional(),
});

export const CreateMachineSchema = z.object({
  stationId: z.string().optional(),
  number: z.string().min(1, 'Machine number/label is required (e.g. 219, 285)'),
  name: z.string().optional(),
  displayOrder: z.number().int().default(1),
  isActive: z.boolean().default(true),
});

export const UpdateMachineSchema = CreateMachineSchema.partial();

export type Machine = z.infer<typeof MachineSchema>;
export type CreateMachineInput = z.infer<typeof CreateMachineSchema>;
export type UpdateMachineInput = z.infer<typeof UpdateMachineSchema>;

