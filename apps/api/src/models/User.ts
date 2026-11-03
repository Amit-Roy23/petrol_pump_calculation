import mongoose, { Schema, Document } from 'mongoose';
import bcrypt from 'bcryptjs';
import { Role } from '@petrolpump/shared';

export interface IUser extends Document {
  stationId: mongoose.Types.ObjectId;
  name: string;
  phone: string;
  email?: string;
  passwordHash: string;
  pinHash?: string;
  role: Role;
  isActive: boolean;
  refreshTokenHash?: string;
  createdAt: Date;
  updatedAt: Date;
  comparePassword(candidate: string): Promise<boolean>;
  comparePin(candidate: string): Promise<boolean>;
}

const UserSchema = new Schema<IUser>(
  {
    stationId: { type: Schema.Types.ObjectId, ref: 'Station', required: true, index: true },
    name: { type: String, required: true },
    phone: { type: String, required: true, unique: true, index: true },
    email: { type: String, sparse: true },
    passwordHash: { type: String, required: true },
    pinHash: { type: String },
    role: { type: String, enum: Object.values(Role), default: Role.ATTENDANT },
    isActive: { type: Boolean, default: true },
    refreshTokenHash: { type: String },
  },
  { timestamps: true }
);

UserSchema.methods.comparePassword = async function (candidate: string): Promise<boolean> {
  return bcrypt.compare(candidate, this.passwordHash);
};

UserSchema.methods.comparePin = async function (candidate: string): Promise<boolean> {
  if (!this.pinHash) return false;
  return bcrypt.compare(candidate, this.pinHash);
};

export const UserModel = mongoose.model<IUser>('User', UserSchema);

