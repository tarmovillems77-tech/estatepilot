import type { EntityMeta } from '@/domain/types';

export function newMeta(now = new Date().toISOString()): EntityMeta {
  return { id: crypto.randomUUID(), createdAt: now, updatedAt: now };
}
