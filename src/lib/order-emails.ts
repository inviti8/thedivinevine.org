// Order emails (DESIGN.md §8): a confirmation to the buyer and a notification to the owner.
import type { ServerEnv } from './env';
import { emailLayout, esc, sendEmail } from './email';
import type { Order, ShippingAddress } from './orders';

const usd = (cents: number) => (cents / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' });

const cell = 'padding:6px 0;border-bottom:1px solid #d8c9a3';

function itemsTable(order: Order, discountCents: number) {
  const rows = order.lines
    .map(
      (l) => `<tr><td style="${cell}">${esc(l.name)} &times; ${l.quantity}</td>
<td style="${cell};text-align:right">${usd(l.unitAmountCents * l.quantity)}</td></tr>`
    )
    .join('');
  const total = (label: string, cents: number, bold = false) =>
    `<tr><td style="padding:4px 0${bold ? ';font-weight:bold' : ''}">${label}</td>
<td style="padding:4px 0;text-align:right${bold ? ';font-weight:bold' : ''}">${usd(cents)}</td></tr>`;
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:16px 0">${rows}
${total('Subtotal', order.subtotalCents)}
${discountCents > 0 ? total('Discount', -discountCents) : ''}
${total('Shipping', order.shippingCents ?? 0)}
${total('Total', order.totalCents ?? 0, true)}
</table>`;
}

function addressBlock(name: string | null, a: ShippingAddress | null) {
  if (!a) return '';
  const lines = [name, a.line1, a.line2, [a.city, a.state].filter(Boolean).join(', ') + ' ' + (a.postal_code ?? ''), a.country]
    .map((l) => l?.trim())
    .filter(Boolean)
    .map(esc);
  return `<p style="margin:16px 0 4px;font-size:12px;letter-spacing:.15em;text-transform:uppercase;color:#3f4a30">Shipping to</p>
<p style="margin:0">${lines.join('<br>')}</p>`;
}

export async function sendOrderEmails(
  env: ServerEnv,
  order: Order,
  extra: { discountCents: number; paymentIntentId: string | null; livemode: boolean }
) {
  const ref = order.id.slice(-8).toUpperCase();
  const sends: Promise<void>[] = [];

  if (order.email) {
    sends.push(
      sendEmail(env, {
        to: order.email,
        subject: `Your Divine Vine order #${ref}`,
        category: 'order',
        html: emailLayout({
          heading: 'Thank you for your order',
          preheader: `Order #${ref} is confirmed.`,
          body: `<p>${order.shippingName ? `Dear ${esc(order.shippingName.split(' ')[0])},` : 'Hello,'}</p>
<p>Your order <strong>#${esc(ref)}</strong> is confirmed. We'll prepare your remedies by hand and ship them within three business days.</p>
${itemsTable(order, extra.discountCents)}
${addressBlock(order.shippingName, order.shippingAddress)}
<p style="margin-top:20px">Questions about your order? Just reply to this email.</p>
<p>With care,<br>The Divine Vine</p>`,
        }),
      })
    );
  }

  if (env.ownerEmail) {
    const dashboard =
      extra.paymentIntentId &&
      `https://dashboard.stripe.com/${extra.livemode ? '' : 'test/'}payments/${encodeURIComponent(extra.paymentIntentId)}`;
    sends.push(
      sendEmail(env, {
        to: env.ownerEmail,
        replyTo: order.email ?? undefined,
        subject: `New order #${ref} — ${usd(order.totalCents ?? 0)}${extra.livemode ? '' : ' (test)'}`,
        category: 'order',
        html: emailLayout({
          heading: 'New order',
          preheader: `${order.lines.length} item(s), ${usd(order.totalCents ?? 0)}`,
          body: `<p>Order <strong>#${esc(ref)}</strong> from ${esc(order.email ?? 'unknown email')}.</p>
${itemsTable(order, extra.discountCents)}
${addressBlock(order.shippingName, order.shippingAddress)}
${dashboard ? `<p style="margin-top:20px"><a href="${esc(dashboard)}" style="color:#8a4a7d">View payment in Stripe</a></p>` : ''}
<p style="font-size:13px;color:#5a4a3a">Reply to this email to write to the customer.</p>`,
        }),
      })
    );
  } else {
    console.warn(`[order ${order.id}] OWNER_EMAIL is not set; no owner notification sent`);
  }

  const results = await Promise.allSettled(sends);
  const failed = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected');
  if (failed.length) throw new AggregateError(failed.map((f) => f.reason), 'order email failed');
}
