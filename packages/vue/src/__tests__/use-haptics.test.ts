import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mount } from "@vue/test-utils";
import { defineComponent, h } from "vue";
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

function mountComposable<T>(composable: () => T): { result: T; wrapper: ReturnType<typeof mount> } {
	let result!: T;
	const TestComponent = defineComponent({
		setup() {
			result = composable();
			return () => h("div");
		},
	});
	const wrapper = mount(TestComponent);
	return { result, wrapper };
}

describe("useHaptics", () => {
	it("returns trigger, cancel, isSupported, and isIOSSupported", () => {
		const { result } = mountComposable(() => useHaptics());

		expect(result).toHaveProperty("trigger");
		expect(result).toHaveProperty("cancel");
		expect(typeof result.isSupported).toBe("boolean");
		expect(typeof result.isIOSSupported).toBe("boolean");
	});

	it("detects vibration support", () => {
		const { result } = mountComposable(() => useHaptics());
		expect(result.isSupported).toBe(true);
	});

	it("triggers vibration for a built-in preset", () => {
		const { result } = mountComposable(() => useHaptics());
		result.trigger("selection");
		expect(vibrateMock).toHaveBeenCalledWith([9, 6]);
	});

	it("does not call vibrate for unknown preset", () => {
		const { result } = mountComposable(() => useHaptics());
		result.trigger("nonexistent-pattern");
		expect(vibrateMock).not.toHaveBeenCalled();
	});

	it("cancel calls navigator.vibrate(0)", () => {
		const { result } = mountComposable(() => useHaptics());
		result.cancel();
		expect(vibrateMock).toHaveBeenCalledWith(0);
	});

	it("isIOSSupported is false in jsdom", () => {
		const { result } = mountComposable(() => useHaptics());
		expect(result.isIOSSupported).toBe(false);
	});

	it("ignores __proto__ as an action name", () => {
		const { result } = mountComposable(() => useHaptics());
		expect(() => result.trigger("__proto__")).not.toThrow();
		expect(vibrateMock).not.toHaveBeenCalled();
	});

	it("ignores constructor and toString as action names", () => {
		const { result } = mountComposable(() => useHaptics());
		result.trigger("constructor");
		result.trigger("toString");
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
			const { result } = mountComposable(() => useHaptics());
			result.trigger("selection", { repeat: true });
			expect(vibrateMock).toHaveBeenCalledTimes(1);

			vi.advanceTimersByTime(100);
			expect(vibrateMock.mock.calls.length).toBeGreaterThan(1);

			result.cancel();
		});

		it("cancel() stops the loop", () => {
			const { result } = mountComposable(() => useHaptics());
			result.trigger("selection", { repeat: true });
			result.cancel();

			const callsAfterCancel = vibrateMock.mock.calls.length;
			vi.advanceTimersByTime(500);
			expect(vibrateMock.mock.calls.length).toBe(callsAfterCancel);
		});

		it("does not loop when repeat is omitted", () => {
			const { result } = mountComposable(() => useHaptics());
			result.trigger("selection");
			expect(vibrateMock).toHaveBeenCalledTimes(1);
			vi.advanceTimersByTime(500);
			expect(vibrateMock).toHaveBeenCalledTimes(1);
		});
	});
});
