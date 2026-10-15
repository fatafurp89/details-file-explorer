import Fastify from 'fastify';
import multipart from '@fastify/multipart';
import fastifyStatic from '@fastify/static';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { cfg } from './config.js';
import appRoutes from './routes/app.js';
import * as perms from './lib/gateway-perms.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const WEB = path.join(here, '..', 'web');

const app = Fastify({ logger: { level: 'warn' }, trustProxy: true, bodyLimit: 2 * 1024 * 1024 });
await app.register(multipart, { limits: { fileSize: cfg.maxUploadBytes } });

app.get('/healthz', { logLevel: 'warn' }, async (req, reply) => {
  reply.header('Cache-Control', 'no-store');
  return { ok: true, catalog_at: perms.registrationStatus().at };
});

await app.register(appRoutes);

await app.register(fastifyStatic, { root: WEB, prefix: '/' });
app.setNotFoundHandler((req, reply) => {
  if (req.raw.url?.startsWith('/api/')) return reply.code(404).send({ error: 'غير موجود' });
  return reply.sendFile('index.html');
});

await app.listen({ port: cfg.port, host: cfg.host });
console.log(JSON.stringify({ level: 'info', msg: 'details-file-explorer listening', host: cfg.host, port: cfg.port, root: cfg.storageRoot }));
perms.start();

for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, async () => { try { await app.close(); } finally { process.exit(0); } });
