# haptics

[![license](https://img.shields.io/github/license/howdoiusekeyboard/haptics)](https://github.com/howdoiusekeyboard/haptics/blob/main/LICENSE)

Haptic feedback for web apps. Works on iOS Safari (17.4+) and Android Chrome.

## Packages

| Package | Version | Description |
| --- | --- | --- |
| [`@haptics/core`](./packages/core) | [![npm](https://img.shields.io/npm/v/@haptics/core)](https://www.npmjs.com/package/@haptics/core) | Framework-agnostic engine |
| [`@haptics/react`](./packages/react) | [![npm](https://img.shields.io/npm/v/@haptics/react)](https://www.npmjs.com/package/@haptics/react) | React bindings |
| [`@haptics/vue`](./packages/vue) | [![npm](https://img.shields.io/npm/v/@haptics/vue)](https://www.npmjs.com/package/@haptics/vue) | Vue 3 bindings |
| [`@haptics/svelte`](./packages/svelte) | [![npm](https://img.shields.io/npm/v/@haptics/svelte)](https://www.npmjs.com/package/@haptics/svelte) | Svelte 5 bindings |
| [`@haptics/vanilla`](./packages/vanilla) | [![npm](https://img.shields.io/npm/v/@haptics/vanilla)](https://www.npmjs.com/package/@haptics/vanilla) | Zero-framework |

## The problem

Mobile browsers have two haptics paths, and both have friction:

- **Android**: `navigator.vibrate()` works, but every component needs to call it manually and there's no pattern abstraction
- **iOS**: Safari never implemented the Vibration API. The only web haptics path is the `<input type="checkbox" switch>` trick — but React 18's concurrent scheduler breaks the native gesture chain required for it to fire

## How this works

A capture-phase event listener on `document` fires **before** the framework's event system. From iOS Safari's perspective, the haptic trigger runs inside a direct native click handler — keeping the user gesture context intact.

On Android, the standard Vibration API is used with pattern support.

Elements opt in with a single attribute. No per-component wiring.

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
| `respectReducedMotion` | `boolean` | `true` | Suppresses haptics when `prefers-reduced-motion: reduce` is active |
| `patterns` | `Record<string, HapticPattern>` | `{}` | Custom patterns merged with built-in presets |

## Platform support

| Platform | Mechanism | Notes |
| --- | --- | --- |
| iOS Safari 17.4+ | Checkbox-switch trick | One tick per segment. Requires system haptics enabled. |
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

| Package | ESM (gzip) | CJS (gzip) |
| --- | --- | --- |
| `@haptics/core` | 1.33 KB | 1.36 KB |
| `@haptics/react` | 1.04 KB | 1.06 KB |
| `@haptics/vue` | 1.33 KB | 1.34 KB |
| `@haptics/svelte` | 1.09 KB | 1.11 KB |
| `@haptics/vanilla` | 0.89 KB | 0.90 KB |
| `react-haptics` | 0.23 KB | 0.33 KB |

Framework adapter sizes exclude the workspace `@haptics/core` dependency (~1.33 KB gz), which is resolved by the consumer's bundler.

## Limitations

**iOS imperative trigger**: `trigger()` from `useHaptics()` / `createHaptics()` attempts a best-effort iOS haptic via `schedulePattern()`, but it only works when called directly within a user gesture context (click/tap handler in the same call stack). For reliable iOS haptics, use declarative `data-haptic` attributes with `HapticsProvider` (React), `HapticsPlugin` (Vue), or `setupHaptics()` (Svelte).

**Desktop**: All calls are silent no-ops. No haptic hardware exists on desktop browsers.

**System haptics**: iOS haptics require the user's system haptics setting to be enabled (Settings > Sounds & Haptics > System Haptics).

**Shadow DOM**: The capture-phase listener uses `closest()`, which does not pierce closed shadow trees. Clicks originating inside a closed shadow root match only the host element. If you need `data-haptic` annotations *inside* a shadow tree to fire, attach a `Haptics` instance from `@haptics/vanilla` with `delegateFrom` set to the shadow root.

**Multi-instance state**: The Vue and Svelte adapters store the active config in module-level state — installing the plugin twice in the same JS context (or instantiating multiple Svelte apps) is idempotent, but the most-recently-installed configuration wins for all consumers. The React adapter is per-provider-scope and not affected.

**Pattern length cap**: Patterns are clamped to 64 segments and a total scheduled offset of 60 seconds. Runaway patterns from buggy or untrusted input are truncated rather than queueing thousands of timers.

**`prefers-reduced-motion`**: Honored by default. Calls are suppressed when the user has enabled reduced motion at the OS level. Pass `respectReducedMotion={false}` to override.

**`event.defaultPrevented`**: The Vue directive and Svelte action skip the haptic when the click was already `preventDefault`'d by an earlier handler. The capture-phase listeners (provider / plugin / setupHaptics) run before bubble-phase `preventDefault` calls, so they always fire — useful for haptics on links that the framework intercepts for client-side navigation.
