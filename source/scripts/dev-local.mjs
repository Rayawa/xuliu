import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";

// Resolve Windows directory junctions before Next passes paths to its dev worker.
process.chdir(realpathSync(fileURLToPath(new URL("../", import.meta.url))));
process.argv = [process.execPath, "next", "dev", "--hostname", "127.0.0.1", ...process.argv.slice(2)];
await import("next/dist/bin/next");
