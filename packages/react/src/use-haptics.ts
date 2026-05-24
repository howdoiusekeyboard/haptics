import { useContext, useCallback, useRef, useEffect } from "react";
import {
	PRESETS,
	isVibrationSupported,
	isIOS,
	toVibrateSequence,
	schedulePattern,
} from "@haptics/core";
import type { PresetName } from "@haptics/core";
import { HapticsContext } from "./provider";

/**
 * Trigger haptic feedback imperatively.
 *
 * - Android: fires navigator.vibrate() with the pattern's timing sequence
 * - iOS: attempts schedulePattern() as best-effort. Only works when called
 *   within a user gesture context (click/tap handler). For reliable iOS
 *   haptics, prefer declarative `data-haptic` attributes with HapticsProvider.
 *
 * Works with or without HapticsProvider — falls back to built-in presets.
 */
export function useHaptics() {
	const ctx = useContext(HapticsContext);
	const patterns = ctx?.patterns ?? PRESETS;
	const respectReducedMotion = ctx?.respectReducedMotion ?? false;

	const reducedMotionRef = useRef(false);

	useEffect(() => {
		const mql = window.matchMedia("(prefers-reduced-motion: reduce)");
		reducedMotionRef.current = mql.matches;

		const onChange = (e: MediaQueryListEvent) => {
			reducedMotionRef.current = e.matches;
		};
		mql.addEventListener("change", onChange);
		return () => mql.removeEventListener("change", onChange);
	}, []);

	const trigger = useCallback(
		(action: PresetName | (string & {})) => {
			if (respectReducedMotion && reducedMotionRef.current) return;

			if (!Object.prototype.hasOwnProperty.call(patterns, action)) return;
			const pattern = patterns[action as keyof typeof patterns];
			if (!pattern) return;

			if (isVibrationSupported()) {
				navigator.vibrate(toVibrateSequence(pattern));
			} else if (isIOS()) {
				schedulePattern(pattern);
			}
		},
		[patterns, respectReducedMotion],
	);

	const cancel = useCallback(() => {
		if (isVibrationSupported()) navigator.vibrate(0);
	}, []);

	return {
		trigger,
		cancel,
		isSupported: isVibrationSupported(),
		/** True when iOS haptics are available (via HapticsProvider + data-haptic attributes) */
		isIOSSupported: isIOS(),
	};
}
