// /api/download —— rewrite 目标（无动态段，保证路由一定命中）
// 由 vercel.json 把下面两种路径重写到这里，并附上 query 参数：
//   /:owner/:repo/releases/download/:tag/:asset
//   /:owner/:repo/archive/:ref*
const { handler } = require('../lib/proxy.js');

module.exports = (req, res) => handler(req, res);
module.exports.config = { maxDuration: 60 };
