// fileLock.js
// Advisory file lock sederhana berbasis exclusive-create ('wx'), dipakai bareng
// oleh mailboxWriter.js dan circuitBreaker.ts supaya read-modify-write ke file
// yang sama aman lintas proses OS. Bukan pengganti proper distributed lock —
// cukup untuk skenario single-machine (Termux/PC) yang jadi target ant-cli.

import fs from 'node:fs';

const STALE_LOCK_MS = 5000; // lock lebih tua dari ini dianggap sisa proses yang crash

function sleepSync(ms: number) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

export function acquireLock(lockPath: string, { retries = 50, delayMs = 20 } = {}) {
  for (let i = 0; i < retries; i++) {
    try {
      const fd = fs.openSync(lockPath, 'wx');
      fs.writeFileSync(fd, String(process.pid));
      fs.closeSync(fd);
      return;
    } catch (err: any) {
      if (err.code !== 'EEXIST') throw err;

      try {
        const stat = fs.statSync(lockPath);
        if (Date.now() - stat.mtimeMs > STALE_LOCK_MS) {
          fs.unlinkSync(lockPath); // lock basi, kemungkinan proses pemegangnya sudah mati
          continue;
        }
      } catch {
        continue; // lock terlepas di antara statSync dan sekarang, coba lagi
      }

      sleepSync(delayMs);
    }
  }
  throw new Error(`[fileLock] Gagal mendapatkan lock setelah ${retries} percobaan: ${lockPath}`);
}

export function releaseLock(lockPath: string) {
  try {
    fs.unlinkSync(lockPath);
  } catch {
    // sudah terlepas, tidak masalah
  }
}

export function withLock<T>(lockPath: string, fn: () => T): T {
  acquireLock(lockPath);
  try {
    return fn();
  } finally {
    releaseLock(lockPath);
  }
}
