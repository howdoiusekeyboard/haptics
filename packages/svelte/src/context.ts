import { PRESETS, attachHaptics } from "@haptics/core";
import type { HapticPattern } from "@haptics/core";

export interface HapticsConfig {
	patterns: Record<string, HapticPattern>;
	respectReducedMotion: boolean;
}

let _config: HapticsConfig | null = null;
let _cleanup: (() => void) | null = null;

/**
 * Initialize haptics for a Svelte app. Call once from the root layout's
 * `<script>` block.
 *
 * Scans the document for `[data-haptic]` elements and wires the platform-
 * appropriate handler (iOS switch overlay; Android click → navigator.vibrate),
 * then watches for new ones via MutationObserver. The `use:haptic` action sets
 * the attribute that this scan picks up.
 *
 * Idempotent: calling again tears down prior handlers before re-attaching.
 *
 * @example
 * ```svelte
 * <script>
 *   import { setupHaptics } from '@haptics/svelte';
 *   setupHaptics({ patterns: { 'my-buzz': [{ duration: 30 }] } });
 * </script>
 * <slot />
 * ```
 */
export function setupHaptics(
	options: {
		patterns?: Record<string, HapticPattern>;
		respectReducedMotion?: boolean;
	} = {},
): void {
	// Idempotent: tear down handlers from a prior call before re-attaching.
	_cleanup?.();
	_cleanup = null;

	const patterns: Record<string, HapticPattern> = {
		...PRESETS,
		...options.patterns,
	};
	const respectReducedMotion = options.respectReducedMotion ?? false;
	_config = { patterns, respectReducedMotion };

	_cleanup = attachHaptics({
		respectReducedMotion,
		getPattern: (name) =>
			Object.prototype.hasOwnProperty.call(patterns, name)
				? patterns[name]
				: undefined,
	});
}

export function getHapticsConfig(): HapticsConfig | null {
	return _config;
}

/** @internal Reset config and tear down handlers. For tests and HMR. */
export function _resetConfig(): void {
	_cleanup?.();
	_cleanup = null;
	_config = null;
}
