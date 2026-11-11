import Link from "next/link";
import { notFound } from "next/navigation";
import { getPot } from "@/lib/pot";
import { StatusPill } from "@/components/StatusPill";
import { SimulateButton } from "@/components/SimulateButton";

export const dynamic = "force-dynamic";

export default async function PayPage({ params }: { params: Promise<{ id: string; cid: string }> }) {
  const { id, cid } = await params;
  const pot = await getPot(id);
  const c = pot?.contributors.find((x) => x.id === cid);
  if (!pot || !c) notFound();
  return (
    <div className="mx-auto max-w-md">
      <div className="card text-center">
        <p className="text-sm text-stone-500">{pot.title}</p>
        <h1 className="mt-1 text-2xl font-semibold">Hi {c.name}, your share is ${c.share.toFixed(2)}</h1>
        <p className="mt-1 text-sm text-stone-600">for {pot.item.title}</p>
        <div className="mt-4 flex justify-center">
          <StatusPill status={c.status} />
        </div>
        {c.status === "sent" && c.invoiceId && (
          <>
            <div className="mx-auto mt-5 w-64 rounded-lg border border-stone-200 bg-white p-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`/api/pots/${pot.id}/contributors/${c.id}/qr`} alt="PayPal invoice QR code" className="h-full w-full" />
            </div>
            <p className="mt-2 text-xs text-stone-500">Scan with your phone to pay the PayPal invoice {c.invoiceNumber ? `#${c.invoiceNumber}` : ""}.</p>
            {c.payerViewUrl && (
              <a href={c.payerViewUrl} target="_blank" rel="noreferrer" className="btn-primary mt-4 w-full bg-[#003087] hover:bg-[#1546a0]">
                Pay with PayPal
              </a>
            )}
          </>
        )}
        {c.status === "paid" && <p className="mt-4 text-emerald-700">Thanks! Your payment is in. {c.paidAt && `Paid ${new Date(c.paidAt).toLocaleString()}.`}</p>}
        {c.status === "refunded" && <p className="mt-4 text-rose-700">This pot did not fill. Your ${c.share.toFixed(2)} was refunded.</p>}
        {c.status === "cancelled" && <p className="mt-4 text-stone-600">This invoice was cancelled. Nothing to pay.</p>}
        {c.status === "sent" && (
          <div className="mt-6 border-t border-dashed border-stone-200 pt-4">
            <p className="mb-2 text-xs text-stone-400">Demo: record this share as paid on the PayPal invoice</p>
            <SimulateButton potId={pot.id} contributorId={c.id} label="Simulate payment" />
          </div>
        )}
        <Link href={`/pot/${pot.id}`} className="mt-6 inline-block text-sm text-stone-500 underline">
          Back to the pot
        </Link>
      </div>
    </div>
  );
}
