type HapticAction = string;

/**
 * Svelte action for declarative haptic feedback.
 *
 * @example
 * ```svelte
 * <script>
 *   import { setupHaptics, haptic } from '@haptics/svelte';
 *   setupHaptics();
 * </script>
 * <button use:haptic={'success'}>Save</button>
 * <button use:haptic={'impact-heavy'}>Delete</button>
 * ```
 *
 * Sets the `data-haptic` attribute that `setupHaptics()` discovers via its
 * initial scan and MutationObserver. Updating the binding rewrites the
 * attribute; destroying the action removes it. Requires `setupHaptics()` to
 * be called from a parent component for the platform handler to wire up.
 */
export function haptic(
	node: HTMLElement,
	action: HapticAction,
): { update: (action: HapticAction) => void; destroy: () => void } {
	node.setAttribute("data-haptic", action);

	return {
		update(newAction: HapticAction) {
			node.setAttribute("data-haptic", newAction);
		},
		destroy() {
			node.removeAttribute("data-haptic");
		},
	};
}
