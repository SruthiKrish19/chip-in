/**
 * The organiser's chat assistant. With Claude: a tool-use loop over read/act tools where the
 * model proposes and this code executes. Without a key: keyword intents hit the same functions.
 */
import Anthropic from "@anthropic-ai/sdk";
import { env, hasClaude } from "./env";
import { addContributor, cancelPot, potSummary, sendReminders } from "./pot";
import type { Pot } from "./types";

export type ChatTurn = { role: "user" | "assistant"; content: string };

const tools: Anthropic.Tool[] = [
  {
    name: "get_pot_status",
    description: "Current funding status: who has paid, who has not, amounts, deadline, order state.",
    input_schema: { type: "object", properties: {}, additionalProperties: false },
    strict: true,
  },
  {
    name: "send_reminders",
    description: "Send a PayPal invoice reminder to every contributor who has not paid yet.",
    input_schema: { type: "object", properties: {}, additionalProperties: false },
    strict: true,
  },
  {
    name: "add_contributor",
    description: "Add a new person to the pot. The remaining balance is re-split among everyone who has not paid yet and new invoices are issued.",
    input_schema: {
      type: "object",
      properties: { name: { type: "string" }, email: { type: "string" } },
      required: ["name", "email"],
      additionalProperties: false,
    },
    strict: true,
  },
  {
    name: "cancel_pot",
    description: "Cancel the pot: refund everyone who paid and cancel open invoices. Irreversible. Only call when the organiser clearly asks to cancel.",
    input_schema: { type: "object", properties: { reason: { type: "string" } }, required: ["reason"], additionalProperties: false },
    strict: true,
  },
];

async function runTool(pot: Pot, name: string, input: Record<string, unknown>): Promise<string> {
  switch (name) {
    case "get_pot_status":
      return JSON.stringify(potSummary(pot));
    case "send_reminders": {
      const r = await sendReminders(pot);
      return JSON.stringify(r);
    }
    case "add_contributor": {
      await addContributor(pot, String(input.name ?? ""), input.email ? String(input.email) : undefined);
      return JSON.stringify(potSummary(pot));
    }
    case "cancel_pot": {
      await cancelPot(pot, `Organiser cancelled via chat: ${String(input.reason ?? "")}`);
      return JSON.stringify(potSummary(pot));
    }
    default:
      return JSON.stringify({ error: `unknown tool ${name}` });
  }
}

function fmt(n: number) {
  return `$${n.toFixed(2)}`;
}

/** Deterministic fallback when no Claude key is configured. */
async function fallbackChat(pot: Pot, message: string): Promise<string> {
  const m = message.toLowerCase();
  const s = potSummary(pot);
  if (/cancel|call it off|abort|refund everyone/.test(m)) {
    if (!/\b(yes|confirm|do it|please)\b/.test(m) && !/cancel (the )?pot/.test(m)) {
      return `Cancelling refunds ${s.paid.length} paid contributor${s.paid.length === 1 ? "" : "s"} (${fmt(s.collected)}) and voids ${s.unpaid.length} open invoice${s.unpaid.length === 1 ? "" : "s"}. Say "cancel the pot" to confirm.`;
    }
    await cancelPot(pot, "Organiser cancelled via chat.");
    return `Done. Refunded ${fmt(s.collected)} across ${s.paid.length} people and cancelled the open invoices.`;
  }
  if (/remind|nudge|chase|poke/.test(m)) {
    const r = await sendReminders(pot);
    return r.sent ? `Reminders sent to ${r.names.join(", ")}.` : "Everyone has paid, nobody to remind.";
  }
  const add = m.match(/add\s+(?:a\s+)?(?:(\d+)(?:st|nd|rd|th)?\s+person|([a-z]+)(?:\s+\(?([\w.+-]+@[\w-]+\.[\w.-]+)\)?)?)/);
  if (/\badd\b|join|one more|another person/.test(m)) {
    const email = message.match(/[\w.+-]+@[\w-]+\.[\w.-]+/)?.[0];
    const name = add?.[2] && !/person|someone|another|one/.test(add[2]) ? add[2][0].toUpperCase() + add[2].slice(1) : "New friend";
    await addContributor(pot, name, email);
    const s2 = potSummary(pot);
    return `${name} added. The remaining ${fmt(s2.remaining)} is now split ${s2.unpaid.length} ways: ${s2.unpaid.map((u) => `${u.name} ${fmt(u.share)}`).join(", ")}. New invoices are out.`;
  }
  if (/who.*(hasn'?t|not) paid|outstanding|owe|still waiting|unpaid/.test(m)) {
    return s.unpaid.length
      ? `Still waiting on ${s.unpaid.map((u) => `${u.name} (${fmt(u.share)})`).join(", ")}. ${fmt(s.remaining)} to go.`
      : "Everyone has paid.";
  }
  if (/who.*paid|status|how.*going|progress|where are we/.test(m)) {
    return `${fmt(s.collected)} of ${fmt(s.total)} collected. Paid: ${s.paid.map((p) => p.name).join(", ") || "nobody yet"}. Waiting on: ${s.unpaid.map((u) => u.name).join(", ") || "nobody"}. Status: ${s.status}.`;
  }
  if (/deadline|when|due/.test(m)) {
    return `Deadline is ${new Date(s.deadline).toLocaleString()}. If the pot isn't full by then, everyone who paid is refunded automatically.`;
  }
  return `I can tell you who hasn't paid, send reminders, add a person, or cancel the pot. Right now: ${fmt(s.collected)} of ${fmt(s.total)} collected.`;
}

export async function chat(pot: Pot, history: ChatTurn[], message: string): Promise<string> {
  if (!hasClaude()) return fallbackChat(pot, message);
  const client = new Anthropic({ apiKey: env.anthropicKey });
  const messages: Anthropic.MessageParam[] = [
    ...history.slice(-10).map((t) => ({ role: t.role, content: t.content }) as Anthropic.MessageParam),
    { role: "user", content: message },
  ];
  const system = `You are Chip-In, the assistant for a group purchase pot. Pot: "${pot.title}" for ${pot.item.title} at $${pot.total.toFixed(2)}, status ${pot.status}. Use get_pot_status before answering questions about payments. Be brief and concrete with names and dollar amounts. Only call cancel_pot when the organiser explicitly asks to cancel; otherwise explain what cancelling would do and ask them to confirm.`;

  for (let i = 0; i < 6; i++) {
    const res = await client.messages.create({
      model: env.anthropicModel,
      max_tokens: 1500,
      output_config: { effort: "low" },
      system,
      tools,
      messages,
    });
    if (res.stop_reason === "refusal") return "I can't help with that one.";
    const toolUses = res.content.filter((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");
    if (!toolUses.length || res.stop_reason !== "tool_use") {
      const text = res.content.filter((b): b is Anthropic.TextBlock => b.type === "text").map((b) => b.text).join("\n").trim();
      return text || "Done.";
    }
    messages.push({ role: "assistant", content: res.content });
    const results: Anthropic.ToolResultBlockParam[] = [];
    for (const tu of toolUses) {
      let content: string;
      let isError = false;
      try {
        content = await runTool(pot, tu.name, (tu.input ?? {}) as Record<string, unknown>);
      } catch (err) {
        content = err instanceof Error ? err.message : String(err);
        isError = true;
      }
      results.push({ type: "tool_result", tool_use_id: tu.id, content, is_error: isError });
    }
    messages.push({ role: "user", content: results });
  }
  return "I did what I could; check the ledger for the latest state.";
}
