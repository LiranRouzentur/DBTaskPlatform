import { Signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { AbstractControl, FormControl, FormControlStatus } from '@angular/forms';

/** Picker → form setter. Marks touched + dirty so validators surface and dirty-guard activates. */
export function setControl<T>(ctrl: FormControl<T>, value: T): void {
  ctrl.setValue(value);
  ctrl.markAsTouched();
  ctrl.markAsDirty();
}

/** Bridges a control's value Observable to a Signal; initialValue avoids `undefined` first emission. */
export function formSignal<T>(ctrl: FormControl<T>): Signal<T> {
  return toSignal(ctrl.valueChanges, { initialValue: ctrl.value });
}

/** Status counterpart of `formSignal`. Drives valid/invalid computeds without polling. */
export function formStatusSignal(ctrl: AbstractControl): Signal<FormControlStatus> {
  return toSignal(ctrl.statusChanges, { initialValue: ctrl.status });
}
