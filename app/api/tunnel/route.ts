import { NextResponse } from 'next/server';
import { spawn, ChildProcess } from 'child_process';

let tunnelProcess: ChildProcess | null = null;
let tunnelUrl: string | null = null;

export async function GET() {
  return NextResponse.json({
    running: tunnelProcess !== null && !tunnelProcess.killed,
    url: tunnelUrl
  });
}

export async function POST(req: Request) {
  const { action } = await req.json();

  if (action === 'start') {
    if (tunnelProcess && !tunnelProcess.killed) {
      return NextResponse.json({ message: 'Tunnel already running', url: tunnelUrl });
    }

    tunnelUrl = null;
    // We use npx localtunnel directly to capture output
    tunnelProcess = spawn('npx', ['localtunnel', '--port', '3005'], {
      shell: true,
      detached: false
    });

    return new Promise<NextResponse>((resolve) => {
      let resolved = false;

      tunnelProcess?.stdout?.on('data', (data) => {
        const output = data.toString();
        console.log('Tunnel output:', output);
        
        // Extract URL: "your url is: https://funny-cat.loca.lt"
        const match = output.match(/your url is: (https:\/\/.*)/i);
        if (match) {
          tunnelUrl = match[1].trim();
          if (!resolved) {
            resolved = true;
            resolve(NextResponse.json({ message: 'Tunnel started', url: tunnelUrl }));
          }
        }
      });

      tunnelProcess?.on('exit', () => {
        tunnelProcess = null;
        tunnelUrl = null;
        if (!resolved) {
          resolved = true;
          resolve(NextResponse.json({ error: 'Tunnel failed to start' }, { status: 500 }));
        }
      });

      // Timeout if it takes too long to get a URL
      setTimeout(() => {
        if (!resolved) {
          resolved = true;
          resolve(NextResponse.json({ error: 'Tunnel timeout' }, { status: 500 }));
        }
      }, 10000);
    });
  }

  if (action === 'stop') {
    if (tunnelProcess) {
      tunnelProcess.kill();
      tunnelProcess = null;
      tunnelUrl = null;
      return NextResponse.json({ message: 'Tunnel stopped' });
    }
    return NextResponse.json({ message: 'Tunnel not running' });
  }

  return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
}
