import { Signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { AbstractControl, FormControl, FormControlStatus } from '@angular/forms';

/** Picker → form setter. Marks touched + dirty so validators surface and dirty-guard activates.
 *  Plain `setValue` alone would leave the control pristine, hiding validation errors until blur. */
export function setControl<T>(ctrl: FormControl<T>, value: T): void {
  // Write the value first so the touched/dirty flags below reflect the post-set state.
  ctrl.setValue(value);
  // Touched flips the "show errors" gate in <tp-field> — required since picker writes bypass the user blur event.
  ctrl.markAsTouched();
  // Dirty drives the unsaved-changes guard; otherwise a programmatic write would look pristine.
  ctrl.markAsDirty();
}

/** Bridges a control's value Observable to a Signal; initialValue avoids `undefined` first emission. */
export function formSignal<T>(ctrl: FormControl<T>): Signal<T> {
  // Seed with `ctrl.value` so consumers get a defined value synchronously on subscribe.
  return toSignal(ctrl.valueChanges, { initialValue: ctrl.value });
}

/** Status counterpart of `formSignal`. Drives valid/invalid computeds without polling `ctrl.status`. */
export function formStatusSignal(ctrl: AbstractControl): Signal<FormControlStatus> {
  // Same seeding pattern as `formSignal` — `statusChanges` doesn't replay on subscribe.
  return toSignal(ctrl.statusChanges, { initialValue: ctrl.status });
}
