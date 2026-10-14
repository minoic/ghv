// /api/proxy?url=<完整 github 链接> 入口，复用 [...path] 的代理逻辑
module.exports = async (req, res) => {
  req.query = { ...(req.query || {}), path: [] };
  return require('./[...path].js')(req, res);
};
module.exports.config = { maxDuration: 60 };
