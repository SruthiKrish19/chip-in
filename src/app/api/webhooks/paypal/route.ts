import { markInvoicePaid } from "@/lib/pot";
import { env, paypalApiBase } from "@/lib/env";
import { getAccessToken } from "@/lib/paypal";

export const dynamic = "force-dynamic";

type WebhookEvent = {
  id: string;
  event_type: string;
  resource?: { invoice?: { id?: string }; id?: string; payments?: { transactions?: { payment_id?: string; type?: string }[] } };
};

async function verify(req: Request, raw: string): Promise<boolean> {
  if (!env.paypalWebhookId) return true; // sandbox convenience: accept unverified events when no webhook id is configured
  const h = (n: string) => req.headers.get(n) ?? "";
  const token = await getAccessToken();
  const res = await fetch(`${paypalApiBase}/v1/notifications/verify-webhook-signature`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      auth_algo: h("paypal-auth-algo"),
      cert_url: h("paypal-cert-url"),
      transmission_id: h("paypal-transmission-id"),
      transmission_sig: h("paypal-transmission-sig"),
      transmission_time: h("paypal-transmission-time"),
      webhook_id: env.paypalWebhookId,
      webhook_event: JSON.parse(raw),
    }),
  });
  const json = (await res.json().catch(() => ({}))) as { verification_status?: string };
  return json.verification_status === "SUCCESS";
}

export async function POST(req: Request) {
  const raw = await req.text();
  if (!(await verify(req, raw))) return Response.json({ error: "bad signature" }, { status: 400 });
  const evt = JSON.parse(raw) as WebhookEvent;
  if (evt.event_type === "INVOICING.INVOICE.PAID") {
    const invoiceId = evt.resource?.invoice?.id ?? evt.resource?.id;
    const tx = evt.resource?.payments?.transactions?.find((t) => t.type === "PAYPAL");
    if (invoiceId) await markInvoicePaid(invoiceId, tx?.payment_id);
  }
  return Response.json({ ok: true });
}
