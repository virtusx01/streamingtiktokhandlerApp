import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';

export type SociabuzzEventData = Record<string, unknown>;

let lastCleanupAt = 0;

export async function publishSociabuzzEvent(data: SociabuzzEventData): Promise<void> {
  await prisma.sociabuzzEvent.create({
    data: { data: data as Prisma.InputJsonValue },
  });

  if (Date.now() - lastCleanupAt < 24 * 60 * 60 * 1000) return;
  try {
    await prisma.sociabuzzEvent.deleteMany({
      where: { createdAt: { lt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } },
    });
    lastCleanupAt = Date.now();
  } catch (error) {
    console.error('[SociaBuzz] Failed to clean up expired events:', error);
  }
}
