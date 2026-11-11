import { NextResponse } from "next/server";
import { createPot, listPots, simulatePayment } from "@/lib/pot";
import { env } from "@/lib/env";
import type { Pot } from "@/lib/types";

export const dynamic = "force-dynamic";

// Contributors use example.com addresses with US billing addresses: an India-region sandbox
// merchant cannot invoice India-based accounts (INR_FOREIGN_CURRENCY_BLOCKED), so the demo
// records payments against the invoices rather than paying them from a sandbox buyer.
const SAMPLES: { key: string; prompt: string; payFirst: number | "all" }[] = [
  {
    key: "office-switch",
    prompt:
      "Get us a Nintendo Switch for the office game nights, split 6 ways between alex@example.com, priya@example.com, sam@example.com, jordan@example.com, maya@example.com and chris@example.com. Deadline in 7 days.",
    payFirst: 4,
  },
  {
    key: "team-kettle",
    prompt: "Get us a Fellow Stagg EKG electric kettle for the team room, split 2 ways between omar.k@example.com and nina.r@example.com. Deadline in 5 days.",
    payFirst: "all",
  },
];

function logEvent(pot: Pot, type: string, message: string) {
  pot.events.unshift({ at: new Date().toISOString(), type, message });
}

/**
 * Seeds the SAMPLE pots for hosted-demo reviewers. Idempotent: an existing live sample pot
 * for the same key is reused. The first pot is left collecting with 4 of 6 paid; the second
 * is fully funded so the PayPal order and approval link are visible. Failures in any step are
 * recorded in the pot's activity log rather than aborting the seed.
 */
export async function POST(req: Request) {
  const existing = await listPots();
  const pots: Pot[] = [];
  const created: string[] = [];
  for (const sample of SAMPLES) {
    const live = existing.find((p) => p.sampleKey === sample.key && p.status !== "cancelled" && p.status !== "refunded");
    if (live) {
      pots.push(live);
      continue;
    }
    let pot: Pot;
    try {
      pot = await createPot(sample.prompt, { sample: true, sampleKey: sample.key });
    } catch (err) {
      return NextResponse.json({ error: `Seeding ${sample.key} failed: ${err instanceof Error ? err.message : String(err)}` }, { status: 500 });
    }
    const targets = sample.payFirst === "all" ? pot.contributors : pot.contributors.slice(0, sample.payFirst);
    for (const c of targets) {
      try {
        pot = await simulatePayment(pot, c.id);
      } catch (err) {
        logEvent(pot, "error", `Sample payment for ${c.name} failed: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
    pots.push(pot);
    created.push(sample.key);
  }
  const wantsHtml = (req.headers.get("accept") ?? "").includes("text/html");
  if (wantsHtml) return NextResponse.redirect(`${env.baseUrl}/`, { status: 303 });
  const safe = pots.map((p) => ({ ...p, contributors: p.contributors.map((c) => ({ ...c, qrPng: undefined })) }));
  return NextResponse.json({ pots: safe, created }, { status: created.length ? 201 : 200 });
}
