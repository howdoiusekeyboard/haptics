"use client";

import { createContext, useEffect, useMemo, useRef } from "react";
import type { HapticPattern } from "./types";
import { PRESETS } from "./presets";
import { isIOS, schedulePattern } from "./engine";

export interface HapticsContextValue {
	patterns: Record<string, HapticPattern>;
	respectReducedMotion: boolean;
}

export const HapticsContext = createContext<HapticsContextValue | null>(null);

export interface HapticsProviderProps {
	children: React.ReactNode;
	/** Custom patterns merged with built-in presets. Custom names override presets. */
	patterns?: Record<string, HapticPattern>;
	/** Skip haptics when prefers-reduced-motion is active. Default: true */
	respectReducedMotion?: boolean;
}

/**
 * Captures native click events before React's delegation layer to preserve
 * the user gesture chain required for iOS haptics.
 *
 * React 18's concurrent scheduler breaks the native gesture context when
 * synthetic event handlers call into the DOM. A capture-phase listener on
 * `document` fires BEFORE React processes the event, keeping the gesture
 * chain intact for the checkbox-switch haptic trick.
 *
 * Elements opt in via `data-haptic="preset-name"` attributes.
 */
export function HapticsProvider({
	children,
	patterns: customPatterns,
	respectReducedMotion = true,
}: HapticsProviderProps) {
	const allPatterns = useMemo<Record<string, HapticPattern>>(
		() => ({ ...PRESETS, ...customPatterns }),
		[customPatterns],
	);

	const patternsRef = useRef(allPatterns);
	patternsRef.current = allPatterns;

	const reducedMotionRef = useRef(respectReducedMotion);
	reducedMotionRef.current = respectReducedMotion;

	useEffect(() => {
		if (!isIOS) return;

		const mql = window.matchMedia("(prefers-reduced-motion: reduce)");
		let prefersReducedMotion = mql.matches;

		const onMqlChange = (e: MediaQueryListEvent) => {
			prefersReducedMotion = e.matches;
		};
		mql.addEventListener("change", onMqlChange);

		const handler = (e: MouseEvent) => {
			if (reducedMotionRef.current && prefersReducedMotion) return;

			const target = (e.target as Element | null)?.closest("[data-haptic]");
			if (!target) return;

			const action = target.getAttribute("data-haptic");
			if (action && action in patternsRef.current) {
				schedulePattern(patternsRef.current[action]);
			}
		};

		document.addEventListener("click", handler, { capture: true, passive: true });
		return () => {
			document.removeEventListener("click", handler, { capture: true });
			mql.removeEventListener("change", onMqlChange);
		};
	}, []);

	const ctx = useMemo<HapticsContextValue>(
		() => ({ patterns: allPatterns, respectReducedMotion }),
		[allPatterns, respectReducedMotion],
	);

	return <HapticsContext.Provider value={ctx}>{children}</HapticsContext.Provider>;
}
