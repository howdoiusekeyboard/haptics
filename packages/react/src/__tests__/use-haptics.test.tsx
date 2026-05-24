import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { resetDetection } from "@haptics/core";
import { useHaptics } from "../use-haptics";

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
});

describe("useHaptics", () => {
	it("returns trigger, cancel, isSupported, and isIOSSupported", () => {
		const { result } = renderHook(() => useHaptics());

		expect(result.current).toHaveProperty("trigger");
		expect(result.current).toHaveProperty("cancel");
		expect(typeof result.current.isSupported).toBe("boolean");
		expect(typeof result.current.isIOSSupported).toBe("boolean");
	});

	it("detects vibration support when navigator.vibrate exists", () => {
		const { result } = renderHook(() => useHaptics());
		expect(result.current.isSupported).toBe(true);
	});

	it("triggers vibration for a built-in preset", () => {
		const { result } = renderHook(() => useHaptics());

		act(() => {
			result.current.trigger("selection");
		});

		expect(vibrateMock).toHaveBeenCalledWith([9, 6]);
	});

	it("triggers vibration for impact-light preset", () => {
		const { result } = renderHook(() => useHaptics());

		act(() => {
			result.current.trigger("impact-light");
		});

		expect(vibrateMock).toHaveBeenCalledWith([8, 27, 5, 5]);
	});

	it("does not call vibrate for an unknown preset", () => {
		const { result } = renderHook(() => useHaptics());

		act(() => {
			result.current.trigger("nonexistent-pattern");
		});

		expect(vibrateMock).not.toHaveBeenCalled();
	});

	it("cancel calls navigator.vibrate(0)", () => {
		const { result } = renderHook(() => useHaptics());

		act(() => {
			result.current.cancel();
		});

		expect(vibrateMock).toHaveBeenCalledWith(0);
	});

	it("isIOSSupported is false in jsdom", () => {
		const { result } = renderHook(() => useHaptics());
		expect(result.current.isIOSSupported).toBe(false);
	});

	it("trigger returns void without error when no support", () => {
		Object.defineProperty(navigator, "vibrate", {
			value: undefined,
			writable: true,
			configurable: true,
		});
		resetDetection();

		const { result } = renderHook(() => useHaptics());

		expect(() => {
			act(() => {
				result.current.trigger("selection");
			});
		}).not.toThrow();
	});

	it("ignores __proto__ as an action name", () => {
		const { result } = renderHook(() => useHaptics());

		expect(() => {
			act(() => {
				result.current.trigger("__proto__");
			});
		}).not.toThrow();
		expect(vibrateMock).not.toHaveBeenCalled();
	});

	it("ignores constructor and toString as action names", () => {
		const { result } = renderHook(() => useHaptics());

		act(() => {
			result.current.trigger("constructor");
			result.current.trigger("toString");
		});
		expect(vibrateMock).not.toHaveBeenCalled();
	});

	describe("repeat option (2.1.0)", () => {
		beforeEach(() => {
			vi.useFakeTimers();
		});

		afterEach(() => {
			vi.useRealTimers();
		});

		it("re-fires vibration on a loop when repeat is true", () => {
			const { result } = renderHook(() => useHaptics());

			act(() => {
				result.current.trigger("selection", { repeat: true });
			});
			expect(vibrateMock).toHaveBeenCalledTimes(1);

			// selection pattern duration sums to 15ms — advancing well past
			// guarantees at least one re-fire.
			vi.advanceTimersByTime(100);
			expect(vibrateMock.mock.calls.length).toBeGreaterThan(1);

			act(() => {
				result.current.cancel();
			});
		});

		it("cancels the loop when cancel() is called", () => {
			const { result } = renderHook(() => useHaptics());

			act(() => {
				result.current.trigger("selection", { repeat: true });
			});

			act(() => {
				result.current.cancel();
			});

			const callsAfterCancel = vibrateMock.mock.calls.length;
			vi.advanceTimersByTime(500);
			// One additional call for navigator.vibrate(0) is expected; no more re-fires.
			expect(vibrateMock.mock.calls.length).toBe(callsAfterCancel);
		});

		it("a second trigger with repeat replaces the prior loop (single active loop)", () => {
			const { result } = renderHook(() => useHaptics());

			act(() => {
				result.current.trigger("selection", { repeat: true });
			});
			act(() => {
				result.current.trigger("impact-light", { repeat: true });
			});

			// Advance enough for impact-light to fire multiple times
			vi.advanceTimersByTime(200);

			// The most recent vibrate call should be impact-light's pattern,
			// confirming the older selection loop didn't continue.
			const lastCall =
				vibrateMock.mock.calls[vibrateMock.mock.calls.length - 1];
			expect(lastCall[0]).toEqual([8, 27, 5, 5]);

			act(() => {
				result.current.cancel();
			});
		});

		it("does not loop when repeat is omitted or false", () => {
			const { result } = renderHook(() => useHaptics());

			act(() => {
				result.current.trigger("selection");
			});
			expect(vibrateMock).toHaveBeenCalledTimes(1);

			vi.advanceTimersByTime(500);
			expect(vibrateMock).toHaveBeenCalledTimes(1);
		});
	});
});
