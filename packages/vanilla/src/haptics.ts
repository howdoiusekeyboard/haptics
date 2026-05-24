import {
	PRESETS,
	isVibrationSupported,
	isIOS,
	toVibrateSequence,
	schedulePattern,
	attachHaptics,
} from "@haptics/core";
import type { HapticPattern, PresetName } from "@haptics/core";

export interface HapticsOptions {
	/**
	 * Root to scan for haptic-triggering elements and observe for new ones.
	 * Default: document.
	 */
	delegateFrom?: ParentNode;
	/**
	 * CSS selector for haptic-triggering elements. The matched element must
	 * also carry a `data-haptic="<name>"` attribute. Default: `"[data-haptic]"`.
	 */
	selector?: string;
	/** Custom patterns merged with built-in presets. */
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
 * Zero-framework haptic feedback controller.
 *
 * Constructing an instance wires every `[data-haptic]` element under the
 * delegate root with the platform-appropriate handler — an invisible switch
 * overlay on iOS (the only surface that survives Apple's 26.5 patch), a
 * click listener calling `navigator.vibrate` on Android. New `[data-haptic]`
 * elements added later are picked up via MutationObserver.
 *
 * Works with HTMX, Alpine.js, Stimulus, plain HTML — anything that mutates
 * the DOM.
 */
export class Haptics {
	private readonly patterns: Record<string, HapticPattern>;
	private readonly respectReducedMotion: boolean;
	private prefersReducedMotion = false;
	private destroyed = false;
	private mqlHandler: ((e: MediaQueryListEvent) => void) | null = null;
	private mql: MediaQueryList | null = null;
	private lastCancel: (() => void) | null = null;
	private loopId: ReturnType<typeof setTimeout> | null = null;
	private detach: () => void;

	readonly isSupported: boolean;
	readonly isIOSSupported: boolean;

	constructor(options: HapticsOptions = {}) {
		this.patterns = { ...PRESETS, ...options.patterns };
		this.respectReducedMotion = options.respectReducedMotion ?? false;
		this.isSupported = isVibrationSupported();
		this.isIOSSupported = isIOS();

		// Track reduced-motion state for the imperative trigger() path.
		// attachHaptics handles its own matchMedia listener for the declarative path.
		if (
			this.respectReducedMotion &&
			typeof window !== "undefined" &&
			window.matchMedia
		) {
			this.mql = window.matchMedia("(prefers-reduced-motion: reduce)");
			this.prefersReducedMotion = this.mql.matches;
			this.mqlHandler = (e: MediaQueryListEvent) => {
				this.prefersReducedMotion = e.matches;
			};
			this.mql.addEventListener("change", this.mqlHandler);
		}

		this.detach = attachHaptics({
			root: options.delegateFrom,
			selector: options.selector,
			respectReducedMotion: this.respectReducedMotion,
			debugOverlay: options.debugOverlay ?? false,
			audioFallback: options.audioFallback ?? false,
			getPattern: (name) =>
				Object.prototype.hasOwnProperty.call(this.patterns, name)
					? this.patterns[name]
					: undefined,
		});
	}

	/** Trigger haptic feedback imperatively by pattern name. */
	trigger(action: PresetName | (string & {}), options?: TriggerOptions): void {
		if (this.destroyed) return;
		if (this.respectReducedMotion && this.prefersReducedMotion) return;

		if (!Object.prototype.hasOwnProperty.call(this.patterns, action)) return;
		const pattern = this.patterns[action];
		if (!pattern) return;

		this.clearLoop();

		if (this.isSupported) {
			const seq = toVibrateSequence(pattern);
			navigator.vibrate(seq);
			if (options?.repeat) {
				const totalMs = Math.max(
					1,
					seq.reduce((s, n) => s + n, 0),
				);
				const tick = () => {
					navigator.vibrate(seq);
					this.loopId = setTimeout(tick, totalMs);
				};
				this.loopId = setTimeout(tick, totalMs);
			}
		} else if (this.isIOSSupported) {
			this.lastCancel = schedulePattern(pattern);
		}
	}

	/** Cancel active vibration (Android) and clear pending iOS pattern ticks. */
	cancel(): void {
		this.clearLoop();
		if (this.isSupported) navigator.vibrate(0);
		this.lastCancel?.();
		this.lastCancel = null;
	}

	/** Remove all handlers and clean up. */
	destroy(): void {
		if (this.destroyed) return;
		this.destroyed = true;

		this.clearLoop();
		this.detach();

		if (this.mql && this.mqlHandler) {
			this.mql.removeEventListener("change", this.mqlHandler);
		}

		this.lastCancel?.();
		this.lastCancel = null;
	}

	private clearLoop(): void {
		if (this.loopId !== null) {
			clearTimeout(this.loopId);
			this.loopId = null;
		}
	}
}
