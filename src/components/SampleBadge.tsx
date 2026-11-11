export function SampleBadge({ className = "" }: { className?: string }) {
  return (
    <span
      title="Seeded sample pot for hosted-demo reviewers"
      className={`inline-flex items-center rounded border border-violet-200 bg-violet-50 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-violet-700 ${className}`}
    >
      Sample
    </span>
  );
}
