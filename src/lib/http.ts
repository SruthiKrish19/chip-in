import { NextResponse } from "next/server";
import { getPot } from "./pot";

export function json(data: unknown, status = 200) {
  return NextResponse.json(data, { status });
}

export function error(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

export async function withPot<T>(id: string, fn: (pot: NonNullable<Awaited<ReturnType<typeof getPot>>>) => Promise<T>) {
  const pot = await getPot(id);
  if (!pot) return error("Pot not found", 404);
  try {
    const result = await fn(pot);
    return result instanceof NextResponse ? result : json(result);
  } catch (err) {
    return error(err instanceof Error ? err.message : String(err), 500);
  }
}

export const dynamic = "force-dynamic";
