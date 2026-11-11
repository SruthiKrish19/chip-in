import { withPot } from "@/lib/http";
import { cancelPot } from "@/lib/pot";

export const dynamic = "force-dynamic";

export async function POST(req: Request, ctx: RouteContext<"/api/pots/[id]/cancel">) {
  const { id } = await ctx.params;
  const body = (await req.json().catch(() => ({}))) as { reason?: string };
  return withPot(id, (pot) => cancelPot(pot, body.reason?.trim() || "Organiser cancelled the pot."));
}
