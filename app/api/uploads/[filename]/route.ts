import { NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CONTENT_TYPES: Record<string, string> = {
  '.aac': 'audio/aac',
  '.avif': 'image/avif',
  '.bmp': 'image/bmp',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.m4a': 'audio/mp4',
  '.m4v': 'video/mp4',
  '.mp3': 'audio/mpeg',
  '.mp4': 'video/mp4',
  '.mov': 'video/quicktime',
  '.ogg': 'audio/ogg',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.tif': 'image/tiff',
  '.tiff': 'image/tiff',
  '.wav': 'audio/wav',
  '.webm': 'audio/webm',
  '.webp': 'image/webp',
};

export async function GET(
  request: Request,
  context: { params: Promise<{ filename: string }> },
) {
  const { filename } = await context.params;
  if (!/^[A-Za-z0-9._-]+$/.test(filename)) {
    return NextResponse.json({ error: 'Invalid upload filename.' }, { status: 400 });
  }

  const filePath = path.join(process.cwd(), 'public', 'uploads', filename);
  try {
    const [file, stats] = await Promise.all([fs.readFile(filePath), fs.stat(filePath)]);
    const contentType = CONTENT_TYPES[path.extname(filename).toLowerCase()] || 'application/octet-stream';
    const headers = new Headers({
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'public, max-age=3600',
      'Content-Disposition': `inline; filename="${filename}"`,
      'Content-Type': contentType,
      'Content-Length': String(stats.size),
    });
    const range = request.headers.get('range');

    if (range) {
      const match = /^bytes=(\d*)-(\d*)$/.exec(range);
      if (!match || (!match[1] && !match[2])) {
        headers.set('Content-Range', `bytes */${stats.size}`);
        return new Response(null, { status: 416, headers });
      }

      const suffixLength = match[1] ? 0 : Number(match[2]);
      if (!match[1] && (!Number.isSafeInteger(suffixLength) || suffixLength <= 0)) {
        headers.set('Content-Range', `bytes */${stats.size}`);
        return new Response(null, { status: 416, headers });
      }
      const start = match[1] ? Number(match[1]) : Math.max(0, stats.size - suffixLength);
      const end = match[1] ? (match[2] ? Number(match[2]) : stats.size - 1) : stats.size - 1;
      if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start > end || start >= stats.size) {
        headers.set('Content-Range', `bytes */${stats.size}`);
        return new Response(null, { status: 416, headers });
      }

      const boundedEnd = Math.min(end, stats.size - 1);
      const chunk = file.subarray(start, boundedEnd + 1);
      headers.set('Content-Range', `bytes ${start}-${boundedEnd}/${stats.size}`);
      headers.set('Content-Length', String(chunk.length));
      return new Response(new Uint8Array(chunk), { status: 206, headers });
    }

    return new Response(new Uint8Array(file), { headers });
  } catch (error) {
    const nodeError = error as NodeJS.ErrnoException;
    if (nodeError.code === 'ENOENT') {
      return NextResponse.json({ error: 'Uploaded file not found.' }, { status: 404 });
    }
    console.error('[Upload] Failed to serve uploaded file:', error);
    return NextResponse.json({ error: 'Failed to read uploaded file.' }, { status: 500 });
  }
}
