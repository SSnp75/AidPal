import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
};

export default nextConfig;

// Integrate the OpenNext Cloudflare adapter with `next dev` so Cloudflare
// bindings work during local development. Harmless outside Cloudflare.
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";
initOpenNextCloudflareForDev();
