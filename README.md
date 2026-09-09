# 序流 — 完整可取回内容恢复备份

本次恢复基于 2026-09-09 仍可访问的 Vercel 部署、数据服务和原始 Git 文件。目标仓库保持私有：Serenitycheng/xuliu-recovery。

## 当前线上版本

`source/` 是当前生产部署的原始源码和素材，共 **58 个文件**。部署 ID：`dpl_68zoKjP3ap1Fefa3Z5ef9R7CzwWy`。文件均与 Vercel 文件 ID（原内容 SHA-1）逐个核对，同时记录 SHA-256。`docs/vercel-source-manifest.json` 保存完整清单及空目录信息。历史版本单独存放。

## 数据和附件

Redis 最新导出位于 `data/cloud-2026-09-09/`，保留各键的数据类型、原始值和导出时的剩余有效期。导出为只读操作，逐键读取，并非跨键事务快照。

Redis 全部 10 个键，SCAN 最终游标为 0。

全部 12 个对象，共 6433685 字节，按原路径保存，逐文件 SHA-256 已验证。

## 历史版本

- xuliu-ai-web：20 个仍保留的部署。
- xuliu-flow-web：1 个仍保留的部署。
- xuliu-flow-web-safe：1 个仍保留的部署。
- xuliu-flow-web-stable：3 个仍保留的部署。
- xuliu-flow-web-v2：1 个仍保留的部署。
- xuliu-flow-web-v3：1 个仍保留的部署。
- xuliu-flow-web-v4：2 个仍保留的部署。
- xuliu-flow-web-v5：2 个仍保留的部署。
- xuliu-flow-web-v6：2 个仍保留的部署。

legacy/github-flow/ 保存原 flow 仓库的两个分支、14 个提交及完整 bundle；已核实原仓库未发生更新。

## 文件位置与核验

- `source/`：当前生产版本的全部已上传项目文件。
- `data/cloud-2026-09-09/`：最新业务数据快照和数据库结构。
- `attachments/files/`：附件原路径副本（存在附件时）；`attachments/manifest.json` 记录全量清单和哈希。
- `history/vercel/`：Vercel 仍保留的历史部署源码、素材及各版本文件清单。
- `legacy/`：原始 Git/Sites 历史、可验证 bundle 与源码。
- 原有 ZIP、分卷和 `SHA256SUMS.txt` 原样保留。`recovered/` 是这些早期备份的展开副本，其中源码曾不完整，以 `source/` 为当前版本。
- `VERIFY.py` 校验本次整个仓库；运行 `python VERIFY.py`。`RESTORE.py`（如存在）仅用于旧的初始压缩包。

## 恢复边界与运行配置

本仓库保存上述来源当前实际保留且可读取的内容。已删除的部署、未上传的本机文件、未同步的浏览器本地状态不在这些来源中，无法据此断言它们已恢复。Vercel 历史清单包含失败构建仍保存的源码。

服务密钥、访问令牌、浏览器 Cookie、登录会话未提交。北京项目中误上传的浏览器凭据目录已排除，并在部署清单中记录。环境变量名称和作用域见 `docs/environment-variable-names.json`；重新运行需通过原服务账号重新配置密钥，Vercel 的 sensitive 值不能读取。

站点未重新部署，业务数据库及原项目内容未改动。数据库和附件为导出时的快照，不包含导出后新写入的业务数据。
