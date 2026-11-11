import { withPot } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: RouteContext<"/api/pots/[id]">) {
  const { id } = await ctx.params;
  return withPot(id, async (pot) => ({ ...pot, contributors: pot.contributors.map((c) => ({ ...c, qrPng: undefined })) }));
}
