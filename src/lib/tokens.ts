// Signed links for booking confirm/decline/cancel and newsletter confirm/unsubscribe.
// A WebCrypto port of heavymeta's itsdangerous URLSafeTimedSerializer:
//   base64url(JSON { p: purpose, d: data, e?: expiry }) "." base64url(HMAC-SHA256)
// The purpose is inside the signed payload, so a token minted for one action
// can't be replayed for another. Tokens are signed, not encrypted: don't put
// anything in `data` that the recipient shouldn't see.

export type VerifyResult<T> = { ok: true; data: T } | { ok: false; reason: 'invalid' | 'expired' };

interface Payload<T> {
  p: string;
  d: T;
  e?: number; // unix seconds
}

const encoder = new TextEncoder();
const keys = new Map<string, Promise<CryptoKey>>();

function hmacKey(secret: string): Promise<CryptoKey> {
  let key = keys.get(secret);
  if (!key) {
    key = crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, [
      'sign',
      'verify',
    ]);
    keys.set(secret, key);
  }
  return key;
}

function toBase64Url(bytes: Uint8Array): string {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(s: string): Uint8Array<ArrayBuffer> | null {
  if (!/^[A-Za-z0-9_-]*$/.test(s)) return null;
  try {
    const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/'));
    return Uint8Array.from(bin, (c) => c.charCodeAt(0));
  } catch {
    return null;
  }
}

export async function signToken<T>(
  secret: string,
  purpose: string,
  data: T,
  { ttlSeconds, now = Date.now() }: { ttlSeconds?: number; now?: number } = {}
): Promise<string> {
  const payload: Payload<T> = { p: purpose, d: data };
  if (ttlSeconds !== undefined) payload.e = Math.floor(now / 1000) + ttlSeconds;
  const body = toBase64Url(encoder.encode(JSON.stringify(payload)));
  const sig = await crypto.subtle.sign('HMAC', await hmacKey(secret), encoder.encode(body));
  return `${body}.${toBase64Url(new Uint8Array(sig))}`;
}

export async function verifyToken<T>(
  secret: string,
  purpose: string,
  token: string,
  { now = Date.now() }: { now?: number } = {}
): Promise<VerifyResult<T>> {
  const invalid = { ok: false, reason: 'invalid' } as const;
  const [body, sigPart, ...rest] = token.split('.');
  if (!body || !sigPart || rest.length) return invalid;

  const sig = fromBase64Url(sigPart);
  // subtle.verify compares in constant time.
  if (!sig || !(await crypto.subtle.verify('HMAC', await hmacKey(secret), sig, encoder.encode(body)))) {
    return invalid;
  }

  let payload: Payload<T>;
  try {
    payload = JSON.parse(new TextDecoder().decode(fromBase64Url(body)!));
  } catch {
    return invalid;
  }
  if (payload.p !== purpose) return invalid;
  if (payload.e !== undefined && Math.floor(now / 1000) >= payload.e) return { ok: false, reason: 'expired' };
  return { ok: true, data: payload.d };
}
