import { randomUUID } from 'node:crypto';
import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { isProcessOwnerAlive, processIdentity, withRecordLock } from '@mearl/daemon-core';

/** Serialize operations across the Skill's independent command workers. */
export async function acquireLock(file: string, timeoutMs: number, label: string, signal?: AbortSignal): Promise<() => void> {
  const token = randomUUID();
  const deadline = Date.now() + timeoutMs;
  const owner = () => {
    try { return JSON.parse(readFileSync(file, 'utf8')); } catch { return undefined; }
  };
  for (;;) {
    signal?.throwIfAborted();
    const acquired = withRecordLock(file, () => {
      const current = owner();
      if (current && isProcessOwnerAlive(current)) return false;
      writeFileSync(file, JSON.stringify({ pid: process.pid, processIdentity: processIdentity(process.pid), token }), { mode: 0o600 });
      return true;
    });
    if (acquired) return () => withRecordLock(file, () => {
      if (owner()?.token === token) rmSync(file, { force: true });
    });
    if (Date.now() >= deadline) throw new Error(`Timed out waiting for ${label}`);
    await new Promise(resolve => setTimeout(resolve, 100));
  }
}
