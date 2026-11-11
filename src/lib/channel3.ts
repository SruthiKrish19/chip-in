/**
 * Channel3 product search (sponsor tool). Real API: POST https://api.trychannel3.com/v1/search
 * with header x-api-key. When CHANNEL3_API_KEY is absent we fall back to a small local catalogue
 * and label the result source so the UI can say so.
 */
import { env, hasChannel3 } from "./env";
import type { Product } from "./types";

type C3Response = {
  products: {
    id: string;
    title: string;
    brands?: { name: string }[];
    images?: { url: string; cleaned_url?: string | null; is_main_image?: boolean }[];
    offers?: { url: string; price: { price: number; currency: string }; availability?: string }[];
  }[];
};

const LOCAL_CATALOGUE: Product[] = [
  { id: "local-switch", title: "Nintendo Switch (OLED model)", price: 349.99, currency: "USD", brand: "Nintendo", source: "local", url: "https://www.nintendo.com/switch/" },
  { id: "local-switch2", title: "Nintendo Switch 2", price: 449.99, currency: "USD", brand: "Nintendo", source: "local" },
  { id: "local-ps5", title: "PlayStation 5 Slim", price: 499.99, currency: "USD", brand: "Sony", source: "local" },
  { id: "local-headphones", title: "Sony WH-1000XM5 Wireless Headphones", price: 329.0, currency: "USD", brand: "Sony", source: "local" },
  { id: "local-coffee", title: "Breville Barista Express Espresso Machine", price: 699.95, currency: "USD", brand: "Breville", source: "local" },
  { id: "local-airfryer", title: "Ninja Air Fryer 5.5 qt", price: 129.99, currency: "USD", brand: "Ninja", source: "local" },
  { id: "local-speaker", title: "Sonos Era 100 Smart Speaker", price: 249.0, currency: "USD", brand: "Sonos", source: "local" },
  { id: "local-projector", title: "XGIMI Horizon 1080p Projector", price: 799.0, currency: "USD", brand: "XGIMI", source: "local" },
  { id: "local-kettle", title: "Fellow Stagg EKG Electric Kettle", price: 165.0, currency: "USD", brand: "Fellow", source: "local" },
  { id: "local-giftcard", title: "Amazon Gift Card", price: 100.0, currency: "USD", brand: "Amazon", source: "local" },
  { id: "local-lego", title: "LEGO Millennium Falcon (75375)", price: 84.99, currency: "USD", brand: "LEGO", source: "local" },
  { id: "local-board", title: "Catan Board Game", price: 44.99, currency: "USD", brand: "Catan Studio", source: "local" },
];

function localSearch(query: string, maxPrice?: number): Product[] {
  const words = query.toLowerCase().split(/\W+/).filter((w) => w.length > 2);
  const scored = LOCAL_CATALOGUE.map((p) => {
    const hay = `${p.title} ${p.brand ?? ""}`.toLowerCase();
    const score = words.reduce((s, w) => s + (hay.includes(w) ? 1 : 0), 0);
    return { p, score };
  })
    .filter((x) => x.score > 0 && (!maxPrice || x.p.price <= maxPrice))
    .sort((a, b) => b.score - a.score || a.p.price - b.p.price);
  return scored.length ? scored.map((x) => x.p) : [LOCAL_CATALOGUE[LOCAL_CATALOGUE.length - 3]];
}

export async function searchProducts(query: string, opts: { maxPrice?: number; limit?: number } = {}): Promise<{
  products: Product[];
  source: "channel3" | "local";
}> {
  if (!hasChannel3()) return { products: localSearch(query, opts.maxPrice), source: "local" };
  const res = await fetch("https://api.trychannel3.com/v1/search", {
    method: "POST",
    headers: { "x-api-key": env.channel3Key, "Content-Type": "application/json" },
    body: JSON.stringify({
      query,
      limit: opts.limit ?? 5,
      filters: opts.maxPrice ? { price: { max_price: opts.maxPrice } } : undefined,
      config: { currency: "USD" },
    }),
    cache: "no-store",
  });
  if (!res.ok) {
    // Degrade gracefully but make it visible.
    return { products: localSearch(query, opts.maxPrice), source: "local" };
  }
  const json = (await res.json()) as C3Response;
  const products: Product[] = json.products
    .map((p): Product | null => {
      const offer = p.offers?.find((o) => o.availability !== "OutOfStock") ?? p.offers?.[0];
      if (!offer) return null;
      const img = p.images?.find((i) => i.is_main_image) ?? p.images?.[0];
      return {
        id: p.id,
        title: p.title,
        price: Number(offer.price.price),
        currency: offer.price.currency || "USD",
        url: offer.url,
        image: img?.cleaned_url ?? img?.url,
        brand: p.brands?.[0]?.name,
        source: "channel3" as const,
      };
    })
    .filter((p): p is Product => Boolean(p));
  return products.length ? { products, source: "channel3" } : { products: localSearch(query, opts.maxPrice), source: "local" };
}
