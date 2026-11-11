import ts from "typescript";
import fs from "node:fs";
const src = fs.readFileSync("src/lib/planner.ts", "utf8");
const body = src.split("export function fallbackPlan")[1].split("export async function makePlan")[0];
const consts = src.match(/const WORD_NUMBERS[\s\S]*?\n};/)[0];
const js = ts.transpileModule(consts + "\nfunction fallbackPlan" + body, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const fallbackPlan = new Function(js + "; return fallbackPlan;")();
for (const p of [
  "Get us a Nintendo Switch for the office game nights, split 6 ways. Deadline in 5 days.",
  "Buy Priya a Sony WH-1000XM5 for her birthday, split between 4 of us, budget under $350.",
  "Order a Breville espresso machine for the studio kitchen, 8 people, by end of month.",
  "Let's chip in for a LEGO Millennium Falcon for Sam, five of us, due Friday",
  "get us a Nintendo Switch for the office game nights, split 6 ways between alex@example.com, priya@example.com and chris@example.com. Deadline in 7 days.",
]) {
  const r = fallbackPlan(p);
  console.log(JSON.stringify({ item: r.itemQuery, title: r.title, n: r.participantCount, days: r.deadlineDays, max: r.maxPrice, emails: r.participants.length }));
}
