/**
 * Desktop development cue — synthesizes a brief filtered noise burst so
 * desktop visitors and developers testing on non-haptic hardware get an
 * audible confirmation that a click registered. Pattern intensity scales
 * the gain and base frequency so different presets sound distinguishable.
 *
 * Lazy-loaded by `attachHaptics` only when `audioFallback: true` is set.
 * The first call constructs an `AudioContext` and reusable filter / gain
 * nodes; subsequent calls reuse them. Buffer data is regenerated per
 * click for variation.
 *
 * Adapted from `web-haptics` (lochie/web-haptics, MIT) — same WebAudio
 * graph, reworked into a standalone module so it can be split out as a
 * lazy chunk rather than baked into the core bundle.
 */

interface AudioFallbackState {
	ctx: AudioContext;
	filter: BiquadFilterNode;
	gain: GainNode;
	buffer: AudioBuffer;
}

const FILTER_FREQ = 4000;
const FILTER_Q = 8;
const BUFFER_DURATION_S = 0.004;

let state: AudioFallbackState | null = null;

function ensureAudio(): AudioFallbackState | null {
	if (state) return state;
	if (typeof AudioContext === "undefined") return null;

	const ctx = new AudioContext();

	const filter = ctx.createBiquadFilter();
	filter.type = "bandpass";
	filter.frequency.value = FILTER_FREQ;
	filter.Q.value = FILTER_Q;

	const gain = ctx.createGain();
	filter.connect(gain);
	gain.connect(ctx.destination);

	const buffer = ctx.createBuffer(
		1,
		Math.max(1, Math.floor(ctx.sampleRate * BUFFER_DURATION_S)),
		ctx.sampleRate,
	);

	state = { ctx, filter, gain, buffer };
	return state;
}

/**
 * Play one synthesized "click" sound. Returns a Promise that resolves once
 * the source has been scheduled (or immediately if WebAudio is unavailable
 * or the AudioContext could not be resumed).
 *
 * @param intensity Clamped to [0, 1]. Defaults to 1 (full gain).
 * @public
 */
export async function playClickSound(intensity = 1): Promise<void> {
	const s = ensureAudio();
	if (!s) return;

	// Browsers require a user gesture to start an AudioContext. The first
	// call from a click handler will trigger resume; subsequent calls find
	// the context already running.
	if (s.ctx.state === "suspended") {
		try {
			await s.ctx.resume();
		} catch {
			return;
		}
	}

	const clamped = Math.max(0, Math.min(1, intensity));

	const data = s.buffer.getChannelData(0);
	for (let i = 0; i < data.length; i++) {
		data[i] = (Math.random() * 2 - 1) * Math.exp(-i / 25);
	}

	s.gain.gain.value = 0.5 * clamped;

	const baseFreq = 2000 + clamped * 2000;
	const jitter = 1 + (Math.random() - 0.5) * 0.3;
	s.filter.frequency.value = baseFreq * jitter;

	const source = s.ctx.createBufferSource();
	source.buffer = s.buffer;
	source.connect(s.filter);
	source.onended = () => source.disconnect();
	source.start();
}
