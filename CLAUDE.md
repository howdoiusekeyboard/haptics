# react-haptics

## Package manager

Bun only. Use `bun`, `bunx`, `bun run`. Never npm/npx/yarn.

## Architecture

```
src/
  types.ts       — Vibration, HapticPattern type definitions
  engine.ts      — Platform detection (isIOS, isVibrationSupported), iosTick(), schedulePattern(), toVibrateSequence()
  presets.ts     — 7 built-in patterns (selection, impact-light/medium/heavy, success, warning, error)
  provider.tsx   — HapticsProvider context + capture-phase click listener
  use-haptics.ts — useHaptics() hook (trigger, cancel, isSupported, isIOSSupported)
  index.ts       — Public API re-exports
  __tests__/
    setup.ts             — matchMedia stub for jsdom
    engine.test.ts       — Engine unit tests
    use-haptics.test.tsx — Hook + provider integration tests
```

## Commands

```bash
bun run build       # tsup → dual ESM/CJS in dist/
bun run test        # vitest run (jsdom)
bun run type-check  # tsc --noEmit
bun run dev         # tsup --watch
```

## Key patterns

- **"use client" injection**: tsup's `banner` config gets stripped by rollup's treeshake pass. The `onSuccess` hook in `tsup.config.ts` prepends the directive to both `dist/index.js` and `dist/index.cjs` post-build.
- **Capture-phase iOS trick**: `HapticsProvider` registers a capture-phase click listener on `document` that fires before React's synthetic event system. This preserves the native gesture chain iOS requires for Taptic Engine activation.
- **Module-level platform detection**: `isIOS` and `isVibrationSupported` are constants evaluated at module load time, not per-call. Guard with `typeof window !== "undefined"` checks.

## Testing setup

- Vitest + jsdom environment.
- `window.matchMedia` stubbed in `src/__tests__/setup.ts` (jsdom doesn't implement it).
- `navigator.vibrate` mocked per-test with `vi.fn()`.
- Fake timers (`vi.useFakeTimers()`) for `schedulePattern` and timing-dependent tests.

## Publish config

- `files: ["dist", "README.md", "LICENSE"]` — only these ship to npm.
- `sideEffects: false` for tree-shaking.
- Peer deps: `react >=18.0.0`, `react-dom >=18.0.0`.

## Conventions

- Strict TypeScript, no `any`.
- No default exports. Named exports only.
- Functional React components and hooks.
- `"use client"` directive on provider and hook (injected at build time on the bundle).
