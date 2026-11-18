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

/** WhatsApp Cloud API (Meta) settings for automatic reminders. All optional. */
export function whatsappConfig() {
  const token = process.env.WHATSAPP_TOKEN || '';
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID || '';
  return {
    token,
    phoneNumberId,
    /** Approved message template name (default "due_reminder"). */
    template: process.env.WHATSAPP_TEMPLATE || 'due_reminder',
    apiVersion: process.env.WHATSAPP_API_VERSION || 'v21.0',
    ready: !!token && !!phoneNumberId,
  };
}
