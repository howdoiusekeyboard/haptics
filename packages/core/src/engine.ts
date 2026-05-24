import type { HapticPattern } from "./types";

/** Defensive limits — guards against runaway patterns from buggy or untrusted input. */
const MAX_PATTERN_SEGMENTS = 64;
const MAX_TOTAL_OFFSET_MS = 60_000;

/**
 * Minimum vibrate-slot duration on Android. Phone vibration motors are
 * mass-on-spring systems that need sustained drive time (~5ms+) to produce
 * any perceptible output. Sub-5ms pulses are below the threshold and were
 * the failure mode that PWM-style intensity modulation hit on real devices.
 * Adopted from `web-haptics` PR #28.
 */
const MIN_VIBRATE_MS = 5;

/**
 * Tick-spacing range for iOS overlay multi-tick scheduling. At intensity 1.0,
 * ticks fire every ~16ms (one frame); at intensity 0.0, every ~200ms (sparse).
 * Higher intensity = tighter ticks = stronger perceived feeling on iOS 17.4–26.4.
 * On iOS 26.5+, only the first tick survives Apple's patch — this scheduler runs
 * but the programmatic .click()s no-op silently. Values match `web-haptics`.
 */
const TOGGLE_MIN_MS = 16;
const TOGGLE_MAX_MS = 184;

/** Attribute marking the injected switch overlay on iOS hosts. */
const OVERLAY_ATTR = "data-haptic-overlay";
/** Attribute marking that an Android click listener has been attached. */
const ATTACHED_ATTR = "data-haptic-attached";

/** True on iOS where navigator.vibrate is absent but touch hardware exists */
let _isIOS: boolean | null = null;
export function isIOS(): boolean {
	if (_isIOS === null) {
		_isIOS =
			typeof window !== "undefined" &&
			typeof navigator !== "undefined" &&
			typeof navigator.vibrate !== "function" &&
			((/iPad|iPhone|iPod/.test(navigator.userAgent) &&
				!("MSStream" in window)) ||
				(navigator.maxTouchPoints > 1 &&
					/MacIntel/.test(navigator.platform)));
	}
	return _isIOS;
}

/** True when the Web Vibration API is available (Android/Chrome) */
let _isVibrationSupported: boolean | null = null;
export function isVibrationSupported(): boolean {
	if (_isVibrationSupported === null) {
		_isVibrationSupported =
			typeof navigator !== "undefined" &&
			typeof navigator.vibrate === "function";
	}
	return _isVibrationSupported;
}

/** @internal Reset cached detection. For testing only. */
export function resetDetection(): void {
	_isIOS = null;
	_isVibrationSupported = null;
}

/**
 * Single haptic tick on iOS via the checkbox-switch side effect.
 *
 * Safari 17.4+ fires Taptic Engine feedback when an `<input type="checkbox" switch>`
 * is toggled. We create one, click it, and remove it — producing one haptic tick.
 *
 * Falls back to document.documentElement when document.body is unavailable
 * (e.g., scripts executing in <head> before body parse, or post-unload).
 */
export function iosTick(): void {
	try {
		if (typeof document === "undefined") return;
		const host = document.body ?? document.documentElement;
		if (!host) return;
		const label = document.createElement("label");
		label.ariaHidden = "true";
		label.style.cssText = "display:none";
		const input = document.createElement("input");
		input.type = "checkbox";
		input.setAttribute("switch", "");
		label.appendChild(input);
		host.appendChild(label);
		label.click();
		host.removeChild(label);
	} catch {
		/* haptics are non-critical */
	}
}

/** Coerce a vibration value into a non-negative integer ms count. */
function clampMs(n: number | undefined): number {
	if (!Number.isFinite(n)) return 0;
	return Math.max(0, Math.floor(n as number));
}

/** Coerce intensity into [0, 1]. Undefined defaults to 1 (no scaling). */
function clampIntensity(n: number | undefined): number {
	if (n === undefined || !Number.isFinite(n)) return 1;
	return Math.max(0, Math.min(1, n as number));
}

/** Tick-spacing for iOS overlay multi-tick scheduling, interpolated by intensity. */
function intensityToTickGapMs(intensity: number | undefined): number {
	return TOGGLE_MIN_MS + (1 - clampIntensity(intensity)) * TOGGLE_MAX_MS;
}

/**
 * Schedule a sequence of ticks at cumulative ms offsets, driven by
 * `requestAnimationFrame`. Each frame checks elapsed time and fires
 * any due ticks. Higher temporal precision than setTimeout under load
 * (RAF aligns with paint; setTimeout has 4–15ms jitter).
 *
 * No-ops when RAF is unavailable — every browser that supports the
 * iOS 17.4+ checkbox-switch haptic trick (and every modern Android
 * Chrome) has RAF, so the fallback is dead code in practice.
 */
function scheduleTicksRAF(
	offsets: number[],
	onTick: () => void,
): () => void {
	if (offsets.length === 0) return () => {};
	if (typeof requestAnimationFrame !== "function") return () => {};

	let cancelled = false;
	let rafId: number | null = null;
	let startTime: number | null = null;
	let nextIndex = 0;

	const loop = (time: number) => {
		if (cancelled) return;
		if (startTime === null) startTime = time;
		const elapsed = time - startTime;

		while (
			nextIndex < offsets.length &&
			elapsed >= offsets[nextIndex]!
		) {
			onTick();
			nextIndex++;
		}

		rafId = nextIndex < offsets.length ? requestAnimationFrame(loop) : null;
	};

	rafId = requestAnimationFrame(loop);

	return () => {
		cancelled = true;
		if (rafId !== null) {
			cancelAnimationFrame(rafId);
			rafId = null;
		}
	};
}

/**
 * Play a multi-segment haptic pattern on iOS.
 * Each segment produces one tick, with delays honored via setTimeout.
 *
 * Returns a cancel function that clears any pending timers. Useful for
 * tearing down listeners on adapter cleanup so in-flight patterns don't
 * keep firing after unmount or SPA navigation.
 *
 * Defensively clamps pattern length and total scheduled offset to guard
 * against runaway patterns from buggy or untrusted input.
 */
export function schedulePattern(pattern: HapticPattern): () => void {
	const timers: ReturnType<typeof setTimeout>[] = [];
	const limit = Math.min(pattern.length, MAX_PATTERN_SEGMENTS);
	let offsetMs = 0;
	for (let i = 0; i < limit; i++) {
		const v = pattern[i];
		offsetMs += clampMs(v.delay);
		if (offsetMs > MAX_TOTAL_OFFSET_MS) break;
		if (offsetMs === 0) {
			iosTick();
		} else {
			timers.push(setTimeout(iosTick, offsetMs));
		}
		offsetMs += clampMs(v.duration);
	}
	return () => {
		for (const t of timers) clearTimeout(t);
		timers.length = 0;
	};
}

/**
 * Convert a HapticPattern to a `navigator.vibrate()` number sequence.
 * Format: [vibrate_ms, pause_ms, vibrate_ms, ...]
 *
 * The Vibration API alternates vibrate/pause starting with vibrate.
 * Leading delays need a 0ms vibration prefix. Consecutive vibration
 * segments without a delay between them need a 0ms pause inserted.
 *
 * Intensity (2.1.0): when `vibration.intensity` is < 1, the segment's
 * duration is scaled (`scaled = max(5, round(duration * intensity))`)
 * and the remainder is pushed as silence. This produces a shorter
 * vibrate at full motor power — perceptible on real Android devices,
 * unlike PWM-style modulation which chops below the motor's response
 * threshold (see `web-haptics` PR #28). `intensity` of 0 collapses the
 * segment into the surrounding off-time; `intensity` >= 1 (or undefined)
 * preserves pre-2.1.0 pass-through behavior.
 *
 * Values are coerced to non-negative integers and the segment count
 * is capped — some Android builds throw a TypeError on negative or
 * non-integer values, breaking the click handler.
 */
export function toVibrateSequence(pattern: HapticPattern): number[] {
	const seq: number[] = [];
	const limit = Math.min(pattern.length, MAX_PATTERN_SEGMENTS);
	for (let i = 0; i < limit; i++) {
		const v = pattern[i];
		const intensity = clampIntensity(v.intensity);
		const delay = clampMs(v.delay);
		const duration = clampMs(v.duration);

		// Place the delay into the appropriate off-slot.
		if (delay > 0) {
			if (seq.length === 0) {
				seq.push(0); // leading 0-vibrate prefix
				seq.push(delay);
			} else if (seq.length % 2 === 0) {
				seq[seq.length - 1]! += delay; // merge into trailing off-time
			} else {
				seq.push(delay); // fill open off-slot
			}
		}

		// Intensity 0: silence — extend the surrounding off-time.
		if (intensity <= 0) {
			if (duration === 0) continue;
			if (seq.length === 0) {
				seq.push(0);
				seq.push(duration);
			} else if (seq.length % 2 === 0) {
				seq[seq.length - 1]! += duration;
			} else {
				seq.push(duration);
			}
			continue;
		}

		// Ensure a separator before the next vibrate when no delay was placed
		// — preserves the alternation invariant of `navigator.vibrate`.
		if (seq.length > 0 && seq.length % 2 === 1 && delay === 0) {
			seq.push(0);
		}

		if (intensity >= 1) {
			seq.push(duration);
		} else {
			const scaled = Math.max(
				MIN_VIBRATE_MS,
				Math.round(duration * intensity),
			);
			seq.push(scaled);
			const remainder = duration - scaled;
			if (remainder > 0) seq.push(remainder);
		}
	}
	return seq;
}

/** Options for attachHaptics — wires per-element handlers under a root. */
export interface AttachHapticsOptions {
	/** Resolves a pattern name to its HapticPattern. Return undefined to skip the trigger. */
	getPattern: (name: string) => HapticPattern | undefined;
	/** Root to scan and observe. Default: document. */
	root?: ParentNode;
	/**
	 * CSS selector for haptic-triggering elements. The matched element must also
	 * carry a `data-haptic="<name>"` attribute since the click handler reads it.
	 * Default: `"[data-haptic]"`.
	 */
	selector?: string;
	/**
	 * When true and `prefers-reduced-motion: reduce` is active, iOS overlays set
	 * `pointer-events: none` so user taps pass through without firing native haptic.
	 * Android click handlers skip the `navigator.vibrate` call. Default: `false`.
	 *
	 * The CSS `prefers-reduced-motion` media query targets visual animation,
	 * not haptic feedback — iOS exposes a dedicated "System Haptics" toggle
	 * (Settings → Sounds & Haptics) for haptic preference. The default leaves
	 * haptics firing for users who enabled Reduce Motion for motion sickness
	 * or other animation-specific reasons.
	 */
	respectReducedMotion?: boolean;
	/**
	 * When true, injected iOS overlays get a dashed outline so you can see where
	 * they were attached, and each attach/detach event is logged via console.debug
	 * (including dynamic mounts picked up by the MutationObserver). Default: false.
	 *
	 * Pure development aid — does not change haptic behavior. Safe to enable in
	 * any environment; logs are at `debug` level so they're hidden unless you've
	 * enabled verbose console output in DevTools.
	 */
	debugOverlay?: boolean;
	/**
	 * When true on desktop browsers (no Vibration API, not iOS), wires a tiny
	 * WebAudio click into each `[data-haptic]` handler so developers and visitors
	 * hear an audible cue confirming the interaction registered. No effect on iOS
	 * or Android — those platforms already produce real haptics. Default: false.
	 *
	 * The audio module is loaded lazily via dynamic `import()` only when this
	 * option is enabled, so consumers who omit it pay no bundle cost. The first
	 * click may not play audio if the module is still loading; subsequent clicks
	 * resolve normally. Audio is silent on browsers without `AudioContext`.
	 */
	audioFallback?: boolean;
}

/** Accent color used for the debugOverlay outline. */
const DEBUG_OVERLAY_OUTLINE = "1px dashed #FF5B35";

/** Centralized debug logger — keeps the long prefix on one line for gzip. */
function dbg(tag: string, host: HTMLElement): void {
	console.debug(`[@haptics] ${tag}`, host);
}

/**
 * Install platform-appropriate haptic handlers for every `[data-haptic]` under `root`.
 *
 * On iOS (17.4+): attaches an invisible `<input type="checkbox" switch>` overlay as
 * a child of each host. The user's tap lands on the overlay, fires one native haptic
 * tick (iOS reads it as user-direct interaction with a switch — the only path that
 * survives Apple's 26.5 patch), and the handler re-dispatches the click to the host
 * so consumer `onclick` still runs. Subsequent ticks for multi-segment patterns are
 * scheduled via programmatic `.click()` on the same overlay — these fire haptic on
 * iOS 17.4–26.4 and silently no-op on iOS 26.5+, where Apple closed the synthetic
 * click path. Single-tick presets (selection, etc.) are unaffected on any iOS.
 *
 * On Android (or anywhere `navigator.vibrate` exists): attaches a click listener that
 * calls `navigator.vibrate(toVibrateSequence(pattern))` — same path as before.
 *
 * Elsewhere: silent no-op.
 *
 * A MutationObserver picks up dynamically-added `[data-haptic]` elements (SPA renders,
 * lazy-loaded components). Returns a teardown that removes overlays, listeners, and
 * the observer.
 */
export function attachHaptics(options: AttachHapticsOptions): () => void {
	if (typeof document === "undefined") return () => {};

	const respectReducedMotion = options.respectReducedMotion ?? false;
	const debugOverlay = options.debugOverlay ?? false;
	const audioFallback = options.audioFallback ?? false;
	const selector = options.selector ?? "[data-haptic]";
	const root = (options.root ?? document) as ParentNode & Node;
	const detachers = new Map<HTMLElement, () => void>();
	const overlays = new Set<HTMLInputElement>();

	// Audio fallback is lazy-loaded: the click handler reads `audioPlay` at
	// invocation time, so handlers attached before the module resolves still
	// work (they just skip audio for the first few clicks).
	let audioPlay: ((intensity?: number) => Promise<void>) | null = null;
	if (audioFallback) {
		import("./audio-fallback")
			.then((m) => {
				audioPlay = m.playClickSound;
			})
			.catch((err) => {
				// Surface the failure once — chunk-load errors (CSP, CDN, bundler
				// misconfig) would otherwise leave the consumer wondering why the
				// audio cue never plays. Subsequent clicks just no-op.
				console.warn("[@haptics] audio-fallback chunk failed to load", err);
			});
	}

	let reducedMotion = false;
	let mql: MediaQueryList | null = null;
	let onMqlChange: ((e: MediaQueryListEvent) => void) | null = null;

	if (
		respectReducedMotion &&
		typeof window !== "undefined" &&
		typeof window.matchMedia === "function"
	) {
		mql = window.matchMedia("(prefers-reduced-motion: reduce)");
		reducedMotion = mql.matches;
		onMqlChange = (e) => {
			reducedMotion = e.matches;
			for (const sw of overlays) {
				sw.style.pointerEvents = reducedMotion ? "none" : "auto";
			}
		};
		mql.addEventListener("change", onMqlChange);
	}

	const isReduced = () => respectReducedMotion && reducedMotion;

	const attach: ((el: HTMLElement) => (() => void) | undefined) | null =
		isVibrationSupported()
			? (el) =>
					attachAndroidListener(
						el,
						options.getPattern,
						isReduced,
						debugOverlay,
					)
			: isIOS()
				? (el) =>
						attachIOSOverlay(
							el,
							options.getPattern,
							overlays,
							isReduced,
							debugOverlay,
						)
				: audioFallback
					? (el) =>
							attachDesktopAudio(
								el,
								options.getPattern,
								isReduced,
								() => audioPlay,
								debugOverlay,
							)
					: null;

	if (!attach) {
		if (mql && onMqlChange) mql.removeEventListener("change", onMqlChange);
		return () => {};
	}

	const attachOne = (el: HTMLElement) => {
		if (detachers.has(el)) return;
		const d = attach(el);
		if (d) detachers.set(el, d);
	};

	const detachOne = (el: HTMLElement) => {
		const d = detachers.get(el);
		if (d) {
			d();
			detachers.delete(el);
		}
	};

	for (const el of (root as ParentNode).querySelectorAll<HTMLElement>(
		selector,
	)) {
		attachOne(el);
	}

	const observer = new MutationObserver((mutations) => {
		for (const m of mutations) {
			for (const node of m.addedNodes) {
				if (!(node instanceof HTMLElement)) continue;
				if (node.matches(selector)) attachOne(node);
				for (const el of node.querySelectorAll<HTMLElement>(selector)) {
					attachOne(el);
				}
			}
			for (const node of m.removedNodes) {
				if (!(node instanceof HTMLElement)) continue;
				if (detachers.has(node)) detachOne(node);
				for (const el of node.querySelectorAll<HTMLElement>(selector)) {
					detachOne(el);
				}
			}
		}
	});
	observer.observe(root, { childList: true, subtree: true });

	return () => {
		observer.disconnect();
		if (mql && onMqlChange) mql.removeEventListener("change", onMqlChange);
		for (const d of detachers.values()) d();
		detachers.clear();
		overlays.clear();
	};
}

/**
 * Attach a switch overlay to a single iOS host. Idempotent — calling twice
 * returns undefined the second time. Returns a teardown function.
 */
function attachIOSOverlay(
	host: HTMLElement,
	getPattern: (name: string) => HapticPattern | undefined,
	overlays: Set<HTMLInputElement>,
	isReduced: () => boolean,
	debugOverlay: boolean,
): (() => void) | undefined {
	if (host.querySelector(`[${OVERLAY_ATTR}]`)) return;

	// `position` must be a non-static containing block so the absolute-positioned
	// overlay anchors to the host. Real browsers report "static" by default;
	// jsdom (and some shadow-DOM contexts) report "" — handle both.
	const pos = getComputedStyle(host).position;
	if (
		pos !== "absolute" &&
		pos !== "relative" &&
		pos !== "fixed" &&
		pos !== "sticky"
	) {
		host.style.position = "relative";
	}

	const sw = document.createElement("input");
	sw.type = "checkbox";
	sw.setAttribute("switch", "");
	sw.setAttribute(OVERLAY_ATTR, "");
	sw.setAttribute("aria-hidden", "true");
	sw.tabIndex = -1;
	sw.style.cssText =
		"position:absolute;inset:0;width:100%;height:100%;" +
		"margin:0;padding:0;border:0;" +
		"-webkit-appearance:switch;appearance:auto;" +
		"opacity:0;cursor:inherit;" +
		`pointer-events:${isReduced() ? "none" : "auto"};`;
	if (debugOverlay) {
		sw.style.outline = DEBUG_OVERLAY_OUTLINE;
		sw.style.outlineOffset = "-1px";
		dbg("iOS+", host);
	}

	let cancelPendingTicks: (() => void) | null = null;
	// Set to true while the multi-tick scheduler fires a programmatic sw.click()
	// so the resulting re-entrant onClick skips setup and host re-dispatch — the
	// click side effect (haptic on iOS 17.4–26.4) still fires, but consumer
	// onclick handlers only see one logical invocation per user tap.
	let isProgrammaticTick = false;

	const onClick = (e: Event) => {
		// On programmatic re-entry, still stop the click from bubbling into
		// the host — otherwise consumer click listeners catch each tick's
		// synthetic event and fire N times per user tap.
		if (isProgrammaticTick) {
			e.stopPropagation();
			return;
		}

		e.stopPropagation();
		host.focus({ preventScroll: true });

		const name = host.getAttribute("data-haptic");
		const pattern = name ? getPattern(name) : undefined;
		if (pattern && pattern.length > 1) {
			cancelPendingTicks?.();
			const limit = Math.min(pattern.length, MAX_PATTERN_SEGMENTS);
			// Tick spacing is intensity-driven, not duration-driven — pattern
			// `duration` is meaningful on Android (motor drive time) but not on
			// iOS overlay (each tick is a discrete event). Higher intensity
			// produces tighter ticks, giving stronger perceived feeling.
			const offsets: number[] = [];
			let offsetMs = intensityToTickGapMs(pattern[0].intensity);
			for (let i = 1; i < limit; i++) {
				const v = pattern[i];
				offsetMs += clampMs(v.delay);
				if (offsetMs > MAX_TOTAL_OFFSET_MS) break;
				offsets.push(offsetMs);
				offsetMs += intensityToTickGapMs(v.intensity);
			}
			cancelPendingTicks = scheduleTicksRAF(offsets, () => {
				isProgrammaticTick = true;
				sw.click();
				isProgrammaticTick = false;
			});
		}

		host.dispatchEvent(
			new MouseEvent("click", { bubbles: true, cancelable: true }),
		);
	};
	sw.addEventListener("click", onClick);

	host.appendChild(sw);
	overlays.add(sw);

	return () => {
		cancelPendingTicks?.();
		cancelPendingTicks = null;
		sw.removeEventListener("click", onClick);
		overlays.delete(sw);
		sw.remove();
		if (debugOverlay) dbg("iOS-", host);
	};
}

/**
 * Desktop fallback: attach a click listener that plays a WebAudio click cue
 * via the lazily-loaded audio-fallback module. Used only when `audioFallback`
 * is enabled and the platform has no native haptic path (no Vibration API,
 * not iOS). Idempotent — same ATTACHED_ATTR marker as the Android path.
 */
function attachDesktopAudio(
	host: HTMLElement,
	getPattern: (name: string) => HapticPattern | undefined,
	isReduced: () => boolean,
	getAudioPlay: () => ((intensity?: number) => Promise<void>) | null,
	debugOverlay: boolean,
): (() => void) | undefined {
	if (host.hasAttribute(ATTACHED_ATTR)) return;
	host.setAttribute(ATTACHED_ATTR, "");
	if (debugOverlay) dbg("Audio+", host);
	const onClick = () => {
		if (isReduced()) return;
		const name = host.getAttribute("data-haptic");
		if (!name) return;
		const pattern = getPattern(name);
		if (!pattern || pattern.length === 0) return;
		const play = getAudioPlay();
		if (!play) return;
		play(pattern[0].intensity ?? 1).catch((err) => {
			console.warn("[@haptics] audio fallback play failed", err);
		});
	};
	host.addEventListener("click", onClick);
	return () => {
		host.removeEventListener("click", onClick);
		host.removeAttribute(ATTACHED_ATTR);
		if (debugOverlay) dbg("Audio-", host);
	};
}

function attachAndroidListener(
	host: HTMLElement,
	getPattern: (name: string) => HapticPattern | undefined,
	isReduced: () => boolean,
	debugOverlay: boolean,
): (() => void) | undefined {
	if (host.hasAttribute(ATTACHED_ATTR)) return;
	host.setAttribute(ATTACHED_ATTR, "");
	if (debugOverlay) dbg("Android+", host);
	const onClick = () => {
		if (isReduced()) return;
		const name = host.getAttribute("data-haptic");
		if (!name) return;
		const pattern = getPattern(name);
		if (!pattern) return;
		navigator.vibrate(toVibrateSequence(pattern));
	};
	host.addEventListener("click", onClick);
	return () => {
		host.removeEventListener("click", onClick);
		host.removeAttribute(ATTACHED_ATTR);
		if (debugOverlay) dbg("Android-", host);
	};
}
