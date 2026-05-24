import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mount } from "@vue/test-utils";
import { createApp, defineComponent, h, withDirectives } from "vue";
import { resetDetection } from "@haptics/core";
import { vHaptic } from "../directive";
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

/** Install the plugin globally so attachHaptics wires up [data-haptic] elements. */
function installPlugin() {
	const app = createApp(defineComponent({ setup: () => () => h("div") }));
	app.use(HapticsPlugin);
}

describe("vHaptic directive", () => {
	it("sets data-haptic attribute on the element", () => {
		const TestComponent = defineComponent({
			setup() {
				return () =>
					withDirectives(h("button", { id: "btn" }, "Click"), [
						[vHaptic, "selection"],
					]);
			},
		});

		const wrapper = mount(TestComponent);
		expect(wrapper.find("#btn").attributes("data-haptic")).toBe("selection");
	});

	it("triggers vibration on click when the plugin is installed", async () => {
		installPlugin();

		const TestComponent = defineComponent({
			setup() {
				return () =>
					withDirectives(h("button", { id: "btn" }, "Click"), [
						[vHaptic, "selection"],
					]);
			},
		});

		const wrapper = mount(TestComponent, { attachTo: document.body });
		// MutationObserver picks up the data-haptic attribute on next microtask.
		await Promise.resolve();
		await wrapper.find("#btn").trigger("click");

		expect(vibrateMock).toHaveBeenCalledWith([15]);
		wrapper.unmount();
	});

	it("removes data-haptic on unmount", () => {
		const TestComponent = defineComponent({
			setup() {
				return () =>
					withDirectives(h("button", { id: "btn" }, "Click"), [
						[vHaptic, "selection"],
					]);
			},
		});

		const wrapper = mount(TestComponent);
		const el = wrapper.find("#btn").element;
		wrapper.unmount();

		expect(el.hasAttribute("data-haptic")).toBe(false);
	});

	it("ignores __proto__ as a directive value", async () => {
		installPlugin();

		const TestComponent = defineComponent({
			setup() {
				return () =>
					withDirectives(h("button", { id: "btn" }, "Click"), [
						[vHaptic, "__proto__"],
					]);
			},
		});

		const wrapper = mount(TestComponent, { attachTo: document.body });
		await Promise.resolve();
		await wrapper.find("#btn").trigger("click");
		expect(vibrateMock).not.toHaveBeenCalled();
		wrapper.unmount();
	});
});
