import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
	toVibrateSequence,
	schedulePattern,
	iosTick,
	isIOS,
	isVibrationSupported,
	resetDetection,
} from "../engine";
import type { HapticPattern } from "../types";
import { PRESETS } from "../presets";

describe("toVibrateSequence", () => {
	it("converts a single-segment pattern", () => {
		const pattern: HapticPattern = [{ duration: 15 }];
		expect(toVibrateSequence(pattern)).toEqual([15]);
	});

	it("converts a pattern with delay between segments", () => {
		const pattern: HapticPattern = [
			{ duration: 20 },
			{ delay: 15, duration: 10 },
		];
		expect(toVibrateSequence(pattern)).toEqual([20, 15, 10]);
	});

	it("handles a leading delay by prepending 0ms vibration", () => {
		const pattern: HapticPattern = [{ delay: 100, duration: 30 }];
		expect(toVibrateSequence(pattern)).toEqual([0, 100, 30]);
	});

	it("inserts 0ms pause between consecutive vibrations without delays", () => {
		const pattern: HapticPattern = [
			{ duration: 30 },
			{ duration: 20 },
		];
		expect(toVibrateSequence(pattern)).toEqual([30, 0, 20]);
	});

	it("handles three consecutive segments without delays", () => {
		const pattern: HapticPattern = [
			{ duration: 10 },
			{ duration: 20 },
			{ duration: 30 },
		];
		expect(toVibrateSequence(pattern)).toEqual([10, 0, 20, 0, 30]);
	});

	it("handles mixed delay/no-delay segments", () => {
		const pattern: HapticPattern = [
			{ duration: 10 },
			{ delay: 5, duration: 20 },
			{ duration: 30 },
		];
		expect(toVibrateSequence(pattern)).toEqual([10, 5, 20, 0, 30]);
	});

	it("returns empty array for empty pattern", () => {
		expect(toVibrateSequence([])).toEqual([]);
	});

	it("coerces negative durations to 0", () => {
		expect(toVibrateSequence([{ duration: -50 }])).toEqual([0]);
	});

	it("coerces NaN durations to 0", () => {
		expect(toVibrateSequence([{ duration: Number.NaN }])).toEqual([0]);
	});

	it("floors fractional durations", () => {
		expect(toVibrateSequence([{ duration: 15.9 }])).toEqual([15]);
	});

	it("coerces negative delays to 0", () => {
		expect(
			toVibrateSequence([{ duration: 10 }, { delay: -100, duration: 20 }]),
		).toEqual([10, 0, 20]);
	});

	it("caps segment count at 64", () => {
		const huge: HapticPattern = Array.from({ length: 200 }, () => ({
			duration: 1,
		}));
		const seq = toVibrateSequence(huge);
		// 64 segments → 64 vibrations + 63 inserted 0ms pauses = 127 entries
		expect(seq.length).toBe(127);
	});

	it("converts all built-in presets without error", () => {
		for (const [name, pattern] of Object.entries(PRESETS)) {
			const seq = toVibrateSequence(pattern);
			expect(seq.length, `${name} should produce a non-empty sequence`).toBeGreaterThan(0);
			for (const n of seq) {
				expect(n, `${name}: all values must be >= 0`).toBeGreaterThanOrEqual(0);
			}
		}
	});

	it("produces intensity-scaled vibrate/pause pattern for presets", () => {
		// 2.1.0: navigator.vibrate now reflects pattern intensity via duration-scaling.
		// Scaled = max(5, round(duration * intensity)), remainder pushed as trailing silence.
		// Adopted from web-haptics PR #28 (with attribution); raw PWM at 20ms cycle was
		// shown to be imperceptible on real Android motors (need 30ms+ sustained drive).
		expect(toVibrateSequence(PRESETS.selection)).toEqual([9, 6]);
		expect(toVibrateSequence(PRESETS["impact-light"])).toEqual([8, 27, 5, 5]);
		expect(toVibrateSequence(PRESETS.success)).toEqual([9, 36, 24, 26, 50]);
	});

	describe("intensity-aware via duration scaling (2.1.0)", () => {
		it("passes duration through when intensity is undefined", () => {
			expect(toVibrateSequence([{ duration: 100 }])).toEqual([100]);
		});

		it("passes duration through at intensity=1 (no scaling)", () => {
			expect(toVibrateSequence([{ duration: 100, intensity: 1 }])).toEqual([
				100,
			]);
		});

		it("scales duration by intensity when intensity < 1", () => {
			// 100ms at 0.5 → scaled = max(5, round(50)) = 50, remainder = 50
			expect(toVibrateSequence([{ duration: 100, intensity: 0.5 }])).toEqual([
				50, 50,
			]);
		});

		it("enforces 5ms floor for very low intensities (PR #28 lesson)", () => {
			// 8ms at 0.3 would mathematically scale to round(2.4)=2, but Android motors
			// need 5ms+ sustained drive to produce any perceptible vibration.
			// scaled = max(5, 2) = 5, remainder = 3.
			expect(toVibrateSequence([{ duration: 8, intensity: 0.3 }])).toEqual([5, 3]);
		});

		it("treats intensity=0 as silence (leading prefix + duration as pause)", () => {
			expect(toVibrateSequence([{ duration: 50, intensity: 0 }])).toEqual([
				0, 50,
			]);
		});

		it("clamps intensity above 1 to 1 (no scaling)", () => {
			expect(toVibrateSequence([{ duration: 100, intensity: 2 }])).toEqual([
				100,
			]);
		});

		it("clamps intensity below 0 to 0 (silence)", () => {
			expect(toVibrateSequence([{ duration: 50, intensity: -0.5 }])).toEqual([
				0, 50,
			]);
		});

		it("scales each segment independently with delay merging", () => {
			// Seg 1: scaled=max(5,8)=8, remainder=12 → [8, 12]
			// Seg 2: delay 15 merged into trailing off → [8, 27];
			//        scaled=max(5,2)=5, remainder=5 → [8, 27, 5, 5]
			expect(
				toVibrateSequence([
					{ duration: 20, intensity: 0.4 },
					{ delay: 15, duration: 10, intensity: 0.2 },
				]),
			).toEqual([8, 27, 5, 5]);
		});

		it("inserts 0ms separator between consecutive full-intensity segments", () => {
			// Without this, consecutive on-slots would collapse onto adjacent positions
			// and break the alternation invariant of navigator.vibrate.
			expect(
				toVibrateSequence([
					{ duration: 10, intensity: 1 },
					{ duration: 20, intensity: 1 },
				]),
			).toEqual([10, 0, 20]);
		});

		it("collapses an intensity=0 segment into the surrounding off-time", () => {
			// vibrate 10 → silence 20 → vibrate 15  ==  [10, 20, 15]
			expect(
				toVibrateSequence([
					{ duration: 10, intensity: 1 },
					{ duration: 20, intensity: 0 },
					{ duration: 15, intensity: 1 },
				]),
			).toEqual([10, 20, 15]);
		});

		it("handles a leading delay combined with intensity scaling", () => {
			// delay 100 → leading [0, 100]; then scaled=max(5,12)=12, remainder=18 → [0, 100, 12, 18]
			expect(
				toVibrateSequence([{ delay: 100, duration: 30, intensity: 0.4 }]),
			).toEqual([0, 100, 12, 18]);
		});
	});
});

describe("schedulePattern", () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it("fires iosTick immediately for first segment without delay", () => {
		const setTimeoutSpy = vi.spyOn(globalThis, "setTimeout");

		const pattern: HapticPattern = [
			{ duration: 20 },
			{ delay: 15, duration: 10 },
		];
		schedulePattern(pattern);

		expect(setTimeoutSpy).toHaveBeenCalledWith(expect.any(Function), 35);
		setTimeoutSpy.mockRestore();
	});

	it("schedules all segments with correct offsets", () => {
		const setTimeoutSpy = vi.spyOn(globalThis, "setTimeout");

		const pattern: HapticPattern = [
			{ duration: 30 },
			{ delay: 15, duration: 40 },
			{ delay: 10, duration: 50 },
		];
		schedulePattern(pattern);

		const calls = setTimeoutSpy.mock.calls;
		expect(calls).toHaveLength(2);
		expect(calls[0][1]).toBe(45);
		expect(calls[1][1]).toBe(95);

		setTimeoutSpy.mockRestore();
	});

	it("returns a cancel function that clears pending timers", () => {
		const setTimeoutSpy = vi.spyOn(globalThis, "setTimeout");
		const clearTimeoutSpy = vi.spyOn(globalThis, "clearTimeout");

		const pattern: HapticPattern = [
			{ duration: 30 },
			{ delay: 15, duration: 40 },
			{ delay: 10, duration: 50 },
		];
		const cancel = schedulePattern(pattern);
		expect(typeof cancel).toBe("function");
		cancel();
		expect(clearTimeoutSpy).toHaveBeenCalledTimes(setTimeoutSpy.mock.calls.length);

		setTimeoutSpy.mockRestore();
		clearTimeoutSpy.mockRestore();
	});

	it("caps total scheduled offset at 60s", () => {
		const setTimeoutSpy = vi.spyOn(globalThis, "setTimeout");
		// pattern that would otherwise schedule a tick past the 60s cap
		const pattern: HapticPattern = [
			{ duration: 1 },
			{ delay: 70_000, duration: 1 },
		];
		schedulePattern(pattern);
		// second segment delay exceeds MAX_TOTAL_OFFSET_MS, so it must be skipped
		expect(setTimeoutSpy).not.toHaveBeenCalled();
		setTimeoutSpy.mockRestore();
	});
});

describe("iosTick", () => {
	it("does not throw in jsdom environment", () => {
		expect(() => iosTick()).not.toThrow();
	});

	it("appends to document.body, not document.head", () => {
		const appendSpy = vi.spyOn(document.body, "appendChild");
		const removeSpy = vi.spyOn(document.body, "removeChild");

		iosTick();

		expect(appendSpy).toHaveBeenCalled();
		expect(removeSpy).toHaveBeenCalled();

		appendSpy.mockRestore();
		removeSpy.mockRestore();
	});
});

describe("platform detection — UA matrix (2.1.0 coverage check)", () => {
	// Each case stubs navigator.userAgent + navigator.vibrate and verifies our
	// isIOS()/isVibrationSupported() return the expected verdict. Covers the
	// device classes lochie's upstream PRs #32 and #26 raised.

	const cases: Array<{
		name: string;
		ua: string;
		hasVibrate: boolean;
		maxTouchPoints?: number;
		platform?: string;
		expectIOS: boolean;
		expectVibrate: boolean;
	}> = [
		{
			name: "iPhone Safari (iOS 26.5)",
			ua: "Mozilla/5.0 (iPhone; CPU iPhone OS 26_5 like Mac OS X) AppleWebKit/605.1.15",
			hasVibrate: false,
			expectIOS: true,
			expectVibrate: false,
		},
		{
			name: "iPhone Chrome (CriOS)",
			ua: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/124.0.6367.111",
			hasVibrate: false,
			expectIOS: true,
			expectVibrate: false,
		},
		{
			name: "iPad with iPad UA",
			ua: "Mozilla/5.0 (iPad; CPU OS 17_4 like Mac OS X) AppleWebKit/605.1.15",
			hasVibrate: false,
			expectIOS: true,
			expectVibrate: false,
		},
		{
			name: "iPadOS 13+ in desktop mode (Mac platform + multitouch)",
			ua: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15",
			hasVibrate: false,
			maxTouchPoints: 5,
			platform: "MacIntel",
			expectIOS: true,
			expectVibrate: false,
		},
		{
			name: "Android Chrome with Vibration API",
			ua: "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36",
			hasVibrate: true,
			expectIOS: false,
			expectVibrate: true,
		},
		{
			name: "Samsung Internet on Android",
			ua: "Mozilla/5.0 (Linux; Android 14; SAMSUNG SM-S908B) AppleWebKit/537.36 SamsungBrowser/24.0",
			hasVibrate: true,
			expectIOS: false,
			expectVibrate: true,
		},
		{
			name: "Desktop macOS (no touch)",
			ua: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15",
			hasVibrate: false,
			maxTouchPoints: 0,
			platform: "MacIntel",
			expectIOS: false,
			expectVibrate: false,
		},
		{
			name: "Desktop Windows (no touch)",
			ua: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
			hasVibrate: false,
			expectIOS: false,
			expectVibrate: false,
		},
		{
			name: "Firefox on Android (post-129, vibration removed)",
			ua: "Mozilla/5.0 (Android 14; Mobile; rv:130.0) Gecko/130.0 Firefox/130.0",
			hasVibrate: false,
			expectIOS: false,
			expectVibrate: false,
		},
	];

	const setNavigator = (
		ua: string,
		vibrate: boolean,
		maxTouchPoints?: number,
		platform?: string,
	) => {
		Object.defineProperty(navigator, "userAgent", {
			value: ua,
			writable: true,
			configurable: true,
		});
		Object.defineProperty(navigator, "vibrate", {
			value: vibrate ? () => true : undefined,
			writable: true,
			configurable: true,
		});
		if (maxTouchPoints !== undefined) {
			Object.defineProperty(navigator, "maxTouchPoints", {
				value: maxTouchPoints,
				writable: true,
				configurable: true,
			});
		}
		if (platform !== undefined) {
			Object.defineProperty(navigator, "platform", {
				value: platform,
				writable: true,
				configurable: true,
			});
		}
	};

	afterEach(() => {
		resetDetection();
	});

	for (const c of cases) {
		it(`${c.name}: isIOS=${c.expectIOS}, isVibrationSupported=${c.expectVibrate}`, () => {
			setNavigator(c.ua, c.hasVibrate, c.maxTouchPoints, c.platform);
			resetDetection();
			expect(isIOS()).toBe(c.expectIOS);
			expect(isVibrationSupported()).toBe(c.expectVibrate);
		});
	}
});

describe("platform detection", () => {
	afterEach(() => {
		resetDetection();
	});

	it("isIOS returns a boolean", () => {
		expect(typeof isIOS()).toBe("boolean");
	});

	it("isVibrationSupported returns a boolean", () => {
		expect(typeof isVibrationSupported()).toBe("boolean");
	});

	it("resetDetection clears cached values", () => {
		isIOS();
		isVibrationSupported();

		resetDetection();

		Object.defineProperty(navigator, "vibrate", {
			value: () => true,
			writable: true,
			configurable: true,
		});

		expect(isVibrationSupported()).toBe(true);

		Object.defineProperty(navigator, "vibrate", {
			value: undefined,
			writable: true,
			configurable: true,
		});
	});

	it("caches results after first call", () => {
		const first = isIOS();
		const second = isIOS();
		expect(first).toBe(second);

		const firstVib = isVibrationSupported();
		const secondVib = isVibrationSupported();
		expect(firstVib).toBe(secondVib);
	});
});
