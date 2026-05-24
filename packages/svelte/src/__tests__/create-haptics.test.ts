import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { resetDetection } from "@haptics/core";
import { createHaptics } from "../create-haptics";
import { _resetConfig } from "../context";

let vibrateMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
	vibrateMock = vi.fn(() => true);
	Object.defineProperty(navigator, "vibrate", {
		value: vibrateMock,
		writable: true,
		configurable: true,
	});
	resetDetection();
	_resetConfig();
});

afterEach(() => {
	Object.defineProperty(navigator, "vibrate", {
		value: undefined,
		writable: true,
		configurable: true,
	});
	resetDetection();
	_resetConfig();
});

describe("createHaptics", () => {
	it("returns trigger, cancel, isSupported, and isIOSSupported", () => {
		const haptics = createHaptics();

		expect(haptics).toHaveProperty("trigger");
		expect(haptics).toHaveProperty("cancel");
		expect(typeof haptics.isSupported).toBe("boolean");
		expect(typeof haptics.isIOSSupported).toBe("boolean");
	});

	it("detects vibration support", () => {
		const haptics = createHaptics();
		expect(haptics.isSupported).toBe(true);
	});

	it("triggers vibration for a built-in preset", () => {
		const haptics = createHaptics();
		haptics.trigger("selection");
		expect(vibrateMock).toHaveBeenCalledWith([9, 6]);
	});

	it("does not call vibrate for unknown preset", () => {
		const haptics = createHaptics();
		haptics.trigger("nonexistent-pattern");
		expect(vibrateMock).not.toHaveBeenCalled();
	});

	it("cancel calls navigator.vibrate(0)", () => {
		const haptics = createHaptics();
		haptics.cancel();
		expect(vibrateMock).toHaveBeenCalledWith(0);
	});

	it("isIOSSupported is false in jsdom", () => {
		const haptics = createHaptics();
		expect(haptics.isIOSSupported).toBe(false);
	});

	it("exposes a destroy method", () => {
		const haptics = createHaptics();
		expect(typeof haptics.destroy).toBe("function");
		expect(() => haptics.destroy()).not.toThrow();
		// idempotent
		expect(() => haptics.destroy()).not.toThrow();
	});

	it("rejects __proto__ as an action name", () => {
		const haptics = createHaptics();
		expect(() => haptics.trigger("__proto__")).not.toThrow();
		expect(vibrateMock).not.toHaveBeenCalled();
		haptics.destroy();
	});

	it("rejects constructor/toString as action names", () => {
		const haptics = createHaptics();
		haptics.trigger("constructor");
		haptics.trigger("toString");
		expect(vibrateMock).not.toHaveBeenCalled();
		haptics.destroy();
	});

	describe("repeat option (2.1.0)", () => {
		beforeEach(() => {
			vi.useFakeTimers();
		});

		afterEach(() => {
			vi.useRealTimers();
		});

		it("re-fires vibration on a loop when repeat is true", () => {
			const haptics = createHaptics();
			haptics.trigger("selection", { repeat: true });
			expect(vibrateMock).toHaveBeenCalledTimes(1);

			vi.advanceTimersByTime(100);
			expect(vibrateMock.mock.calls.length).toBeGreaterThan(1);

			haptics.cancel();
			haptics.destroy();
		});

		it("cancel() stops the loop", () => {
			const haptics = createHaptics();
			haptics.trigger("selection", { repeat: true });
			haptics.cancel();

			const callsAfterCancel = vibrateMock.mock.calls.length;
			vi.advanceTimersByTime(500);
			expect(vibrateMock.mock.calls.length).toBe(callsAfterCancel);

			haptics.destroy();
		});

		it("destroy() stops the loop", () => {
			const haptics = createHaptics();
			haptics.trigger("selection", { repeat: true });
			haptics.destroy();

			const callsBefore = vibrateMock.mock.calls.length;
			vi.advanceTimersByTime(500);
			expect(vibrateMock.mock.calls.length).toBe(callsBefore);
		});

		it("does not loop when repeat is omitted", () => {
			const haptics = createHaptics();
			haptics.trigger("selection");
			expect(vibrateMock).toHaveBeenCalledTimes(1);
			vi.advanceTimersByTime(500);
			expect(vibrateMock).toHaveBeenCalledTimes(1);
			haptics.destroy();
		});
	});
});
