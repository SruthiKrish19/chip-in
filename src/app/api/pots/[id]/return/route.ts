import { NextResponse } from "next/server";
import { completeOrder, getPot } from "@/lib/pot";
import { env } from "@/lib/env";

export const dynamic = "force-dynamic";

/** PayPal redirects the approver here after they approve the funded order. */
export async function GET(req: Request, ctx: RouteContext<"/api/pots/[id]/return">) {
  const { id } = await ctx.params;
  const token = new URL(req.url).searchParams.get("token") ?? undefined;
  const pot = await getPot(id);
  if (!pot) return NextResponse.redirect(`${env.baseUrl}/?missing=1`);
  try {
    await completeOrder(pot, token);
    return NextResponse.redirect(`${env.baseUrl}/pot/${id}?purchased=1`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.redirect(`${env.baseUrl}/pot/${id}?error=${encodeURIComponent(msg.slice(0, 200))}`);
  }
}
