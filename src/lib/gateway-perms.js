/**
 * صلاحيات مستكشف الملفات من شجرة صلاحيات بوابة ديتيلز (نفس نظام storage الموجود مسبقًا — grants جاهزة).
 * البوابة هي مصدر الحقيقة: تُسجَّل الشجرة (storage.explorer.*) عند الإقلاع وكل 6 ساعات، وتُجلب منح كل موظف
 * برقمه الوظيفي مع تخزين مؤقت 60 ثانية. الافتراضي منع. المشرف العام (1012/1010 أو admin في البوابة) يتجاوز.
 * تشغيل يدوي: node src/lib/gateway-perms.js register | catalog | grants <رقم>
 */
import { cfg } from '../config.js';

const SYSTEM = 'storage';
const GRANT_TTL_MS = 60_000;
const STALE_MAX_MS = 10 * 60_000;
const CATALOG_EVERY_MS = 6 * 3600_000;
const FETCH_TIMEOUT_MS = 5_000;

export const PERM = {
  VIEW: 'storage.explorer.view',
  UPLOAD: 'storage.explorer.upload',
  DELETE: 'storage.explorer.delete',
  MANAGE: 'storage.explorer.manage', // إعادة تسمية/نقل/إنشاء مجلدات
};

export function buildCatalog() {
  const nodes = []; let sort = 0;
  const add = (key, label_ar, description_ar, kind, parent_key) => nodes.push({
    key, label_ar, description_ar: description_ar || label_ar, kind,
    parent_key: parent_key === undefined ? key.split('.').slice(0, -1).join('.') : parent_key, sort: ++sort,
  });
  add('storage.explorer', 'مستكشف الملفات (تجريبي)', 'نسخة جديدة من مستكشف ملفات أرشيف الشركة (5 تيرابايت)', 'module', 'storage');
  add(PERM.VIEW, 'تصفح وتنزيل الملفات', 'رؤية المجلدات والملفات وتنزيلها', 'action');
  add(PERM.UPLOAD, 'رفع ملفات', 'رفع ملفات جديدة إلى أي مجلد يملك الوصول إليه', 'action');
  add(PERM.DELETE, 'حذف ملفات', 'حذف ملفات أو مجلدات نهائيًا', 'action');
  add(PERM.MANAGE, 'إدارة متقدمة', 'إنشاء مجلدات وإعادة التسمية والنقل', 'action');
  return nodes;
}

async function gwFetch(path, init = {}) {
  if (!cfg.gatewayProxyKey) throw new Error('GATEWAY_PROXY_KEY missing');
  const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(cfg.gatewayInternalUrl + path, { ...init, signal: ctrl.signal,
      headers: { 'Content-Type': 'application/json', 'X-Gw-Proxy-Key': cfg.gatewayProxyKey, ...(init.headers || {}) } });
    const text = await res.text();
    let json = null; try { json = JSON.parse(text); } catch { /* not json */ }
    if (!res.ok) throw new Error(`gateway ${res.status} ${String(json?.error || text).slice(0, 120)}`);
    return json;
  } finally { clearTimeout(t); }
}

let lastRegister = { at: null, count: 0, error: null, result: null };
export const registrationStatus = () => ({ ...lastRegister });

export async function registerCatalog() {
  const nodes = buildCatalog();
  try {
    const out = await gwFetch('/_gw/catalog', { method: 'POST', body: JSON.stringify({ system: SYSTEM, nodes }) });
    lastRegister = { at: new Date().toISOString(), count: nodes.length, error: null, result: out };
    console.log(JSON.stringify({ level: 'info', msg: 'gw catalog registered', nodes: nodes.length, result: out }));
  } catch (e) {
    lastRegister = { ...lastRegister, count: nodes.length, error: String(e.message).slice(0, 160) };
    console.error(JSON.stringify({ level: 'error', msg: 'gw catalog register failed', err: lastRegister.error }));
  }
  return lastRegister;
}

const cache = new Map(); // employee_no -> { at, data: { admin, active, keys:Set } }
const inflight = new Map();
export async function getGrants(no) {
  const hit = cache.get(no);
  if (hit && Date.now() - hit.at < GRANT_TTL_MS) return hit.data;
  if (inflight.has(no)) return inflight.get(no);
  const p = (async () => {
    try {
      const j = await gwFetch(`/_gw/grants/${encodeURIComponent(no)}?system=${SYSTEM}`);
      const data = j?.admin === true ? { admin: true, active: true, keys: new Set() }
        : { admin: false, active: j?.active !== false, keys: new Set(Array.isArray(j?.keys) ? j.keys.map(String) : []) };
      if (!data.active) data.keys = new Set();
      cache.set(no, { at: Date.now(), data });
      return data;
    } catch (e) {
      if (hit && Date.now() - hit.at < STALE_MAX_MS) return hit.data;
      const err = new Error('GATEWAY_UNAVAILABLE'); err.cause = e; throw err;
    } finally { inflight.delete(no); }
  })();
  inflight.set(no, p);
  return p;
}

/** Attach user.perms (Set) / user.admin. Returns null or an error object (503) when the gateway is unreachable. */
export async function attach(user) {
  if (user.super || user.gw_admin) { user.admin = true; user.perms = new Set(Object.values(PERM)); return null; }
  if (!cfg.gatewayPerms) { user.admin = false; user.perms = new Set(); return null; }
  try {
    const g = await getGrants(user.employee_no);
    user.admin = g.admin === true;
    // منحة النظام الخشنة الموجودة مسبقًا (system_key='storage') تُترجم إلى صلاحية عرض على الأقل،
    // حتى لا يُطلب من كل موظف منحة دقيقة جديدة قبل أن يرى أي شيء في المستكشف التجريبي
    user.perms = g.admin ? new Set(Object.values(PERM)) : g.keys;
    return null;
  } catch {
    user.admin = false; user.perms = new Set();
    return { status: 503, error: 'تعذّر التحقق من صلاحياتك من بوابة ديتيلز حاليًا — حاول بعد قليل' };
  }
}

export const can = (user, key) => Boolean(user && (user.admin || user.perms?.has(key)));

export function start() {
  if (!cfg.gatewayPerms) { console.log(JSON.stringify({ level: 'warn', msg: 'gateway perms disabled: only super admins can use the app' })); return; }
  if (!cfg.gatewayProxyKey) console.error(JSON.stringify({ level: 'error', msg: 'GATEWAY_PROXY_KEY missing: non-admin users will be denied' }));
  const tick = () => registerCatalog().catch(() => {});
  setTimeout(tick, 2_000).unref?.();
  setInterval(tick, CATALOG_EVERY_MS).unref?.();
}

// manual CLI
if (process.argv[1] && /gateway-perms\.js$/.test(process.argv[1]) && process.argv[2]) {
  const cmd = process.argv[2];
  if (cmd === 'catalog') console.log(JSON.stringify({ count: buildCatalog().length, keys: buildCatalog().map((n) => n.key) }, null, 1));
  else if (cmd === 'register') console.log(JSON.stringify(await registerCatalog()));
  else if (cmd === 'grants') { const g = await getGrants(String(process.argv[3] || '')); console.log(JSON.stringify({ admin: g.admin, active: g.active, keys: [...g.keys] })); }
  else console.log('usage: node src/lib/gateway-perms.js catalog|register|grants <no>');
}
