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
		});
	});

	const trigger = (action: PresetName | (string & {})) => {
		if (respectReducedMotion && prefersReducedMotion.value) return;

		if (!Object.prototype.hasOwnProperty.call(patterns, action)) return;
		const pattern = patterns[action as keyof typeof patterns];
		if (!pattern) return;

		if (isVibrationSupported()) {
			navigator.vibrate(toVibrateSequence(pattern));
		} else if (isIOS()) {
			schedulePattern(pattern);
		}
	};

	const cancel = () => {
		if (isVibrationSupported()) navigator.vibrate(0);
	};

	return {
		trigger,
		cancel,
		isSupported: isVibrationSupported(),
		isIOSSupported: isIOS(),
	};
}
