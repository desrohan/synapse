import { defineConfig } from "@trigger.dev/sdk";

export default defineConfig({
  project: "proj_alvgqlijckvpyuusrxbf",
  dirs: ["./src/trigger"],
  runtime: "node-22",
  maxDuration: 300, // 5 minutes max duration for tasks
});