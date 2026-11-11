"use client";

import { useMemo, useState } from "react";
import { AgGridReact } from "ag-grid-react";
import { AllCommunityModule, ModuleRegistry, themeQuartz, type ColDef, type ICellRendererParams } from "ag-grid-community";
import type { Contributor, Pot } from "@/lib/types";
import { SampleBadge } from "./SampleBadge";

ModuleRegistry.registerModules([AllCommunityModule]);

const theme = themeQuartz.withParams({ accentColor: "#f59e0b", fontSize: 13, headerFontSize: 12, spacing: 6 });

type Row = Contributor & { potId: string; potStatus: Pot["status"]; sample: boolean };

export function Ledger({ pot, onChanged }: { pot: Pot; onChanged: () => void }) {
  const [busyId, setBusyId] = useState<string | null>(null);

  const rows: Row[] = useMemo(() => pot.contributors.map((c) => ({ ...c, potId: pot.id, potStatus: pot.status, sample: Boolean(pot.sample) })), [pot]);

  const cols: ColDef<Row>[] = useMemo(
    () => [
      {
        field: "name",
        headerName: "Contributor",
        flex: 1.2,
        minWidth: 150,
        cellRenderer: (p: ICellRendererParams<Row>) => (
          <span className="inline-flex items-center gap-2">
            {p.value as string}
            {p.data?.sample && <SampleBadge />}
          </span>
        ),
      },
      { field: "email", headerName: "Email", flex: 1.6, minWidth: 180, cellClass: "text-stone-500" },
      { field: "share", headerName: "Share", width: 100, valueFormatter: (p) => `$${Number(p.value).toFixed(2)}`, type: "rightAligned" },
      {
        field: "status",
        headerName: "Status",
        width: 110,
        cellRenderer: (p: ICellRendererParams<Row>) => {
          const s = p.value as string;
          const cls =
            s === "paid" ? "bg-emerald-50 text-emerald-700" : s === "sent" ? "bg-amber-50 text-amber-700" : s === "refunded" ? "bg-rose-50 text-rose-700" : "bg-stone-100 text-stone-600";
          return <span className={`pill ${cls}`}>{s}</span>;
        },
      },
      { field: "invoiceNumber", headerName: "PayPal invoice", width: 130, valueFormatter: (p) => (p.value ? `#${p.value}` : "—") },
      { field: "reminders", headerName: "Nudges", width: 90, type: "rightAligned" },
      {
        field: "paymentId",
        headerName: "Payment / refund",
        flex: 1.4,
        minWidth: 170,
        cellClass: "font-mono text-xs text-stone-500",
        valueGetter: (p) => p.data?.refundId ?? p.data?.paymentId ?? "",
      },
      {
        headerName: "",
        width: 200,
        sortable: false,
        filter: false,
        cellRenderer: (p: ICellRendererParams<Row>) => {
          const r = p.data!;
          return (
            <div className="flex items-center gap-2">
              {r.invoiceId && (
                <a href={`/pot/${r.potId}/pay/${r.id}`} className="text-xs text-blue-700 underline" target="_blank" rel="noreferrer">
                  QR page
                </a>
              )}
              {r.status === "sent" && r.potStatus === "collecting" && (
                <button
                  className="btn-secondary !px-2 !py-0.5 text-xs"
                  disabled={busyId === r.id}
                  onClick={async () => {
                    setBusyId(r.id);
                    await fetch(`/api/pots/${r.potId}/contributors/${r.id}/simulate`, { method: "POST" });
                    setBusyId(null);
                    onChanged();
                  }}
                >
                  {busyId === r.id ? "…" : "Simulate pay"}
                </button>
              )}
            </div>
          );
        },
      },
    ],
    [busyId, onChanged],
  );

  return (
    <div style={{ height: Math.min(520, 56 + rows.length * 42) }}>
      <AgGridReact<Row>
        theme={theme}
        rowData={rows}
        columnDefs={cols}
        getRowId={(p) => p.data.id}
        defaultColDef={{ sortable: true, filter: true, resizable: true }}
        animateRows
        rowHeight={40}
      />
    </div>
  );
}
