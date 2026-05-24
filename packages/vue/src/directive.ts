import type { Directive } from "vue";

type HapticValue = string;

/**
 * v-haptic directive for declarative haptic feedback.
 *
 * Usage:
 *   <button v-haptic="'success'">Save</button>
 *   <button v-haptic="'impact-heavy'">Delete</button>
 *
 * Sets the `data-haptic` attribute so the plugin's `attachHaptics` install
 * picks the element up (via initial scan or MutationObserver) and wires the
 * platform-appropriate handler. Updating the binding rewrites the attribute;
 * unmounting removes it.
 */
export const vHaptic: Directive<HTMLElement, HapticValue> = {
	mounted(el, binding) {
		if (binding.value) el.setAttribute("data-haptic", binding.value);
	},
	updated(el, binding) {
		if (binding.value) el.setAttribute("data-haptic", binding.value);
		else el.removeAttribute("data-haptic");
	},
	unmounted(el) {
		el.removeAttribute("data-haptic");
	},
};
