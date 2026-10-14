// /api/proxy?url=<完整 github 链接> 入口（独立文件，不再依赖 [...path]）
const { handler } = require('../lib/proxy.js');

module.exports = (req, res) => handler(req, res);
module.exports.config = { maxDuration: 60 };
