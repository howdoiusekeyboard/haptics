import { createContext, useMemo, useRef, useEffect } from "react";
import { PRESETS, attachHaptics } from "@haptics/core";
import type { HapticPattern } from "@haptics/core";

export interface HapticsContextValue {
	patterns: Record<string, HapticPattern>;
	respectReducedMotion: boolean;
}

export interface HapticsProviderProps {
	children: React.ReactNode;
	/** Custom patterns merged with built-in presets. Custom names override presets. */
	patterns?: Record<string, HapticPattern>;
	/**
	 * Skip haptics when `prefers-reduced-motion: reduce` is active. Default: `false`.
	 * The CSS query targets visual animation; iOS has a separate System Haptics toggle.
	 */
	respectReducedMotion?: boolean;
}

export const HapticsContext = createContext<HapticsContextValue | null>(null);

/**
 * Wires every `[data-haptic]` descendant with a platform-appropriate handler.
 *
 * On iOS the handler is an invisible `<input type="checkbox" switch>` overlay
 * — the only surface that survives Apple's iOS 26.5 patch on the synthetic
 * `.click()` trick. On Android the handler is a click listener that calls
 * `navigator.vibrate`. Reduced-motion is honored automatically via the
 * underlying `attachHaptics` helper.
 *
 * The provider re-keys its scanned root to `document` and uses a
 * MutationObserver to pick up `[data-haptic]` elements rendered later.
 */
export function HapticsProvider({
	children,
	patterns: customPatterns,
	respectReducedMotion = false,
}: HapticsProviderProps) {
	const allPatterns = useMemo(
		() => ({ ...PRESETS, ...customPatterns }),
		[customPatterns],
	);

	const patternsRef = useRef(allPatterns);
	patternsRef.current = allPatterns;

	useEffect(() => {
		return attachHaptics({
			respectReducedMotion,
			getPattern: (name) =>
				Object.prototype.hasOwnProperty.call(patternsRef.current, name)
					? patternsRef.current[name as keyof typeof patternsRef.current]
					: undefined,
		});
	}, [respectReducedMotion]);

	const ctx = useMemo(
		() => ({ patterns: allPatterns, respectReducedMotion }),
		[allPatterns, respectReducedMotion],
	);

	return <HapticsContext.Provider value={ctx}>{children}</HapticsContext.Provider>;
}
