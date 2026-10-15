// عمليات نظام الملفات: كل دالة تأخذ مسارًا نسبيًا (relPath) من جذر التخزين فقط، ولا تخرج منه أبدًا.
import { promises as fs } from 'node:fs';
import { createReadStream } from 'node:fs';
import path from 'node:path';
import { cfg } from '../config.js';

export class PathError extends Error { constructor(msg) { super(msg); this.code = 'BAD_PATH'; } }

/** يحوّل مسارًا نسبيًا واردًا من العميل إلى مسار مطلق آمن داخل جذر التخزين فقط. يرمي PathError عند أي محاولة خروج. */
export function safeAbs(relPath) {
  const rel = String(relPath ?? '').replace(/\\/g, '/').replace(/^\/+/, '');
  if (rel.split('/').some((seg) => seg === '..')) throw new PathError('مسار غير مسموح');
  const abs = path.resolve(cfg.storageRoot, rel);
  const root = path.resolve(cfg.storageRoot);
  if (abs !== root && !abs.startsWith(root + path.sep)) throw new PathError('مسار غير مسموح');
  return abs;
}

export const safeName = (name) => {
  const n = String(name ?? '').replace(/[\\/]/g, '').trim().slice(0, 255);
  if (!n || n === '.' || n === '..') throw new PathError('اسم غير صالح');
  return n;
};

export async function list(relPath) {
  const abs = safeAbs(relPath);
  const entries = await fs.readdir(abs, { withFileTypes: true });
  const out = [];
  for (const e of entries) {
    if (e.name.startsWith('.')) continue; // أخفِ الملفات المخفية (dotfiles) من التصفح
    let st;
    try { st = await fs.stat(path.join(abs, e.name)); } catch { continue; } // رابط رمزي معطّل أو نحوه
    out.push({
      name: e.name,
      type: e.isDirectory() ? 'dir' : 'file',
      size: e.isDirectory() ? null : st.size,
      modified_at: st.mtime.toISOString(),
    });
  }
  out.sort((a, b) => (a.type === b.type ? a.name.localeCompare(b.name, 'ar') : a.type === 'dir' ? -1 : 1));
  return out;
}

export async function statOf(relPath) {
  const abs = safeAbs(relPath);
  const st = await fs.stat(abs);
  return { is_dir: st.isDirectory(), size: st.size, modified_at: st.mtime.toISOString() };
}

export function readStream(relPath) {
  const abs = safeAbs(relPath);
  return createReadStream(abs);
}

export async function mkdir(relPath, name) {
  const abs = path.join(safeAbs(relPath), safeName(name));
  await fs.mkdir(abs, { recursive: false });
}

export async function writeUpload(relPath, name, stream) {
  const abs = path.join(safeAbs(relPath), safeName(name));
  const { createWriteStream } = await import('node:fs');
  await new Promise((resolve, reject) => {
    const out = createWriteStream(abs, { flags: 'wx' }); // wx: يفشل لو الملف موجود، لا كتابة فوقية صامتة
    stream.on('error', reject);
    out.on('error', reject);
    out.on('finish', resolve);
    stream.pipe(out);
  });
}

export async function remove(relPath) {
  const abs = safeAbs(relPath);
  if (abs === path.resolve(cfg.storageRoot)) throw new PathError('لا يمكن حذف الجذر');
  await fs.rm(abs, { recursive: true, force: false });
}

export async function rename(relPath, newName) {
  const abs = safeAbs(relPath);
  const dest = path.join(path.dirname(abs), safeName(newName));
  await fs.rename(abs, dest);
}

export async function move(relPath, toDir) {
  const abs = safeAbs(relPath);
  const destDir = safeAbs(toDir);
  const dest = path.join(destDir, path.basename(abs));
  await fs.rename(abs, dest);
}
