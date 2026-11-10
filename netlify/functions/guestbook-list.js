/* 读取 Netlify Forms「guestbook」提交，供留言墙展示。
   需在 Netlify 环境变量里配置 NETLIFY_AUTH_TOKEN（Personal Access Token）。
   SITE_ID 一般会自动注入；若没有，再手动加 NETLIFY_SITE_ID。 */

const cors = {
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store',
  'Access-Control-Allow-Origin': '*'
};

exports.handler = async () => {
  const token = process.env.NETLIFY_AUTH_TOKEN || '';
  const siteId = process.env.NETLIFY_SITE_ID || process.env.SITE_ID || '';

  if (!token || !siteId) {
    return {
      statusCode: 503,
      headers: cors,
      body: JSON.stringify({
        items: [],
        error: 'missing_config',
        hint: '在 Netlify → Site configuration → Environment variables 添加 NETLIFY_AUTH_TOKEN'
      })
    };
  }

  try {
    const formsRes = await fetch(`https://api.netlify.com/api/v1/sites/${siteId}/forms`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!formsRes.ok) {
      throw new Error('forms_http_' + formsRes.status);
    }
    const forms = await formsRes.json();
    const form = (forms || []).find((f) => f.name === 'guestbook');
    if (!form) {
      return { statusCode: 200, headers: cors, body: JSON.stringify({ items: [] }) };
    }

    const subRes = await fetch(
      `https://api.netlify.com/api/v1/forms/${form.id}/submissions?per_page=100`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    if (!subRes.ok) {
      throw new Error('submissions_http_' + subRes.status);
    }
    const subs = await subRes.json();
    const items = (subs || [])
      .map((s) => ({
        id: s.id,
        name: String((s.data && s.data.name) || '匿名').slice(0, 40),
        message: String((s.data && s.data.message) || '').slice(0, 1000),
        created: s.created_at || ''
      }))
      .filter((x) => x.message);

    return { statusCode: 200, headers: cors, body: JSON.stringify({ items }) };
  } catch (err) {
    return {
      statusCode: 500,
      headers: cors,
      body: JSON.stringify({ items: [], error: String(err && err.message || err) })
    };
  }
};
