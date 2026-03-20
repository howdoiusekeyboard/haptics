# Changelog

All notable changes to this project will be documented in this file.

Format based on [Keep a Changelog](https://keepachangelog.com/).

## [1.0.0] - 2026-03-20

### Added

- `HapticsProvider` component with capture-phase click listener for iOS Safari haptics.
- `useHaptics` hook with `trigger`, `cancel`, `isSupported`, and `isIOSSupported`.
- 7 built-in presets: selection, impact-light, impact-medium, impact-heavy, success, warning, error.
- Custom pattern support via `patterns` prop on provider.
- Reduced-motion support (`prefers-reduced-motion` respected by default).
- Engine exports (`iosTick`, `schedulePattern`, `toVibrateSequence`, `isIOS`, `isVibrationSupported`) for custom integrations.
- Dual ESM/CJS build with `"use client"` directive.
