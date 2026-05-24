import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { attachHaptics, resetDetection } from "../engine";

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
});
