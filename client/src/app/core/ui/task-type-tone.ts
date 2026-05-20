import { BadgeTone } from './badge/badge.component';

// Stable tone-per-type assignment. Curated tones cover seeded types; new types hash into the
// pool for a deterministic, distinguishable colour.
const CURATED_TONES: Readonly<Record<number, BadgeTone>> = {
  1: 'accent',   // Procurement
  2: 'success',  // Development
};

const TONE_POOL: readonly BadgeTone[] = ['warning', 'danger', 'neutral', 'accent', 'success'];

export function taskTypeTone(typeId: number): BadgeTone {
  return CURATED_TONES[typeId] ?? TONE_POOL[Math.abs(typeId) % TONE_POOL.length];
}
