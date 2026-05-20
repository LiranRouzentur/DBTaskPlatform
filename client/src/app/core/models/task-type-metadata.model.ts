// Mirrors the backend's StatusFieldKind/Spec/StatusDefinition/TaskType shape from /api/task-types.
// Capitalised literals match server enum names — keep in sync (CustomDataParser dispatches on them).

/** Mirrors server's StatusFieldKind enum. Adding a new kind requires server + CustomDataParser changes. */
export type FieldKind = 'String' | 'Number';

/** Per-field shape inside a status. Drives DynamicFormComponent — see frontend.md §7. */
export interface FieldSpecMetadata {
  /** Field identifier — used as the FormControl/FormArray name and humanised for the label. */
  readonly name: string;
  /** Type discriminator — DynamicFormComponent renders text vs number input based on this. */
  readonly kind: FieldKind;

  /** Scalar when 1, fixed-length FormArray when >1 (frontend.md §4 — no add/remove UI). */
  readonly itemCount: number;

  /** Optional lower bound — for Number, the min value; for String, the min length. */
  readonly min: number | null;

  /** Optional upper bound — for Number, the max value; for String, the max length. */
  readonly max: number | null;
}

/** Definition of one status within a TaskType — drives the change-status modal's per-status form. */
export interface StatusMetadata {
  /** Status code (1-based, monotonic per type). Forward-by-one transition rule applies. */
  readonly status: number;
  /** Display name shown in the workflow stepper. */
  readonly name: string;
  /** Field specs that customData for this status must satisfy. */
  readonly fields: readonly FieldSpecMetadata[];
}

/** Full task-type schema row served from GET /api/task-types — cached in TasksStore at bootstrap. */
export interface TaskTypeMetadata {
  /** Task-type id. */
  readonly id: number;
  /** Display name (e.g. "Procurement", "Development"). */
  readonly name: string;
  /** Terminal status code — reaching this closes the task (closed-task immutability per project.md §4). */
  readonly finalStatus: number;
  /** Ordered list of status definitions for this type. */
  readonly statuses: readonly StatusMetadata[];
}
