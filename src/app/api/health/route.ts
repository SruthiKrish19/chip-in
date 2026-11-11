import { hasChannel3, hasClaude, hasPayPal, env } from "@/lib/env";

export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json({
    ok: true,
    paypal: hasPayPal() ? env.paypalEnv : "missing",
    claude: hasClaude() ? env.anthropicModel : "fallback planner",
    channel3: hasChannel3() ? "live" : "local catalogue",
    storage: process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL ? "upstash" : "json-file",
  });
}
