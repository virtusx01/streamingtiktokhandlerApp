import { NextResponse } from 'next/server';
import { exec } from 'child_process';
import { promisify } from 'util';
import { isAdbAgentConfigured } from '@/lib/adb-agent-auth';
import { prisma } from '@/lib/prisma';

const execAsync = promisify(exec);

export async function GET() {
  if (isAdbAgentConfigured()) {
    let data;
    try {
      data = await prisma.adbAgent.findFirst({ orderBy: { lastSeen: 'desc' } });
    } catch (error) {
      console.error('[ADB Status] Failed to read agent status:', error);
      return NextResponse.json({ connected: false, devices: [], agentOnline: false, error: 'Gagal membaca status agent dari database.' }, { status: 503 });
    }

    const isOnline = Boolean(data && Date.now() - data.lastSeen.getTime() < 30000);
    return NextResponse.json({
      connected: isOnline && Boolean(data?.adbConnected),
      devices: isOnline && Array.isArray(data?.devices) ? data.devices : [],
      agentOnline: isOnline,
      agentId: isOnline ? data?.agentId : null,
    });
  }

  try {
    // Runs 'adb devices -l' to get detailed device info
    const { stdout } = await execAsync('adb devices -l');
    const lines = stdout.split('\n');
    const devices = [];

    // Skip the first line "List of devices attached"
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      const parts = line.split(/\s+/);
      if (parts.length < 2) continue;

      const serial = parts[0];
      const status = parts[1];
      
      if (status !== 'device') continue;

      // Detect if it's wireless (usually contains an IP:Port)
      const isWireless = serial.includes('.') && serial.includes(':');
      
      // Parse model info from -l output (e.g. model:POCO_X3_Pro)
      let model = 'Unknown Device';
      const modelMatch = line.match(/model:([^\s]+)/);
      if (modelMatch) model = modelMatch[1].replace(/_/g, ' ');

      devices.push({
        serial,
        status,
        isWireless,
        model
      });
    }

    return NextResponse.json({ 
      connected: devices.length > 0,
      devices 
    });
  } catch (err: any) {
    console.error("ADB Status Error:", err);
    return NextResponse.json({ connected: false, devices: [], error: err.message });
  }
}
