/**
 * Thin PayPal REST client (sandbox by default). Covers the surfaces Chip-In uses:
 * Invoicing v2 (create, send, QR, record payment, record refund, remind, cancel),
 * Orders v2 (create, capture, track) and Payments v2 (refund a capture).
 */
import { env, paypalApiBase, hasPayPal } from "./env";

let cachedToken: { token: string; expiresAt: number } | null = null;

export class PayPalError extends Error {
  constructor(
    message: string,
    public status: number,
    public body: unknown,
  ) {
    super(message);
    this.name = "PayPalError";
  }
}

export async function getAccessToken(): Promise<string> {
  if (!hasPayPal()) throw new PayPalError("PayPal credentials are not configured", 0, null);
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) return cachedToken.token;
  const basic = Buffer.from(`${env.paypalClientId}:${env.paypalClientSecret}`).toString("base64");
  const res = await fetch(`${paypalApiBase}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
    cache: "no-store",
  });
  if (!res.ok) throw new PayPalError("PayPal auth failed", res.status, await res.text());
  const json = (await res.json()) as { access_token: string; expires_in: number };
  cachedToken = { token: json.access_token, expiresAt: Date.now() + json.expires_in * 1000 };
  return cachedToken.token;
}

async function pp<T = unknown>(
  path: string,
  init: { method?: string; body?: unknown; headers?: Record<string, string>; raw?: boolean } = {},
): Promise<T> {
  const token = await getAccessToken();
  const res = await fetch(`${paypalApiBase}${path}`, {
    method: init.method ?? "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
    cache: "no-store",
  });
  if (!res.ok) {
    let body: unknown;
    const text = await res.text();
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }
    const issue =
      typeof body === "object" && body && "details" in body
        ? JSON.stringify((body as { details: unknown }).details)
        : typeof body === "string"
          ? body
          : JSON.stringify(body);
    throw new PayPalError(`PayPal ${init.method ?? "GET"} ${path} failed (${res.status}): ${issue}`, res.status, body);
  }
  if (init.raw) return (await res.text()) as unknown as T;
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

function money(value: number, currency = "USD") {
  return { currency_code: currency, value: value.toFixed(2) };
}

// ---------- Invoicing v2 ----------

export type InvoiceRecipient = { name: string; email: string };

export async function createInvoice(opts: {
  recipient: InvoiceRecipient;
  amount: number;
  currency: string;
  itemName: string;
  note: string;
  reference: string;
  dueDate?: string; // YYYY-MM-DD
}): Promise<{ id: string }> {
  const [given, ...rest] = opts.recipient.name.trim().split(/\s+/);
  const body = {
    detail: {
      currency_code: opts.currency,
      note: opts.note,
      reference: opts.reference,
      memo: "Created by Chip-In",
      payment_term: opts.dueDate ? { due_date: opts.dueDate } : undefined,
    },
    primary_recipients: [
      {
        billing_info: {
          name: { given_name: given || "Friend", surname: rest.join(" ") || undefined },
          email_address: opts.recipient.email,
          // Sandbox note: an India-region merchant cannot invoice India-based customers,
          // so contributor addresses default to US.
          address: { country_code: "US" },
        },
      },
    ],
    items: [
      {
        name: opts.itemName,
        quantity: "1",
        unit_amount: money(opts.amount, opts.currency),
      },
    ],
  };
  const res = await pp<{ href: string }>("/v2/invoicing/invoices", { method: "POST", body });
  const id = res.href.split("/").pop()!;
  return { id };
}

export async function sendInvoice(id: string): Promise<{ payerViewUrl?: string }> {
  const res = await pp<{ href?: string } | undefined>(`/v2/invoicing/invoices/${id}/send`, {
    method: "POST",
    body: { send_to_recipient: true, send_to_invoicer: false },
  });
  return { payerViewUrl: res?.href };
}

export type Invoice = {
  id: string;
  status: string;
  detail: { invoice_number?: string; metadata?: { recipient_view_url?: string; invoicer_view_url?: string } };
  payments?: {
    paid_amount?: { value: string };
    transactions?: { type: string; payment_id: string; method?: string; amount: { value: string } }[];
  };
  refunds?: { transactions?: { refund_id: string; amount: { value: string } }[] };
};

export async function getInvoice(id: string): Promise<Invoice> {
  return pp<Invoice>(`/v2/invoicing/invoices/${id}`);
}

/** Returns a base64 PNG (no data: prefix). PayPal responds multipart/form-data with an "image" part. */
export async function getInvoiceQrPng(id: string, size = 300): Promise<string> {
  const raw = await pp<string>(`/v2/invoicing/invoices/${id}/generate-qr-code`, {
    method: "POST",
    body: { width: size, height: size, action: "pay" },
    raw: true,
  });
  // Extract the body of the "image" part.
  const idx = raw.indexOf('name="image"');
  if (idx === -1) throw new PayPalError("QR response missing image part", 200, raw.slice(0, 200));
  const afterHeaders = raw.indexOf("\r\n\r\n", idx);
  const start = afterHeaders === -1 ? idx : afterHeaders + 4;
  const end = raw.indexOf("\r\n--", start);
  return raw.slice(start, end === -1 ? undefined : end).trim();
}

export async function recordInvoicePayment(id: string, amount: number, currency: string, note: string) {
  return pp<{ payment_id: string }>(`/v2/invoicing/invoices/${id}/payments`, {
    method: "POST",
    body: { method: "OTHER", amount: money(amount, currency), note },
  });
}

export async function recordInvoiceRefund(id: string, amount: number, currency: string) {
  return pp<{ refund_id: string }>(`/v2/invoicing/invoices/${id}/refunds`, {
    method: "POST",
    body: { method: "OTHER", amount: money(amount, currency) },
  });
}

export async function remindInvoice(id: string, subject: string, note: string) {
  await pp(`/v2/invoicing/invoices/${id}/remind`, {
    method: "POST",
    body: { subject, note, send_to_recipient: true, send_to_invoicer: false },
  });
}

export async function cancelInvoice(id: string, note: string) {
  await pp(`/v2/invoicing/invoices/${id}/cancel`, {
    method: "POST",
    body: { subject: "Chip-In pot cancelled", note, send_to_recipient: true, send_to_invoicer: false },
  });
}

// ---------- Orders v2 ----------

export type Order = {
  id: string;
  status: string;
  links?: { rel: string; href: string }[];
  purchase_units?: { payments?: { captures?: { id: string; status: string }[] } }[];
};

export async function createOrder(opts: {
  amount: number;
  currency: string;
  description: string;
  reference: string;
  returnUrl: string;
  cancelUrl: string;
}): Promise<Order> {
  return pp<Order>("/v2/checkout/orders", {
    method: "POST",
    headers: { "PayPal-Request-Id": `chipin-${opts.reference}-${Date.now()}` },
    body: {
      intent: "CAPTURE",
      purchase_units: [
        {
          reference_id: opts.reference,
          description: opts.description.slice(0, 127),
          amount: money(opts.amount, opts.currency),
        },
      ],
      payment_source: {
        paypal: {
          experience_context: {
            brand_name: "Chip-In",
            user_action: "PAY_NOW",
            return_url: opts.returnUrl,
            cancel_url: opts.cancelUrl,
          },
        },
      },
    },
  });
}

export async function getOrder(id: string): Promise<Order> {
  return pp<Order>(`/v2/checkout/orders/${id}`);
}

export async function captureOrder(id: string): Promise<Order> {
  return pp<Order>(`/v2/checkout/orders/${id}/capture`, { method: "POST", body: {} });
}

export async function addOrderTracking(orderId: string, captureId: string, trackingNumber: string, carrierName: string) {
  return pp<Order>(`/v2/checkout/orders/${orderId}/track`, {
    method: "POST",
    body: {
      capture_id: captureId,
      tracking_number: trackingNumber,
      carrier: "OTHER",
      carrier_name_other: carrierName,
      notify_payer: true,
    },
  });
}

// ---------- Payments v2 ----------

export async function refundCapture(captureId: string, amount?: number, currency = "USD") {
  return pp<{ id: string; status: string }>(`/v2/payments/captures/${captureId}/refund`, {
    method: "POST",
    body: amount ? { amount: money(amount, currency) } : {},
  });
}

export function approveLink(order: Order): string | undefined {
  return order.links?.find((l) => l.rel === "payer-action" || l.rel === "approve")?.href;
}
