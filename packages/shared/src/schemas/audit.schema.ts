import { z } from 'zod';
import { AuditAction } from '../enums.js';

export const AuditLogSchema = z.object({
  _id: z.string().optional(),
  stationId: z.string().min(1),
  entity: z.string().min(1),
  entityId: z.string().min(1),
  action: z.nativeEnum(AuditAction),
  before: z.record(z.any()).optional(),
  after: z.record(z.any()).optional(),
  userId: z.string().optional(),
  reason: z.string().optional(),
  timestamp: z.coerce.date().default(() => new Date()),
});

export type AuditLog = z.infer<typeof AuditLogSchema>;

