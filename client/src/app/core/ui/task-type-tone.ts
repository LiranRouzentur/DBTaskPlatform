import { BadgeTone } from './badge/badge.component';

// Stable tone-per-type assignment. Curated tones cover seeded types; new types hash into the
// pool for a deterministic, distinguishable colour.
/** Hand-picked tones for the two seeded task types — keeps Procurement/Development visually anchored. */
const CURATED_TONES: Readonly<Record<number, BadgeTone>> = {
  1: 'accent',   // Procurement
  2: 'success',  // Development
};

/** Fallback rotation for any new task type id — `typeId mod pool.length` keeps colours stable across reloads. */
const TONE_POOL: readonly BadgeTone[] = ['warning', 'danger', 'neutral', 'accent', 'success'];

/** Maps a task-type id to its badge tone. Curated entries win; unknown types pick deterministically from the pool. */
export function taskTypeTone(typeId: number): BadgeTone {
  return CURATED_TONES[typeId] ?? TONE_POOL[Math.abs(typeId) % TONE_POOL.length];
}
