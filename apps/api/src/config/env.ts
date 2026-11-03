import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(5000),
  MONGODB_URI: z.string().default('mongodb://localhost:27017/petrolpump?replicaSet=rs0'),
  JWT_ACCESS_SECRET: z.string().min(16).default('development_jwt_access_secret_super_secure_key_123'),
  JWT_REFRESH_SECRET: z.string().min(16).default('development_jwt_refresh_secret_super_secure_key_123'),
  ACCESS_TOKEN_EXPIRES_IN: z.string().default('15m'),
  REFRESH_TOKEN_EXPIRES_IN: z.string().default('30d'),
  WEB_APP_ORIGIN: z.string().default('http://localhost:5173'),
  DEFAULT_OWNER_PHONE: z.string().default('9876543210'),
  DEFAULT_OWNER_PASSWORD: z.string().default('Admin@12345'),
  DEFAULT_OWNER_PIN: z.string().default('1234'),
});

export const env = EnvSchema.parse(process.env);

