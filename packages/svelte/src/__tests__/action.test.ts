import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { resetDetection } from "@haptics/core";
import { haptic } from "../action";
import { setupHaptics, _resetConfig } from "../context";

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

describe("haptic action", () => {
	it("sets data-haptic attribute on the element", () => {
		const node = document.createElement("button");
		haptic(node, "selection");
		expect(node.getAttribute("data-haptic")).toBe("selection");
	});

	it("triggers vibration on click when setupHaptics is installed", async () => {
		setupHaptics();
		const node = document.createElement("button");
		document.body.appendChild(node);
		haptic(node, "selection");

		// MutationObserver picks up the [data-haptic] attribute on the next microtask.
		await Promise.resolve();

		node.click();
		expect(vibrateMock).toHaveBeenCalledWith([9, 6]);

		document.body.removeChild(node);
	});

	it("updates data-haptic on update", () => {
		const node = document.createElement("button");
		const action = haptic(node, "selection");

		action.update("success");
		expect(node.getAttribute("data-haptic")).toBe("success");
	});

	it("removes attribute on destroy", () => {
		const node = document.createElement("button");
		const action = haptic(node, "selection");

		action.destroy();
		expect(node.hasAttribute("data-haptic")).toBe(false);
	});

	it("uses updated action name for vibration", async () => {
		setupHaptics();
		const node = document.createElement("button");
		document.body.appendChild(node);
		const action = haptic(node, "selection");

		await Promise.resolve();

		action.update("success");
		node.click();

		expect(vibrateMock).toHaveBeenCalledWith([9, 36, 24, 26, 50]);

		document.body.removeChild(node);
	});

	it("ignores __proto__ as an action name", async () => {
		setupHaptics();
		const node = document.createElement("button");
		document.body.appendChild(node);
		haptic(node, "__proto__");

		await Promise.resolve();

		expect(() => node.click()).not.toThrow();
		expect(vibrateMock).not.toHaveBeenCalled();

		document.body.removeChild(node);
	});
});
