// Vercel Serverless Function: GitHub Release 下载代理
// 用法：把 github.com 换成你的 Vercel 域名即可
//   https://github.com/owner/repo/releases/download/v1.0/app.zip
//   → https://<你的域名>/owner/repo/releases/download/v1.0/app.zip
// 也支持：
//   /api/owner/repo/releases/download/v1.0/app.zip
//   /api/proxy?url=<完整 github 链接>  (见 api/proxy.js)

const GITHUB_ORIGIN = 'https://github.com';

const USAGE = `ghv - GitHub Release 下载代理

用法：把链接中的 github.com 换成当前域名即可，例如：
  https://github.com/owner/repo/releases/download/v1.0/app.zip
  → /owner/repo/releases/download/v1.0/app.zip （本站同路径）

也支持：
  /api/owner/repo/releases/download/v1.0/app.zip
  /api/proxy?url=<完整 github 链接>
`;

function buildTarget(req, pathSegs) {
  // 兼容 Vercel 传参：req.url 可能是相对路径，补一个 base
  const url = new URL(req.url || '/', `http://${(req.headers && req.headers.host) || 'localhost'}`);

  // 1) ?url= 优先（允许传入本站域名链接，自动还原成 github.com）
  const direct = url.searchParams.get('url');
  if (direct) {
    try {
      const u = new URL(direct);
      if (u.hostname !== 'github.com') {
        u.protocol = 'https:';
        u.hostname = 'github.com';
        u.port = '';
      }
      // 去掉代理专用参数，避免污染上游
      u.searchParams.delete('url');
      return u.toString();
    } catch (e) { /* fall through */ }
  }

  // 2) 路径形式：/api/<owner>/<repo>/...
  const parts = Array.isArray(pathSegs) ? pathSegs : (pathSegs ? [pathSegs] : []);
  const path = parts.join('/');
  if (!path) return null;

  // 只保留非代理参数的 query（去掉 url 本身）
  url.searchParams.delete('url');
  const qs = url.searchParams.toString();
  return `${GITHUB_ORIGIN}/${path}${qs ? `?${qs}` : ''}`;
}

module.exports = async (req, res) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.status(405).setHeader('Allow', 'GET, HEAD');
    return res.send('Method Not Allowed');
  }

  const target = buildTarget(req, req.query && req.query.path);
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

    // 透传关键头
    for (const h of ['content-type', 'content-length', 'content-disposition', 'accept-ranges', 'etag', 'last-modified']) {
      const v = upstream.headers.get(h);
      if (v) res.setHeader(h, v);
    }
    // 上游没给文件名时补一个 attachment
    if (!res.getHeader('content-disposition')) {
      const raw = decodeURIComponent(target.split('/').pop().split('?')[0] || 'download');
      const safe = raw.replace(/["\r\n]/g, '_');
      res.setHeader('content-disposition', `attachment; filename="${safe}"`);
    }

    res.status(upstream.status);
    if (req.method === 'HEAD' || !upstream.body) return res.end();

    // 流式管道回传
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
};

module.exports.config = { maxDuration: 60 };
