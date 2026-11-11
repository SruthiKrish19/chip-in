"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

const EXAMPLES = [
  "Get us a Nintendo Switch for the office game nights, split 6 ways. Deadline in 5 days.",
  "Buy Priya a Sony WH-1000XM5 for her birthday, split between 4 of us, budget under $350.",
  "Order a Breville espresso machine for the studio kitchen, 8 people, by end of month.",
];

export function NewPotForm() {
  const router = useRouter();
  const [prompt, setPrompt] = useState(EXAMPLES[0]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await fetch("/api/pots", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt }),
    });
    const json = await res.json();
    setBusy(false);
    if (!res.ok) return setError(json.error ?? "Something went wrong");
    router.push(`/pot/${json.id}`);
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <label className="block text-sm font-medium text-stone-700">What should the group buy, and how do we split it?</label>
      <textarea
        className="w-full rounded-md border border-stone-300 p-3 text-sm focus:border-stone-500 focus:outline-none"
        rows={3}
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        placeholder="Get us a Switch for the office, split 6 ways, due Friday"
      />
      <div className="flex flex-wrap gap-2">
        {EXAMPLES.map((ex) => (
          <button type="button" key={ex} onClick={() => setPrompt(ex)} className="pill border border-stone-200 bg-stone-50 text-stone-600 hover:bg-stone-100">
            {ex.split(",")[0].slice(0, 42)}…
          </button>
        ))}
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button className="btn-primary" disabled={busy || prompt.trim().length < 5}>
        {busy ? "Planning, invoicing…" : "Start the pot"}
      </button>
      <p className="text-xs text-stone-500">
        Chip-In will find the item, split the price to the cent, and send each person a PayPal invoice with a QR code.
      </p>
    </form>
  );
}
