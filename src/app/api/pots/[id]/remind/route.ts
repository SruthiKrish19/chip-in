import { withPot } from "@/lib/http";
import { sendReminders } from "@/lib/pot";

export const dynamic = "force-dynamic";

export async function POST(_req: Request, ctx: RouteContext<"/api/pots/[id]/remind">) {
  const { id } = await ctx.params;
  return withPot(id, async (pot) => {
    const result = await sendReminders(pot);
    return { ...result, pot };
  });
}
