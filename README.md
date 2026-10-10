# 序流

序流是个人学习与生活工作台，把今日安排、任务、课程、笔记和日常记录放在同一个空间。

正式网址：[xuliu-ai-web-one.vercel.app](https://xuliu-ai-web-one.vercel.app)。本文以 GitHub `main` 的应用代码为准；本地演示与云端服务的状态分别核验。

## 现有能力与边界

- 今日安排、短期与长期任务、事项、计划推进日与截止时间；课程任务和课前、课上、课后学习安排。
- 课表导入、笔记与私有附件、专注计时、习惯与提醒、个人记账及微信账单导入。
- 多账号空间、云端版本检查与冲突保护；AI 助手可提出修改，写入前需要预览和确认。
- `/preview` 使用演示数据，刷新后重置。课表安排由客户端规则生成；不会自动读取本机笔记库，也不是关闭网页后运行的定时任务。
- 真正的登录、保存、附件和 AI 需要各自服务配置；演示页面不能证明这些服务可用。账单分类仍需人工核对。

## 技术栈与运行

Next.js 16、React 19、TypeScript、Zod、Vercel AI SDK；Upstash Redis 保存空间状态，Vercel 私有 Blob 保存附件，DeepSeek 提供可选 AI。

需要 Node.js 22.13+ 与 npm。应用在 `source/`，从仓库根目录执行：

```powershell
cd source
npm ci
npm run dev:local -- --port 3006
```

演示入口为 `http://localhost:3006/preview`。常用检查与生产运行：

```powershell
npm test
npm run typecheck
npm run build
npm start -- --port 3006
```

## 环境变量

将自己的配置放在 `source/.env.local`，部署时配置在 Vercel。这里只列名称，不保存实际值。

- 云端状态：`UPSTASH_REDIS_REST_URL`、`UPSTASH_REDIS_REST_TOKEN`；兼容 `KV_REST_API_URL`、`KV_REST_API_TOKEN`。
- 登录：`XULIU_SESSION_SECRET`，以及 `XULIU_OWNER_PASSWORD_HASH`、`XULIU_PARTNER_PASSWORD_HASH`、`XULIU_LXS_PASSWORD_HASH`、`XULIU_RAYCHEN_PASSWORD_HASH`。各组还支持对应的 `*_USERNAME` 与 `*_DISPLAY_NAME`；只配置需要的账号，密码使用哈希。
- 私有附件：`BLOB_READ_WRITE_TOKEN`。
- 可选 AI：`DEEPSEEK_API_KEY`、`DEEPSEEK_BASE_URL`、`DEEPSEEK_MODEL`、`XULIU_AI_APPROVAL_SECRET`。当前代码要求地址为 `https://api.deepseek.com`、模型为 `deepseek-v4-flash`。

## 部署与目录

已有 Vercel 项目名为 `xuliu-ai-web`。使用 Next.js，Root Directory 设为 `source`，生产分支为 `main`；构建与运行使用应用中的 npm 脚本。仓库改名不要求更改项目名或正式域名。推送后应核对对应提交的构建与部署结果。

- `source/`：当前应用。
- `docs/`：环境变量名称、结构与历史记录。
- `archive/recovery/`、`data/`、`attachments/`：历史恢复资料、业务快照与附件副本，不能作为今天的云端状态或直接回灌。

恢复数据与附件包含私有内容，公开前需要单独处理公开范围；仅修改 README 不会清除 Git 历史中的数据。
