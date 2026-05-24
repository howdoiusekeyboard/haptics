import type { HapticPattern } from "./types";

/** Defensive limits — guards against runaway patterns from buggy or untrusted input. */
const MAX_PATTERN_SEGMENTS = 64;
const MAX_TOTAL_OFFSET_MS = 60_000;

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
 * Values are coerced to non-negative integers and the segment count
 * is capped — some Android builds throw a TypeError on negative or
 * non-integer values, breaking the click handler.
 */
export function toVibrateSequence(pattern: HapticPattern): number[] {
	const seq: number[] = [];
	const limit = Math.min(pattern.length, MAX_PATTERN_SEGMENTS);
	for (let i = 0; i < limit; i++) {
		const v = pattern[i];
		const delay = clampMs(v.delay);
		if (delay > 0) {
			if (seq.length === 0) {
				seq.push(0);
			}
			seq.push(delay);
		} else if (seq.length > 0) {
			seq.push(0);
		}
		seq.push(clampMs(v.duration));
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
	const selector = options.selector ?? "[data-haptic]";
	const root = (options.root ?? document) as ParentNode & Node;
	const detachers = new Map<HTMLElement, () => void>();
	const overlays = new Set<HTMLInputElement>();

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
			? (el) => attachAndroidListener(el, options.getPattern, isReduced)
			: isIOS()
				? (el) =>
						attachIOSOverlay(el, options.getPattern, overlays, isReduced)
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

	let pendingTimers: ReturnType<typeof setTimeout>[] = [];

	const onClick = (e: Event) => {
		e.stopPropagation();
		host.focus({ preventScroll: true });

		const name = host.getAttribute("data-haptic");
		const pattern = name ? getPattern(name) : undefined;
		if (pattern && pattern.length > 1) {
			for (const t of pendingTimers) clearTimeout(t);
			pendingTimers = [];
			const limit = Math.min(pattern.length, MAX_PATTERN_SEGMENTS);
			let offsetMs = clampMs(pattern[0].duration);
			for (let i = 1; i < limit; i++) {
				const v = pattern[i];
				offsetMs += clampMs(v.delay);
				if (offsetMs > MAX_TOTAL_OFFSET_MS) break;
				pendingTimers.push(setTimeout(() => sw.click(), offsetMs));
				offsetMs += clampMs(v.duration);
			}
		}

		host.dispatchEvent(
			new MouseEvent("click", { bubbles: true, cancelable: true }),
		);
	};
	sw.addEventListener("click", onClick);

	host.appendChild(sw);
	overlays.add(sw);

	return () => {
		for (const t of pendingTimers) clearTimeout(t);
		pendingTimers = [];
		sw.removeEventListener("click", onClick);
		overlays.delete(sw);
		sw.remove();
	};
}

/**
 * Attach a click listener to an Android host that calls `navigator.vibrate`
 * with the resolved pattern. Idempotent. Returns a teardown function.
 */
function attachAndroidListener(
	host: HTMLElement,
	getPattern: (name: string) => HapticPattern | undefined,
	isReduced: () => boolean,
): (() => void) | undefined {
	if (host.hasAttribute(ATTACHED_ATTR)) return;
	host.setAttribute(ATTACHED_ATTR, "");

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
	};
}
