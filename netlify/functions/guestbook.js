/* 留言板：用 Netlify Blobs 存取，发出即可上墙。
   GET  → 列表（最新在前）
   POST → 新增（昵称 + 内容；蜜罐字段非空则丢弃） */

const { connectLambda, getStore } = require('@netlify/blobs');

const cors = {
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'
};

const KEY = 'messages';
const MAX = 200;
const NAME_MAX = 40;
const MSG_MAX = 1000;

function ok(body, status) {
  return { statusCode: status || 200, headers: cors, body: JSON.stringify(body) };
}

function parseBody(event) {
  const raw = event.body || '';
  const text = event.isBase64Encoded ? Buffer.from(raw, 'base64').toString('utf8') : raw;
  const ct = (event.headers['content-type'] || event.headers['Content-Type'] || '').toLowerCase();
  if (ct.includes('application/json')) {
    try { return JSON.parse(text || '{}'); } catch (e) { return {}; }
  }
  const params = new URLSearchParams(text);
  const out = {};
  params.forEach((v, k) => { out[k] = v; });
  return out;
}

function clientIp(event) {
  const h = event.headers || {};
  return h['x-nf-client-connection-ip']
    || (h['x-forwarded-for'] || '').split(',')[0].trim()
    || h['client-ip']
    || 'unknown';
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: cors, body: '' };
  }

  // 经典 Lambda 形态的 Function 必须先 connect，才能读到站点 Blobs 上下文
  try {
    connectLambda(event);
  } catch (err) {
    return ok({ items: [], error: 'blobs_connect_failed', hint: String(err && err.message || err) }, 503);
  }

  let store;
  try {
    store = getStore('guestbook');
  } catch (err) {
    return ok({ items: [], error: 'blobs_unavailable', hint: String(err && err.message || err) }, 503);
  }

  if (event.httpMethod === 'GET') {
    const data = (await store.get(KEY, { type: 'json' })) || { items: [] };
    const items = Array.isArray(data.items) ? data.items : [];
    return ok({ items });
  }

  if (event.httpMethod === 'POST') {
    const body = parseBody(event);
    // 蜜罐
    if (body['bot-field']) return ok({ ok: true });

    const name = String(body.name || '').trim().slice(0, NAME_MAX);
    const message = String(body.message || '').trim().slice(0, MSG_MAX);
    if (!name || !message) {
      return ok({ error: 'invalid', hint: '昵称和留言都要填' }, 400);
    }

    const ip = clientIp(event);
    const data = (await store.get(KEY, { type: 'json' })) || { items: [], lastByIp: {} };
    const items = Array.isArray(data.items) ? data.items : [];
    const lastByIp = data.lastByIp && typeof data.lastByIp === 'object' ? data.lastByIp : {};
    const now = Date.now();
    if (lastByIp[ip] && now - lastByIp[ip] < 15000) {
      return ok({ error: 'rate_limited', hint: '发太快了，稍等几秒再试' }, 429);
    }

    const item = {
      id: now.toString(36) + Math.random().toString(36).slice(2, 8),
      name,
      message,
      created: new Date(now).toISOString()
    };
    items.unshift(item);
    if (items.length > MAX) items.length = MAX;
    lastByIp[ip] = now;
    // 只留近期 ip，避免无限涨
    Object.keys(lastByIp).forEach((k) => {
      if (now - lastByIp[k] > 86400000) delete lastByIp[k];
    });

    await store.setJSON(KEY, { items, lastByIp });
    return ok({ ok: true, item, items });
  }

  return ok({ error: 'method_not_allowed' }, 405);
};
