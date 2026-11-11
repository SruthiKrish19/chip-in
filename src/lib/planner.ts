/**
 * Turns "get us a Switch for the office, split 6 ways, due Friday" into a validated Plan.
 * Claude does the parsing when ANTHROPIC_API_KEY is set; otherwise a deterministic regex planner runs.
 * Either way the output is schema-validated and the arithmetic is done in code, never by the model.
 */
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { env, hasClaude } from "./env";
import type { Plan } from "./types";

const PlanSchema = z.object({
  itemQuery: z.string().describe("Short product search query, e.g. 'Nintendo Switch OLED'"),
  title: z.string().describe("Short pot title, e.g. 'Office Switch'"),
  participantCount: z.number().int().min(2).max(50),
  participants: z
    .array(z.object({ name: z.string(), email: z.string() }))
    .describe("Named participants if the organiser listed any; otherwise empty"),
  deadlineDays: z.number().int().min(1).max(60).describe("Days until the funding deadline; default 7"),
  maxPrice: z.number().nullable().describe("Budget cap in USD if stated, else null"),
  summary: z.string().describe("One friendly sentence summarising the plan"),
});

const WORD_NUMBERS: Record<string, number> = {
  two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12,
};

export function fallbackPlan(prompt: string): Plan {
  const text = prompt.trim();
  const lower = text.toLowerCase();

  // participants: "split 6 ways", "between 6 of us", "6 people", or word numbers
  let count = 0;
  const m =
    lower.match(/split(?:ting)?\s+(?:it\s+)?(\d+|[a-z]+)\s*ways?/) ||
    lower.match(/(\d+|[a-z]+)\s+(?:of us|people|friends|colleagues|folks|contributors|members)/) ||
    lower.match(/between\s+(?:the\s+)?(\d+|[a-z]+)/);
  if (m) count = Number(m[1]) || WORD_NUMBERS[m[1]] || 0;

  const emails = Array.from(text.matchAll(/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g)).map((x) => x[0]);
  const participants = emails.map((email) => ({
    name: email.split("@")[0].replace(/[._+-]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
    email,
  }));
  if (!count) count = participants.length || 4;

  // deadline
  let deadlineDays = 7;
  const d = lower.match(/(?:in|within|by)\s+(\d+)\s+days?/) || lower.match(/(\d+)\s*-?\s*day deadline/);
  if (d) deadlineDays = Math.max(1, Math.min(60, Number(d[1])));
  else if (/\btomorrow\b/.test(lower)) deadlineDays = 1;
  else if (/\b(this|by|due)\s+(mon|tues|wednes|thurs|fri|satur|sun)day\b|\b(this|by)\s+(weekend|week)\b/.test(lower)) deadlineDays = 5;
  else if (/\bnext week\b/.test(lower)) deadlineDays = 10;
  else if (/\bend of (the )?month\b/.test(lower)) deadlineDays = 21;

  // budget
  const b =
    lower.match(/(?:under|below|max|budget(?: of)?|up to|<)\s*\$?\s*(\d+(?:\.\d+)?)/) ||
    lower.match(/\$\s*(\d+(?:\.\d+)?)/);
  const maxPrice = b ? Number(b[1]) : undefined;

  // item: strip the verb and the recipient ("Buy Priya a ..."), then cut at the first clause boundary
  let item = text
    .replace(/^(please\s+)?(can you\s+|could you\s+|let'?s\s+)?(get|buy|grab|order|find|purchase|chip in for)\s+(us|me|the team|everyone)?\s*/i, "")
    .replace(/^[A-Z][a-z]+\s+(a|an|the)\s+/, "")
    .replace(/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g, "")
    .split(
      /,|;|\.|\bsplit\b|\bbetween\b|\bfor\b|\band\s+(?:split|divide)\b|\bdue\b|\bby\b|\bin\s+\d+\s+days?\b|\bunder\b|\bbudget\b|\bwith\b/i,
    )[0]
    .replace(/^(a|an|the|one|some)\s+/i, "")
    .trim();
  if (!item) item = text.slice(0, 60);
  const title = item.split(/\s+/).slice(0, 3).join(" ");

  return {
    itemQuery: item,
    title: title.charAt(0).toUpperCase() + title.slice(1),
    participantCount: count,
    participants,
    deadlineDays,
    maxPrice,
    summary: `${count} people chip in for ${item}${maxPrice ? ` (budget $${maxPrice})` : ""}, deadline in ${deadlineDays} day${deadlineDays === 1 ? "" : "s"}.`,
  };
}

export async function makePlan(prompt: string): Promise<{ plan: Plan; source: "claude" | "fallback"; notes?: string }> {
  if (!hasClaude()) return { plan: fallbackPlan(prompt), source: "fallback", notes: "ANTHROPIC_API_KEY not set" };
  try {
    const client = new Anthropic({ apiKey: env.anthropicKey });
    const response = await client.messages.parse({
      model: env.anthropicModel,
      max_tokens: 2000,
      output_config: { effort: "low", format: zodOutputFormat(PlanSchema) },
      system:
        "You turn a group-buy request into a structured plan. Extract the product to search for, how many people are splitting it, any named participants with emails, the deadline in days (default 7), and a USD budget cap if stated. Never invent emails. Keep the title to 2-4 words.",
      messages: [{ role: "user", content: prompt }],
    });
    const parsed = response.parsed_output;
    if (!parsed) throw new Error("Claude returned no structured plan");
    const plan: Plan = { ...parsed, maxPrice: parsed.maxPrice ?? undefined };
    if (plan.participants.length && plan.participants.length !== plan.participantCount) {
      plan.participantCount = Math.max(plan.participantCount, plan.participants.length);
    }
    return { plan, source: "claude" };
  } catch (err) {
    const msg = err instanceof Anthropic.APIError ? `Claude API error ${err.status}: ${err.message}` : String(err);
    return { plan: fallbackPlan(prompt), source: "fallback", notes: msg };
  }
}

/** Split `total` into `n` cent-exact shares; the first `remainder` people pay one cent more. */
export function splitShares(total: number, n: number): number[] {
  const cents = Math.round(total * 100);
  const base = Math.floor(cents / n);
  const remainder = cents - base * n;
  return Array.from({ length: n }, (_, i) => (base + (i < remainder ? 1 : 0)) / 100);
}

/** Draft a friendly note for an invoice or reminder. Uses Claude when available, else templates. */
export async function draftMessage(
  kind: "invoice" | "reminder" | "refund",
  ctx: { name: string; item: string; share: number; deadline: string },
) {
  const due = new Date(ctx.deadline).toLocaleDateString("en-US", { month: "short", day: "numeric" });
  const amount = `$${ctx.share.toFixed(2)}`;
  const templates = {
    invoice: `Hi ${ctx.name}! We're chipping in together for ${ctx.item}. Your share is ${amount}. Please pay by ${due} so we can place the order. Thanks!`,
    reminder: `Friendly nudge, ${ctx.name}: your ${amount} share for ${ctx.item} is still open. We order the moment everyone is in. Deadline ${due}.`,
    refund: `Hi ${ctx.name}, the ${ctx.item} pot didn't fill in time, so your ${amount} has been refunded. Sorry about that!`,
  };
  if (!hasClaude()) return templates[kind];
  try {
    const client = new Anthropic({ apiKey: env.anthropicKey });
    const res = await client.messages.create({
      model: env.anthropicModel,
      max_tokens: 300,
      output_config: { effort: "low" },
      system:
        "Write one short, warm, plain-text message (max 2 sentences, no emojis, no subject line) for a group purchase. Include the exact dollar amount and the deadline.",
      messages: [
        { role: "user", content: `Kind: ${kind}. Recipient: ${ctx.name}. Item: ${ctx.item}. Share: ${amount}. Deadline: ${due}.` },
      ],
    });
    const text = res.content.find((b) => b.type === "text");
    return text && text.type === "text" && text.text.trim() ? text.text.trim().slice(0, 500) : templates[kind];
  } catch {
    return templates[kind];
  }
}
