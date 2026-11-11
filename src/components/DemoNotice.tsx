import { hasClaude } from "@/lib/env";

const REPO = "https://github.com/SruthiKrish19/chip-in";

/** Server component. Shown on every page of the hosted demo while no Claude API key is configured. */
export function DemoNotice() {
  if (hasClaude()) return null;
  return (
    <div className="border-b border-amber-200 bg-amber-50 text-amber-950">
      <div className="mx-auto flex max-w-6xl flex-wrap items-start gap-x-3 gap-y-1 px-4 py-2 text-sm leading-snug">
        <span className="mt-0.5 inline-flex shrink-0 items-center rounded bg-amber-500 px-1.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-white">
          Hosted demo
        </span>
        <p className="min-w-0 flex-1">
          AI API credits are not available on this hosted instance, so the planner and assistant run in{" "}
          <strong>sample / fallback mode</strong>. Pots marked <strong>SAMPLE</strong> are seeded for reviewers. PayPal sandbox
          invoices, orders and refunds, and Channel3 product search are real. To run with live Claude: clone the repo, add{" "}
          <code className="rounded bg-amber-100 px-1 font-mono text-xs">ANTHROPIC_API_KEY</code>, PayPal sandbox keys and{" "}
          <code className="rounded bg-amber-100 px-1 font-mono text-xs">CHANNEL3_API_KEY</code> to <code className="rounded bg-amber-100 px-1 font-mono text-xs">.env.local</code>, then{" "}
          <code className="rounded bg-amber-100 px-1 font-mono text-xs">npm run dev</code>.{" "}
          <a href={`${REPO}#hosted-demo-vs-running-locally`} className="font-medium underline underline-offset-2 hover:text-amber-700" target="_blank" rel="noreferrer">
            Setup in the README
          </a>
        </p>
      </div>
    </div>
  );
}
