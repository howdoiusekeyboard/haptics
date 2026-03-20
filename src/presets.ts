import type { Vibration } from "./types";

export const PRESETS = {
	/** Light tick for toggles and minor state changes */
	selection: [{ duration: 15, intensity: 0.6 }],

	/** Subtle tap — gentle acknowledgment */
	"impact-light": [
		{ duration: 20, intensity: 0.4 },
		{ delay: 15, duration: 10, intensity: 0.2 },
	],

	/** Standard tap — button presses, navigation */
	"impact-medium": [
		{ duration: 25, intensity: 0.7 },
		{ delay: 12, duration: 15, intensity: 0.4 },
	],

	/** Strong tap — destructive actions, important confirmations */
	"impact-heavy": [
		{ duration: 40, intensity: 1.0 },
		{ delay: 10, duration: 25, intensity: 0.6 },
	],

	/** Rising confirmation — form submission, save complete */
	success: [
		{ duration: 30, intensity: 0.3 },
		{ delay: 15, duration: 40, intensity: 0.6 },
		{ delay: 10, duration: 50, intensity: 1.0 },
	],

	/** Attention pulse — validation warning, needs attention */
	warning: [
		{ duration: 35, intensity: 0.8 },
		{ delay: 30, duration: 20, intensity: 0.5 },
		{ delay: 25, duration: 35, intensity: 0.8 },
	],

	/** Sharp rejection — failed action, critical error */
	error: [
		{ duration: 40, intensity: 1.0 },
		{ delay: 50, duration: 30, intensity: 0.7 },
		{ delay: 40, duration: 20, intensity: 0.4 },
	],
} as const satisfies Record<string, Vibration[]>;

export type PresetName = keyof typeof PRESETS;
