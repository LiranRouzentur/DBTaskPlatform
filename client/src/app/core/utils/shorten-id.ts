/** Display formatter for task ids (`123` → `#0123`). Fixed width keeps list columns aligned monospaced. */
export function shortenTaskId(id: number): string {
  return '#' + String(id).padStart(4, '0');
}
