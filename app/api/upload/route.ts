import { NextResponse } from 'next/server';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import { randomUUID } from 'crypto';
import { getR2Storage } from '@/lib/r2-storage';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const uploadedFile = formData.get('file');
    if (!(uploadedFile instanceof File)) {
      return NextResponse.json({ error: 'No file uploaded' }, { status: 400 });
    }
    const file = uploadedFile;
    const isAudioFile = file.type.startsWith('audio/') || /\.(mp3|wav|ogg|m4a|aac|webm)$/i.test(file.name);
    if (isAudioFile && file.size > 15 * 1024 * 1024) {
      return NextResponse.json({ error: 'Audio uploads must be 15 MB or smaller.' }, { status: 413 });
    }
    if (file.size === 0) {
      return NextResponse.json({ error: 'Uploaded file is empty.' }, { status: 400 });
    }

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    const { client, bucket, publicBaseUrl } = getR2Storage();
    const safeName = file.name.replace(/[^A-Za-z0-9._-]/g, '_').slice(-120) || 'upload';
    const filename = `${Date.now()}_${randomUUID()}_${safeName}`;
    const key = `uploads/${filename}`;
    await client.send(new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: buffer,
      ContentLength: buffer.length,
      ContentType: file.type || 'application/octet-stream',
      CacheControl: 'public, max-age=31536000, immutable',
    }));

    const fileUrl = publicBaseUrl
      ? `${publicBaseUrl}/${key.split('/').map(encodeURIComponent).join('/')}`
      : `/api/uploads/${filename}`;
    return NextResponse.json({ url: fileUrl });
  } catch (error: unknown) {
    console.error("Upload error:", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Upload to R2 failed.' }, { status: 500 });
  }
}
