import { defineConfig } from "tsup";

export default defineConfig((options) => [
	{
		entry: ["src/index.ts"],
		format: ["esm", "cjs"],
		dts: true,
		clean: true,
		treeshake: true,
		sourcemap: true,
		minify: false,
		external: ["@haptics/core"],
	},
	// Standalone IIFE for <script> tag usage (HTMX, Alpine, plain HTML).
	// Bundles @haptics/core into a single file so no module loader is needed.
	{
		entry: { haptics: "src/index.ts" },
		format: ["iife"],
		globalName: "HapticsLib",
		sourcemap: false,
		target: "es2017",
		minify: !options.watch,
		footer: {
			js: `if(typeof window!=="undefined"){window.Haptics=HapticsLib.Haptics;window.HapticsLib=HapticsLib;}`,
		},
	},
]);
