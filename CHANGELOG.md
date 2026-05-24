# Changelog

All notable changes to this project will be documented in this file.

Format based on [Keep a Changelog](https://keepachangelog.com/).

## [2.0.0] - 2026-05-24

### Fixed

- **iOS 26.5+ haptic firing.** Apple's iOS 26.5 patch closed the `<label>.click()` → `<input type="checkbox" switch>` synthetic-click trick that the entire 1.0.x line (and every other web haptics library) relied on. The new mechanism injects an invisible switch overlay as a child of every `[data-haptic]` element; the user's tap lands on the overlay (iOS reads it as user-direct switch interaction, the only path that survives the patch) and a click is re-dispatched to the host so consumer `onclick` handlers still run. Verified on real iOS 26.5 hardware.

### Added

- `attachHaptics(options)` in `@haptics/core` — the new entry point used by every adapter. Scans a root for haptic-triggering elements, installs the platform-appropriate handler (iOS switch overlay or Android click listener), and watches via `MutationObserver` for elements rendered later. Returns a teardown function.
- `AttachHapticsOptions.selector` for matching elements by any CSS selector (default `[data-haptic]`).
- `AttachHapticsOptions.respectReducedMotion` — when `prefers-reduced-motion: reduce` is active, iOS overlays go `pointer-events: none` so user taps pass through without firing native haptic; Android skips `navigator.vibrate`.

### Changed

- All four adapters (`@haptics/react`, `@haptics/vue`, `@haptics/svelte`, `@haptics/vanilla`) now delegate to `attachHaptics` for click delegation. The shared `matchMedia` listener and document capture-phase listener that each adapter maintained have moved into core. Per-adapter bundles shrank 80–330 B gz; core grew ~960 B gz; net consumer delta lands in the 0.64–0.88 KB range.
- `@haptics/vue` `v-haptic` directive simplified to only set/remove the `data-haptic` attribute; the directive no longer attaches its own click listener (the plugin's `attachHaptics` install handles it).

### Known limitations on iOS 26.5+

- **Multi-tick presets degrade to a single tick.** `success` (3 ticks), `error` (3 ticks), `warning` (3 ticks), `impact-light/medium/heavy` (2 ticks) all fire only their first tick on iOS 26.5+ because every programmatic mechanism for triggering a second tick was closed by Apple's patch (synchronous `sw.click()`, fresh switch per tick, `setTimeout` chains, stacked switches — all verified to deliver ≤1 buzz). `selection` (single tick) is unaffected. iOS 17.4–26.4 retains full multi-tick. Android retains full vibration sequences.
- **Re-dispatched clicks have `event.isTrusted === false`.** Consumer code that gates behavior on `isTrusted` (rare — mainly some form libraries and analytics SDKs) won't see the user's tap as trusted. The vast majority of click handlers, including every framework's synthetic event system, are unaffected.
- **The overlay is appended as a child of `[data-haptic]` elements**, including `<button>`. The HTML spec's button content model excludes interactive descendants — every browser renders and clicks this correctly, but HTML validators will flag it. Document accordingly if you run a validation step in CI.
- **`position: relative` is forced on hosts whose computed position is `static`.** This is required for the absolute-positioned overlay to anchor to the host. For block-level elements (`<button>`, `<div>`) this is a no-op layout change. For inline elements (`<a data-haptic>`, `<span data-haptic>`), it can subtly affect text wrapping in surrounding content. Use a block-level container for haptic-triggering inline content if precise layout matters.

### Changed (behavior)

- **`respectReducedMotion` now defaults to `false`** across every adapter and the `attachHaptics` core API. The CSS `prefers-reduced-motion: reduce` media query targets visual animation, not haptic feedback — iOS exposes a dedicated System Haptics toggle (Settings → Sounds & Haptics) for haptic preference. The previous default suppressed haptics for users who enabled Reduce Motion for motion-sickness or animation-specific reasons, which felt like the library was silently broken on those devices. Apps that explicitly want haptics suppressed when Reduce Motion is active should pass `respectReducedMotion: true` (on the provider/plugin/`setupHaptics`/`Haptics` constructor).

### Breaking

- **`@haptics/svelte` `use:haptic`** no longer self-attaches a click listener — `setupHaptics()` must be called from a parent component for the action to wire up haptics. Apps already calling `setupHaptics` in their root layout are unaffected. Apps that used the action standalone need to add one `setupHaptics()` call in their layout.

## [1.0.1] - 2026-05-20

### Deprecated

- `react-haptics` on npm — superseded by `@haptics/react`. The package remains installable (re-exports from `@haptics/react` + `@haptics/core`) but now surfaces a deprecation notice on install.
- `svelte-haptics` on npm — was a placeholder; use `@haptics/svelte`.

### Infrastructure

- Publish workflow migrated to npm Trusted Publishing (OIDC). The long-lived `NPM_TOKEN` secret is no longer used; each package's publish access on npm is configured to `Require 2FA and disallow tokens`, with GitHub Actions registered as a trusted publisher.

### Fixed

- All adapters now reject `data-haptic` values that resolve to inherited object properties (`__proto__`, `constructor`, `toString`, etc.). Previously, these would resolve to `Object.prototype` and throw inside the click handler.
- `@haptics/vue` plugin and `@haptics/svelte` `setupHaptics` no longer leak `matchMedia` and `document` click listeners. Re-installation is idempotent — the prior install's listeners are torn down first.
- `@haptics/svelte` `createHaptics()` now exposes a `destroy()` method to release its `matchMedia` listener; existing callers should pair this with `onDestroy`.
- `@haptics/core` `toVibrateSequence` coerces negative, `NaN`, and fractional values to non-negative integers — guards against `TypeError` throws on some Android Vibration API implementations.
- `@haptics/core` `schedulePattern` clamps pattern length to 64 segments and total scheduled offset to 60 seconds.
- `@haptics/core` `schedulePattern` returns a cancel function; all capture-phase adapter listeners now call it on teardown so in-flight iOS patterns don't continue firing after unmount or SPA navigation.
- `@haptics/core` `iosTick` falls back to `document.documentElement` when `document.body` is unavailable (early `<head>` script execution).
- The Vue `v-haptic` directive and Svelte `use:haptic` action skip the haptic when the click was already `preventDefault`'d by an earlier handler.

## [1.0.0] - 2026-03-20

### Added

- `HapticsProvider` component with capture-phase click listener for iOS Safari haptics.
- `useHaptics` hook with `trigger`, `cancel`, `isSupported`, and `isIOSSupported`.
- 7 built-in presets: selection, impact-light, impact-medium, impact-heavy, success, warning, error.
- Custom pattern support via `patterns` prop on provider.
- Reduced-motion support (`prefers-reduced-motion` respected by default).
- Engine exports (`iosTick`, `schedulePattern`, `toVibrateSequence`, `isIOS`, `isVibrationSupported`) for custom integrations.
- Dual ESM/CJS build with `"use client"` directive.
