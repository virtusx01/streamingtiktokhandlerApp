import os
import sys
import asyncio
from pathlib import Path
import edge_tts

async def generate_tts(text, output_file, speed=1.0, voice="id-ID-ArdiNeural"):
    # edge-tts uses rate: e.g., "+10%", "-5%"
    # Convert speed multiplier to a percentage string for edge-tts
    # 1.0 -> "+0%"
    # 1.5 -> "+50%"
    # 0.5 -> "-50%"
    rate_percent = int((speed - 1.0) * 100)
    rate_str = f"+{rate_percent}%" if rate_percent >= 0 else f"{rate_percent}%"

    # Valid edge-tts voices for Indonesian
    VALID_VOICES = ["id-ID-ArdiNeural", "id-ID-GadisNeural"]
    if voice not in VALID_VOICES:
        print(f"Warning: Voice '{voice}' not supported by edge-tts. Falling back to id-ID-ArdiNeural.")
        voice = "id-ID-ArdiNeural"

    try:
        communicate = edge_tts.Communicate(text, voice, rate=rate_str)
        await communicate.save(output_file)
    except Exception as e:
        print(f"Error during TTS generation: {e}")
        sys.exit(1)

if __name__ == "__main__":
    if len(sys.argv) < 3:
        print("Usage: python tts_engine.py <text> <output_wav> [speed] [voice]")
        sys.exit(1)
    
    text = sys.argv[1]
    output_wav = sys.argv[2]
    speed = float(sys.argv[3]) if len(sys.argv) > 3 else 1.0
    voice = sys.argv[4] if len(sys.argv) > 4 else "id-ID-ArdiNeural"
    
    asyncio.run(generate_tts(text, output_wav, speed, voice))
    print(f"Successfully generated: {output_wav}")
