#!/bin/bash
# One-shot provisioning on the WMS VPS (idempotent). Run as root from /opt/details-file-explorer after the code is copied.
set -euo pipefail
APP=/opt/details-file-explorer
ENVF=/etc/details-file-explorer/env

id -u details-explorer >/dev/null 2>&1 || useradd --system --home "$APP" --shell /usr/sbin/nologin details-explorer
mkdir -p /etc/details-file-explorer

# env file (created once; later edits by hand). يُعاد استعمال GATEWAY_PROXY_KEY الموجود مسبقًا على
# نفس السيرفر (مشترك بين كل التطبيقات خلف البوابة) بدل توليد واحد جديد غير متوافق.
if [ ! -f "$ENVF" ]; then
  GWKEY=$(grep -s '^GATEWAY_PROXY_KEY=' /etc/details-whatsapp/env | cut -d= -f2- || true)
  cp "$APP/deploy/env.example" "$ENVF"
  if [ -n "$GWKEY" ]; then
    sed -i "s#^GATEWAY_PROXY_KEY=.*#GATEWAY_PROXY_KEY=$GWKEY#" "$ENVF"
  else
    echo "تحذير: تعذّر إيجاد GATEWAY_PROXY_KEY في /etc/details-whatsapp/env — عدّل $ENVF يدويًا." >&2
  fi
  chown root:details-explorer "$ENVF"; chmod 640 "$ENVF"
fi

cd "$APP" && npm install --omit=dev --no-audit --no-fund >/dev/null
chown -R root:details-explorer "$APP"; chmod -R g+rX "$APP"

install -m 644 "$APP/deploy/details-file-explorer.service" /etc/systemd/system/details-file-explorer.service
install -m 644 "$APP/deploy/nginx-wms-tunnel.conf" /etc/nginx/sites-available/explorer.details-wms.cloud.tunnel
ln -sf /etc/nginx/sites-available/explorer.details-wms.cloud.tunnel /etc/nginx/sites-enabled/explorer.details-wms.cloud.tunnel
systemctl daemon-reload
systemctl enable --now details-file-explorer
systemctl restart details-file-explorer
nginx -t && systemctl reload nginx
echo "install done — لا تنسَ نشر deploy/nginx-bridge.conf على سيرفر الجسر (179.198.192.141) يدويًا + توسيع شهادة TLS لتشمل explorer.details-wms.cloud + إضافة صف systems في details_gateway (key='file_explorer_v2')."
