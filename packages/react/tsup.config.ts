import { defineConfig } from "tsup";
import { promises as fs } from "node:fs";

const DIRECTIVE = '"use client";\n';

export default defineConfig({
	entry: ["src/index.ts"],
	format: ["esm", "cjs"],
	dts: true,
	clean: true,
	treeshake: true,
	sourcemap: true,
	minify: false,
	external: ["react", "react-dom", "@haptics/core"],
	// tsup's banner + source-level "use client" are both stripped by rollup
	// during the dts pass. Post-process to guarantee the directive lands at
	// the top of each emitted JS bundle — required for Next.js App Router
	// consumers of <HapticsProvider>.
	async onSuccess() {
		for (const file of ["dist/index.js", "dist/index.cjs"]) {
			const content = await fs.readFile(file, "utf8");
			if (!content.startsWith(DIRECTIVE)) {
				await fs.writeFile(file, DIRECTIVE + content);
			}
		}
	},
});
