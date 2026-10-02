# 序流：唯一维护目录

- 唯一活动仓库是 `D:\projects\xuliu-recovery`，应用目录为其下的 `source`。后续修改、安装依赖、build、commit 和 push 均从此仓库执行。
- 开始工作先读 `项目入口.md`；2026-09-17 合并记录见 `docs/仓库统一说明-20260917.md`。重新检查当前 Git 状态和远程版本，不把文档中的旧提交号视为永远最新。
- 旧 Codex 工作区、`recovered`、`history`、`legacy` 及 `.local-archive` 都是保留资料，不能作为日常开发目录。
- 必须保留全部用户数据、笔记、附件与历史。不要使用 `reset --hard`、`clean` 或覆盖式复制消除未知差异；意外改动先备份再处理。
- `data`、`attachments` 和压缩包是历史恢复快照，不代表云端当前业务状态。源码更新不能触发数据库恢复、覆盖、清空或维护脚本。
- `.local-archive` 内含私有资料与可恢复备份，已从 Git 排除。不要擅自发布归档或本地配置；环境变量值不得输出。
- 开发依赖应安装到本仓库 `source/node_modules`，不得链接回旧工作区。常用命令：`./project.ps1 build`、`./project.ps1 test`、`./project.ps1 typecheck`、`./project.ps1 dev`。
- 先读取 `source/AGENTS.md`（如存在）和已安装 Next.js 的相关本地文档，再修改应用代码。
- 只关闭能够确认属于本项目本次启动的服务，不批量终止 Node 进程。默认本地端口 3006。
- 回答多分点、短而清晰，避免冗余和非必要表格。
