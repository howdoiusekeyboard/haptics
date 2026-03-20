"use client";

import { useCallback, useContext, useEffect, useRef } from "react";
import { HapticsContext } from "./provider";
import {
	isIOS,
	isVibrationSupported,
	schedulePattern,
	toVibrateSequence,
} from "./engine";
import { PRESETS, type PresetName } from "./presets";
import type { HapticPattern } from "./types";

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
	const patterns: Record<string, HapticPattern> = ctx?.patterns ?? PRESETS;
	const respectReducedMotion = ctx?.respectReducedMotion ?? true;

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

			const pattern = patterns[action];
			if (!pattern) return;

			if (isVibrationSupported) {
				navigator.vibrate(toVibrateSequence(pattern));
			} else if (isIOS) {
				// Best-effort: only works within a user gesture context
				schedulePattern(pattern);
			}
		},
		[patterns, respectReducedMotion],
	);

	const cancel = useCallback(() => {
		if (isVibrationSupported) navigator.vibrate(0);
	}, []);

	return {
		trigger,
		cancel,
		isSupported: isVibrationSupported,
		/** True when iOS haptics are available (via HapticsProvider + data-haptic attributes) */
		isIOSSupported: isIOS,
	};
}
