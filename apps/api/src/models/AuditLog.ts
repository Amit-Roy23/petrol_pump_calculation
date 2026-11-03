import mongoose, { Schema, Document } from 'mongoose';
import { AuditAction } from '@petrolpump/shared';

export interface IAuditLog extends Document {
  stationId: mongoose.Types.ObjectId;
  entity: string;
  entityId: string;
  action: AuditAction;
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
  userId?: mongoose.Types.ObjectId;
  reason?: string;
  timestamp: Date;
}

const AuditLogSchema = new Schema<IAuditLog>(
  {
    stationId: { type: Schema.Types.ObjectId, ref: 'Station', required: true, index: true },
    entity: { type: String, required: true, index: true },
    entityId: { type: String, required: true, index: true },
    action: { type: String, enum: Object.values(AuditAction), required: true },
    before: { type: Schema.Types.Mixed },
    after: { type: Schema.Types.Mixed },
    userId: { type: Schema.Types.ObjectId, ref: 'User' },
    reason: { type: String },
    timestamp: { type: Date, default: () => new Date(), index: true },
  },
  { timestamps: false }
);

export const AuditLogModel = mongoose.model<IAuditLog>('AuditLog', AuditLogSchema);

