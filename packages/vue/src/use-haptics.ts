import { inject, ref, onMounted, onUnmounted } from "vue";
import {
	PRESETS,
	isVibrationSupported,
	isIOS,
	toVibrateSequence,
	schedulePattern,
} from "@haptics/core";
import type { PresetName } from "@haptics/core";
import { HAPTICS_INJECTION_KEY } from "./plugin";

/** Options for the imperative `trigger()` call. */
export interface TriggerOptions {
	/**
	 * When true, the vibration pattern repeats continuously until `cancel()`
	 * is called. Loop affects the Android (Vibration API) path only — iOS
	 * triggers remain best-effort single-tick per call. Default: false.
	 */
	repeat?: boolean;
}

/**
 * Composable for imperative haptic feedback.
 *
 * Works with or without HapticsPlugin — falls back to built-in presets.
 *
 * Returns plain values (not refs) for isSupported/isIOSSupported to match
 * the React hook's API shape. These don't change at runtime.
 */
export function useHaptics() {
	const ctx = inject(HAPTICS_INJECTION_KEY, null);
	const patterns = ctx?.patterns ?? PRESETS;
	const respectReducedMotion = ctx?.respectReducedMotion ?? false;

	const prefersReducedMotion = ref(false);
	let loopId: ReturnType<typeof setTimeout> | null = null;

	const clearLoop = () => {
		if (loopId !== null) {
			clearTimeout(loopId);
			loopId = null;
		}
	};

	onMounted(() => {
		if (typeof window === "undefined" || !window.matchMedia) return;

		const mql = window.matchMedia("(prefers-reduced-motion: reduce)");
		prefersReducedMotion.value = mql.matches;

		const onChange = (e: MediaQueryListEvent) => {
			prefersReducedMotion.value = e.matches;
		};
		mql.addEventListener("change", onChange);

		onUnmounted(() => {
			mql.removeEventListener("change", onChange);
			clearLoop();
		});
	});

	const trigger = (
		action: PresetName | (string & {}),
		options?: TriggerOptions,
	) => {
		if (respectReducedMotion && prefersReducedMotion.value) return;

		if (!Object.prototype.hasOwnProperty.call(patterns, action)) return;
		const pattern = patterns[action as keyof typeof patterns];
		if (!pattern || pattern.length === 0) return;

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

	return {
		trigger,
		cancel,
		isSupported: isVibrationSupported(),
		isIOSSupported: isIOS(),
	};
}
