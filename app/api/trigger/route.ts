import { NextResponse } from 'next/server';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);
const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export async function POST(req: Request) {
  try {
    const data = await req.json();
    
    // 1. Perform ADB Actions
    const rawActions = data.actions || data; 
    const actions = Array.isArray(rawActions) ? rawActions : [rawActions];
    const results = [];

    for (const action of actions) {
        if (!action || typeof action !== 'object' || !action.type) {
            console.log(`[ADB Queue] Skipping invalid action:`, action);
            continue;
        }
        
        const { type, x, y, keycode, swipe, inputParams, delayAfter } = action;
        let command = '';

        if (type === 'click' && x != null && y != null) {
            command = `adb shell input tap ${Math.round(x)} ${Math.round(y)}`;
        } else if (type === 'keyevent' && keycode) {
            command = `adb shell input keyevent ${keycode}`;
        } else if (type === 'swipe' && swipe) {
            const { startX, startY, endX, endY, duration } = swipe;
            command = `adb shell input swipe ${Math.round(startX)} ${Math.round(startY)} ${Math.round(endX)} ${Math.round(endY)} ${duration || 500}`;
        } else if (type === 'text' && inputParams) {
            // Escape double quotes in text to prevent injection
            const cleanText = String(inputParams).replace(/"/g, '\\"');
            command = `adb shell input text "${cleanText}"`;
        }

        if (command) {
            console.log(`[ADB Queue] Executing: ${command}`);
            try {
                const { stdout, stderr } = await execAsync(command);
                results.push({ command, stdout, stderr, success: true });
            } catch (cmdErr: any) {
                console.error(`[ADB Queue] Error executing ${command}:`, cmdErr);
                results.push({ command, error: cmdErr.message, success: false });
            }
        }

        // Wait for the specified delay after executing the command, default to 500ms
        const delay = delayAfter !== undefined ? delayAfter : 500;
        if (delay > 0) {
            await wait(delay);
        }
    }

    return NextResponse.json({ success: true, results });
  } catch (err: any) {
    console.error("Trigger Event Error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
