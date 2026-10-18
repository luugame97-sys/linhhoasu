const crypto = require('crypto');

const Transaction = require('../db/models/Transaction');
const Player = require('../db/models/Player');
const config = require('./ConfigService');
const rechargeConfigService = require('./RechargeConfigService');

function trimSlash(value) {
  return String(value || '').trim().replace(/\/+$/, '');
}

function getConfig() {
  return {
    gateway: trimSlash(process.env.XTPAY_GATEWAY || 'https://m.xtpay.xyz'),
    pid: String(process.env.XTPAY_PID || '').trim(),
    key: String(process.env.XTPAY_KEY || '').trim(),
    signType: String(process.env.XTPAY_SIGN_TYPE || 'MD5').trim() || 'MD5',
    submitPath: String(process.env.XTPAY_SUBMIT_PATH || '/submit.php').trim() || '/submit.php',
    mapiPath: String(process.env.XTPAY_MAPI_PATH || '/mapi.php').trim() || '/mapi.php',
    createMode: String(process.env.XTPAY_CREATE_MODE || 'submit').trim().toLowerCase(),
    defaultPayType: String(process.env.XTPAY_DEFAULT_TYPE || 'alipay').trim() || 'alipay',
    notifyUrl: String(process.env.XTPAY_NOTIFY_URL || '').trim(),
    returnUrl: String(process.env.XTPAY_RETURN_URL || '').trim(),
    siteName: String(process.env.XTPAY_SITE_NAME || '').trim(),
    submitIncludeSiteName: String(process.env.XTPAY_SUBMIT_INCLUDE_SITENAME || '0').trim() === '1',
    submitIncludeExtra: String(process.env.XTPAY_SUBMIT_INCLUDE_EXTRA || '0').trim() === '1',
    useLocalGateway: String(process.env.XTPAY_USE_LOCAL_GATEWAY || '1').trim() !== '0',
  };
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function md5(text) {
  return crypto.createHash('md5').update(String(text), 'utf8').digest('hex');
}

function normalizeSignValue(value) {
  if (value === undefined || value === null) return '';
  return String(value);
}

function buildSignSource(params, key) {
  const parts = Object.keys(params || {})
    .filter((name) => name !== 'sign' && name !== 'sign_type')
    .filter((name) => {
      const value = normalizeSignValue(params[name]);
      return value !== '' && value !== '0';
    })
    .sort()
    .map((name) => `${name}=${normalizeSignValue(params[name])}`);
  return `${parts.join('&')}${key}`;
}

function buildSign(params, key) {
  return md5(buildSignSource(params, key));
}

function verifySign(params, key) {
  const actual = String((params && params.sign) || '').toLowerCase();
  if (!actual || !key) return false;
  return actual === buildSign(params, key).toLowerCase();
}

function appendPath(base, path) {
  const normalizedPath = String(path || '').startsWith('/') ? path : `/${path}`;
  return `${trimSlash(base)}${normalizedPath}`;
}

function toMoney(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return '';
  return n.toFixed(2);
}

function toAmount(value) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0;
}

function makeOrderId() {
  const random = crypto.randomBytes(4).toString('hex');
  return `LHS${Date.now()}${random}`;
}

function getPayConfigRow(productId) {
  const payCfg = config.get('PayConfig') || {};
  return payCfg[productId] || payCfg[String(productId)] || null;
}

async function resolveProduct(input = {}) {
  const productId = String(input.productId || input.payId || '').trim();
  const overrideRow = productId ? await rechargeConfigService.getResolvedRow(productId) : null;
  const row = overrideRow || (productId ? getPayConfigRow(productId) : null);
  const cfgAmount = row ? toAmount(row.amount != null ? row.amount : row.priceR) : 0;
  const requestedAmount = toAmount(input.amount || input.money);
  const amount = cfgAmount > 0 ? cfgAmount : requestedAmount;
  const payType = String(input.type || input.payType || row?.payType || getConfig().defaultPayType).trim();

  return {
    productId,
    amount,
    payType,
    name: String(input.name || row?.name || (productId ? `Vật phẩm LHS${productId}` : "Nạp LHS")),
  };
}

function buildRequestBaseUrl(req) {
  const configured = trimSlash(process.env.XTPAY_PUBLIC_BASE_URL || process.env.PUBLIC_BASE_URL || '');
  if (configured) return configured;

  if (!req) return '';
  const proto = String(req.headers['x-forwarded-proto'] || req.protocol || 'http').split(',')[0].trim();
  const host = String(req.headers['x-forwarded-host'] || req.headers.host || '').split(',')[0].trim();
  return host ? `${proto}://${host}` : '';
}

function buildDefaultUrl(req, path) {
  const base = buildRequestBaseUrl(req);
  return base ? `${base}${path}` : '';
}

function getClientIp(req) {
  if (!req) return '';
  const forwarded = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  return forwarded || req.ip || (req.socket && req.socket.remoteAddress) || '';
}

function parsePassThrough(value) {
  const text = String(value || '');
  const [userId = '', productId = ''] = text.split('|');
  return { userId, productId };
}

async function createPaymentOrder(input = {}, req = null) {
  const xt = getConfig();
  if (!xt.pid || !xt.key) return { success: false, error: 'XTPAY_NOT_CONFIGURED' };
  if (!xt.gateway) return { success: false, error: 'XTPAY_GATEWAY_MISSING' };

  const userId = String(input.userId || '').trim();
  const product = await resolveProduct(input);
  if (!userId || !product.productId || product.amount <= 0) {
    return { success: false, error: 'MISSING_PARAMS' };
  }

  const player = await Player.findOne({ userId });
  if (!player) return { success: false, error: 'PLAYER_NOT_FOUND' };

  const orderId = makeOrderId();
  const notifyUrl = String(input.notifyUrl || xt.notifyUrl || buildDefaultUrl(req, '/api/pay/xtpay/notify')).trim();
  const returnUrl = String(input.returnUrl || xt.returnUrl || buildDefaultUrl(req, '/api/pay/xtpay/return')).trim();
  if (!notifyUrl) return { success: false, error: 'NOTIFY_URL_MISSING' };

  const payType = product.payType || xt.defaultPayType;
  const baseParams = {
    pid: xt.pid,
    type: payType,
    out_trade_no: orderId,
    notify_url: notifyUrl,
    return_url: returnUrl,
    name: product.name,
    money: toMoney(product.amount),
  };
  if (xt.submitIncludeSiteName && xt.siteName) baseParams.sitename = xt.siteName;

  const extraParams = {
    clientip: getClientIp(req),
    device: String(input.device || 'mobile'),
    param: `${userId}|${product.productId}`,
  };

  const params = xt.createMode === 'mapi' || xt.submitIncludeExtra
    ? { ...baseParams, ...extraParams }
    : { ...baseParams };
  const signSource = buildSignSource(params, xt.key);
  params.sign = buildSign(params, xt.key);
  params.sign_type = xt.signType;

  const submitUrl = `${appendPath(xt.gateway, xt.submitPath)}?${new URLSearchParams(params).toString()}`;
  const gatewayUrl = buildDefaultUrl(req, `/api/pay/xtpay/gateway?orderId=${encodeURIComponent(orderId)}`);

  await Transaction.create({
    orderId,
    userId,
    playerId: player.playerId,
    amount: product.amount,
    diamond: 0,
    productId: product.productId,
    channel: `xtpay:${payType}`,
    status: 'pending',
    agentId: player.agentId || null,
    extra: {
      xtpay: {
        provider: 'xtpay',
        payType,
        createMode: xt.createMode,
        params,
        submitUrl,
        signSource,
      },
    },
  });

  if (xt.createMode !== 'mapi') {
    return {
      success: true,
      data: {
        orderId,
        amount: product.amount,
        productId: product.productId,
        payType,
        payUrl: xt.useLocalGateway && gatewayUrl ? gatewayUrl : submitUrl,
        directPayUrl: submitUrl,
        params,
      },
    };
  }

  const resp = await fetch(appendPath(xt.gateway, xt.mapiPath), {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(params).toString(),
  });
  const text = await resp.text();
  let provider = null;
  try {
    provider = JSON.parse(text);
  } catch (_err) {
    provider = { raw: text };
  }

  return {
    success: resp.ok,
    error: resp.ok ? undefined : 'XTPAY_CREATE_FAILED',
    data: {
      orderId,
      amount: product.amount,
      productId: product.productId,
      payType,
      payUrl: provider.payurl || provider.payUrl || provider.qrcode || submitUrl,
      provider,
      params,
    },
  };
}

async function buildGatewayForm(orderId) {
  const xt = getConfig();
  const transaction = await Transaction.findOne({ orderId: String(orderId || '').trim() });
  const params = transaction && transaction.extra && transaction.extra.xtpay && transaction.extra.xtpay.params;
  if (!transaction || !params || typeof params !== 'object') {
    return null;
  }

  const action = appendPath(xt.gateway, xt.submitPath);
  const inputs = Object.keys(params).map((key) => (
    `<input type="hidden" name="${escapeHtml(key)}" value="${escapeHtml(params[key])}">`
  )).join('\n');

  return `<!doctype html>\n<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">\n<title>Đang chuyển thanh toán</title></head>\n<body><p>正在跳转支付，请稍候...</p>\n<form id="payForm" method="post" action="${escapeHtml(action)}">
${inputs}
</form>
<script>document.getElementById('payForm').submit();</script>
</body></html>`;
}

async function handleNotify(input = {}, wsServer = null) {
  const xt = getConfig();
  if (!xt.key) return { success: false, error: 'XTPAY_NOT_CONFIGURED' };
  const params = { ...(input || {}) };
  if (!verifySign(params, xt.key)) return { success: false, error: 'INVALID_SIGN' };

  const status = String(params.trade_status || params.status || '').toUpperCase();
  if (status && status !== 'TRADE_SUCCESS' && status !== 'SUCCESS') {
    return { success: true, ignored: true, data: { status } };
  }

  const orderId = String(params.out_trade_no || '').trim();
  const amount = toAmount(params.money || params.amount);
  if (!orderId || amount <= 0) return { success: false, error: 'MISSING_PARAMS' };

  const transaction = await Transaction.findOne({ orderId });
  if (!transaction) return { success: false, error: 'ORDER_NOT_FOUND' };
  if (Math.abs(toAmount(transaction.amount) - amount) > 0.001) {
    return { success: false, error: 'AMOUNT_MISMATCH' };
  }

  const passThrough = parsePassThrough(params.param);
  const recharge = require('../handlers/recharge');
  return recharge.handleRecharge({
    userId: transaction.userId || passThrough.userId,
    orderId,
    amount,
    productId: transaction.productId || passThrough.productId,
    channel: `xtpay:${params.type || transaction.channel || ''}`,
    allowPendingOrder: true,
    idempotentSuccess: true,
    extra: {
      xtpay: {
        provider: 'xtpay',
        tradeNo: params.trade_no || '',
        notify: params,
      },
    },
  }, wsServer);
}

module.exports = {
  buildSign,
  buildSignSource,
  buildGatewayForm,
  createPaymentOrder,
  getClientIp,
  handleNotify,
  verifySign,
};
