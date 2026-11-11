import { notFound } from "next/navigation";
import { getPot } from "@/lib/pot";
import { PotDashboard } from "@/components/PotDashboard";

export const dynamic = "force-dynamic";

export default async function PotPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const pot = await getPot(id);
  if (!pot) notFound();
  const safe = { ...pot, contributors: pot.contributors.map((c) => ({ ...c, qrPng: undefined })) };
  return <PotDashboard initial={safe} />;
}
