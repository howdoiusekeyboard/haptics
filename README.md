# haptics

<p>
  <a href="https://github.com/howdoiusekeyboard/haptics/actions/workflows/ci.yml"><img src="https://github.com/howdoiusekeyboard/haptics/actions/workflows/ci.yml/badge.svg" alt="CI" /></a>
  <a href="https://www.npmjs.com/package/@haptics/react"><img src="https://img.shields.io/npm/dm/@haptics/react.svg?label=npm%20downloads" alt="npm downloads" /></a>
  <a href="https://bundlephobia.com/package/@haptics/react"><img src="https://img.shields.io/bundlephobia/minzip/@haptics/react?label=%40haptics%2Freact%20gzip" alt="bundle size" /></a>
  <a href="https://github.com/howdoiusekeyboard/haptics/blob/main/LICENSE"><img src="https://img.shields.io/github/license/howdoiusekeyboard/haptics" alt="license" /></a>
</p>

**Haptic feedback for the web — actually works on iOS Safari.**
~1 KB gzip per adapter. React, Vue, Svelte, or any framework.

> [!NOTE]
> A short demo of the haptic firing on a real iPhone goes here once recorded. See [`assets/hero.gif`](./assets/hero.gif).

## Packages

| Package | Version | Size (gzip) | Description |
| --- | --- | --- | --- |
| [`@haptics/core`](./packages/core) | [![npm](https://img.shields.io/npm/v/@haptics/core)](https://www.npmjs.com/package/@haptics/core) | 1.33 KB | Framework-agnostic engine |
| [`@haptics/react`](./packages/react) | [![npm](https://img.shields.io/npm/v/@haptics/react)](https://www.npmjs.com/package/@haptics/react) | 1.04 KB | React bindings |
| [`@haptics/vue`](./packages/vue) | [![npm](https://img.shields.io/npm/v/@haptics/vue)](https://www.npmjs.com/package/@haptics/vue) | 1.33 KB | Vue 3 bindings |
| [`@haptics/svelte`](./packages/svelte) | [![npm](https://img.shields.io/npm/v/@haptics/svelte)](https://www.npmjs.com/package/@haptics/svelte) | 1.09 KB | Svelte 5 bindings |
| [`@haptics/vanilla`](./packages/vanilla) | [![npm](https://img.shields.io/npm/v/@haptics/vanilla)](https://www.npmjs.com/package/@haptics/vanilla) | 0.89 KB | Zero-framework |

## The problem

Mobile browsers have two haptics paths, and both have friction:

- **Android**: `navigator.vibrate()` works, but every component needs to call it manually and there's no pattern abstraction
- **iOS**: Safari never implemented the Vibration API. The only web haptics path is the `<input type="checkbox" switch>` trick — but React 18's concurrent scheduler breaks the native gesture chain required for it to fire

## How this works

On iOS, the library injects an invisible `<input type="checkbox" switch>` overlay as a child of every `[data-haptic]` element. The user's finger lands on the overlay; iOS treats this as direct user interaction with a switch — the only path that survives Apple's iOS 26.5 patch — and fires native haptic feedback. The library re-dispatches the click to the host so consumer `onclick` handlers still run. iOS 17.4 – 26.4 additionally schedules subsequent ticks for multi-segment patterns via programmatic clicks on the same overlay; on iOS 26.5+ those programmatic clicks no-op and patterns degrade to a single tick.

On Android, the standard Vibration API is used with full pattern support.

A `MutationObserver` watches for dynamically-added `[data-haptic]` elements so SPAs and lazy-loaded components are picked up automatically. Elements opt in with a single attribute — no per-component wiring.

## Install

```bash
npm install @haptics/react    # React
npm install @haptics/vue      # Vue 3
npm install @haptics/svelte   # Svelte 5
npm install @haptics/vanilla  # No framework
npm install @haptics/core     # Engine only
```

> The legacy `react-haptics` and placeholder `svelte-haptics` packages are deprecated on npm. Existing `react-haptics` installs continue to function (it re-exports from `@haptics/react`), but new projects should install `@haptics/react` directly.

## Usage

Wrap your app with `HapticsProvider`:

```tsx
import { HapticsProvider } from "@haptics/react";

export default function App({ children }) {
  return <HapticsProvider>{children}</HapticsProvider>;
}
```

Add `data-haptic` attributes to interactive elements:

```tsx
<button data-haptic="success">Submit</button>
<button data-haptic="impact-heavy">Delete</button>
<a data-haptic="selection" href="/settings">Settings</a>
```

Or trigger imperatively via the hook:

```tsx
import { useHaptics } from "@haptics/react";

function SaveButton() {
  const { trigger } = useHaptics();

  const handleSave = async () => {
    const ok = await save();
    trigger(ok ? "success" : "error");
  };

  return (
    <button data-haptic="impact-medium" onClick={handleSave}>
      Save
    </button>
  );
}
```

### Vue

```ts
import { HapticsPlugin } from "@haptics/vue";

app.use(HapticsPlugin);
```

```vue
<button v-haptic="'success'">Save</button>
```

Or use the composable:

```ts
const { trigger } = useHaptics();
trigger("success");
```

### Svelte

```svelte
<script>
  import { setupHaptics, haptic } from '@haptics/svelte';
  setupHaptics();
</script>

<button use:haptic={'success'}>Save</button>
```

### Vanilla JS

```ts
import { Haptics } from "@haptics/vanilla";

const haptics = new Haptics();
// Any <button data-haptic="success"> now triggers haptics on click
// Or imperatively: haptics.trigger("success");
```

### Plain HTML via `<script>` tag (2.1.0)

`@haptics/vanilla` ships a self-contained IIFE bundle for use without a bundler — HTMX, Alpine.js, plain HTML pages.

```html
<script src="https://unpkg.com/@haptics/vanilla"></script>
<script>
  const haptics = new Haptics();
  document.querySelector("#save").addEventListener("click", () =>
    haptics.trigger("success"),
  );
</script>
```

The script tag makes `window.Haptics` (the class) and `window.HapticsLib` (the full module) available.

## Presets

| Name | Feel | Use case |
| --- | --- | --- |
| `selection` | Light tick | Toggles, minor state changes |
| `impact-light` | Subtle tap | Gentle acknowledgment |
| `impact-medium` | Standard tap | Button presses, navigation |
| `impact-heavy` | Strong tap | Destructive actions, confirmations |
| `success` | Rising confirmation | Form submit, save complete |
| `warning` | Attention pulse | Validation warning |
| `error` | Sharp rejection | Failed action, critical error |

## Custom patterns

```tsx
import { HapticsProvider } from "@haptics/react";

const patterns = {
  "card-tap": [
    { duration: 12, intensity: 0.5 },
    { delay: 20, duration: 12, intensity: 0.5 },
    { delay: 20, duration: 12, intensity: 0.5 },
  ],
};

<HapticsProvider patterns={patterns}>
  <button data-haptic="card-tap">Tap me</button>
</HapticsProvider>;
```

Custom patterns are merged with built-in presets. Same-name customs override the preset.

## Configuration

| Prop | Type | Default | Description |
| --- | --- | --- | --- |
| `respectReducedMotion` | `boolean` | `false` | Suppresses haptics when `prefers-reduced-motion: reduce` is active. Default is off because the CSS query targets visual animation, not haptic feedback — iOS has a dedicated System Haptics toggle. Opt in if you want Reduce Motion to also gate haptics. |
| `patterns` | `Record<string, HapticPattern>` | `{}` | Custom patterns merged with built-in presets |
| `debugOverlay` | `boolean` | `false` | Outline injected iOS overlays with a dashed border and emit `console.debug` logs on attach/detach. Dev aid for tracing where overlays land and which `MutationObserver`-driven mounts pick them up. (2.1.0) |
| `audioFallback` | `boolean` | `false` | Play a WebAudio click cue on desktop browsers (no Vibration API, not iOS). Lazy-loaded — consumers who omit this pay no bundle cost. (2.1.0) |

### Trigger options

`trigger(name, options?)` on every adapter accepts:

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `repeat` | `boolean` | `false` | Loop the pattern continuously until `cancel()` is called. Android path only — iOS triggers remain best-effort single-tick per call. Second call with `repeat: true` replaces the prior loop. (2.1.0) |

## Platform support

| Platform | Mechanism | Notes |
| --- | --- | --- |
| iOS Safari 17.4 – 26.4 | Switch overlay + programmatic re-tick | Full multi-tick patterns. Requires system haptics enabled. |
| iOS Safari 26.5+ | Switch overlay (single tick) | One tick per user tap. Apple's 26.5 patch closed every programmatic-toggle path, so multi-segment presets degrade to single-tick. Single-tick presets (`selection`) are unaffected. |
| Android Chrome / Edge | `navigator.vibrate()` | Full pattern support with timing sequences. |
| Samsung Internet | `navigator.vibrate()` | Full pattern support. |
| Firefox Android | Not supported | Vibration API removed in Firefox 129 (Aug 2024). |
| Desktop | No-op | No haptic hardware. All calls resolve silently. |

## API

### `<HapticsProvider>`

Wraps your app. Registers a capture-phase click listener for iOS haptics. Without it, `data-haptic` attributes won't fire on iOS.

### `useHaptics()`

Returns:

- `trigger(action)` — fire a haptic pattern by name (preset or custom)
- `cancel()` — stop active vibration (Android only)
- `isSupported` — `true` if the Vibration API is available (Android/Chrome)
- `isIOSSupported` — `true` if iOS haptics are available

Works with or without HapticsProvider — falls back to built-in presets.

### Core engine

For framework-agnostic or custom integrations:

```ts
import {
  isIOS,
  isVibrationSupported,
  iosTick,
  schedulePattern,
  toVibrateSequence,
  PRESETS,
} from "@haptics/core";
```

## Bundle size

Sizes measured after minification + gzip (level 9) — what a production bundler will actually ship.

| Package | ESM (min + gz) | CJS (min + gz) |
| --- | --- | --- |
| `@haptics/core` | 1.85 KB | 1.88 KB |
| `@haptics/react` | 0.67 KB | 0.77 KB |
| `@haptics/vue` | 0.67 KB | 0.77 KB |
| `@haptics/svelte` | 0.61 KB | 0.71 KB |
| `@haptics/vanilla` | 0.58 KB | 0.69 KB |

Framework adapter sizes exclude the workspace `@haptics/core` dependency (~1.85 KB min+gz), which is resolved by the consumer's bundler. A typical React consumer ships ~2.52 KB total (adapter + core).

## Limitations

**iOS 26.5+ multi-tick presets** degrade to a single tick. Apple's 26.5 patch closed every programmatic mechanism for firing additional ticks (synchronous `.click()` chains, fresh switches per tick, `setTimeout` chains, stacked switches — all verified to deliver ≤1 buzz). `success`, `error`, `warning`, `impact-light`, `impact-medium`, `impact-heavy` all fire only their first tick on 26.5+. `selection` (single tick) is unaffected. iOS 17.4 – 26.4 retains full multi-tick. Android retains full vibration sequences.

**iOS imperative trigger**: `trigger()` from `useHaptics()` / `createHaptics()` attempts a best-effort iOS haptic via `schedulePattern()`, but it only works when called directly within a user gesture context on iOS 17.4 – 26.4. On iOS 26.5+, programmatic triggers from JS no longer fire — the library's overlay only fires haptic on a real user tap on a `data-haptic` element. For reliable iOS haptics on every version, use declarative `data-haptic` attributes with `HapticsProvider` (React), `HapticsPlugin` (Vue), or `setupHaptics()` (Svelte).

**Re-dispatched click events have `event.isTrusted === false`** on the consumer's `data-haptic` element (iOS path). The user's actual tap lands on the library's invisible switch overlay; the click is then re-dispatched to the host element so consumer `onclick` handlers still run. Consumer code that gates behavior on `isTrusted` (rare — mainly some form libraries and analytics SDKs) won't see these clicks as trusted. The vast majority of click handlers, including every framework's synthetic event system, treat the re-dispatched click identically to a direct one.

**HTML validity of `<button data-haptic>`**: the iOS overlay is appended as a child of `[data-haptic]` elements. The HTML spec's `<button>` content model excludes interactive descendants, so HTML validators will flag this combination. Every browser renders and clicks it correctly. If you run a validation step in CI, configure it to allow the `data-haptic-overlay` attribute on `<input>` descendants of `<button>`.

**Desktop**: All calls are silent no-ops. No haptic hardware exists on desktop browsers.

**System haptics**: iOS haptics require the user's system haptics setting to be enabled (Settings > Sounds & Haptics > System Haptics).

**Shadow DOM**: The capture-phase listener uses `closest()`, which does not pierce closed shadow trees. Clicks originating inside a closed shadow root match only the host element. If you need `data-haptic` annotations *inside* a shadow tree to fire, attach a `Haptics` instance from `@haptics/vanilla` with `delegateFrom` set to the shadow root.

**Multi-instance state**: The Vue and Svelte adapters store the active config in module-level state — installing the plugin twice in the same JS context (or instantiating multiple Svelte apps) is idempotent, but the most-recently-installed configuration wins for all consumers. The React adapter is per-provider-scope and not affected.

**Pattern length cap**: Patterns are clamped to 64 segments and a total scheduled offset of 60 seconds. Runaway patterns from buggy or untrusted input are truncated rather than queueing thousands of timers.

**`prefers-reduced-motion`**: Not honored by default (changed in 2.0.0). The CSS query targets visual animation, not haptic feedback; iOS provides a separate System Haptics toggle for haptic preference. Pass `respectReducedMotion={true}` if you want Reduce Motion to also gate haptics.

**`event.defaultPrevented`**: The Vue directive and Svelte action skip the haptic when the click was already `preventDefault`'d by an earlier handler. The capture-phase listeners (provider / plugin / setupHaptics) run before bubble-phase `preventDefault` calls, so they always fire — useful for haptics on links that the framework intercepts for client-side navigation.

## FAQ

### Why doesn't `trigger()` from `useEffect` or a `try/catch` fire on iOS?

Safari requires haptics calls to originate inside a native user gesture stack — the synchronous call path from a click/tap/keydown handler. Any call that resumes after `await`, fires from `useEffect`, runs inside a `setTimeout`/`setInterval`, or sits inside a `try/catch` whose synchronous path has already returned will not fire haptic on iOS. The library's `trigger()` is best-effort: it tries `iosTick()` regardless, but iOS only fires the Taptic Engine when the call is still inside the original user gesture.

The reliable iOS path is **declarative**:

```tsx
<button data-haptic="success" onClick={handleSave}>Save</button>
```

With `HapticsProvider`/`HapticsPlugin`/`setupHaptics`/`Haptics` installed, the library attaches an invisible switch overlay on iOS. The user's tap lands on the overlay (a real native gesture) and fires haptic before your handler runs. The handler can do anything — `await`, dispatch reducers, `try/catch`, fetch, throw — the haptic has already fired.

Android is more permissive: `navigator.vibrate()` can be called from anywhere (including inside `useEffect` or after `await`) and will fire normally. Only iOS has the user-gesture constraint.

### Multi-tick presets only fire one tick on my iPhone

Expected on iOS 26.5+. Apple's 26.5 patch closed every programmatic mechanism for firing a second tick (synchronous `.click()` chains, fresh switches per tick, `setTimeout` chains, stacked switches — all verified to deliver ≤1 buzz). Single-tick presets like `selection` are unaffected. iOS 17.4–26.4 retains full multi-tick.

### How do I hear the haptic on my laptop while developing?

Pass `audioFallback: true` to the provider/plugin/`setupHaptics`/`Haptics` constructor (2.1.0). The library loads a tiny WebAudio module on demand and plays a filtered click sound on desktop browsers. The audio module is lazy-loaded — opt in to pay the bundle cost only when you want it.
