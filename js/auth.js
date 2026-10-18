/* =====================================================================
 * auth.js – Khóa chức năng quản trị bằng mật khẩu (SHA-256, phía client)
 * ===================================================================== */
import { CONFIG } from './config.js';
import { lsGet } from './utils.js';

const KEY = 'stt2.admin';      // sessionStorage: { exp }
const FAIL = 'stt2.fails';      // sessionStorage: { n, until }
const ss = {
  get: (k) => { try { return JSON.parse(sessionStorage.getItem(k)); } catch { return null; } },
  set: (k, v) => { try { sessionStorage.setItem(k, JSON.stringify(v)); } catch { /* bỏ qua */ } },
  del: (k) => { try { sessionStorage.removeItem(k); } catch { /* bỏ qua */ } },
};

/** SHA-256 thuần JS (dự phòng khi trình duyệt không có crypto.subtle, vd: http không phải localhost) */
function sha256Fallback(str) {
  const bytes = [...new TextEncoder().encode(str)];
  const primes = []; for (let n = 2; primes.length < 64; n++) if (primes.every((p) => n % p)) primes.push(n);
  const frac = (x) => Math.floor((x - Math.floor(x)) * 2 ** 32);
  const K = primes.map((p) => frac(Math.cbrt(p)));
  const H = primes.slice(0, 8).map((p) => frac(Math.sqrt(p)));
  const rotr = (x, n) => (x >>> n) | (x << (32 - n));
  const bitLen = bytes.length * 8;
  bytes.push(0x80);
  while (bytes.length % 64 !== 56) bytes.push(0);
  for (let i = 7; i >= 0; i--) bytes.push(i >= 4 ? 0 : (bitLen >>> (i * 8)) & 255);
  for (let off = 0; off < bytes.length; off += 64) {
    const w = new Array(64);
    for (let i = 0; i < 16; i++) w[i] = (bytes[off + 4 * i] << 24) | (bytes[off + 4 * i + 1] << 16) | (bytes[off + 4 * i + 2] << 8) | bytes[off + 4 * i + 3];
    for (let i = 16; i < 64; i++) {
      const s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >>> 3);
      const s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >>> 10);
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) | 0;
    }
    let [a, b, c, d, e, f, g, h] = H;
    for (let i = 0; i < 64; i++) {
      const t1 = (h + (rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25)) + ((e & f) ^ (~e & g)) + K[i] + w[i]) | 0;
      const t2 = ((rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22)) + ((a & b) ^ (a & c) ^ (b & c))) | 0;
      h = g; g = f; f = e; e = (d + t1) | 0; d = c; c = b; b = a; a = (t1 + t2) | 0;
    }
    [a, b, c, d, e, f, g, h].forEach((v, i) => { H[i] = (H[i] + v) | 0; });
  }
  return H.map((v) => (v >>> 0).toString(16).padStart(8, '0')).join('');
}

/** Băm mật khẩu → chuỗi hex */
export async function hashPassword(pw) {
  if (globalThis.crypto?.subtle) {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(pw));
    return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
  }
  return sha256Fallback(pw);
}

/** Có bật khóa quản trị hay không */
export const authEnabled = () => !!CONFIG.ADMIN_HASH;

/** Phiên quản trị còn hiệu lực? */
export function isAdmin() {
  if (!authEnabled()) return true;
  const s = ss.get(KEY);
  if (s && s.exp > Date.now()) return true;
  ss.del(KEY);
  return false;
}

/** Đăng nhập: trả về { ok, msg } */
export async function login(pw) {
  const f = ss.get(FAIL) || { n: 0, until: 0 };
  if (f.until > Date.now()) return { ok: false, msg: `Nhập sai nhiều lần – thử lại sau ${Math.ceil((f.until - Date.now()) / 1000)} giây.` };
  if ((await hashPassword(pw)) === CONFIG.ADMIN_HASH) {
    ss.del(FAIL);
    ss.set(KEY, { exp: Date.now() + CONFIG.SESSION_MINUTES * 60000 });
    return { ok: true };
  }
  f.n += 1;
  if (f.n >= CONFIG.MAX_FAILS) { f.n = 0; f.until = Date.now() + CONFIG.LOCK_SECONDS * 1000; }
  ss.set(FAIL, f);
  return { ok: false, msg: 'Mật khẩu không đúng.' };
}

export const logout = () => ss.del(KEY);
export const sessionLeftMinutes = () => Math.max(0, Math.round(((ss.get(KEY)?.exp || 0) - Date.now()) / 60000));
