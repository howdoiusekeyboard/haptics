// Components
export { HapticsProvider } from "./provider";
export type { HapticsProviderProps, HapticsContextValue } from "./provider";

// Hooks
export { useHaptics } from "./use-haptics";

// Presets
export { PRESETS } from "./presets";
export type { PresetName } from "./presets";

// Types
export type { Vibration, HapticPattern } from "./types";

// Engine (advanced — for custom integrations)
export {
	iosTick,
	schedulePattern,
	toVibrateSequence,
	isIOS,
	isVibrationSupported,
} from "./engine";
