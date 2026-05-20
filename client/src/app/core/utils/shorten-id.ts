/** Display formatter for task ids (`123` → `#0123`). Width is fixed so list columns align. */
export function shortenTaskId(id: number): string {
  return '#' + String(id).padStart(4, '0');
}
