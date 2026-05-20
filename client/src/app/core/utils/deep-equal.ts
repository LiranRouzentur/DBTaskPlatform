/** Structural equality for JSON-shaped values; no support for Date/Map/Set/class/cycles.
 *  Used by dirty-tracking + change-detection to compare custom-data payloads without `JSON.stringify` round-trips. */
export function deepEqual(a: unknown, b: unknown): boolean {
  // Fast path — identical primitives or same reference; covers ~all unchanged-field comparisons.
  if (a === b) return true;
  // One side is null but not the other (reference check above already handled both-null); cannot be equal.
  if (a === null || b === null) return a === b;
  // Different primitive categories (string vs number, etc.) can never structurally match.
  if (typeof a !== typeof b) return false;

  // Arrays first — `typeof [] === 'object'`, so the object branch below would otherwise mishandle them.
  if (Array.isArray(a)) {
    // b must also be an array of the same length; mismatched length short-circuits the per-element walk.
    if (!Array.isArray(b) || a.length !== b.length) return false;
    // Recurse positionally — JSON arrays are order-sensitive.
    for (let i = 0; i < a.length; i++) {
      if (!deepEqual(a[i], b[i])) return false;
    }
    return true;
  }

  if (typeof a === 'object') {
    // Reject the array-vs-plain-object mismatch — `typeof [] === 'object'` would otherwise let them compare.
    if (typeof b !== 'object' || Array.isArray(b)) return false;
    // Cast to indexable shape so the key walk type-checks; safe because we've established both are non-null objects.
    const ao = a as Record<string, unknown>;
    const bo = b as Record<string, unknown>;
    // Snapshot key lists once; reading length & iterating from `aKeys` is cheaper than repeated property lookups.
    const aKeys = Object.keys(ao);
    const bKeys = Object.keys(bo);
    // Cardinality check before the per-key walk — extra keys on either side mean unequal.
    if (aKeys.length !== bKeys.length) return false;
    for (const k of aKeys) {
      // hasOwnProperty (not `in`) so inherited-prop pollution can't fake a match.
      if (!Object.prototype.hasOwnProperty.call(bo, k)) return false;
      if (!deepEqual(ao[k], bo[k])) return false;
    }
    return true;
  }

  // Unreachable for matching JSON-shape primitives (covered by `a === b`); guards against future type drift.
  return false;
}
