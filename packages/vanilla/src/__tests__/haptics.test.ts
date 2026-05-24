import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { resetDetection } from "@haptics/core";
import { Haptics } from "../haptics";

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

describe("Haptics", () => {
	it("creates an instance without error", () => {
		const h = new Haptics();
		expect(h).toBeInstanceOf(Haptics);
		h.destroy();
	});

	it("detects vibration support", () => {
		const h = new Haptics();
		expect(h.isSupported).toBe(true);
		h.destroy();
	});

	it("triggers vibration imperatively", () => {
		const h = new Haptics();
		h.trigger("selection");
		expect(vibrateMock).toHaveBeenCalledWith([15]);
		h.destroy();
	});

	it("does not call vibrate for unknown preset", () => {
		const h = new Haptics();
		h.trigger("nonexistent-pattern");
		expect(vibrateMock).not.toHaveBeenCalled();
		h.destroy();
	});

	it("cancel calls navigator.vibrate(0)", () => {
		const h = new Haptics();
		h.cancel();
		expect(vibrateMock).toHaveBeenCalledWith(0);
		h.destroy();
	});

	it("does not trigger after destroy", () => {
		const h = new Haptics();
		h.destroy();
		h.trigger("selection");
		expect(vibrateMock).not.toHaveBeenCalled();
	});

	it("handles click delegation on data-haptic elements", async () => {
		const container = document.createElement("div");
		document.body.appendChild(container);

		const h = new Haptics({ delegateFrom: container });
		const btn = document.createElement("button");
		btn.setAttribute("data-haptic", "selection");
		container.appendChild(btn);

		// MutationObserver fires asynchronously on the next microtask.
		// Flush the microtask queue before clicking.
		await Promise.resolve();

		btn.click();
		expect(vibrateMock).toHaveBeenCalledWith([15]);

		h.destroy();
		document.body.removeChild(container);
	});

	it("attaches handler to elements present at construction time", () => {
		const container = document.createElement("div");
		const btn = document.createElement("button");
		btn.setAttribute("data-haptic", "selection");
		container.appendChild(btn);
		document.body.appendChild(container);

		// Element exists before Haptics is constructed → picked up by the
		// initial synchronous scan, no MutationObserver wait needed.
		const h = new Haptics({ delegateFrom: container });

		btn.click();
		expect(vibrateMock).toHaveBeenCalledWith([15]);

		h.destroy();
		document.body.removeChild(container);
	});

	it("accepts custom patterns", () => {
		const h = new Haptics({
			patterns: {
				"custom-buzz": [{ duration: 50, intensity: 1 }],
			},
		});

		h.trigger("custom-buzz");
		expect(vibrateMock).toHaveBeenCalledWith([50]);

		h.destroy();
	});

	it("isIOSSupported is false in jsdom", () => {
		const h = new Haptics();
		expect(h.isIOSSupported).toBe(false);
		h.destroy();
	});

	it("ignores __proto__ as a data-haptic value (delegation path)", async () => {
		const container = document.createElement("div");
		document.body.appendChild(container);

		const h = new Haptics({ delegateFrom: container });
		const btn = document.createElement("button");
		btn.setAttribute("data-haptic", "__proto__");
		container.appendChild(btn);

		await Promise.resolve();

		expect(() => btn.click()).not.toThrow();
		expect(vibrateMock).not.toHaveBeenCalled();

		h.destroy();
		document.body.removeChild(container);
	});

	it("ignores __proto__ in imperative trigger", () => {
		const h = new Haptics();
		expect(() => h.trigger("__proto__")).not.toThrow();
		expect(vibrateMock).not.toHaveBeenCalled();
		h.destroy();
	});
});
