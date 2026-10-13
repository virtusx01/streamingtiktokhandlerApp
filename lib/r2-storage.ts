import { S3Client } from '@aws-sdk/client-s3';

interface R2Storage {
  client: S3Client;
  bucket: string;
  publicBaseUrl: string;
}

let cachedStorage: R2Storage | undefined;

export function getR2Storage(): R2Storage {
  if (cachedStorage) return cachedStorage;

  const endpoint = process.env.R2_ENDPOINT_URL?.trim();
  const accessKeyId = process.env.R2_ACCESS_KEY_ID?.trim();
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY?.trim();
  const bucket = process.env.R2_BUCKET_NAME?.trim();
  const publicBaseUrl = process.env.R2_PUBLIC_BASE_URL?.trim().replace(/\/+$/, '') || '';
  const missing = [
    ['R2_ENDPOINT_URL', endpoint],
    ['R2_ACCESS_KEY_ID', accessKeyId],
    ['R2_SECRET_ACCESS_KEY', secretAccessKey],
    ['R2_BUCKET_NAME', bucket],
  ].filter(([, value]) => !value).map(([name]) => name);

  if (missing.length > 0) {
    throw new Error(`R2 configuration is missing: ${missing.join(', ')}.`);
  }

  try {
    if (new URL(endpoint!).protocol !== 'https:') {
      throw new Error('R2_ENDPOINT_URL must use HTTPS.');
    }
    if (publicBaseUrl && new URL(publicBaseUrl).protocol !== 'https:') {
      throw new Error('R2_PUBLIC_BASE_URL must use HTTPS.');
    }
  } catch (error) {
    if (error instanceof TypeError) {
      throw new Error('R2 endpoint or public base URL is not a valid URL.');
    }
    throw error;
  }

  cachedStorage = {
    client: new S3Client({
      endpoint,
      region: 'auto',
      forcePathStyle: true,
      credentials: { accessKeyId: accessKeyId!, secretAccessKey: secretAccessKey! },
    }),
    bucket: bucket!,
    publicBaseUrl,
  };
  return cachedStorage;
}
