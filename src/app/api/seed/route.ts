import { NextResponse } from "next/server";
import { createPot, listPots } from "@/lib/pot";
import { env } from "@/lib/env";

export const dynamic = "force-dynamic";

// Contributors use example.com addresses with US billing addresses: an India-region sandbox
// merchant cannot invoice India-based accounts (INR_FOREIGN_CURRENCY_BLOCKED), so the demo
// records payments against the invoices rather than paying them from a sandbox buyer.
const SEED_PROMPT =
  "Get us a Nintendo Switch for the office game nights, split 6 ways between alex@example.com, priya@example.com, sam@example.com, jordan@example.com, maya@example.com and chris@example.com. Deadline in 7 days.";

/** Creates the "Office Switch" demo pot (idempotent while one is still collecting). */
export async function POST(req: Request) {
  const existing = await listPots();
  const seeded = existing.find((p) => p.title.toLowerCase().includes("switch") && p.status === "collecting");
  const pot = seeded ?? (await createPot(SEED_PROMPT));
  const wantsHtml = (req.headers.get("accept") ?? "").includes("text/html");
  if (wantsHtml) return NextResponse.redirect(`${env.baseUrl}/pot/${pot.id}`, { status: 303 });
  return NextResponse.json({ pot, created: !seeded }, { status: seeded ? 200 : 201 });
}
