import { NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';

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

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    const uploadDir = path.join(process.cwd(), 'public', 'uploads');
    
    // Ensure upload directory exists
    try {
      await fs.access(uploadDir);
    } catch {
      await fs.mkdir(uploadDir, { recursive: true });
    }

    const safeName = path.basename(file.name).replace(/[^A-Za-z0-9._-]/g, '_').slice(-160) || 'upload';
    const filename = `${Date.now()}_${safeName}`;
    const filePath = path.join(uploadDir, filename);
    await fs.writeFile(filePath, buffer);

    const fileUrl = `/api/uploads/${filename}`;
    return NextResponse.json({ url: fileUrl });
  } catch (error: unknown) {
    console.error("Upload error:", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Upload failed.' }, { status: 500 });
  }
}
