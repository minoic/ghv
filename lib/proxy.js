// 共享代理逻辑（放到 /lib 下，避免被 Vercel 当成 /api 路由）
// 支持三种调用方式：
//   1) ?url=<完整 github 链接>（或已替换域名的本站链接，自动还原成 github.com）
//   2) rewrite 传参：?owner=&repo=&tag=&asset=  或  ?owner=&repo=&ref=
//   3) 裸路径兜底：/api/download 收到原始 path 时直接解析（兼容 rewrite 前的 req.url）

const GITHUB_ORIGIN = 'https://github.com';

// rewrite/内部控制参数，不透传给上游
const CONTROL_KEYS = new Set(['url', 'owner', 'repo', 'tag', 'asset', 'ref', 'type']);

const USAGE = `ghv - GitHub Release 下载代理

用法：把链接中的 github.com 换成当前域名即可，例如：
  https://github.com/owner/repo/releases/download/v1.0/app.zip
  → /owner/repo/releases/download/v1.0/app.zip （本站同路径）

也支持：
  /api/proxy?url=<完整 github 链接>
  /<owner>/<repo>/archive/refs/heads/main.zip
`;

function pick(req, name) {
  const q = (req && req.query) || {};
  const v = q[name];
  if (Array.isArray(v)) return v.join('/');
  return v;
}

function extraQuery(req) {
  try {
    const url = new URL(req.url || '/', 'http://localhost');
    const out = new URLSearchParams();
    for (const [k, v] of url.searchParams.entries()) {
      if (!CONTROL_KEYS.has(k)) out.append(k, v);
    }
    const s = out.toString();
    return s ? `?${s}` : '';
  } catch (e) {
    return '';
  }
}

function buildTarget(req) {
  const q = (req && req.query) || {};

  // 1) ?url= 优先
  const direct = pick(req, 'url');
  if (direct) {
    try {
      const u = new URL(direct);
      if (u.hostname !== 'github.com') {
        u.protocol = 'https:';
        u.hostname = 'github.com';
        u.port = '';
      }
      u.searchParams.delete('url');
      return u.toString();
    } catch (e) { /* fall through */ }
  }

  // 2) rewrite 传参：releases
  const owner = pick(req, 'owner');
  const repo = pick(req, 'repo');
  const tag = pick(req, 'tag');
  const asset = pick(req, 'asset');
  if (owner && repo && tag && asset) {
    return `${GITHUB_ORIGIN}/${owner}/${repo}/releases/download/${tag}/${asset}${extraQuery(req)}`;
  }

  // 3) rewrite 传参：archive（ref 可能是 refs/heads/main.zip，含斜杠）
  const ref = pick(req, 'ref');
  if (owner && repo && ref) {
    return `${GITHUB_ORIGIN}/${owner}/${repo}/archive/${ref}${extraQuery(req)}`;
  }

  // 4) 裸路径兜底：从 req.url 解析 /api/... 或 /owner/repo/...
  try {
    const url = new URL(req.url || '/', 'http://localhost');
    let p = url.pathname || '/';
    p = p.replace(/^\/api\/download\/?/, '').replace(/^\/api\/?/, '').replace(/^\//, '');
    if (p && p !== 'proxy' && p.split('/').length >= 2) {
      url.searchParams.delete('url');
      const qs = url.searchParams.toString();
      return `${GITHUB_ORIGIN}/${p}${qs ? `?${qs}` : ''}`;
    }
  } catch (e) { /* ignore */ }

  // 兼容旧版 [...path] 传参：?path=a/b/c
  const legacy = q.path;
  if (legacy) {
    const parts = Array.isArray(legacy) ? legacy : [legacy];
    const path = parts.join('/');
    if (path) return `${GITHUB_ORIGIN}/${path}${extraQuery(req)}`;
  }

  return null;
}

async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.status(405).setHeader('Allow', 'GET, HEAD');
    return res.send('Method Not Allowed');
  }

  const target = buildTarget(req);
  if (!target) {
    res.status(400).setHeader('content-type', 'text/plain; charset=utf-8');
    return res.send(USAGE);
  }
  if (!target.startsWith(`${GITHUB_ORIGIN}/`)) {
    return res.status(400).send('Invalid target URL');
  }

  try {
    const upstream = await fetch(target, {
      method: req.method,
      redirect: 'follow',
      headers: { 'User-Agent': 'ghv-proxy/1.0', Accept: '*/*' },
    });

    if (!upstream.ok) {
      return res.status(upstream.status).send(`Upstream error: ${upstream.status} ${upstream.statusText}`);
    }

    for (const h of ['content-type', 'content-length', 'content-disposition', 'accept-ranges', 'etag', 'last-modified']) {
      const v = upstream.headers.get(h);
      if (v) res.setHeader(h, v);
    }
    if (!res.getHeader('content-disposition')) {
      const raw = decodeURIComponent(target.split('/').pop().split('?')[0] || 'download');
      const safe = raw.replace(/["\r\n]/g, '_');
      res.setHeader('content-disposition', `attachment; filename="${safe}"`);
    }

    res.status(upstream.status);
    if (req.method === 'HEAD' || !upstream.body) return res.end();

    const reader = upstream.body.getReader();
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        if (!res.write(Buffer.from(value))) {
          await new Promise((resolve) => res.once('drain', resolve));
        }
      }
    } finally {
      reader.releaseLock();
    }
    res.end();
  } catch (e) {
    res.status(502).send('Proxy fetch failed: ' + (e && e.message));
  }
}

module.exports = { handler, buildTarget, GITHUB_ORIGIN, USAGE };
