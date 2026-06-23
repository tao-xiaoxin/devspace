import { rm } from "node:fs/promises";
import { rmSync } from "node:fs";
import { setTimeout as delay } from "node:timers/promises";

const RETRYABLE_REMOVE_ERRORS = new Set(["EBUSY", "ENOTEMPTY", "EPERM"]);

export async function removeTempDir(path: string): Promise<void> {
  let lastError: unknown;

  for (let attempt = 0; attempt < 8; attempt += 1) {
    try {
      await rm(path, { recursive: true, force: true });
      return;
    } catch (error) {
      if (!isRetryableRemoveError(error)) throw error;
      lastError = error;
      await delay(25 * (attempt + 1));
    }
  }

  throw lastError;
}

export function removeTempDirSync(path: string): void {
  let lastError: unknown;

  for (let attempt = 0; attempt < 8; attempt += 1) {
    try {
      rmSync(path, { recursive: true, force: true });
      return;
    } catch (error) {
      if (!isRetryableRemoveError(error)) throw error;
      lastError = error;
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 25 * (attempt + 1));
    }
  }

  throw lastError;
}

function isRetryableRemoveError(error: unknown): boolean {
  return (
    typeof error === "object"
    && error !== null
    && "code" in error
    && RETRYABLE_REMOVE_ERRORS.has(String(error.code))
  );
}
