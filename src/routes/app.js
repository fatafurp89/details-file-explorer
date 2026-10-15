// Staff API (behind the gateway, same pattern as details-files)
import { cfg } from '../config.js';
import { readIdentity } from '../lib/identity.js';
import { attach, can, PERM, registrationStatus } from '../lib/gateway-perms.js';
import { list, statOf, readStream, mkdir, writeUpload, remove, rename, move, safeName, PathError } from '../lib/fsops.js';

const MSG = { unauth: 'يلزم تسجيل الدخول عبر بوابة ديتيلز', forbidden: 'لا تملك هذه الصلاحية', badRequest: 'الطلب غير صالح', notFound: 'غير موجود' };

const str = (v, max = 2000) => String(v ?? '').trim().slice(0, max);

export default async function appRoutes(app) {
  app.addHook('preHandler', async (req, reply) => {
    const user = readIdentity(req);
    if (!user) return reply.code(401).send({ error: MSG.unauth });
    const err = await attach(user);
    if (err) return reply.code(err.status).send({ error: err.error });
    req.user = user;
    reply.header('Cache-Control', 'no-store');
  });
  const need = (key) => async (req, reply) => { if (!can(req.user, key)) return reply.code(403).send({ error: MSG.forbidden, required: key }); };

  app.get('/api/app/me', async (req) => ({
    employee: { employee_no: req.user.employee_no, name: req.user.name, admin: req.user.admin },
    perms: [...req.user.perms], portal: cfg.portalUrl, max_upload_bytes: cfg.maxUploadBytes,
  }));

  app.get('/api/app/status', async () => ({ catalog: registrationStatus() }));

  app.get('/api/app/list', { preHandler: need(PERM.VIEW) }, async (req, reply) => {
    const p = str(req.query?.path, 4000);
    try { return { path: p, entries: await list(p) }; }
    catch (e) { if (e instanceof PathError) return reply.code(400).send({ error: e.message }); if (e.code === 'ENOENT') return reply.code(404).send({ error: MSG.notFound }); throw e; }
  });

  app.get('/api/app/download', { preHandler: need(PERM.VIEW) }, async (req, reply) => {
    const p = str(req.query?.path, 4000);
    let st;
    try { st = await statOf(p); } catch (e) { if (e instanceof PathError) return reply.code(400).send({ error: e.message }); return reply.code(404).send({ error: MSG.notFound }); }
    if (st.is_dir) return reply.code(400).send({ error: 'لا يمكن تنزيل مجلد مباشرة' });
    const name = p.split('/').filter(Boolean).pop() || 'file';
    reply.header('Content-Type', 'application/octet-stream');
    reply.header('Content-Length', String(st.size));
    reply.header('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(name)}`);
    reply.header('X-Content-Type-Options', 'nosniff');
    return reply.send(readStream(p));
  });

  app.post('/api/app/mkdir', { preHandler: need(PERM.MANAGE) }, async (req, reply) => {
    const { path: p, name } = req.body || {};
    try { await mkdir(str(p, 4000), str(name, 255)); return { ok: true }; }
    catch (e) { if (e instanceof PathError) return reply.code(400).send({ error: e.message }); if (e.code === 'EEXIST') return reply.code(409).send({ error: 'يوجد مجلد بنفس الاسم' }); throw e; }
  });

  app.post('/api/app/upload', { preHandler: need(PERM.UPLOAD) }, async (req, reply) => {
    if (!req.isMultipart()) return reply.code(400).send({ error: MSG.badRequest });
    let targetPath = '';
    const uploaded = [];
    try {
      for await (const part of req.parts()) {
        if (part.type === 'field' && part.fieldname === 'path') { targetPath = String(part.value || ''); continue; }
        if (part.type === 'file') {
          const name = safeName(part.filename);
          await writeUpload(targetPath, name, part.file);
          uploaded.push(name);
        }
      }
    } catch (e) {
      if (e instanceof PathError) return reply.code(400).send({ error: e.message });
      if (e.code === 'EEXIST') return reply.code(409).send({ error: 'يوجد ملف بنفس الاسم بالفعل' });
      throw e;
    }
    if (!uploaded.length) return reply.code(400).send({ error: 'لم يُرسَل أي ملف' });
    return { ok: true, uploaded };
  });

  app.post('/api/app/rename', { preHandler: need(PERM.MANAGE) }, async (req, reply) => {
    const { path: p, new_name } = req.body || {};
    try { await rename(str(p, 4000), str(new_name, 255)); return { ok: true }; }
    catch (e) { if (e instanceof PathError) return reply.code(400).send({ error: e.message }); if (e.code === 'ENOENT') return reply.code(404).send({ error: MSG.notFound }); if (e.code === 'EEXIST') return reply.code(409).send({ error: 'الاسم مستخدم بالفعل' }); throw e; }
  });

  app.post('/api/app/move', { preHandler: need(PERM.MANAGE) }, async (req, reply) => {
    const { path: p, to } = req.body || {};
    try { await move(str(p, 4000), str(to, 4000)); return { ok: true }; }
    catch (e) { if (e instanceof PathError) return reply.code(400).send({ error: e.message }); if (e.code === 'ENOENT') return reply.code(404).send({ error: MSG.notFound }); throw e; }
  });

  app.post('/api/app/delete', { preHandler: need(PERM.DELETE) }, async (req, reply) => {
    const { path: p } = req.body || {};
    try { await remove(str(p, 4000)); return { ok: true }; }
    catch (e) { if (e instanceof PathError) return reply.code(400).send({ error: e.message }); if (e.code === 'ENOENT') return reply.code(404).send({ error: MSG.notFound }); throw e; }
  });
}
