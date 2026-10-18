import { setTimeout } from 'node:timers/promises';
import { ProcessingError, RevisionConflict } from './contracts.js';

const MAX_ATTEMPTS = 3;

export interface RevisionRetryOptions<T> {
  /** Durable completion check; true means another delivery already finished. */
  isProcessed: () => Promise<boolean>;
  /**
   * One full attempt: load the aggregate revision, read fresh provider state,
   * and commit. Every retry calls it again, so no pre-conflict data is reused.
   */
  attempt: () => Promise<T>;
  /** Errors that mean "someone else wrote first"; defaults to RevisionConflict. */
  isRetryable?: (error: unknown) => boolean;
  /** Error code thrown when every attempt lost the race. */
  exhaustedCode?: string;
}

/**
 * Optimistic concurrency loop shared by every subscription processor.
 *
 * 1. Skip work that a previous delivery already completed (duplicate event).
 * 2. Run one attempt. The commit only succeeds if the aggregate revision is
 *    still the one this attempt loaded (compare-and-swap).
 * 3. If the attempt fails, check completion again: another worker may have
 *    finished the same event, or our commit succeeded but its response was lost.
 * 4. Retry a lost race after a short random pause; rethrow any other error.
 *
 * After a few attempts the error reaches the queue, which owns further retries
 * and eventual DLQ routing. Callers never acknowledge a job that threw.
 */
export async function retryOnRevisionConflict<T>({
  isProcessed,
  attempt,
  isRetryable = (error) => error instanceof RevisionConflict,
  exhaustedCode = 'concurrency_retry_exhausted',
}: RevisionRetryOptions<T>): Promise<T | { outcome: 'duplicate' }> {
  for (let attemptNumber = 0; attemptNumber < MAX_ATTEMPTS; attemptNumber++) {
    if (await isProcessed()) {
      return { outcome: 'duplicate' };
    }

    try {
      return await attempt();
    } catch (error) {
      if (await isProcessed()) {
        return { outcome: 'duplicate' };
      }

      if (!isRetryable(error)) {
        throw error;
      }

      // Jitter keeps two competing workers from colliding in lockstep again.
      await setTimeout(25 + Math.random() * 75);
    }
  }

  throw new ProcessingError(exhaustedCode);
}
