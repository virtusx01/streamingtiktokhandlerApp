import { ResponsiveVoiceAPIClient } from '@responsivevoice/api-client';

let client: ResponsiveVoiceAPIClient | null = null;

export function getResponsiveVoiceClient(): ResponsiveVoiceAPIClient {
  const apiKey = process.env.RESPONSIVEVOICE_API_KEY?.trim();
  const apiSecret = process.env.RESPONSIVEVOICE_API_SECRET?.trim();
  if (!apiKey || !apiSecret) {
    throw new Error('ResponsiveVoice server credentials are not configured.');
  }

  if (!client) {
    client = new ResponsiveVoiceAPIClient({
      apiKey,
      apiSecret,
      timeout: 20000,
      retryAttempts: 1,
    });
  }
  return client;
}
