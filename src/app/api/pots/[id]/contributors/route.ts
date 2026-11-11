import { withPot } from "@/lib/http";
import { addContributor } from "@/lib/pot";

export const dynamic = "force-dynamic";

export async function POST(req: Request, ctx: RouteContext<"/api/pots/[id]/contributors">) {
  const { id } = await ctx.params;
  const body = (await req.json().catch(() => ({}))) as { name?: string; email?: string };
  return withPot(id, (pot) => addContributor(pot, body.name ?? "", body.email));
}
