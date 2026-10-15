// Configuration from the environment (secrets live in /etc/details-file-explorer/env, never in the repo)
const env = process.env;
const int = (v, d) => { const n = Number(v); return Number.isFinite(n) && n > 0 ? Math.floor(n) : d; };
const MB = 1024 ** 2;

export const cfg = {
  host: env.HOST || '127.0.0.1',
  port: int(env.PORT, 3600),
  storageRoot: env.STORAGE_ROOT || '/mnt/hetzner-storage',
  publicBase: (env.PUBLIC_BASE_URL || 'https://explorer.details-wms.cloud').replace(/\/+$/, ''),
  portalUrl: 'https://details-wms.cloud/',
  maxUploadBytes: int(env.MAX_UPLOAD_MB, 2048) * MB,
  // gateway identity + permissions (نفس نمط details-files/details-whatsapp)
  gwTrusted: env.GW_TRUSTED === '1',
  gatewayPerms: env.GATEWAY_PERMS !== '0',
  gatewayInternalUrl: (env.GATEWAY_INTERNAL_URL || 'http://10.9.0.1:8081').replace(/\/+$/, ''),
  gatewayProxyKey: env.GATEWAY_PROXY_KEY || '',
  superAdmins: new Set(String(env.SUPER_ADMINS || '1012,1010').split(',').map((s) => s.trim()).filter(Boolean)),
};
