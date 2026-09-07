import asyncio
import json
import os
import sys
import edge_tts
from urllib.parse import urlparse, parse_qs

# Configuration
PORT = 5002
HOST = '127.0.0.1'

async def handle_request(reader, writer):
    data = await reader.read(1024)
    message = data.decode()
    
    # Very simple HTTP-like parser for internal use
    try:
        lines = message.split('\r\n')
        if not lines: return
        
        request_line = lines[0]
        parts = request_line.split(' ')
        if len(parts) < 2: return
        
        path = parts[1]
        parsed_path = urlparse(path)
        params = parse_qs(parsed_path.query)
        
        text = params.get("text", [None])[0]
        voice = params.get("voice", ["id-ID-ArdiNeural"])[0]
        speed = params.get("speed", ["1.0"])[0]
        output_path = params.get("output", [None])[0]
        
        if text and output_path:
            # edge-tts uses rate: e.g., "+10%", "-5%"
            speed_val = float(speed)
            rate_percent = int((speed_val - 1.0) * 100)
            rate_str = f"+{rate_percent}%" if rate_percent >= 0 else f"{rate_percent}%"
            
            communicate = edge_tts.Communicate(text, voice, rate=rate_str)
            await communicate.save(output_path)
            
            response = "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\n\r\n" + json.dumps({"success": True})
        else:
            response = "HTTP/1.1 400 Bad Request\r\n\r\nMissing parameters"
            
    except Exception as e:
        response = f"HTTP/1.1 500 Internal Server Error\r\n\r\n{str(e)}"
    
    writer.write(response.encode())
    await writer.drain()
    writer.close()
    await writer.wait_closed()

async def main():
    server = await asyncio.start_server(handle_request, HOST, PORT)
    addr = server.sockets[0].getsockname()
    print(f"TTS Persistent Server active on {addr}")
    
    async with server:
        await server.serve_forever()

if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        pass
