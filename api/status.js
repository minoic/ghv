// /api/status —— 站点状态（供首页展示下载开关状态）
const { isDownloadAllowed } = require('../lib/proxy.js');

module.exports = (req, res) => {
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  return res.status(200).json({ download_enabled: isDownloadAllowed() });
};
