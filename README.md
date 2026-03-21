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

Existing `react-haptics` users: the package still works. No migration needed.

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
| Android Chrome | `navigator.vibrate()` | Full pattern support with timing sequences. |
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

## Limitations

**iOS imperative trigger**: `trigger()` from `useHaptics()` attempts a best-effort iOS haptic via `schedulePattern()`, but it only works when called directly within a user gesture context (click/tap handler in the same call stack). For reliable iOS haptics, use declarative `data-haptic` attributes with `HapticsProvider`.

**Desktop**: All calls are silent no-ops. No haptic hardware exists on desktop browsers.

**System haptics**: iOS haptics require the user's system haptics setting to be enabled (Settings > Sounds & Haptics > System Haptics).

## License

MIT
