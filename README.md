# ghv - GitHub Release 下载代理

接受一个替换过域名的 GitHub Release 下载链接，服务端代为下载并返回文件。

## 用法

把链接中的 `github.com` 换成部署域名即可：

```
https://github.com/owner/repo/releases/download/v1.0/app.zip
→ https://<你的域名>/owner/repo/releases/download/v1.0/app.zip
```

同时支持：

- archive 包：`/<owner>/<repo>/archive/refs/heads/main.zip`
- 显式接口：`/api/proxy?url=<完整 github 链接>`
- 显式接口：`/api/<owner>/<repo>/releases/download/...`

## 本地 / 部署

纯静态页 + Vercel Serverless Function，无需依赖，直接部署：

```bash
vercel --prod
```

或关联 GitHub 仓库后由 Vercel 自动部署。
