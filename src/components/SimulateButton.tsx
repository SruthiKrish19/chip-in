"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function SimulateButton({ potId, contributorId, label = "Simulate payment", onDone }: { potId: string; contributorId: string; label?: string; onDone?: () => void }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  return (
    <div>
      <button
        className="btn-secondary"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setErr(null);
          const res = await fetch(`/api/pots/${potId}/contributors/${contributorId}/simulate`, { method: "POST" });
          const json = await res.json().catch(() => ({}));
          setBusy(false);
          if (!res.ok) return setErr(json.error ?? "Failed");
          onDone?.();
          router.refresh();
        }}
      >
        {busy ? "Recording…" : label}
      </button>
      {err && <p className="mt-1 text-xs text-red-600">{err}</p>}
    </div>
  );
}
