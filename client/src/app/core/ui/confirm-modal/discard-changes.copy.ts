// Single source of truth for the "unsaved changes" prompt across every form-bearing modal.
export const DISCARD_CHANGES_COPY = {
  title: 'Discard your changes?',
  body: 'You have unsaved input on this form. Closing now will throw it away. Continue?',
  confirmLabel: 'Discard',
  cancelLabel: 'Keep editing',
} as const;
