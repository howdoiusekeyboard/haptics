export interface Vibration {
	/** Duration of the vibration segment in milliseconds */
	duration: number;
	/** Intensity from 0 to 1. Used for iOS pattern scheduling; ignored by the Web Vibration API. */
	intensity?: number;
	/** Delay before this segment in milliseconds */
	delay?: number;
}

export type HapticPattern = readonly Vibration[];
