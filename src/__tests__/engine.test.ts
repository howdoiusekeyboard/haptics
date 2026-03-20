import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { toVibrateSequence, schedulePattern, iosTick } from "../engine";
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
		// First segment: vibrate 20ms
		// Second segment: pause 15ms, vibrate 10ms
		expect(toVibrateSequence(pattern)).toEqual([20, 15, 10]);
	});

	it("handles a leading delay by prepending 0ms vibration", () => {
		const pattern: HapticPattern = [{ delay: 100, duration: 30 }];
		// Can't start with a pause, so: vibrate 0ms, pause 100ms, vibrate 30ms
		expect(toVibrateSequence(pattern)).toEqual([0, 100, 30]);
	});

	it("inserts 0ms pause between consecutive vibrations without delays", () => {
		const pattern: HapticPattern = [
			{ duration: 30 },
			{ duration: 20 },
		];
		// Without a delay, we need an explicit 0ms pause separator
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

	it("converts all built-in presets without error", () => {
		for (const [name, pattern] of Object.entries(PRESETS)) {
			const seq = toVibrateSequence(pattern);
			expect(seq.length, `${name} should produce a non-empty sequence`).toBeGreaterThan(0);
			// Every element should be a non-negative number
			for (const n of seq) {
				expect(n, `${name}: all values must be >= 0`).toBeGreaterThanOrEqual(0);
			}
		}
	});

	it("produces correct alternating vibrate/pause pattern for presets", () => {
		// selection: single segment [{ duration: 15 }] → [15]
		expect(toVibrateSequence(PRESETS.selection)).toEqual([15]);

		// impact-light: [{ duration: 20 }, { delay: 15, duration: 10 }] → [20, 15, 10]
		expect(toVibrateSequence(PRESETS["impact-light"])).toEqual([20, 15, 10]);

		// success: 3 segments, first no delay, second delay 15, third delay 10
		expect(toVibrateSequence(PRESETS.success)).toEqual([30, 15, 40, 10, 50]);
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
		// We can't easily test iosTick in jsdom (no real checkbox switch),
		// but we can verify setTimeout scheduling
		const setTimeoutSpy = vi.spyOn(globalThis, "setTimeout");

		const pattern: HapticPattern = [
			{ duration: 20 },
			{ delay: 15, duration: 10 },
		];
		schedulePattern(pattern);

		// Second segment should be scheduled at offset 20 (duration) + 15 (delay) = 35ms
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

		// Segment 2: offset = 30 (dur) + 15 (delay) = 45ms
		// Segment 3: offset = 45 + 40 (dur) + 10 (delay) = 95ms
		const calls = setTimeoutSpy.mock.calls;
		expect(calls).toHaveLength(2); // first segment fires immediately
		expect(calls[0][1]).toBe(45);
		expect(calls[1][1]).toBe(95);

		setTimeoutSpy.mockRestore();
	});
});

describe("iosTick", () => {
	it("does not throw in jsdom environment", () => {
		// iosTick creates DOM elements — should not throw even in non-Safari env
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
