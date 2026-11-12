import handler from "vinext/server/app-router-entry";
import { handleProRequest, type ProEnv } from "./pro";

type AppEnv = NonNullable<Parameters<typeof handler.fetch>[1]> & ProEnv & { PLAY_CERT_FINGERPRINTS?: string };

// Android app links: tells Android that the Google Play app may open this site full screen.
// Fingerprints are public. The first is the upload key from the PWABuilder package; add the
// "App signing key" SHA-256 from Play Console (Test and release → App integrity) once the first
// build is uploaded, here or as a comma-separated PLAY_CERT_FINGERPRINTS variable on the worker.
const PLAY_PACKAGE = "com.luckybearcreations.fluidstudio";
const PLAY_FINGERPRINTS = [
  "A3:58:AD:BA:7F:0C:DF:D3:DB:89:2A:08:E7:D8:3F:59:A7:1A:7D:EB:ED:A7:49:DE:58:08:FE:A6:8E:8E:81:96",
];

function assetLinks(env: AppEnv): Response {
  const extra = (env.PLAY_CERT_FINGERPRINTS ?? "").split(",").map((f) => f.trim().toUpperCase()).filter((f) => /^([0-9A-F]{2}:){31}[0-9A-F]{2}$/.test(f));
  const body = [{
    relation: ["delegate_permission/common.handle_all_urls"],
    target: { namespace: "android_app", package_name: env.PLAY_PACKAGE_NAME || PLAY_PACKAGE, sha256_cert_fingerprints: [...new Set([...PLAY_FINGERPRINTS, ...extra])] },
  }];
  return new Response(JSON.stringify(body, null, 2), { headers: { "content-type": "application/json", "cache-control": "public, max-age=300" } });
}
type AppContext = Parameters<typeof handler.fetch>[2];

export default {
  async fetch(request: Request, env: AppEnv, ctx: AppContext) {
    // Pro checks run in the worker so the subscription can't be faked in the browser.
    const { pathname } = new URL(request.url);
    if (pathname === "/.well-known/assetlinks.json") return assetLinks(env);
    if (pathname.startsWith("/api/pro/")) return handleProRequest(request, env);
    return handler.fetch(request, env, ctx);
  },
};
