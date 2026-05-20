/** Display formatter for task ids (`123` → `#0123`). Fixed width keeps list columns aligned monospaced. */
export function shortenTaskId(id: number): string {
  // Width-4 left-pad — keeps the list column visually aligned for ids 1–9999; 5-digit ids overflow gracefully.
  return '#' + String(id).padStart(4, '0');
}
