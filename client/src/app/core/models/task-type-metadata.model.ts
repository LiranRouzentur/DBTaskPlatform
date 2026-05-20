// Mirrors the backend's StatusFieldKind/Spec/StatusDefinition/TaskType shape from /api/task-types.
// Capitalised literals match server enum names — keep in sync (CustomDataParser dispatches on them).

export type FieldKind = 'String' | 'Number';

export interface FieldSpecMetadata {
  readonly name: string;
  readonly kind: FieldKind;
  
  readonly itemCount: number;
  
  readonly min: number | null;
  
  readonly max: number | null;
}

export interface StatusMetadata {
  readonly status: number;
  readonly name: string;
  readonly fields: readonly FieldSpecMetadata[];
}

export interface TaskTypeMetadata {
  readonly id: number;
  readonly name: string;
  readonly finalStatus: number;
  readonly statuses: readonly StatusMetadata[];
}
