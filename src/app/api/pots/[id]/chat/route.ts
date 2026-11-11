import { withPot } from "@/lib/http";
import { chat, type ChatTurn } from "@/lib/assistant";
import { getPot } from "@/lib/pot";

export const dynamic = "force-dynamic";

export async function POST(req: Request, ctx: RouteContext<"/api/pots/[id]/chat">) {
  const { id } = await ctx.params;
  const body = (await req.json().catch(() => ({}))) as { message?: string; history?: ChatTurn[] };
  const message = body.message?.trim();
  if (!message) return Response.json({ error: "Say something" }, { status: 400 });
  return withPot(id, async (pot) => {
    const reply = await chat(pot, body.history ?? [], message);
    const fresh = await getPot(id);
    return { reply, pot: fresh };
  });
}
