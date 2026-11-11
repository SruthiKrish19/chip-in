/**
 * The Chip-In state machine. Every money movement here is deterministic code calling PayPal;
 * the model (planner / assistant) only proposes.
 */
import { randomUUID } from "node:crypto";
import { env, hasPayPal } from "./env";
import * as pp from "./paypal";
import { searchProducts } from "./channel3";
import { draftMessage, makePlan, splitShares } from "./planner";
import { store } from "./store";
import { isFunded, paidTotal, round2, type Contributor, type Pot, type Product } from "./types";

const FIRST_NAMES = ["Alex", "Priya", "Sam", "Jordan", "Maya", "Chris", "Dev", "Riley", "Nina", "Omar", "Zoe", "Kai"];

function now() {
  return new Date().toISOString();
}
function log(pot: Pot, type: string, message: string) {
  pot.events.unshift({ at: now(), type, message });
  pot.events = pot.events.slice(0, 200);
  pot.updatedAt = now();
}
function shortId() {
  return randomUUID().split("-")[0];
}

export async function getPot(id: string) {
  const pot = await store().get(id);
  if (!pot) return null;
  // Lazy deadline enforcement: any read after the deadline settles the pot.
  if (pot.status === "collecting" && new Date(pot.deadline).getTime() < Date.now()) {
    await cancelPot(pot, "Deadline passed before the pot was fully funded.");
  }
  return pot;
}
export const listPots = () => store().list();
const save = (pot: Pot) => store().save(pot);

// ---------- creation ----------

export async function createPot(
  prompt: string,
  opts: { deadlineOverrideMinutes?: number; sample?: boolean; sampleKey?: string } = {},
): Promise<Pot> {
  const { plan, source, notes } = await makePlan(prompt);
  const { products, source: productSource } = await searchProducts(plan.itemQuery, { maxPrice: plan.maxPrice });
  const item: Product = products[0];

  const n = Math.max(2, plan.participantCount);
  const shares = splitShares(item.price, n);
  const named = plan.participants.slice(0, n);
  const contributors: Contributor[] = Array.from({ length: n }, (_, i) => {
    const p = named[i];
    const name = p?.name || FIRST_NAMES[i % FIRST_NAMES.length];
    const email = p?.email || `${name.toLowerCase().replace(/\s+/g, ".")}-${shortId()}@example.com`;
    return { id: shortId(), name, email, share: shares[i], status: "pending", reminders: 0 };
  });

  const deadline = opts.deadlineOverrideMinutes
    ? new Date(Date.now() + opts.deadlineOverrideMinutes * 60_000)
    : new Date(Date.now() + plan.deadlineDays * 86_400_000);

  const pot: Pot = {
    id: shortId(),
    title: plan.title,
    prompt,
    item,
    total: round2(item.price),
    currency: "USD",
    deadline: deadline.toISOString(),
    status: "collecting",
    contributors,
    plan: { summary: plan.summary, source, notes },
    sample: opts.sample || undefined,
    sampleKey: opts.sampleKey,
    events: [],
    createdAt: now(),
    updatedAt: now(),
  };
  if (opts.sample) log(pot, "sample", "Seeded as a SAMPLE pot for hosted-demo reviewers.");
  log(pot, "plan", `${source === "claude" ? "Claude" : "Fallback planner"} parsed the request: ${plan.summary}`);
  log(pot, "product", `${productSource === "channel3" ? "Channel3" : "Local catalogue"} found "${item.title}" at $${item.price.toFixed(2)}.`);
  log(pot, "split", `Split $${pot.total.toFixed(2)} ${n} ways: ${describeShares(shares)}.`);
  await save(pot);
  await issueInvoices(pot, pot.contributors);
  await save(pot);
  return pot;
}

function describeShares(shares: number[]) {
  const uniq = Array.from(new Set(shares.map((s) => s.toFixed(2))));
  return uniq.length === 1 ? `$${uniq[0]} each` : `$${uniq[0]} × ${shares.filter((s) => s.toFixed(2) === uniq[0]).length}, $${uniq[1]} × ${shares.filter((s) => s.toFixed(2) === uniq[1]).length}`;
}

async function issueInvoices(pot: Pot, targets: Contributor[]) {
  if (!hasPayPal()) {
    for (const c of targets) {
      c.status = "sent";
      c.lastError = "PayPal not configured: invoice simulated";
    }
    log(pot, "warn", "PayPal credentials missing; invoices were simulated.");
    return;
  }
  const dueDate = pot.deadline.slice(0, 10);
  for (const c of targets) {
    try {
      const note = await draftMessage("invoice", { name: c.name, item: pot.item.title, share: c.share, deadline: pot.deadline });
      const { id } = await pp.createInvoice({
        recipient: { name: c.name, email: c.email },
        amount: c.share,
        currency: pot.currency,
        itemName: `${pot.title}: share of ${pot.item.title}`.slice(0, 200),
        note,
        reference: `chipin-${pot.id}-${c.id}`,
        dueDate,
      });
      c.invoiceId = id;
      const sent = await pp.sendInvoice(id);
      const inv = await pp.getInvoice(id);
      c.invoiceNumber = inv.detail.invoice_number;
      c.payerViewUrl = sent.payerViewUrl ?? inv.detail.metadata?.recipient_view_url;
      c.status = "sent";
      c.lastError = undefined;
      log(pot, "invoice", `Invoice ${c.invoiceNumber ?? id} for $${c.share.toFixed(2)} sent to ${c.name}.`);
    } catch (err) {
      c.lastError = err instanceof Error ? err.message : String(err);
      log(pot, "error", `Invoice for ${c.name} failed: ${c.lastError}`);
    }
  }
}

// ---------- payments ----------

export async function ensureQr(pot: Pot, contributorId: string): Promise<string | undefined> {
  const c = pot.contributors.find((x) => x.id === contributorId);
  if (!c?.invoiceId) return undefined;
  if (c.qrPng) return c.qrPng;
  try {
    c.qrPng = await pp.getInvoiceQrPng(c.invoiceId);
    await save(pot);
  } catch (err) {
    c.lastError = err instanceof Error ? err.message : String(err);
  }
  return c.qrPng;
}

/** Demo helper: records an external payment against the contributor's PayPal invoice. */
export async function simulatePayment(pot: Pot, contributorId: string) {
  const c = pot.contributors.find((x) => x.id === contributorId);
  if (!c) throw new Error("Contributor not found");
  if (pot.status !== "collecting") throw new Error(`Pot is ${pot.status}; no more payments accepted`);
  if (c.status === "paid") return pot;
  if (c.invoiceId) {
    const res = await pp.recordInvoicePayment(c.invoiceId, c.share, pot.currency, "Paid via Chip-In demo");
    c.paymentId = res.payment_id;
  }
  c.paymentKind = "recorded";
  c.status = "paid";
  c.paidAt = now();
  log(pot, "paid", `${c.name} paid $${c.share.toFixed(2)}${c.paymentId ? ` (PayPal payment ${c.paymentId})` : ""}. Pot at $${paidTotal(pot).toFixed(2)} / $${pot.total.toFixed(2)}.`);
  await save(pot);
  await checkFunded(pot);
  return pot;
}

/** Webhook path: a contributor paid the PayPal invoice for real. */
export async function markInvoicePaid(invoiceId: string, captureId?: string) {
  const pot = await store().findByInvoice(invoiceId);
  if (!pot) return null;
  const c = pot.contributors.find((x) => x.invoiceId === invoiceId);
  if (!c || c.status === "paid") return pot;
  c.status = "paid";
  c.paidAt = now();
  c.paymentKind = captureId ? "paypal" : "recorded";
  c.paymentId = captureId ?? c.paymentId;
  log(pot, "paid", `${c.name} paid invoice ${c.invoiceNumber ?? invoiceId} via PayPal.`);
  await save(pot);
  await checkFunded(pot);
  return pot;
}

// ---------- funding → buy ----------

async function checkFunded(pot: Pot) {
  if (pot.status !== "collecting" || !isFunded(pot)) return;
  pot.status = "funded";
  log(pot, "funded", `Fully funded: $${paidTotal(pot).toFixed(2)} collected. Placing the order.`);
  await save(pot);
  await placeOrder(pot);
}

async function placeOrder(pot: Pot) {
  if (!hasPayPal()) {
    pot.order = { id: `SIM-${shortId()}`, status: "SIMULATED" };
    log(pot, "order", "PayPal not configured; order simulated.");
    await save(pot);
    return;
  }
  try {
    const order = await pp.createOrder({
      amount: pot.total,
      currency: pot.currency,
      description: `${pot.title}: ${pot.item.title}`,
      reference: pot.id,
      returnUrl: `${env.baseUrl}/api/pots/${pot.id}/return`,
      cancelUrl: `${env.baseUrl}/pot/${pot.id}?cancelled=1`,
    });
    pot.order = { id: order.id, status: order.status, approveUrl: pp.approveLink(order) };
    log(pot, "order", `PayPal order ${order.id} created for $${pot.total.toFixed(2)}. Awaiting buyer approval.`);
  } catch (err) {
    log(pot, "error", `Order creation failed: ${err instanceof Error ? err.message : String(err)}`);
  }
  await save(pot);
}

/** Called from the PayPal return URL after the organiser approves the order. */
export async function completeOrder(pot: Pot, token?: string) {
  if (!pot.order) throw new Error("No order on this pot");
  if (token && token !== pot.order.id) throw new Error("Order token mismatch");
  if (pot.status === "purchased") return pot;
  const captured = await pp.captureOrder(pot.order.id);
  const capture = captured.purchase_units?.[0]?.payments?.captures?.[0];
  pot.order.status = captured.status;
  pot.order.captureId = capture?.id;
  log(pot, "captured", `Order ${pot.order.id} captured (${captured.status}${capture ? `, capture ${capture.id}` : ""}).`);
  if (capture?.id) {
    const trackingNumber = `CHIP${Date.now().toString().slice(-8)}`;
    try {
      await pp.addOrderTracking(pot.order.id, capture.id, trackingNumber, "Chip-In Courier");
      pot.order.trackingNumber = trackingNumber;
      pot.order.carrier = "Chip-In Courier";
      log(pot, "shipped", `Shipment tracking ${trackingNumber} attached to the order.`);
    } catch (err) {
      log(pot, "error", `Tracking failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  pot.status = "purchased";
  await save(pot);
  return pot;
}

// ---------- reminders ----------

export async function sendReminders(pot: Pot) {
  const unpaid = pot.contributors.filter((c) => c.status === "sent");
  let sent = 0;
  for (const c of unpaid) {
    try {
      if (c.invoiceId) {
        const note = await draftMessage("reminder", { name: c.name, item: pot.item.title, share: c.share, deadline: pot.deadline });
        await pp.remindInvoice(c.invoiceId, `Reminder: your share for ${pot.title}`, note);
      }
      c.reminders += 1;
      c.lastReminderAt = now();
      sent += 1;
    } catch (err) {
      c.lastError = err instanceof Error ? err.message : String(err);
    }
  }
  log(pot, "reminder", sent ? `Reminders sent to ${sent} contributor${sent === 1 ? "" : "s"}: ${unpaid.map((c) => c.name).join(", ")}.` : "Nobody to remind.");
  await save(pot);
  return { sent, names: unpaid.map((c) => c.name) };
}

// ---------- cancel / refund ----------

export async function cancelPot(pot: Pot, reason: string) {
  if (pot.status === "purchased" || pot.status === "refunded" || pot.status === "cancelled") return pot;
  log(pot, "cancel", reason);
  let refunded = 0;
  for (const c of pot.contributors) {
    try {
      if (c.status === "paid") {
        if (c.invoiceId) {
          if (c.paymentKind === "paypal" && c.paymentId) {
            const r = await pp.refundCapture(c.paymentId, c.share, pot.currency);
            c.refundId = r.id;
          } else {
            const r = await pp.recordInvoiceRefund(c.invoiceId, c.share, pot.currency);
            c.refundId = r.refund_id;
          }
        }
        c.status = "refunded";
        refunded += 1;
        log(pot, "refund", `Refunded $${c.share.toFixed(2)} to ${c.name}${c.refundId ? ` (${c.refundId})` : ""}.`);
      } else if (c.status === "sent" && c.invoiceId) {
        await pp.cancelInvoice(c.invoiceId, `The ${pot.title} pot was cancelled. Nothing to pay.`);
        c.status = "cancelled";
      } else {
        c.status = "cancelled";
      }
    } catch (err) {
      c.lastError = err instanceof Error ? err.message : String(err);
      log(pot, "error", `Refund/cancel for ${c.name} failed: ${c.lastError}`);
    }
  }
  if (pot.order?.approveUrl && !pot.order.captureId) pot.order.status = "ABANDONED";
  pot.status = refunded ? "refunded" : "cancelled";
  await save(pot);
  return pot;
}

// ---------- add contributor (re-split among the unpaid) ----------

export async function addContributor(pot: Pot, name: string, email?: string) {
  if (pot.status !== "collecting") throw new Error(`Pot is ${pot.status}; cannot add people`);
  const remaining = round2(pot.total - paidTotal(pot));
  const unpaid = pot.contributors.filter((c) => c.status === "sent" || c.status === "pending");
  const newC: Contributor = {
    id: shortId(),
    name: name.trim() || FIRST_NAMES[pot.contributors.length % FIRST_NAMES.length],
    email: email?.trim() || `${name.trim().toLowerCase().replace(/\s+/g, ".") || "friend"}-${shortId()}@example.com`,
    share: 0,
    status: "pending",
    reminders: 0,
  };
  const group = [...unpaid, newC];
  const shares = splitShares(remaining, group.length);
  // Cancel the old unpaid invoices, then reissue with the new amounts.
  for (const c of unpaid) {
    if (c.invoiceId && c.status === "sent") {
      try {
        await pp.cancelInvoice(c.invoiceId, `Your share changed because ${newC.name} joined. A new invoice is on its way.`);
      } catch (err) {
        c.lastError = err instanceof Error ? err.message : String(err);
      }
    }
    c.invoiceId = undefined;
    c.invoiceNumber = undefined;
    c.payerViewUrl = undefined;
    c.qrPng = undefined;
    c.status = "pending";
  }
  group.forEach((c, i) => (c.share = shares[i]));
  pot.contributors.push(newC);
  log(pot, "resplit", `${newC.name} joined. Remaining $${remaining.toFixed(2)} re-split ${group.length} ways: ${describeShares(shares)}.`);
  await save(pot);
  await issueInvoices(pot, group);
  await save(pot);
  return pot;
}

export function potSummary(pot: Pot) {
  const paid = pot.contributors.filter((c) => c.status === "paid");
  const unpaid = pot.contributors.filter((c) => c.status === "sent" || c.status === "pending");
  return {
    id: pot.id,
    title: pot.title,
    status: pot.status,
    item: pot.item.title,
    total: pot.total,
    collected: paidTotal(pot),
    remaining: round2(pot.total - paidTotal(pot)),
    deadline: pot.deadline,
    paid: paid.map((c) => ({ name: c.name, share: c.share })),
    unpaid: unpaid.map((c) => ({ name: c.name, share: c.share, reminders: c.reminders })),
    order: pot.order,
  };
}
