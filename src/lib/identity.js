// Staff identity: only from the X-Gw-* headers the Details Gateway sets, and only when the request
// came through the local nginx tunnel block (GW_TRUSTED=1 + loopback socket + X-Gw-Proxy marker).
import { cfg } from '../config.js';

const LOOPBACK = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);

export function readIdentity(req) {
  if (!cfg.gwTrusted) return null;
  if (!LOOPBACK.has(req.socket?.remoteAddress)) return null;
  if (String(req.headers['x-gw-proxy'] || '') !== '1') return null;
  const no = String(req.headers['x-gw-employee-no'] || '').trim();
  if (!/^\d{4}$/.test(no)) return null;
  let name = String(req.headers['x-gw-name'] || '');
  try { name = decodeURIComponent(name); } catch { /* keep raw */ }
  const role = String(req.headers['x-gw-role'] || '').trim().toLowerCase();
  const adminHdr = String(req.headers['x-gw-admin'] || '').trim();
  return {
    employee_no: no,
    employee_id: String(req.headers['x-gw-employee-id'] || '').trim(),
    name: name.trim().slice(0, 120) || `موظف ${no}`,
    email: String(req.headers['x-gw-email'] || '').trim().toLowerCase().slice(0, 200),
    gw_admin: role === 'admin' || adminHdr === '1' || adminHdr === 'true',
    super: cfg.superAdmins.has(no),
  };
}
