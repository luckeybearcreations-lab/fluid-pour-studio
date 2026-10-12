import handler from "vinext/server/app-router-entry";
import { handleProRequest, type ProEnv } from "./pro";

type AppEnv = NonNullable<Parameters<typeof handler.fetch>[1]> & ProEnv;
type AppContext = Parameters<typeof handler.fetch>[2];

export default {
  async fetch(request: Request, env: AppEnv, ctx: AppContext) {
    // Pro checks run in the worker so the subscription can't be faked in the browser.
    if (new URL(request.url).pathname.startsWith("/api/pro/")) return handleProRequest(request, env);
    return handler.fetch(request, env, ctx);
  },
};
