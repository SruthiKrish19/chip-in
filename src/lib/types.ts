export type ContributorStatus = "pending" | "sent" | "paid" | "refunded" | "cancelled";

export type Contributor = {
  id: string;
  name: string;
  email: string;
  share: number; // USD
  status: ContributorStatus;
  invoiceId?: string;
  invoiceNumber?: string;
  payerViewUrl?: string;
  qrPng?: string; // base64 PNG, cached
  paidAt?: string;
  paymentId?: string; // EXTR-... (recorded) or capture id (real PayPal payment)
  paymentKind?: "recorded" | "paypal";
  refundId?: string;
  reminders: number;
  lastReminderAt?: string;
  lastError?: string;
};

export type PotStatus = "collecting" | "funded" | "purchased" | "cancelled" | "refunded";

export type Product = {
  id: string;
  title: string;
  price: number;
  currency: string;
  url?: string;
  image?: string;
  brand?: string;
  source: "channel3" | "local";
};

export type PotEvent = { at: string; type: string; message: string };

export type Pot = {
  id: string;
  title: string;
  prompt: string;
  item: Product;
  total: number;
  currency: string;
  deadline: string; // ISO
  status: PotStatus;
  contributors: Contributor[];
  order?: {
    id: string;
    status: string;
    approveUrl?: string;
    captureId?: string;
    trackingNumber?: string;
    carrier?: string;
  };
  plan: { summary: string; source: "claude" | "fallback"; notes?: string };
  events: PotEvent[];
  createdAt: string;
  updatedAt: string;
};

export type Plan = {
  itemQuery: string;
  title: string;
  participants: { name: string; email: string }[];
  participantCount: number;
  deadlineDays: number;
  maxPrice?: number;
  summary: string;
};

export function paidTotal(pot: Pot) {
  return round2(pot.contributors.filter((c) => c.status === "paid").reduce((s, c) => s + c.share, 0));
}
export function round2(n: number) {
  return Math.round(n * 100) / 100;
}
export function isFunded(pot: Pot) {
  return paidTotal(pot) + 0.001 >= pot.total;
}
