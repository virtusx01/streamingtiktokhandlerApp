import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { verifyAdminToken } from '@/lib/auth';

export type AdbAction =
  | { type: 'click'; x: number; y: number; delayAfter: number }
  | { type: 'keyevent'; keycode: number | string; delayAfter: number }
  | {
      type: 'swipe';
      swipe: { startX: number; startY: number; endX: number; endY: number; duration: number };
      delayAfter: number;
    }
  | { type: 'text'; inputParams: string; delayAfter: number };

const MAX_ACTIONS = 20;
const MAX_COORDINATE = 10000;
const MAX_DELAY = 30000;

function coordinate(value: unknown, field: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > MAX_COORDINATE) {
    throw new Error(`Invalid ADB action coordinate: ${field}`);
  }
  return Math.round(value);
}

function delay(value: unknown): number {
  if (value === undefined) return 500;
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > MAX_DELAY) {
    throw new Error('Invalid ADB action delay');
  }
  return Math.round(value);
}

export function normalizeAdbActions(value: unknown): AdbAction[] {
  const rawActions = Array.isArray(value) ? value : [value];
  if (rawActions.length === 0 || rawActions.length > MAX_ACTIONS) {
    throw new Error(`ADB action count must be between 1 and ${MAX_ACTIONS}`);
  }

  return rawActions.map((raw): AdbAction => {
    if (!raw || typeof raw !== 'object') throw new Error('Invalid ADB action');
    const action = raw as Record<string, unknown>;
    const delayAfter = delay(action.delayAfter);

    if (action.type === 'click') {
      return {
        type: 'click',
        x: coordinate(action.x, 'x'),
        y: coordinate(action.y, 'y'),
        delayAfter,
      };
    }

    if (action.type === 'keyevent') {
      const rawKeycode = String(action.keycode ?? '');
      const numericKeycode = Number(rawKeycode);
      if (Number.isInteger(numericKeycode) && numericKeycode >= 0 && numericKeycode <= 288) {
        return { type: 'keyevent', keycode: numericKeycode, delayAfter };
      }
      if (!/^KEYCODE_[A-Z0-9_]+$/.test(rawKeycode)) {
        throw new Error('Invalid Android keycode');
      }
      return { type: 'keyevent', keycode: rawKeycode, delayAfter };
    }

    if (action.type === 'swipe') {
      if (!action.swipe || typeof action.swipe !== 'object') throw new Error('Invalid ADB swipe');
      const swipe = action.swipe as Record<string, unknown>;
      const duration = swipe.duration === undefined ? 500 : Number(swipe.duration);
      if (!Number.isInteger(duration) || duration < 1 || duration > MAX_DELAY) {
        throw new Error('Invalid ADB swipe duration');
      }
      return {
        type: 'swipe',
        swipe: {
          startX: coordinate(swipe.startX, 'startX'),
          startY: coordinate(swipe.startY, 'startY'),
          endX: coordinate(swipe.endX, 'endX'),
          endY: coordinate(swipe.endY, 'endY'),
          duration,
        },
        delayAfter,
      };
    }

    if (action.type === 'text') {
      if (typeof action.inputParams !== 'string' || action.inputParams.length === 0 || action.inputParams.length > 500) {
        throw new Error('ADB text must contain between 1 and 500 characters');
      }
      if (/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(action.inputParams)) {
        throw new Error('ADB text contains unsupported control characters');
      }
      return { type: 'text', inputParams: action.inputParams, delayAfter };
    }

    throw new Error('Unsupported ADB action type');
  });
}

export async function enqueueAdbActions(actions: unknown[], metadata: Record<string, unknown> = {}) {
  const normalizedActions = normalizeAdbActions(actions);
  const jsonMetadata = JSON.parse(JSON.stringify(metadata)) as Prisma.InputJsonObject;
  const command = await prisma.adbCommand.create({
    data: {
      actions: normalizedActions as unknown as Prisma.InputJsonArray,
      metadata: jsonMetadata,
    },
    select: { id: true },
  });
  return command.id;
}

export async function isAdminActionRequest(req: Request): Promise<boolean> {
  const cookie = req.headers.get('cookie') || '';
  const sessionCookie = cookie.split(';').map(part => part.trim()).find(part => part.startsWith('admin_session='));
  if (!sessionCookie) return false;

  try {
    const token = decodeURIComponent(sessionCookie.slice('admin_session='.length));
    const payload = await verifyAdminToken(token);
    return payload?.role === 'admin';
  } catch {
    return false;
  }
}
