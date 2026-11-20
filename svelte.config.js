import adapterNode from "@sveltejs/adapter-node";
import adapterCloudflare from "@sveltejs/adapter-cloudflare";

const adapter =
  process.env.SCHEDULE_STUDIO_TARGET === "cloudflare"
    ? adapterCloudflare()
    : adapterNode();

/** @type {import("@sveltejs/kit").Config} */
const config = {
  compilerOptions: {
    runes: ({ filename }) =>
      filename.split(/[/\\]/).includes("node_modules") ? undefined : true,
    warningFilter: (warning) => warning.code !== "event_directive_deprecated",
  },
  kit: {
    adapter,
  },
};

export default config;
