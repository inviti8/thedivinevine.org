// Transactional email via Mailtrap's HTTP send API (DESIGN.md §8). Workers can't
// run Mailtrap's SDK, so this is a plain fetch. Message-specific senders (order
// confirmation, booking emails, …) build on sendEmail and live next to the
// feature that sends them; they must pass every interpolated value through esc().
import type { ServerEnv } from './env';
import { required } from './env';

const MAILTRAP_SEND_URL = 'https://send.api.mailtrap.io/api/send';
const FROM_NAME = 'The Divine Vine';

export interface EmailAttachment {
  filename: string;
  content: string | Uint8Array; // strings are sent as UTF-8
  type: string; // e.g. 'text/calendar; method=REQUEST'
}

export interface Email {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
  replyTo?: string;
  attachments?: EmailAttachment[];
  /** Mailtrap analytics category, e.g. 'order', 'booking'. */
  category?: string;
}

export class EmailError extends Error {
  name = 'EmailError';
}

const ESCAPES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

/** Escape a value for HTML text or a quoted attribute. */
export const esc = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, (c) => ESCAPES[c]);

/**
 * Shared email shell: a parchment card with inline styles (email clients ignore
 * stylesheets). `body` is trusted HTML: escape every interpolated value with esc().
 */
export function emailLayout({ heading, body, preheader = '' }: { heading: string; body: string; preheader?: string }) {
  return `<!doctype html>
<html><body style="margin:0;padding:24px 12px;background:#1c1020;font-family:Georgia,'Times New Roman',serif;color:#1d1712">
<span style="display:none;max-height:0;overflow:hidden">${esc(preheader)}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;background:#efe3c6;border:1px solid #c9a24b">
<tr><td style="padding:28px 28px 8px;text-align:center">
<p style="margin:0;font-size:12px;letter-spacing:.2em;text-transform:uppercase;color:#3f4a30">The Divine Vine</p>
<h1 style="margin:8px 0 0;font-size:24px;font-weight:normal;color:#3a1d3f">${esc(heading)}</h1>
<hr style="border:0;border-top:1px solid #c9a24b;margin:20px auto 0;width:80px">
</td></tr>
<tr><td style="padding:16px 28px 28px;font-size:16px;line-height:1.55">${body}</td></tr>
</table>
</body></html>`;
}

function toBase64(content: string | Uint8Array): string {
  const bytes = typeof content === 'string' ? new TextEncoder().encode(content) : content;
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

export async function sendEmail(env: ServerEnv, msg: Email): Promise<void> {
  const to = Array.isArray(msg.to) ? msg.to : [msg.to];

  // heavymeta's DEBUG bypass: log instead of sending.
  if (env.debug) {
    console.log(
      `[email:debug] to=${to.join(', ')} subject=${JSON.stringify(msg.subject)}` +
        (msg.attachments?.length ? ` attachments=${msg.attachments.map((a) => a.filename).join(', ')}` : '')
    );
    return;
  }

  const res = await fetch(MAILTRAP_SEND_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${required(env.mailtrapApiToken, 'MAILTRAP_API_TOKEN')}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: { email: env.emailFrom, name: FROM_NAME },
      to: to.map((email) => ({ email })),
      // heavymeta's emails said "reply" but came from noreply@; always give a real reply address.
      reply_to: { email: msg.replyTo ?? env.ownerEmail ?? env.emailFrom },
      subject: msg.subject,
      html: msg.html,
      ...(msg.text && { text: msg.text }),
      ...(msg.category && { category: msg.category }),
      ...(msg.attachments?.length && {
        attachments: msg.attachments.map((a) => ({
          filename: a.filename,
          content: toBase64(a.content),
          type: a.type,
          disposition: 'attachment',
        })),
      }),
    }),
  });

  if (!res.ok) {
    throw new EmailError(`Mailtrap send failed (${res.status}): ${await res.text()}`);
  }
}
