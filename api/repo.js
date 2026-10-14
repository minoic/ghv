// /api/repo —— 仓库浏览器接口
//   GET /api/repo?owner=jpillora&repo=chisel
//   GET /api/repo?repo=jpillora/chisel
// 返回：仓库信息 + README(markdown) + release 列表（含每个 asset 的本站代理路径）

const { isDownloadAllowed } = require('../lib/proxy.js');

const GITHUB_API = 'https://api.github.com';
const VALID = /^[A-Za-z0-9_.-]+$/;

function ghHeaders() {
  const h = {
    'User-Agent': 'ghv-proxy/1.0',
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  };
  const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
  if (token) h.Authorization = `Bearer ${token}`;
  return h;
}

function parseRepo(req) {
  const q = (req && req.query) || {};
  let owner = Array.isArray(q.owner) ? q.owner[0] : q.owner;
  let repo = Array.isArray(q.repo) ? q.repo[0] : q.repo;

  // 兼容 ?repo=owner/repo
  if ((!owner || !repo) && typeof repo === 'string' && repo.includes('/')) {
    const [o, r] = repo.split('/').filter(Boolean);
    owner = owner || o;
    repo = r || repo;
  }
  // 兼容 ?url=https://github.com/owner/repo...
  const urlParam = Array.isArray(q.url) ? q.url[0] : q.url;
  if ((!owner || !repo) && typeof urlParam === 'string') {
    try {
      const u = new URL(urlParam);
      const segs = u.pathname.split('/').filter(Boolean);
      if (segs.length >= 2) {
        owner = owner || segs[0];
        repo = repo || segs[1];
      }
    } catch (e) { /* ignore */ }
  }

  if (typeof owner !== 'string' || typeof repo !== 'string') return null;
  owner = owner.trim();
  repo = repo.trim().replace(/\.git$/, '');
  if (!VALID.test(owner) || !VALID.test(repo)) return null;
  return { owner, repo };
}

async function gh(path) {
  const r = await fetch(`${GITHUB_API}${path}`, { headers: ghHeaders() });
  const text = await r.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch (e) { data = { raw: text }; }
  return { status: r.status, data, headers: r.headers };
}

module.exports = async (req, res) => {
  if (req.method !== 'GET') {
    res.status(405).setHeader('Allow', 'GET');
    return res.send('Method Not Allowed');
  }

  const parsed = parseRepo(req);
  if (!parsed) {
    return res.status(400).json({ error: '用法：/api/repo?owner=<owner>&repo=<repo> 或 /api/repo?repo=owner/repo' });
  }
  const { owner, repo } = parsed;

  try {
    const [repoR, relR, readmeR] = await Promise.all([
      gh(`/repos/${owner}/${repo}`),
      gh(`/repos/${owner}/${repo}/releases?per_page=30&page=1`),
      gh(`/repos/${owner}/${repo}/readme`),
    ]);

    if (repoR.status === 404) {
      return res.status(404).json({ error: `仓库不存在：${owner}/${repo}` });
    }
    if (repoR.status === 403 && repoR.data && /rate limit/i.test(JSON.stringify(repoR.data))) {
      return res.status(429).json({ error: 'GitHub API 限流了，稍后再试（可给项目配 GITHUB_TOKEN 环境变量提额）' });
    }
    if (repoR.status !== 200) {
      return res.status(502).json({ error: `GitHub API 错误：${repoR.status}` });
    }

    const r = repoR.data || {};
    const releases = Array.isArray(relR.data) ? relR.data.map((rel) => ({
      tag_name: rel.tag_name,
      name: rel.name || rel.tag_name,
      body: (rel.body || '').slice(0, 4000),
      prerelease: !!rel.prerelease,
      draft: !!rel.draft,
      published_at: rel.published_at,
      html_url: rel.html_url,
      assets: (rel.assets || []).map((a) => ({
        name: a.name,
        size: a.size,
        download_count: a.download_count,
        browser_download_url: a.browser_download_url,
        proxy_path: `/${owner}/${repo}/releases/download/${encodeURIComponent(rel.tag_name)}/${encodeURIComponent(a.name)}`,
      })),
    })) : [];

    let readme = null;
    if (readmeR.status === 200 && readmeR.data) {
      const { path, encoding, content } = readmeR.data;
      if (encoding === 'base64' && content) {
        try {
          const md = Buffer.from(content.replace(/\n/g, ''), 'base64').toString('utf-8');
          readme = { path: path || 'README.md', markdown: md.slice(0, 200000) };
        } catch (e) { readme = null; }
      }
    }

    res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=600');
    res.setHeader('content-type', 'application/json; charset=utf-8');
    return res.status(200).json({
      download_enabled: isDownloadAllowed(),
      repo: {
        full_name: r.full_name,
        description: r.description,
        stargazers_count: r.stargazers_count,
        language: r.language,
        default_branch: r.default_branch,
        html_url: r.html_url,
      },
      readme,
      releases,
    });
  } catch (e) {
    return res.status(502).json({ error: '请求 GitHub API 失败：' + (e && e.message) });
  }
};

module.exports.config = { maxDuration: 30 };
