import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createApp, defineComponent, h } from "vue";
import { resetDetection } from "@haptics/core";
import { HapticsPlugin, _resetPlugin } from "../plugin";

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
	_resetPlugin();
});

describe("HapticsPlugin", () => {
	it("installs without error", () => {
		const app = createApp(defineComponent({ setup: () => () => h("div") }));
		expect(() => app.use(HapticsPlugin)).not.toThrow();
	});

	it("accepts custom patterns", () => {
		const app = createApp(defineComponent({ setup: () => () => h("div") }));
		expect(() =>
			app.use(HapticsPlugin, {
				patterns: {
					"custom-buzz": [{ duration: 50, intensity: 1 }],
				},
			}),
		).not.toThrow();
	});

	it("accepts respectReducedMotion option", () => {
		const app = createApp(defineComponent({ setup: () => () => h("div") }));
		expect(() =>
			app.use(HapticsPlugin, { respectReducedMotion: false }),
		).not.toThrow();
	});

	it("wires Android click delegation for elements present at install time", () => {
		const btn = document.createElement("button");
		btn.setAttribute("data-haptic", "selection");
		document.body.appendChild(btn);

		const app = createApp(defineComponent({ setup: () => () => h("div") }));
		app.use(HapticsPlugin);

		btn.click();
		expect(vibrateMock).toHaveBeenCalledWith([15]);

		document.body.removeChild(btn);
	});

	it("picks up dynamically-added [data-haptic] elements via MutationObserver", async () => {
		const app = createApp(defineComponent({ setup: () => () => h("div") }));
		app.use(HapticsPlugin);

		const btn = document.createElement("button");
		btn.setAttribute("data-haptic", "selection");
		document.body.appendChild(btn);

		await Promise.resolve();

		btn.click();
		expect(vibrateMock).toHaveBeenCalledWith([15]);

		document.body.removeChild(btn);
	});

	it("is idempotent — re-installing tears down the prior wiring", async () => {
		const btn = document.createElement("button");
		btn.setAttribute("data-haptic", "selection");
		document.body.appendChild(btn);

		const app1 = createApp(defineComponent({ setup: () => () => h("div") }));
		app1.use(HapticsPlugin);

		const app2 = createApp(defineComponent({ setup: () => () => h("div") }));
		app2.use(HapticsPlugin);

		btn.click();
		// Exactly one navigator.vibrate call — the prior install's handler
		// was torn down before the second install attached its own.
		expect(vibrateMock).toHaveBeenCalledTimes(1);

		document.body.removeChild(btn);
	});

	it("_resetPlugin tears down all wiring", () => {
		const btn = document.createElement("button");
		btn.setAttribute("data-haptic", "selection");
		document.body.appendChild(btn);

		const app = createApp(defineComponent({ setup: () => () => h("div") }));
		app.use(HapticsPlugin);

		_resetPlugin();

		btn.click();
		expect(vibrateMock).not.toHaveBeenCalled();

		document.body.removeChild(btn);
	});

	it("ignores data-haptic values that are not own properties (e.g., __proto__)", () => {
		const btn = document.createElement("button");
		btn.setAttribute("data-haptic", "__proto__");
		document.body.appendChild(btn);

		const app = createApp(defineComponent({ setup: () => () => h("div") }));
		app.use(HapticsPlugin);

		expect(() => btn.click()).not.toThrow();
		expect(vibrateMock).not.toHaveBeenCalled();

		document.body.removeChild(btn);
	});
});
