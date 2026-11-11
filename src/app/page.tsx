import Link from "next/link";
import { listPots } from "@/lib/pot";
import { hasChannel3, hasClaude, hasPayPal } from "@/lib/env";
import { NewPotForm } from "@/components/NewPotForm";
import { StatusPill } from "@/components/StatusPill";
import { paidTotal } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function Home() {
  const pots = await listPots();
  return (
    <div className="grid gap-8 lg:grid-cols-[1.1fr_0.9fr]">
      <section>
        <h1 className="text-3xl font-semibold tracking-tight">One sentence. Everyone pays. The agent buys.</h1>
        <p className="mt-2 max-w-xl text-stone-600">
          Tell Chip-In what the group wants and how to split it. It sends a PayPal invoice with a QR code to each person,
          tracks who paid, places the order the moment the pot is full, and refunds everyone if the deadline passes short.
        </p>
        <div className="card mt-6">
          <NewPotForm />
        </div>
        <ul className="mt-4 flex flex-wrap gap-2 text-xs text-stone-500">
          <li className="pill bg-stone-100">PayPal: {hasPayPal() ? "sandbox connected" : "not configured"}</li>
          <li className="pill bg-stone-100">Planner: {hasClaude() ? "Claude" : "deterministic fallback"}</li>
          <li className="pill bg-stone-100">Products: {hasChannel3() ? "Channel3 live" : "local catalogue"}</li>
        </ul>
      </section>
      <section>
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Pots</h2>
          <form action="/api/seed" method="post">
            <SeedButton hasPots={pots.length > 0} />
          </form>
        </div>
        {pots.length === 0 ? (
          <p className="card mt-3 text-sm text-stone-500">No pots yet. Create one on the left, or seed the demo pot.</p>
        ) : (
          <ul className="mt-3 space-y-3">
            {pots.map((p) => {
              const paid = paidTotal(p);
              const pct = Math.min(100, Math.round((paid / p.total) * 100));
              return (
                <li key={p.id} className="card hover:border-stone-300">
                  <Link href={`/pot/${p.id}`} className="block">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="font-medium">{p.title}</div>
                        <div className="text-sm text-stone-500">{p.item.title}</div>
                      </div>
                      <StatusPill status={p.status} />
                    </div>
                    <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-stone-100">
                      <div className="h-full rounded-full bg-emerald-500" style={{ width: `${pct}%` }} />
                    </div>
                    <div className="mt-1 flex justify-between text-xs text-stone-500">
                      <span>
                        ${paid.toFixed(2)} of ${p.total.toFixed(2)}
                      </span>
                      <span>{p.contributors.filter((c) => c.status === "paid").length}/{p.contributors.length} paid</span>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}

function SeedButton({ hasPots }: { hasPots: boolean }) {
  return (
    <button className="btn-secondary" formAction="/api/seed" type="submit">
      {hasPots ? "Seed demo pot" : "Seed “Office Switch” demo"}
    </button>
  );
}
