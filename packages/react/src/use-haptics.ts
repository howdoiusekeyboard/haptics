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
/** Options for the imperative `trigger()` call. */
export interface TriggerOptions {
	/**
	 * When true, the vibration pattern repeats continuously until `cancel()`
	 * is called. Loop affects the Android (Vibration API) path only — iOS
	 * triggers remain best-effort single-tick per call. Default: false.
	 */
	repeat?: boolean;
}

export function useHaptics() {
	const ctx = useContext(HapticsContext);
	const patterns = ctx?.patterns ?? PRESETS;
	const respectReducedMotion = ctx?.respectReducedMotion ?? false;

	const reducedMotionRef = useRef(false);
	const loopIdRef = useRef<ReturnType<typeof setTimeout> | null>(null);

	useEffect(() => {
		const mql = window.matchMedia("(prefers-reduced-motion: reduce)");
		reducedMotionRef.current = mql.matches;

		const onChange = (e: MediaQueryListEvent) => {
			reducedMotionRef.current = e.matches;
		};
		mql.addEventListener("change", onChange);
		return () => {
			mql.removeEventListener("change", onChange);
			if (loopIdRef.current !== null) {
				clearTimeout(loopIdRef.current);
				loopIdRef.current = null;
			}
		};
	}, []);

	const clearLoop = useCallback(() => {
		if (loopIdRef.current !== null) {
			clearTimeout(loopIdRef.current);
			loopIdRef.current = null;
		}
	}, []);

	const trigger = useCallback(
		(action: PresetName | (string & {}), options?: TriggerOptions) => {
			if (respectReducedMotion && reducedMotionRef.current) return;

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
						loopIdRef.current = setTimeout(tick, totalMs);
					};
					loopIdRef.current = setTimeout(tick, totalMs);
				}
			} else if (isIOS()) {
				schedulePattern(pattern);
			}
		},
		[patterns, respectReducedMotion, clearLoop],
	);

	const cancel = useCallback(() => {
		clearLoop();
		if (isVibrationSupported()) navigator.vibrate(0);
	}, [clearLoop]);

	return {
		trigger,
		cancel,
		isSupported: isVibrationSupported(),
		/** True when iOS haptics are available (via HapticsProvider + data-haptic attributes) */
		isIOSSupported: isIOS(),
	};
}
