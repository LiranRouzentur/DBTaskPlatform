# Styling rules

This document is the styling contract for the Angular 19 frontend. It captures the 10 rules the project is held to, the places to look first, and the patterns to copy.

## The 10 rules

1. **No inline `style=""`.** Static values belong in a stylesheet.
2. **No `[style]` / `[style.x]` / `[ngStyle]` unless dynamic-runtime.** Today's permitted uses are documented in the "Justified style bindings" table below; anything else needs a class.
3. **Globals are reserved for true global concerns:** reset, typography defaults, design tokens, the shared form control class, focus ring, screen-reader helper, shared `@keyframes`. Everything else goes in the owning component's CSS.
4. **CSS variables for repeated values.** Colors, spacing, radii, shadows, type sizes, motion timings — see [src/styles.css](src/styles.css). Add a token rather than repeating a literal 3+ times.
5. **No `::ng-deep`.** If you need to influence a child's styling, expose a CSS-variable hook from the inner element (e.g. `.tp-input` reads `--tp-input-border-color`) and write to it from `:host` on the outer. That is a documented downward contract, not an encapsulation breach.
6. **Semantic class names.** `.task-card`, `.assignee-cell`, `.link-button`. Not `div > span > button`.
7. **Shallow nesting.** Class-based selectors, depth ≤ 2 elements unless there is a specific reason.
8. **One form pattern.** `<tp-field label … [required]>` wraps `<input class="tp-input">` (or any composite). Field error state flows through the field's CSS variable hooks.
9. **No `!important`.** Use specificity carefully; if a 3rd-party rule fights back, document the reason inline.
10. **Standalone + OnPush** on every component. Templates readable. Encapsulation default.

## Where to look first

- **Design tokens** — [src/styles.css](src/styles.css) `:root` block (68 vars: colors, spacing 0..16, radii, shadows, type, motion, focus ring, breakpoints).
- **Global form control** — `.tp-input` in `src/styles.css`. Reads `--tp-input-border-color` and `--tp-input-ring` from a wrapping `:host` so wrappers can theme it without `::ng-deep`.
- **Form wrapper** — [src/app/core/ui/field/](src/app/core/ui/field/). Owns label/required/hint/errors markup and the `.has-error` state.
- **Shared animations** — `@keyframes tp-fade-in`, `tp-shimmer`, `tp-toast-in/out`, `tp-pulse` in `src/styles.css`. `prefers-reduced-motion: reduce` disables them.

## Justified style bindings

| Component | Binding | Why |
|---|---|---|
| `avatar.component.ts` | `[style.background]`, `[style.color]`, `[style.width.px]`, `[style.height.px]`, `[style.fontSize.px]` | Background/foreground are deterministic from a hash of the user's name (`TONES` array). Sizes are input-driven. |
| `user-picker.component.ts` | `[style.top.px]`, `[style.left.px]`, `[style.minWidth.px]` | Fixed-position popover; coordinates computed at runtime from the trigger's bounding rect. |
| `type-picker.component.ts` | Same three positioning bindings | Same reason. |
| `skeleton.component.ts` | `[style.width]`, `[style.height]` | Dimensions come from `width()` / `height()` signal inputs. |

These are the **only** permitted `[style.*]` bindings. Anything new should justify itself in the same way or use a class.

## When you add a new component

- Standalone, OnPush.
- File pair: `name.component.ts` (inline `template:` for short markup, or sibling `.html` for long ones — match neighbors) and `name.component.css`.
- Selectors prefixed with `.` and named for the role they play.
- If a value (color, spacing, radius, shadow, type size, duration) is going to appear in two other files, use the corresponding `var(--…)` instead of a literal. Add a token if one doesn't exist yet.
- If you need to react to a parent component's state, expose `--component-x` custom properties that the parent can override on its `:host`.

## Verification commands

```bash
git grep -n '::ng-deep' client/src/app/        # → 0 matches
git grep -nE 'style="' client/src/app/         # → 0 matches
git grep -n '#ffffff\|#fff[^a-fA-F0-9]' client/src/app/    # → 0 matches
git grep -n '!important' client/src/app/       # → 0 matches
```
