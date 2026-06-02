import { defineConfig } from "@trigger.dev/sdk";

export default defineConfig({
  project: "proj_alvgqlijckvpyuusrxbf",
  dirs: ["./src/trigger"],
  runtime: "node",
  maxDuration: 300, // 5 minutes max duration for tasks
});