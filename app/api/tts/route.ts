import { NextRequest, NextResponse } from "next/server";
import path from "path";
import fs from "fs";
import { createHash } from "crypto";

const TTS_SERVER_URL = "http://127.0.0.1:5002";
const CACHE_DIR = path.join(process.cwd(), "cache", "tts");

// Ensure cache directory exists
if (!fs.existsSync(CACHE_DIR)) {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
}

export async function GET(req: NextRequest): Promise<Response> {
  const { searchParams } = new URL(req.url);
  const text = searchParams.get("text");
  const speed = searchParams.get("speed") || "1.0";
  const voice = searchParams.get("voice") || "id-ID-ArdiNeural";

  if (!text) {
    return NextResponse.json({ error: "Text is required" }, { status: 400 });
  }

  // Generate cache key based on text, voice and speed
  const cacheKey = createHash("md5")
    .update(`${text}_${voice}_${speed}`)
    .digest("hex");
  
  const cacheFile = path.join(CACHE_DIR, `${cacheKey}.wav`);

  // 1. Check Cache
  if (fs.existsSync(cacheFile)) {
    const fileBuffer = fs.readFileSync(cacheFile);
    return new NextResponse(fileBuffer, {
      headers: {
        "Content-Type": "audio/wav",
        "Content-Length": fileBuffer.length.toString(),
        "X-Cache": "HIT"
      },
    });
  }

  // 2. Not in Cache, Request from Persistent Server
  try {
    const url = `${TTS_SERVER_URL}/?text=${encodeURIComponent(text)}&voice=${encodeURIComponent(voice)}&speed=${speed}&output=${encodeURIComponent(cacheFile)}`;
    
    // We expect the server to write the file directly to cacheFile
    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(`TTS Server error: ${response.statusText}`);
    }

    // Wait a brief moment for filesystem to sync if needed, though write is finished on server side
    if (!fs.existsSync(cacheFile)) {
        throw new Error("TTS Server reported success but file is missing");
    }

    const fileBuffer = fs.readFileSync(cacheFile);
    return new NextResponse(fileBuffer, {
      headers: {
        "Content-Type": "audio/wav",
        "Content-Length": fileBuffer.length.toString(),
        "X-Cache": "MISS"
      },
    });

  } catch (err: any) {
    console.error(`[TTS_API] Failed: ${err.message}`);
    return NextResponse.json({ 
        error: "TTS Generation failed", 
        details: err.message 
    }, { status: 500 });
  }
}
