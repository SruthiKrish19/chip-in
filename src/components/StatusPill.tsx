import type { PotStatus, ContributorStatus } from "@/lib/types";

const styles: Record<string, string> = {
  collecting: "bg-amber-50 text-amber-700",
  funded: "bg-blue-50 text-blue-700",
  purchased: "bg-emerald-50 text-emerald-700",
  cancelled: "bg-stone-100 text-stone-600",
  refunded: "bg-rose-50 text-rose-700",
  pending: "bg-stone-100 text-stone-600",
  sent: "bg-amber-50 text-amber-700",
  paid: "bg-emerald-50 text-emerald-700",
};

export function StatusPill({ status }: { status: PotStatus | ContributorStatus }) {
  return <span className={`pill ${styles[status] ?? "bg-stone-100"}`}>{status}</span>;
}
