import {
	PRESETS,
	isVibrationSupported,
	isIOS,
	toVibrateSequence,
	schedulePattern,
} from "@haptics/core";
import type { PresetName } from "@haptics/core";
import { getHapticsConfig } from "./context";

/** Options for the imperative `trigger()` call. */
export interface TriggerOptions {
	/**
	 * When true, the vibration pattern repeats continuously until `cancel()`
	 * is called. Loop affects the Android (Vibration API) path only — iOS
	 * triggers remain best-effort single-tick per call. Default: false.
	 */
	repeat?: boolean;
}

export interface HapticsController {
	trigger: (
		action: PresetName | (string & {}),
		options?: TriggerOptions,
	) => void;
	cancel: () => void;
	/** Release the matchMedia listener registered by this controller. Idempotent. */
	destroy: () => void;
	readonly isSupported: boolean;
	readonly isIOSSupported: boolean;
}

/**
 * Create an imperative haptics controller.
 *
 * Can be called inside a Svelte component's <script> block (will use
 * setupHaptics context if available) or outside components (falls back
 * to built-in presets).
 *
 * Register `destroy()` with onDestroy to release the matchMedia listener
 * when the component unmounts.
 *
 * @example
 * ```svelte
 * <script>
 *   import { onDestroy } from 'svelte';
 *   import { createHaptics } from '@haptics/svelte';
 *   const haptics = createHaptics();
 *   onDestroy(() => haptics.destroy());
 *   function handleSave() { haptics.trigger('success'); }
 * </script>
 * ```
 */
export function createHaptics(): HapticsController {
	const config = getHapticsConfig();
	const patterns = config?.patterns ?? PRESETS;
	const respectReducedMotion = config?.respectReducedMotion ?? false;

	let prefersReducedMotion = false;
	let mqlCleanup: (() => void) | null = null;
	let loopId: ReturnType<typeof setTimeout> | null = null;

	const clearLoop = () => {
		if (loopId !== null) {
			clearTimeout(loopId);
			loopId = null;
		}
	};

	if (typeof window !== "undefined" && window.matchMedia) {
		const mql = window.matchMedia("(prefers-reduced-motion: reduce)");
		prefersReducedMotion = mql.matches;
		const onChange = (e: MediaQueryListEvent) => {
			prefersReducedMotion = e.matches;
		};
		mql.addEventListener("change", onChange);
		mqlCleanup = () => mql.removeEventListener("change", onChange);
	}

	const trigger = (
		action: PresetName | (string & {}),
		options?: TriggerOptions,
	) => {
		if (respectReducedMotion && prefersReducedMotion) return;

		if (!Object.prototype.hasOwnProperty.call(patterns, action)) return;
		const pattern = patterns[action as keyof typeof patterns];
		if (!pattern) return;

		clearLoop();

		if (isVibrationSupported()) {
			const seq = toVibrateSequence(pattern);
			navigator.vibrate(seq);
			if (options?.repeat) {
				const totalMs = Math.max(
					1,
					seq.reduce((s, n) => s + n, 0),
				);
				const tick = () => {
					navigator.vibrate(seq);
					loopId = setTimeout(tick, totalMs);
				};
				loopId = setTimeout(tick, totalMs);
			}
		} else if (isIOS()) {
			schedulePattern(pattern);
		}
	};

	const cancel = () => {
		clearLoop();
		if (isVibrationSupported()) navigator.vibrate(0);
	};

	const destroy = () => {
		clearLoop();
		mqlCleanup?.();
		mqlCleanup = null;
	};

	return {
		trigger,
		cancel,
		destroy,
		isSupported: isVibrationSupported(),
		isIOSSupported: isIOS(),
	};
}
