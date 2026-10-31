import { afterEach, describe, expect, it, vi } from 'vitest';
import { esc, sendEmail, EmailError } from './email';
import { parseEnv, type RuntimeEnv } from './env';

const DB = {} as RuntimeEnv['DB'];
const liveEnv = parseEnv(
  { DB, MAILTRAP_API_TOKEN: 'tok', OWNER_EMAIL: 'owner@example.com', DEBUG: 'false' },
  { dev: false }
);

afterEach(() => vi.unstubAllGlobals());

describe('esc', () => {
  it('escapes HTML-significant characters', () => {
    expect(esc(`<a href="x">Tom & Jerry's</a>`)).toBe('&lt;a href=&quot;x&quot;&gt;Tom &amp; Jerry&#39;s&lt;/a&gt;');
    expect(esc(null)).toBe('');
    expect(esc(42)).toBe('42');
  });
});

describe('sendEmail', () => {
  it('logs instead of sending in debug mode', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    await sendEmail(parseEnv({ DB }, { dev: true }), { to: 'a@b.co', subject: 'Hi', html: '<p>Hi</p>' });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalledWith(expect.stringContaining('to=a@b.co'));
    log.mockRestore();
  });

  it('posts to Mailtrap with reply-to and base64 attachments', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('{"success":true}'));
    vi.stubGlobal('fetch', fetchMock);
    await sendEmail(liveEnv, {
      to: ['a@b.co'],
      subject: 'Booked',
      html: '<p>x</p>',
      category: 'booking',
      attachments: [{ filename: 'invite.ics', content: 'BEGIN:VCALENDAR', type: 'text/calendar' }],
    });

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://send.api.mailtrap.io/api/send');
    expect(init.headers.Authorization).toBe('Bearer tok');
    expect(JSON.parse(init.body)).toEqual({
      from: { email: 'hello@thedivinevine.org', name: 'The Divine Vine' },
      to: [{ email: 'a@b.co' }],
      reply_to: { email: 'owner@example.com' },
      subject: 'Booked',
      html: '<p>x</p>',
      category: 'booking',
      attachments: [
        { filename: 'invite.ics', content: btoa('BEGIN:VCALENDAR'), type: 'text/calendar', disposition: 'attachment' },
      ],
    });
  });

  it('throws on a Mailtrap error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('bad token', { status: 401 })));
    await expect(sendEmail(liveEnv, { to: 'a@b.co', subject: 's', html: 'h' })).rejects.toThrow(EmailError);
  });

  it('needs a Mailtrap token outside debug', async () => {
    const env = parseEnv({ DB, DEBUG: 'false' }, { dev: false });
    await expect(sendEmail(env, { to: 'a@b.co', subject: 's', html: 'h' })).rejects.toThrow(/MAILTRAP_API_TOKEN/);
  });
});
