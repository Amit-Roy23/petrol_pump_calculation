/** Accept the common names people use for the Mongo connection string on Vercel. */
export function mongoUri(): string | undefined {
  return process.env.MONGODB_URI || process.env.MONGO_URI || process.env.MONGO_URL || process.env.DATABASE_URL || undefined;
}

export function appPassword(): string | undefined {
  return process.env.APP_PASSWORD || undefined;
}

export function missingEnv(): string[] {
  const missing: string[] = [];
  if (!mongoUri()) missing.push('MONGODB_URI');
  if (!appPassword()) missing.push('APP_PASSWORD');
  return missing;
}
