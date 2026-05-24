import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { attachHaptics, resetDetection } from "../engine";
import type { HapticPattern } from "../types";

let vibrateMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
	vibrateMock = vi.fn(() => true);
	Object.defineProperty(navigator, "vibrate", {
		value: vibrateMock,
		writable: true,
		configurable: true,
	});
	resetDetection();
});

afterEach(() => {
	Object.defineProperty(navigator, "vibrate", {
		value: undefined,
		writable: true,
		configurable: true,
	});
	resetDetection();
	// Clean up any leftover DOM
	document.body.innerHTML = "";
});

describe("attachHaptics (Android path)", () => {
	it("returns a no-op teardown when document is unavailable", () => {
		// Can't actually unset document in jsdom, but verify the function exists
		// and accepts the expected shape.
		const teardown = attachHaptics({ getPattern: () => undefined });
		expect(typeof teardown).toBe("function");
		teardown();
	});

	it("attaches click handler to elements present at install time", () => {
		const btn = document.createElement("button");
		btn.setAttribute("data-haptic", "tap");
		document.body.appendChild(btn);

		const teardown = attachHaptics({
			getPattern: (name) => (name === "tap" ? [{ duration: 25 }] : undefined),
		});

		btn.click();
		expect(vibrateMock).toHaveBeenCalledWith([25]);

		teardown();
	});

	it("picks up dynamically-added elements via MutationObserver", async () => {
		const teardown = attachHaptics({
			getPattern: (name) => (name === "tap" ? [{ duration: 25 }] : undefined),
		});

		const btn = document.createElement("button");
		btn.setAttribute("data-haptic", "tap");
		document.body.appendChild(btn);

		await Promise.resolve();

		btn.click();
		expect(vibrateMock).toHaveBeenCalledWith([25]);

		teardown();
	});

	it("skips when getPattern returns undefined", () => {
		const btn = document.createElement("button");
		btn.setAttribute("data-haptic", "unknown");
		document.body.appendChild(btn);

		const teardown = attachHaptics({
			getPattern: () => undefined,
		});

		btn.click();
		expect(vibrateMock).not.toHaveBeenCalled();

		teardown();
	});

	it("teardown removes click handlers", () => {
		const btn = document.createElement("button");
		btn.setAttribute("data-haptic", "tap");
		document.body.appendChild(btn);

		const teardown = attachHaptics({
			getPattern: () => [{ duration: 25 }],
		});

		teardown();
		btn.click();
		expect(vibrateMock).not.toHaveBeenCalled();
	});

	it("teardown disconnects MutationObserver", async () => {
		const teardown = attachHaptics({
			getPattern: () => [{ duration: 25 }],
		});

		teardown();

		const btn = document.createElement("button");
		btn.setAttribute("data-haptic", "tap");
		document.body.appendChild(btn);

		await Promise.resolve();

		btn.click();
		expect(vibrateMock).not.toHaveBeenCalled();
	});

	it("respects a custom selector", () => {
		const btn = document.createElement("button");
		btn.setAttribute("data-haptic", "tap");
		btn.classList.add("my-haptic");
		document.body.appendChild(btn);

		const teardown = attachHaptics({
			selector: ".my-haptic",
			getPattern: () => [{ duration: 25 }],
		});

		btn.click();
		expect(vibrateMock).toHaveBeenCalledWith([25]);

		teardown();
	});

	it("idempotent: re-attaches to the same element only once", () => {
		const btn = document.createElement("button");
		btn.setAttribute("data-haptic", "tap");
		document.body.appendChild(btn);

		const teardown1 = attachHaptics({
			getPattern: () => [{ duration: 25 }],
		});

		// A second attachHaptics call on the same DOM would normally try to
		// attach again — the ATTACHED_ATTR marker should make this a no-op
		// for the same element.
		const teardown2 = attachHaptics({
			getPattern: () => [{ duration: 25 }],
		});

		btn.click();
		// One vibrate per click despite two installs.
		expect(vibrateMock).toHaveBeenCalledTimes(1);

		teardown1();
		teardown2();
	});

	it("converts multi-segment pattern via toVibrateSequence", () => {
		const btn = document.createElement("button");
		btn.setAttribute("data-haptic", "success");
		document.body.appendChild(btn);

		const teardown = attachHaptics({
			getPattern: (name) =>
				name === "success"
					? [
							{ duration: 30 },
							{ delay: 15, duration: 40 },
							{ delay: 10, duration: 50 },
						]
					: undefined,
		});

		btn.click();
		expect(vibrateMock).toHaveBeenCalledWith([30, 15, 40, 10, 50]);

		teardown();
	});

	it("ignores missing data-haptic value (attribute removed at click time)", () => {
		const btn = document.createElement("button");
		btn.setAttribute("data-haptic", "tap");
		document.body.appendChild(btn);

		const teardown = attachHaptics({
			getPattern: () => [{ duration: 25 }],
		});

		// Remove the attribute after attachment.
		btn.removeAttribute("data-haptic");

		btn.click();
		expect(vibrateMock).not.toHaveBeenCalled();

		teardown();
	});

	it("picks up [data-haptic] descendants of dynamically-added subtrees", async () => {
		const teardown = attachHaptics({
			getPattern: () => [{ duration: 25 }],
		});

		const wrapper = document.createElement("div");
		const btn = document.createElement("button");
		btn.setAttribute("data-haptic", "tap");
		wrapper.appendChild(btn);
		document.body.appendChild(wrapper);

		await Promise.resolve();

		btn.click();
		expect(vibrateMock).toHaveBeenCalledWith([25]);

		teardown();
	});

	it("scoped root only sees its own subtree, not the rest of the document", async () => {
		const inScope = document.createElement("div");
		document.body.appendChild(inScope);

		const outOfScope = document.createElement("button");
		outOfScope.setAttribute("data-haptic", "tap");
		document.body.appendChild(outOfScope);

		const teardown = attachHaptics({
			root: inScope,
			getPattern: () => [{ duration: 25 }],
		});

		outOfScope.click();
		expect(vibrateMock).not.toHaveBeenCalled();

		const inScopeBtn = document.createElement("button");
		inScopeBtn.setAttribute("data-haptic", "tap");
		inScope.appendChild(inScopeBtn);
		await Promise.resolve();

		inScopeBtn.click();
		expect(vibrateMock).toHaveBeenCalledWith([25]);

		teardown();
	});
});

describe("attachHaptics (iOS overlay path)", () => {
	let originalUA: string;
	let originalVibrate: unknown;

	beforeEach(() => {
		originalUA = navigator.userAgent;
		originalVibrate = (navigator as { vibrate?: unknown }).vibrate;
		Object.defineProperty(navigator, "userAgent", {
			value:
				"Mozilla/5.0 (iPhone; CPU iPhone OS 26_5 like Mac OS X) AppleWebKit/605.1.15",
			writable: true,
			configurable: true,
		});
		Object.defineProperty(navigator, "vibrate", {
			value: undefined,
			writable: true,
			configurable: true,
		});
		resetDetection();
	});

	afterEach(() => {
		Object.defineProperty(navigator, "userAgent", {
			value: originalUA,
			writable: true,
			configurable: true,
		});
		Object.defineProperty(navigator, "vibrate", {
			value: originalVibrate,
			writable: true,
			configurable: true,
		});
		resetDetection();
		document.body.innerHTML = "";
	});

	it("injects a switch overlay child on each [data-haptic] host", () => {
		const btn = document.createElement("button");
		btn.setAttribute("data-haptic", "tap");
		document.body.appendChild(btn);

		const teardown = attachHaptics({
			getPattern: (name) =>
				name === "tap" ? [{ duration: 25 }] : undefined,
		});

		const overlay = btn.querySelector(
			"[data-haptic-overlay]",
		) as HTMLInputElement | null;
		expect(overlay).not.toBeNull();
		expect(overlay?.type).toBe("checkbox");
		expect(overlay?.hasAttribute("switch")).toBe(true);
		expect(overlay?.getAttribute("aria-hidden")).toBe("true");
		expect(overlay?.tabIndex).toBe(-1);

		teardown();
		expect(btn.querySelector("[data-haptic-overlay]")).toBeNull();
	});

	it("forces position:relative on hosts whose computed position is static", () => {
		const btn = document.createElement("button");
		btn.setAttribute("data-haptic", "tap");
		document.body.appendChild(btn);

		const teardown = attachHaptics({
			getPattern: () => [{ duration: 25 }],
		});

		expect(btn.style.position).toBe("relative");
		teardown();
	});

	it("re-dispatches click to host so consumer onclick handlers still run", () => {
		const btn = document.createElement("button");
		btn.setAttribute("data-haptic", "tap");
		document.body.appendChild(btn);

		const teardown = attachHaptics({
			getPattern: () => [{ duration: 25 }],
		});

		let hostClicks = 0;
		btn.addEventListener("click", () => {
			hostClicks++;
		});

		const overlay = btn.querySelector(
			"[data-haptic-overlay]",
		) as HTMLInputElement;
		overlay.click();

		expect(hostClicks).toBe(1);
		teardown();
	});

	it("idempotent: re-attaches to the same host only once", () => {
		const btn = document.createElement("button");
		btn.setAttribute("data-haptic", "tap");
		document.body.appendChild(btn);

		const teardown1 = attachHaptics({
			getPattern: () => [{ duration: 25 }],
		});
		const teardown2 = attachHaptics({
			getPattern: () => [{ duration: 25 }],
		});

		const overlays = btn.querySelectorAll("[data-haptic-overlay]");
		expect(overlays.length).toBe(1);

		teardown1();
		teardown2();
	});

	it("picks up dynamically-added iOS hosts via MutationObserver", async () => {
		const teardown = attachHaptics({
			getPattern: () => [{ duration: 25 }],
		});

		const btn = document.createElement("button");
		btn.setAttribute("data-haptic", "tap");
		document.body.appendChild(btn);

		await Promise.resolve();

		expect(btn.querySelector("[data-haptic-overlay]")).not.toBeNull();
		teardown();
	});

	it("teardown removes all overlays", () => {
		const a = document.createElement("button");
		a.setAttribute("data-haptic", "tap");
		const b = document.createElement("button");
		b.setAttribute("data-haptic", "tap");
		document.body.append(a, b);

		const teardown = attachHaptics({
			getPattern: () => [{ duration: 25 }],
		});

		expect(document.querySelectorAll("[data-haptic-overlay]").length).toBe(2);

		teardown();
		expect(document.querySelectorAll("[data-haptic-overlay]").length).toBe(0);
	});

	describe("intensity-scaled RAF multi-tick scheduling (2.1.0)", () => {
		let rafQueue: { cb: FrameRequestCallback; id: number }[];
		let rafSpy: ReturnType<typeof vi.fn>;
		let cancelRAFSpy: ReturnType<typeof vi.fn>;

		beforeEach(() => {
			rafQueue = [];
			let nextId = 1;
			rafSpy = vi.fn((cb: FrameRequestCallback) => {
				const id = nextId++;
				rafQueue.push({ cb, id });
				return id;
			});
			cancelRAFSpy = vi.fn((id: number) => {
				const idx = rafQueue.findIndex((q) => q.id === id);
				if (idx >= 0) rafQueue.splice(idx, 1);
			});
			vi.stubGlobal("requestAnimationFrame", rafSpy);
			vi.stubGlobal("cancelAnimationFrame", cancelRAFSpy);
		});

		afterEach(() => {
			vi.unstubAllGlobals();
		});

		/** Fire the next queued RAF callback with the given timestamp. */
		const fireFrame = (time: number) => {
			const next = rafQueue.shift();
			if (next) next.cb(time);
		};

		const setupOverlayWithPattern = (pattern: HapticPattern) => {
			const btn = document.createElement("button");
			btn.setAttribute("data-haptic", "tap");
			document.body.appendChild(btn);
			const teardown = attachHaptics({ getPattern: () => pattern });
			const overlay = btn.querySelector(
				"[data-haptic-overlay]",
			) as HTMLInputElement;
			const clickSpy = vi.spyOn(overlay, "click");
			return { btn, overlay, teardown, clickSpy };
		};

		it("requests an animation frame for multi-tick scheduling (not setTimeout)", () => {
			const setTimeoutSpy = vi.spyOn(globalThis, "setTimeout");
			const { overlay, teardown } = setupOverlayWithPattern([
				{ duration: 25, intensity: 1.0 },
				{ duration: 25, intensity: 1.0 },
			]);

			setTimeoutSpy.mockClear();
			overlay.click();

			expect(rafSpy).toHaveBeenCalled();
			// setTimeout may still be called by jsdom's focus/dispatchEvent paths
			// (always with 0 offset) — but never by our scheduling code.
			const nonZeroSetTimeouts = setTimeoutSpy.mock.calls.filter(
				(c) => c[1] !== 0,
			);
			expect(nonZeroSetTimeouts).toHaveLength(0);

			teardown();
			setTimeoutSpy.mockRestore();
		});

		it("fires tick 1 at elapsed 16ms for intensity=1.0", () => {
			const { overlay, teardown, clickSpy } = setupOverlayWithPattern([
				{ duration: 25, intensity: 1.0 },
				{ duration: 25, intensity: 1.0 },
			]);

			overlay.click();
			expect(clickSpy).toHaveBeenCalledTimes(1); // user click

			fireFrame(0); // anchors startTime; no tick yet
			expect(clickSpy).toHaveBeenCalledTimes(1);

			fireFrame(15); // elapsed 15 < 16ms threshold
			expect(clickSpy).toHaveBeenCalledTimes(1);

			fireFrame(16); // elapsed 16 == threshold → tick fires
			expect(clickSpy).toHaveBeenCalledTimes(2);

			teardown();
			clickSpy.mockRestore();
		});

		it("waits until elapsed 200ms for intensity=0 (TOGGLE_MIN+TOGGLE_MAX)", () => {
			const { overlay, teardown, clickSpy } = setupOverlayWithPattern([
				{ duration: 25, intensity: 0 },
				{ duration: 25, intensity: 0 },
			]);

			overlay.click();
			fireFrame(0);
			fireFrame(100);
			expect(clickSpy).toHaveBeenCalledTimes(1); // still under 200ms

			fireFrame(200);
			expect(clickSpy).toHaveBeenCalledTimes(2);

			teardown();
			clickSpy.mockRestore();
		});

		it("fires at elapsed 108ms for intensity=0.5 (linear interpolation)", () => {
			const { overlay, teardown, clickSpy } = setupOverlayWithPattern([
				{ duration: 100, intensity: 0.5 },
				{ duration: 100, intensity: 0.5 },
			]);

			overlay.click();
			fireFrame(0);
			fireFrame(107);
			expect(clickSpy).toHaveBeenCalledTimes(1);

			fireFrame(108);
			expect(clickSpy).toHaveBeenCalledTimes(2);

			teardown();
			clickSpy.mockRestore();
		});

		it("adds per-segment delay on top of intensity-derived offset", () => {
			const { overlay, teardown, clickSpy } = setupOverlayWithPattern([
				{ duration: 25, intensity: 1.0 },
				{ delay: 50, duration: 25, intensity: 1.0 },
			]);

			overlay.click();
			fireFrame(0);
			fireFrame(65);
			expect(clickSpy).toHaveBeenCalledTimes(1);

			fireFrame(66); // 16 (intensity gap) + 50 (delay) = 66
			expect(clickSpy).toHaveBeenCalledTimes(2);

			teardown();
			clickSpy.mockRestore();
		});

		it("defaults missing intensity to 1.0 (16ms tick gap)", () => {
			const { overlay, teardown, clickSpy } = setupOverlayWithPattern([
				{ duration: 25 },
				{ duration: 25 },
			]);

			overlay.click();
			fireFrame(0);
			fireFrame(16);
			expect(clickSpy).toHaveBeenCalledTimes(2);

			teardown();
			clickSpy.mockRestore();
		});

		it("accumulates offsets across three intensity-bearing segments", () => {
			const { overlay, teardown, clickSpy } = setupOverlayWithPattern([
				{ duration: 25, intensity: 1.0 }, // initial gap = 16
				{ duration: 25, intensity: 0.5 }, // tick 1 at 16; advance by 108 = 124
				{ duration: 25, intensity: 0 }, // tick 2 at 124
			]);

			overlay.click();
			fireFrame(0);
			fireFrame(16);
			expect(clickSpy).toHaveBeenCalledTimes(2); // tick 1

			fireFrame(50);
			expect(clickSpy).toHaveBeenCalledTimes(2);

			fireFrame(124);
			expect(clickSpy).toHaveBeenCalledTimes(3); // tick 2

			teardown();
			clickSpy.mockRestore();
		});

		it("teardown cancels the in-flight animation frame", () => {
			const { overlay, teardown } = setupOverlayWithPattern([
				{ duration: 25, intensity: 1.0 },
				{ duration: 25, intensity: 1.0 },
			]);

			overlay.click();
			fireFrame(0); // schedules another frame after anchoring startTime
			expect(rafQueue.length).toBe(1);

			teardown();

			expect(cancelRAFSpy).toHaveBeenCalled();
		});

		it("a late RAF callback after teardown does not fire a tick (cancelled flag)", () => {
			// Even if the browser delivers an already-queued RAF callback after
			// cancelAnimationFrame ran, the closure's cancelled flag must
			// short-circuit before sw.click() executes.
			const { overlay, teardown, clickSpy } = setupOverlayWithPattern([
				{ duration: 25, intensity: 1.0 },
				{ duration: 25, intensity: 1.0 },
			]);

			overlay.click();
			expect(clickSpy).toHaveBeenCalledTimes(1); // user click only

			// Capture the pending RAF before teardown.
			const pending = rafQueue.shift();
			expect(pending).toBeDefined();

			teardown();

			// Simulate browser delivering the already-queued callback after disconnect.
			pending!.cb(16);

			// No additional sw.click() — the cancelled flag short-circuited.
			expect(clickSpy).toHaveBeenCalledTimes(1);
		});

		it("re-attaching after teardown gives a fresh independent overlay (no leak from old closure)", () => {
			const btn = document.createElement("button");
			btn.setAttribute("data-haptic", "tap");
			document.body.appendChild(btn);

			const pattern: HapticPattern = [
				{ duration: 25, intensity: 1.0 },
				{ duration: 25, intensity: 1.0 },
			];

			const teardown1 = attachHaptics({ getPattern: () => pattern });
			const overlay1 = btn.querySelector(
				"[data-haptic-overlay]",
			) as HTMLInputElement;
			overlay1.click();
			const pendingFromFirstMount = rafQueue.shift();

			teardown1();
			// Old overlay should be detached.
			expect(btn.querySelector("[data-haptic-overlay]")).toBeNull();

			const teardown2 = attachHaptics({ getPattern: () => pattern });
			const overlay2 = btn.querySelector(
				"[data-haptic-overlay]",
			) as HTMLInputElement;
			expect(overlay2).not.toBeNull();
			expect(overlay2).not.toBe(overlay1); // fresh element

			// Late callback from the first mount fires — must not touch the new overlay.
			const clickSpy2 = vi.spyOn(overlay2, "click");
			pendingFromFirstMount!.cb(50);
			expect(clickSpy2).not.toHaveBeenCalled();

			teardown2();
			clickSpy2.mockRestore();
		});

		it("does not cascade host clicks for multi-tick patterns", () => {
			// Regression: each programmatic sw.click() must NOT re-dispatch to the host,
			// otherwise consumer onclick fires N times per user tap (one per tick).
			const { btn, overlay, teardown } = setupOverlayWithPattern([
				{ duration: 25, intensity: 1.0 },
				{ duration: 25, intensity: 1.0 },
				{ duration: 25, intensity: 1.0 },
			]);

			let hostClicks = 0;
			btn.addEventListener("click", () => hostClicks++);

			overlay.click();
			// Drive RAF past all scheduled ticks
			let time = 0;
			while (rafQueue.length > 0 && time <= 500) {
				time += 16;
				fireFrame(time);
			}

			expect(hostClicks).toBe(1);
			teardown();
		});
	});

	describe("debugOverlay (2.1.0)", () => {
		it("does not apply outline to overlays when debugOverlay is omitted", () => {
			const btn = document.createElement("button");
			btn.setAttribute("data-haptic", "tap");
			document.body.appendChild(btn);

			const teardown = attachHaptics({
				getPattern: () => [{ duration: 25 }],
			});

			const overlay = btn.querySelector(
				"[data-haptic-overlay]",
			) as HTMLInputElement;
			expect(overlay.style.outline).toBe("");

			teardown();
		});

		it("applies a dashed outline to overlays when debugOverlay is true", () => {
			const btn = document.createElement("button");
			btn.setAttribute("data-haptic", "tap");
			document.body.appendChild(btn);

			const teardown = attachHaptics({
				getPattern: () => [{ duration: 25 }],
				debugOverlay: true,
			});

			const overlay = btn.querySelector(
				"[data-haptic-overlay]",
			) as HTMLInputElement;
			expect(overlay.style.outline).toMatch(/dashed/);
			expect(overlay.style.outlineOffset).toBe("-1px");

			teardown();
		});

		it("emits console.debug on iOS overlay attach when debugOverlay is true", () => {
			const debugSpy = vi
				.spyOn(console, "debug")
				.mockImplementation(() => {});
			const btn = document.createElement("button");
			btn.setAttribute("data-haptic", "tap");
			document.body.appendChild(btn);

			const teardown = attachHaptics({
				getPattern: () => [{ duration: 25 }],
				debugOverlay: true,
			});

			expect(debugSpy).toHaveBeenCalled();

			teardown();
			debugSpy.mockRestore();
		});

		it("emits console.debug on iOS overlay detach when debugOverlay is true", () => {
			const debugSpy = vi
				.spyOn(console, "debug")
				.mockImplementation(() => {});
			const btn = document.createElement("button");
			btn.setAttribute("data-haptic", "tap");
			document.body.appendChild(btn);

			const teardown = attachHaptics({
				getPattern: () => [{ duration: 25 }],
				debugOverlay: true,
			});

			debugSpy.mockClear();
			teardown();
			expect(debugSpy).toHaveBeenCalled();

			debugSpy.mockRestore();
		});

		it("does not emit console.debug when debugOverlay is false", () => {
			const debugSpy = vi
				.spyOn(console, "debug")
				.mockImplementation(() => {});
			const btn = document.createElement("button");
			btn.setAttribute("data-haptic", "tap");
			document.body.appendChild(btn);

			const teardown = attachHaptics({
				getPattern: () => [{ duration: 25 }],
				debugOverlay: false,
			});

			teardown();
			expect(debugSpy).not.toHaveBeenCalled();

			debugSpy.mockRestore();
		});
	});
});

describe("attachHaptics — audioFallback desktop wiring (2.1.0)", () => {
	beforeEach(() => {
		// Desktop: no Vibration API, default jsdom userAgent doesn't match iOS.
		Object.defineProperty(navigator, "vibrate", {
			value: undefined,
			writable: true,
			configurable: true,
		});
		resetDetection();
	});

	afterEach(() => {
		resetDetection();
		document.body.innerHTML = "";
	});

	it("does not attach a listener on desktop when audioFallback is omitted", () => {
		const btn = document.createElement("button");
		btn.setAttribute("data-haptic", "tap");
		document.body.appendChild(btn);

		const teardown = attachHaptics({
			getPattern: () => [{ duration: 25 }],
		});

		expect(btn.hasAttribute("data-haptic-attached")).toBe(false);
		expect(btn.querySelector("[data-haptic-overlay]")).toBeNull();

		teardown();
	});

	it("attaches a desktop click listener when audioFallback is true", () => {
		const btn = document.createElement("button");
		btn.setAttribute("data-haptic", "tap");
		document.body.appendChild(btn);

		const teardown = attachHaptics({
			getPattern: () => [{ duration: 25 }],
			audioFallback: true,
		});

		expect(btn.hasAttribute("data-haptic-attached")).toBe(true);

		teardown();
		expect(btn.hasAttribute("data-haptic-attached")).toBe(false);
	});

	it("does not inject an iOS overlay on desktop even with audioFallback: true", () => {
		const btn = document.createElement("button");
		btn.setAttribute("data-haptic", "tap");
		document.body.appendChild(btn);

		const teardown = attachHaptics({
			getPattern: () => [{ duration: 25 }],
			audioFallback: true,
		});

		expect(btn.querySelector("[data-haptic-overlay]")).toBeNull();

		teardown();
	});

	it("picks up dynamically-added desktop hosts via MutationObserver", async () => {
		const teardown = attachHaptics({
			getPattern: () => [{ duration: 25 }],
			audioFallback: true,
		});

		const btn = document.createElement("button");
		btn.setAttribute("data-haptic", "tap");
		document.body.appendChild(btn);

		await Promise.resolve();

		expect(btn.hasAttribute("data-haptic-attached")).toBe(true);
		teardown();
	});
});

describe("attachHaptics — debugOverlay logs on Android path (2.1.0)", () => {
	beforeEach(() => {
		vibrateMock = vi.fn(() => true);
		Object.defineProperty(navigator, "vibrate", {
			value: vibrateMock,
			writable: true,
			configurable: true,
		});
		resetDetection();
	});

	afterEach(() => {
		Object.defineProperty(navigator, "vibrate", {
			value: undefined,
			writable: true,
			configurable: true,
		});
		resetDetection();
		document.body.innerHTML = "";
	});

	it("emits console.debug on Android attach when debugOverlay is true", () => {
		const debugSpy = vi.spyOn(console, "debug").mockImplementation(() => {});
		const btn = document.createElement("button");
		btn.setAttribute("data-haptic", "tap");
		document.body.appendChild(btn);

		const teardown = attachHaptics({
			getPattern: () => [{ duration: 25 }],
			debugOverlay: true,
		});

		expect(debugSpy).toHaveBeenCalled();
		teardown();
		debugSpy.mockRestore();
	});
});
