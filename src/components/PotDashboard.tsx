"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import type { Pot } from "@/lib/types";
import { StatusPill } from "./StatusPill";
import { Ledger } from "./Ledger";
import { Chat } from "./Chat";

function paidTotal(pot: Pot) {
  return Math.round(pot.contributors.filter((c) => c.status === "paid").reduce((s, c) => s + c.share, 0) * 100) / 100;
}

export function PotDashboard({ initial }: { initial: Pot }) {
  const [pot, setPot] = useState<Pot>(initial);
  const [busy, setBusy] = useState<string | null>(null);
  const params = useSearchParams();
  const [toast, setToast] = useState<string | null>(() => {
    if (params.get("purchased")) return "Order captured and tracking attached.";
    const e = params.get("error");
    return e ? `PayPal returned an error: ${e}` : null;
  });
  const [now, setNow] = useState(() => Date.now());

  const refresh = useCallback(async () => {
    const res = await fetch(`/api/pots/${initial.id}`, { cache: "no-store" });
    if (res.ok) setPot(await res.json());
  }, [initial.id]);

  useEffect(() => {
    const t = setInterval(() => {
      setNow(Date.now());
      void refresh();
    }, 4000);
    return () => clearInterval(t);
  }, [refresh]);

  const paid = paidTotal(pot);
  const pct = Math.min(100, Math.round((paid / pot.total) * 100));
  const unpaid = pot.contributors.filter((c) => c.status === "sent" || c.status === "pending").length;
  const deadline = useMemo(() => new Date(pot.deadline), [pot.deadline]);
  const msLeft = deadline.getTime() - now;
  const daysLeft = Math.max(0, Math.ceil(msLeft / 86_400_000));

  async function act(path: string, body?: unknown, label?: string) {
    setBusy(path);
    const res = await fetch(`/api/pots/${pot.id}/${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    });
    const json = await res.json().catch(() => ({}));
    setBusy(null);
    if (!res.ok) setToast(json.error ?? "Something went wrong");
    else if (label) setToast(label);
    await refresh();
  }

  return (
    <div className="space-y-6">
      {toast && (
        <div className="flex items-center justify-between rounded-md border border-stone-200 bg-white px-4 py-2 text-sm shadow-sm">
          <span>{toast}</span>
          <button className="text-stone-400 hover:text-stone-700" onClick={() => setToast(null)}>
            ✕
          </button>
        </div>
      )}

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold tracking-tight">{pot.title}</h1>
            <StatusPill status={pot.status} />
          </div>
          <p className="mt-1 text-stone-600">
            {pot.item.title} · ${pot.total.toFixed(2)}
            {pot.item.brand ? ` · ${pot.item.brand}` : ""} ·{" "}
            <span className="text-stone-400">{pot.item.source === "channel3" ? "found via Channel3" : "local catalogue"}</span>
          </p>
          <p className="mt-1 text-xs text-stone-500">“{pot.prompt}”</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {pot.status === "collecting" && (
            <>
              <button className="btn-secondary" disabled={busy !== null || unpaid === 0} onClick={() => act("remind", undefined, "Reminders sent on PayPal.")}>
                {busy === "remind" ? "Sending…" : `Remind ${unpaid} unpaid`}
              </button>
              <AddPerson onAdd={(name, email) => act("contributors", { name, email }, `${name} added and invoices re-split.`)} busy={busy === "contributors"} />
              <button
                className="btn-danger"
                disabled={busy !== null}
                onClick={() => {
                  if (confirm("Cancel the pot? Everyone who paid is refunded on PayPal and open invoices are cancelled.")) {
                    act("cancel", { reason: "Organiser cancelled from the dashboard." }, "Pot cancelled and refunds issued.");
                  }
                }}
              >
                Cancel & refund
              </button>
            </>
          )}
          {pot.status === "funded" && pot.order?.approveUrl && (
            <a className="btn-primary bg-[#003087] hover:bg-[#1546a0]" href={pot.order.approveUrl}>
              Approve PayPal order ${pot.total.toFixed(2)}
            </a>
          )}
        </div>
      </div>

      <div className="card">
        <div className="flex items-end justify-between">
          <div>
            <div className="text-3xl font-semibold">
              ${paid.toFixed(2)} <span className="text-base font-normal text-stone-500">of ${pot.total.toFixed(2)}</span>
            </div>
            <div className="text-sm text-stone-500">
              {pot.contributors.filter((c) => c.status === "paid").length} of {pot.contributors.length} paid
            </div>
          </div>
          <div className="text-right text-sm text-stone-500">
            {pot.status === "collecting" ? (
              <>
                <div>{daysLeft === 0 ? "Deadline today" : `${daysLeft} day${daysLeft === 1 ? "" : "s"} left`}</div>
                <div className="text-xs">{deadline.toLocaleString()}</div>
              </>
            ) : (
              <div className="capitalize">{pot.status}</div>
            )}
          </div>
        </div>
        <div className="mt-3 h-3 w-full overflow-hidden rounded-full bg-stone-100">
          <div
            className={`h-full rounded-full transition-all ${pot.status === "refunded" || pot.status === "cancelled" ? "bg-rose-400" : "bg-emerald-500"}`}
            style={{ width: `${pct}%` }}
          />
        </div>
        {pot.order && (
          <div className="mt-4 grid gap-2 rounded-md bg-stone-50 p-3 text-sm sm:grid-cols-3">
            <div>
              <div className="text-xs text-stone-500">PayPal order</div>
              <div className="font-mono text-xs">{pot.order.id}</div>
              <div>{pot.order.status}</div>
            </div>
            <div>
              <div className="text-xs text-stone-500">Capture</div>
              <div className="font-mono text-xs">{pot.order.captureId ?? "awaiting approval"}</div>
            </div>
            <div>
              <div className="text-xs text-stone-500">Shipment tracking</div>
              <div className="font-mono text-xs">{pot.order.trackingNumber ?? "—"}</div>
              <div className="text-xs text-stone-500">{pot.order.carrier}</div>
            </div>
          </div>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <div className="space-y-6">
          <div className="card">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-semibold">Contributor ledger</h2>
              <span className="text-xs text-stone-400">AG Grid</span>
            </div>
            <Ledger pot={pot} onChanged={refresh} />
          </div>
          <div className="card">
            <h2 className="mb-3 font-semibold">Activity</h2>
            <ul className="max-h-72 space-y-2 overflow-auto text-sm">
              {pot.events.map((e, i) => (
                <li key={i} className="flex gap-3">
                  <span className="w-16 shrink-0 text-xs text-stone-400">{new Date(e.at).toLocaleTimeString()}</span>
                  <span className={`pill shrink-0 ${e.type === "error" ? "bg-red-50 text-red-700" : "bg-stone-100 text-stone-600"}`}>{e.type}</span>
                  <span className="text-stone-700">{e.message}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
        <div className="card flex min-h-[420px] flex-col">
          <h2 className="mb-3 font-semibold">Ask Chip-In</h2>
          <Chat potId={pot.id} onChanged={refresh} />
        </div>
      </div>
    </div>
  );
}

function AddPerson({ onAdd, busy }: { onAdd: (name: string, email: string) => void; busy: boolean }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  if (!open)
    return (
      <button className="btn-secondary" onClick={() => setOpen(true)}>
        Add a person
      </button>
    );
  return (
    <form
      className="flex flex-wrap items-center gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        onAdd(name || "New friend", email);
        setOpen(false);
        setName("");
        setEmail("");
      }}
    >
      <input className="rounded-md border border-stone-300 px-2 py-1 text-sm" placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} />
      <input className="rounded-md border border-stone-300 px-2 py-1 text-sm" placeholder="email (optional)" value={email} onChange={(e) => setEmail(e.target.value)} />
      <button className="btn-primary" disabled={busy}>
        {busy ? "Re-splitting…" : "Add"}
      </button>
      <button type="button" className="btn-secondary" onClick={() => setOpen(false)}>
        ✕
      </button>
    </form>
  );
}
