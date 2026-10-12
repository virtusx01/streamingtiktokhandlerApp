import { NextRequest, NextResponse } from "next/server";
import path from "path";
import fs from "fs";
import { createHash } from "crypto";

const TTS_SERVER_URL = "http://127.0.0.1:5002";
const CACHE_DIR = path.join(process.cwd(), "cache", "tts");

if (!fs.existsSync(CACHE_DIR)) {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
}

function createSilentWavBuffer(durationMs = 120): Buffer {
  const sampleRate = 22050;
  const channels = 1;
  const bitsPerSample = 16;
  const byteRate = sampleRate * channels * (bitsPerSample / 8);
  const blockAlign = channels * (bitsPerSample / 8);
  const sampleCount = Math.max(1, Math.floor((sampleRate * durationMs) / 1000));
  const dataSize = sampleCount * blockAlign;
  const totalSize = 36 + dataSize;
  const buffer = Buffer.alloc(44 + dataSize);

  buffer.write("RIFF", 0, "ascii");
  buffer.writeUInt32LE(totalSize, 4);
  buffer.write("WAVE", 8, "ascii");
  buffer.write("fmt ", 12, "ascii");
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(channels, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(byteRate, 28);
  buffer.writeUInt16LE(blockAlign, 32);
  buffer.writeUInt16LE(bitsPerSample, 34);
  buffer.write("data", 36, "ascii");
  buffer.writeUInt32LE(dataSize, 40);

  return buffer;
}

function buildSilentAudioResponse() {
  const silentWav = createSilentWavBuffer(120);
  return new NextResponse(new Uint8Array(silentWav), {
    headers: {
      "Content-Type": "audio/wav",
      "Content-Length": silentWav.length.toString(),
      "X-Cache": "OFFLINE-SILENT"
    }
  });
}

export async function GET(req: NextRequest): Promise<Response> {
  const { searchParams } = new URL(req.url);
  const text = searchParams.get("text");
  const speed = searchParams.get("speed") || "1.0";
  const voice = searchParams.get("voice") || "id-ID-ArdiNeural";

  if (!text) {
    return NextResponse.json({ error: "Text is required" }, { status: 400 });
  }

  const cacheKey = createHash("md5")
    .update(`${text}_${voice}_${speed}`)
    .digest("hex");

  const cacheFile = path.join(CACHE_DIR, `${cacheKey}.wav`);

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

  try {
    const url = `${TTS_SERVER_URL}/?text=${encodeURIComponent(text)}&voice=${encodeURIComponent(voice)}&speed=${speed}&output=${encodeURIComponent(cacheFile)}`;
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`TTS Server error: ${response.statusText}`);
    }

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
    console.warn(`[TTS_API] TTS server unavailable or failed: ${err.message}. Falling back to silent audio.`);
    return buildSilentAudioResponse();
  }
}
