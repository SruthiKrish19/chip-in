import { withPot } from "@/lib/http";
import { simulatePayment } from "@/lib/pot";

export const dynamic = "force-dynamic";

export async function POST(_req: Request, ctx: RouteContext<"/api/pots/[id]/contributors/[cid]/simulate">) {
  const { id, cid } = await ctx.params;
  return withPot(id, (pot) => simulatePayment(pot, cid));
}
