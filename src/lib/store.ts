import { promises as fs } from "node:fs";
import path from "node:path";
import type { Pot } from "./types";

interface Store {
  get(id: string): Promise<Pot | null>;
  list(): Promise<Pot[]>;
  save(pot: Pot): Promise<void>;
  findByInvoice(invoiceId: string): Promise<Pot | null>;
}

// ----- JSON file store (local dev) with in-memory fallback (read-only filesystems) -----
class FileStore implements Store {
  private file = path.join(process.cwd(), ".data", "pots.json");
  private mem: Record<string, Pot> | null = null;
  private writable = true;

  private async load(): Promise<Record<string, Pot>> {
    if (this.mem) return this.mem;
    try {
      const raw = await fs.readFile(this.file, "utf8");
      this.mem = JSON.parse(raw) as Record<string, Pot>;
    } catch {
      this.mem = {};
    }
    return this.mem;
  }
  private async persist() {
    if (!this.writable || !this.mem) return;
    try {
      await fs.mkdir(path.dirname(this.file), { recursive: true });
      await fs.writeFile(this.file, JSON.stringify(this.mem, null, 2));
    } catch {
      this.writable = false; // e.g. Vercel read-only FS: keep in memory only
    }
  }
  async get(id: string) {
    return (await this.load())[id] ?? null;
  }
  async list() {
    return Object.values(await this.load()).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
  async save(pot: Pot) {
    const all = await this.load();
    all[pot.id] = pot;
    await this.persist();
  }
  async findByInvoice(invoiceId: string) {
    return (await this.list()).find((p) => p.contributors.some((c) => c.invoiceId === invoiceId)) ?? null;
  }
}

// ----- Upstash Redis store (Vercel) -----
class RedisStore implements Store {
  private client: import("@upstash/redis").Redis;
  constructor(url: string, token: string) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { Redis } = require("@upstash/redis") as typeof import("@upstash/redis");
    this.client = new Redis({ url, token });
  }
  async get(id: string) {
    return (await this.client.get<Pot>(`pot:${id}`)) ?? null;
  }
  async list() {
    const ids = await this.client.smembers("pots");
    if (!ids.length) return [];
    const pots = await Promise.all(ids.map((id) => this.get(id)));
    return pots.filter((p): p is Pot => Boolean(p)).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
  async save(pot: Pot) {
    await this.client.set(`pot:${pot.id}`, pot);
    await this.client.sadd("pots", pot.id);
    for (const c of pot.contributors) if (c.invoiceId) await this.client.set(`inv:${c.invoiceId}`, pot.id);
  }
  async findByInvoice(invoiceId: string) {
    const id = await this.client.get<string>(`inv:${invoiceId}`);
    return id ? this.get(id) : null;
  }
}

declare global {
  var __chipinStore: Store | undefined;
}

export function store(): Store {
  if (!globalThis.__chipinStore) {
    const url = process.env.UPSTASH_REDIS_REST_URL;
    const token = process.env.UPSTASH_REDIS_REST_TOKEN;
    globalThis.__chipinStore = url && token ? new RedisStore(url, token) : new FileStore();
  }
  return globalThis.__chipinStore;
}
