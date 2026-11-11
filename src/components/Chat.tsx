"use client";

import { useState } from "react";

type Turn = { role: "user" | "assistant"; content: string };

const SUGGESTIONS = ["Who hasn't paid?", "Send a reminder to everyone unpaid", "Add Taylor (taylor@example.com)", "What happens if we cancel?"];

export function Chat({ potId, onChanged, aiMode = "fallback" }: { potId: string; onChanged: () => void; aiMode?: "claude" | "fallback" }) {
  const [history, setHistory] = useState<Turn[]>([
    {
      role: "assistant",
      content:
        aiMode === "claude"
          ? "I'm watching this pot. Ask me who still owes, nudge people, add someone, or cancel."
          : "Fallback mode (no AI credits on this hosted demo): I understand the suggested commands below. Run locally with ANTHROPIC_API_KEY for the full Claude assistant.",
    },
  ]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);

  async function send(text: string) {
    if (!text.trim() || busy) return;
    const next: Turn[] = [...history, { role: "user", content: text }];
    setHistory(next);
    setInput("");
    setBusy(true);
    const res = await fetch(`/api/pots/${potId}/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: text, history: next.slice(1, -1) }),
    });
    const json = await res.json().catch(() => ({}));
    setBusy(false);
    setHistory([...next, { role: "assistant", content: res.ok ? json.reply : json.error ?? "Something went wrong." }]);
    onChanged();
  }

  return (
    <div className="flex flex-1 flex-col">
      <div className="flex-1 space-y-2 overflow-auto text-sm">
        {history.map((t, i) => (
          <div key={i} className={`max-w-[90%] rounded-lg px-3 py-2 ${t.role === "user" ? "ml-auto bg-stone-900 text-white" : "bg-stone-100 text-stone-800"}`}>
            {t.content}
          </div>
        ))}
        {busy && <div className="max-w-[90%] rounded-lg bg-stone-100 px-3 py-2 text-stone-400">thinking…</div>}
      </div>
      <div className="mt-3 flex flex-wrap gap-1">
        {SUGGESTIONS.map((s) => (
          <button key={s} className="pill border border-stone-200 bg-white text-stone-600 hover:bg-stone-50" onClick={() => send(s)} disabled={busy}>
            {s}
          </button>
        ))}
      </div>
      <form
        className="mt-2 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
      >
        <input
          className="flex-1 rounded-md border border-stone-300 px-3 py-2 text-sm focus:border-stone-500 focus:outline-none"
          placeholder="Ask about the pot…"
          value={input}
          onChange={(e) => setInput(e.target.value)}
        />
        <button className="btn-primary" disabled={busy || !input.trim()}>
          Send
        </button>
      </form>
    </div>
  );
}
