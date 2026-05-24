import type { App, InjectionKey } from "vue";
import { PRESETS, attachHaptics } from "@haptics/core";
import type { HapticPattern } from "@haptics/core";

export interface HapticsPluginOptions {
	/** Custom patterns merged with built-in presets. Same-name customs override. */
	patterns?: Record<string, HapticPattern>;
	/**
	 * Suppress haptics when `prefers-reduced-motion: reduce` is active. Default: `false`.
	 * The CSS query targets visual animation; iOS has a separate System Haptics toggle.
	 */
	respectReducedMotion?: boolean;
	/**
	 * Outline injected iOS overlays + log attach/detach events via console.debug.
	 * Pure development aid. Default: false.
	 */
	debugOverlay?: boolean;
	/**
	 * Play a WebAudio click cue on desktop browsers (no Vibration API, not iOS).
	 * Lazy-loaded — no bundle cost when omitted. Default: false.
	 */
	audioFallback?: boolean;
}

export interface HapticsContext {
	patterns: Record<string, HapticPattern>;
	respectReducedMotion: boolean;
}

export const HAPTICS_INJECTION_KEY: InjectionKey<HapticsContext> =
	Symbol("haptics");

let _cleanup: (() => void) | null = null;

export const HapticsPlugin = {
	install(app: App, options: HapticsPluginOptions = {}) {
		// Idempotent: tear down handlers from a prior install before re-attaching.
		// Guards against HMR, repeated app.use() calls in tests, and multiple Vue apps.
		_cleanup?.();
		_cleanup = null;

		const patterns: Record<string, HapticPattern> = {
			...PRESETS,
			...options.patterns,
		};
		const respectReducedMotion = options.respectReducedMotion ?? false;

		app.provide(HAPTICS_INJECTION_KEY, { patterns, respectReducedMotion });

		_cleanup = attachHaptics({
			respectReducedMotion,
			debugOverlay: options.debugOverlay ?? false,
			audioFallback: options.audioFallback ?? false,
			getPattern: (name) =>
				Object.prototype.hasOwnProperty.call(patterns, name)
					? patterns[name]
					: undefined,
		});
	},
};

/** @internal Tear down listeners and reset config. For tests and HMR. */
export function _resetPlugin(): void {
	_cleanup?.();
	_cleanup = null;
}
