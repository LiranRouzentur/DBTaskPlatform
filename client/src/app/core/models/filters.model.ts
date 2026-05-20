/** Tab on the task list. Pure-view: never round-trips to the server. */
export type StateFilter = 'all' | 'open' | 'closed';

/** Sort direction for client-side column sorts. */
export type SortDir = 'asc' | 'desc';

/** "No filter" sentinel from user/type pickers. Store converts -1 → null before the API sees it. */
export const ALL_VALUE = -1;
