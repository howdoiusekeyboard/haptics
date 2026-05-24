import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

let createdContexts = 0;
let lastSourceStartCount = 0;
let lastGainValue: number | null = null;
let lastFilterFreq: number | null = null;

class FakeBufferSource {
	buffer: AudioBuffer | null = null;
	onended: (() => void) | null = null;
	connect = vi.fn();
	disconnect = vi.fn();
	start = vi.fn(() => {
		lastSourceStartCount++;
	});
}

class FakeBiquadFilter {
	type = "";
	frequency = {
		_value: 0,
		get value() {
			return this._value;
		},
		set value(v: number) {
			this._value = v;
			lastFilterFreq = v;
		},
	};
	Q = { value: 0 };
	connect = vi.fn();
}

class FakeGain {
	gain = {
		_value: 0,
		get value() {
			return this._value;
		},
		set value(v: number) {
			this._value = v;
			lastGainValue = v;
		},
	};
	connect = vi.fn();
}

class FakeAudioContext {
	sampleRate = 44100;
	state: "running" | "suspended" | "closed" = "running";
	destination = { name: "destination" };
	resume = vi.fn(async () => {
		this.state = "running";
	});

	constructor() {
		createdContexts++;
	}

	createBiquadFilter() {
		return new FakeBiquadFilter();
	}

	createGain() {
		return new FakeGain();
	}

	createBuffer(_channels: number, length: number, _sampleRate: number) {
		const data = new Float32Array(Math.floor(length));
		return { getChannelData: () => data } as AudioBuffer;
	}

	createBufferSource(): AudioBufferSourceNode {
		return new FakeBufferSource() as unknown as AudioBufferSourceNode;
	}
}

beforeEach(() => {
	createdContexts = 0;
	lastSourceStartCount = 0;
	lastGainValue = null;
	lastFilterFreq = null;
	vi.stubGlobal("AudioContext", FakeAudioContext);
	vi.resetModules();
});

afterEach(() => {
	vi.unstubAllGlobals();
});

describe("playClickSound", () => {
	it("creates an AudioContext on first call", async () => {
		const { playClickSound } = await import("../audio-fallback");
		await playClickSound(0.5);
		expect(createdContexts).toBe(1);
		expect(lastSourceStartCount).toBe(1);
	});

	it("reuses the AudioContext on subsequent calls", async () => {
		const { playClickSound } = await import("../audio-fallback");
		await playClickSound(0.5);
		await playClickSound(0.5);
		await playClickSound(0.5);
		expect(createdContexts).toBe(1);
		expect(lastSourceStartCount).toBe(3);
	});

	it("resolves silently when AudioContext is unavailable", async () => {
		vi.stubGlobal("AudioContext", undefined);
		const { playClickSound } = await import("../audio-fallback");
		await expect(playClickSound(0.5)).resolves.toBeUndefined();
		expect(createdContexts).toBe(0);
	});

	it("clamps intensity to [0, 1] without throwing", async () => {
		const { playClickSound } = await import("../audio-fallback");
		await expect(playClickSound(2)).resolves.toBeUndefined();
		await expect(playClickSound(-0.5)).resolves.toBeUndefined();
		expect(createdContexts).toBe(1);
	});

	it("defaults intensity to 1 when omitted", async () => {
		const { playClickSound } = await import("../audio-fallback");
		await playClickSound();
		// gain = 0.5 * 1.0 = 0.5
		expect(lastGainValue).toBeCloseTo(0.5, 5);
	});

	it("scales gain linearly by intensity", async () => {
		const { playClickSound } = await import("../audio-fallback");
		await playClickSound(0.4);
		// gain = 0.5 * 0.4 = 0.2
		expect(lastGainValue).toBeCloseTo(0.2, 5);
	});

	it("resumes a suspended AudioContext before playing", async () => {
		let resumeCalls = 0;
		class SuspendedCtx extends FakeAudioContext {
			constructor() {
				super();
				this.state = "suspended";
			}
			resume = vi.fn(async () => {
				resumeCalls++;
				this.state = "running";
			});
		}
		vi.stubGlobal("AudioContext", SuspendedCtx);

		const { playClickSound } = await import("../audio-fallback");
		await playClickSound(0.5);
		expect(resumeCalls).toBe(1);
		expect(lastSourceStartCount).toBe(1);
	});

	it("does not start a source when resume() rejects", async () => {
		class FailingResume extends FakeAudioContext {
			constructor() {
				super();
				this.state = "suspended";
			}
			resume = vi.fn(async () => {
				throw new Error("autoplay blocked");
			});
		}
		vi.stubGlobal("AudioContext", FailingResume);

		const { playClickSound } = await import("../audio-fallback");
		await expect(playClickSound(0.5)).resolves.toBeUndefined();
		expect(lastSourceStartCount).toBe(0);
	});

	it("varies the filter frequency by intensity (higher intensity = higher base freq)", async () => {
		const { playClickSound } = await import("../audio-fallback");

		await playClickSound(0); // baseFreq = 2000 + 0*2000 = 2000
		const lowFreq = lastFilterFreq!;

		await playClickSound(1); // baseFreq = 2000 + 1*2000 = 4000
		const highFreq = lastFilterFreq!;

		// Jitter is ±15%, so worst case: low(2000*1.15)=2300 < high(4000*0.85)=3400.
		// Always: highFreq > lowFreq even with adversarial jitter.
		expect(highFreq).toBeGreaterThan(lowFreq);
	});
});
