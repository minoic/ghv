# ghv - GitHub Release 下载代理

把 GitHub 链接中的 `github.com` 换成部署域名，服务端代为下载并返回文件；首页还支持输入 `owner/repo` 浏览 README 与 Release 列表并选择下载。

## 功能

- **代理下载**：替换域名即代理，支持 Release 附件与 archive 包
- **仓库浏览器**（首页）：输入 `owner/repo`，查看仓库信息、README（渲染）、Release 版本下拉与附件列表
- **链接转换**（首页）：粘贴 GitHub 下载链接，生成本站代理链接或直接下载
- **下载总开关**：`ALLOW_DOWNLOAD` 环境变量控制是否允许下载，默认允许；关闭后仅拦截文件下载，仓库浏览、README、版本列表不受影响

## 用法

把链接中的 `github.com` 换成部署域名即可：

```
https://github.com/owner/repo/releases/download/v1.0/app.zip
→ https://<你的域名>/owner/repo/releases/download/v1.0/app.zip
```

其他支持的路径：

| 用法 | 示例 |
|---|---|
| 短链接（Release 附件） | `/<owner>/<repo>/releases/download/<tag>/<asset>` |
| 短链接（archive 包） | `/<owner>/<repo>/archive/refs/heads/main.zip` |
| 显式接口 | `/api/proxy?url=<完整 github 链接>` |
| 显式接口 | `/api/<owner>/<repo>/releases/download/...` |
| 仓库信息接口 | `/api/repo?repo=owner/repo` 或 `/api/repo?owner=o&repo=r` |
| 状态接口 | `/api/status` → `{ "download_enabled": true }` |
| 首页直达仓库 | `/?repo=owner/repo`（如 `/?repo=jpillora/chisel`） |

## 环境变量

| 变量 | 默认 | 说明 |
|---|---|---|
| `ALLOW_DOWNLOAD` | 允许（未设置即允许） | 下载总开关。设为 `0` / `false` / `no` / `off` 关闭下载（下载类请求返回 `403`）；设为 `1` / `true` / `yes` / `on` 或不设置则允许。关闭后 `/api/repo`、`/api/status`、README、版本列表均正常，仅文件下载被拦截，首页会显示提示横幅并置灰下载按钮 |
| `GITHUB_TOKEN`（或 `GH_TOKEN`） | 无 | 可选。给 `/api/repo` 用的 GitHub API token（任意有 `public_repo` 权限即可），把未登录 60 次/小时的限额提到 5000 次/小时 |

在 Vercel 后台设置：项目 → Settings → Environment Variables，添加后重新部署生效。

示例：临时关闭下载测试

```bash
# Vercel CLI
vercel env add ALLOW_DOWNLOAD production   # 输入 0
vercel --prod
```

关闭后验证：

```bash
curl -i "https://<你的域名>/owner/repo/releases/download/v1.0/app.zip"
# HTTP/2 403 + 文件下载功能已关闭……
curl "https://<你的域名>/api/status"
# {"download_enabled":false}
```

## 本地 / 部署

纯静态页 + Vercel Serverless Function（Node，无第三方依赖），直接部署：

```bash
vercel --prod
```

或关联 GitHub 仓库后由 Vercel 自动部署。自定义域名在项目 → Settings → Domains 添加即可。

## 项目结构

```
├── index.html          # 首页：仓库浏览器 + 链接转换
├── api/
│   ├── download.js     # rewrite 目标（短链接 → 代理下载）
│   ├── proxy.js        # /api/proxy?url= 入口
│   ├── repo.js         # /api/repo 仓库信息 + README + release 列表
│   └── status.js       # /api/status 下载开关状态
├── lib/
│   └── proxy.js        # 共享代理逻辑 + ALLOW_DOWNLOAD 开关
└── vercel.json         # rewrite 规则
```
