import { getPot, ensureQr } from "@/lib/pot";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: RouteContext<"/api/pots/[id]/contributors/[cid]/qr">) {
  const { id, cid } = await ctx.params;
  const pot = await getPot(id);
  if (!pot) return new Response("Not found", { status: 404 });
  const png = await ensureQr(pot, cid);
  if (!png) return new Response("QR unavailable", { status: 404 });
  return new Response(Buffer.from(png, "base64"), {
    headers: { "Content-Type": "image/png", "Cache-Control": "private, max-age=3600" },
  });
}
