import { NextResponse } from 'next/server';
import { GetObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
import { getR2Storage } from '@/lib/r2-storage';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(
  request: Request,
  context: { params: Promise<{ filename: string }> },
) {
  const { filename } = await context.params;
  if (!/^[A-Za-z0-9._-]+$/.test(filename)) {
    return NextResponse.json({ error: 'Invalid upload filename.' }, { status: 400 });
  }

  try {
    const { client, bucket } = getR2Storage();
    const key = `uploads/${filename}`;
    const metadata = await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
    const size = metadata.ContentLength ?? 0;
    const range = request.headers.get('range');
    const headers = new Headers({
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'public, max-age=3600',
      'Content-Disposition': `inline; filename="${filename}"`,
      'Content-Type': metadata.ContentType || 'application/octet-stream',
    });

    if (range) {
      const match = /^bytes=(\d*)-(\d*)$/.exec(range);
      if (!match || (!match[1] && !match[2])) {
        headers.set('Content-Range', `bytes */${size}`);
        return new Response(null, { status: 416, headers });
      }

      const suffixLength = match[1] ? 0 : Number(match[2]);
      if (!match[1] && (!Number.isSafeInteger(suffixLength) || suffixLength <= 0)) {
        headers.set('Content-Range', `bytes */${size}`);
        return new Response(null, { status: 416, headers });
      }
      const start = match[1] ? Number(match[1]) : Math.max(0, size - suffixLength);
      const end = match[1] ? (match[2] ? Number(match[2]) : size - 1) : size - 1;
      if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start > end || start >= size) {
        headers.set('Content-Range', `bytes */${size}`);
        return new Response(null, { status: 416, headers });
      }

      const boundedEnd = Math.min(end, size - 1);
      const result = await client.send(new GetObjectCommand({
        Bucket: bucket,
        Key: key,
        Range: `bytes=${start}-${boundedEnd}`,
      }));
      if (!result.Body) {
        throw new Error('R2 returned an empty response body for an uploaded file.');
      }
      headers.set('Content-Range', result.ContentRange || `bytes ${start}-${boundedEnd}/${size}`);
      headers.set('Content-Length', String(result.ContentLength ?? boundedEnd - start + 1));
      return new Response(result.Body.transformToWebStream(), { status: 206, headers });
    }

    const result = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
    if (!result.Body) {
      throw new Error('R2 returned an empty response body for an uploaded file.');
    }
    headers.set('Content-Length', String(result.ContentLength ?? size));
    if (result.ContentType) headers.set('Content-Type', result.ContentType);
    return new Response(result.Body.transformToWebStream(), { headers });
  } catch (error) {
    const r2Error = error as { name?: string; $metadata?: { httpStatusCode?: number } };
    if (r2Error.name === 'NotFound' || r2Error.name === 'NoSuchKey' || r2Error.$metadata?.httpStatusCode === 404) {
      return NextResponse.json({ error: 'Uploaded file not found.' }, { status: 404 });
    }
    console.error('[Upload] Failed to serve R2 file:', error);
    return NextResponse.json({ error: 'Failed to read uploaded file from R2.' }, { status: 500 });
  }
}
