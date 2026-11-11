import { createPot, listPots } from "@/lib/pot";
import { error, json } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function GET() {
  const pots = await listPots();
  return json(pots.map((p) => ({ ...p, contributors: p.contributors.map((c) => ({ ...c, qrPng: undefined })) })));
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { prompt?: string; deadlineMinutes?: number };
  const prompt = body.prompt?.trim();
  if (!prompt || prompt.length < 5) return error("Tell me what to buy and how to split it.");
  try {
    const pot = await createPot(prompt, { deadlineOverrideMinutes: body.deadlineMinutes });
    return json(pot, 201);
  } catch (err) {
    return error(err instanceof Error ? err.message : String(err), 500);
  }
}
