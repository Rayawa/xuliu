# 序流 · HarmonyOS

面向 HarmonyOS API26、最低兼容 API23 的学习与生活工作台。以 [Serenitycheng/xuliu](https://github.com/Serenitycheng/xuliu/tree/26cd01e2c62a030ff79fbdb58c47d8b7cca70d29) 的功能为参照，采用本机 Dashboard HarmonyOS 工程的分层目录、Hds 导航和统一存储模式。

完整功能清单、原生覆盖范围与剩余差异见 [功能对照](docs/features.md)。本轮按要求只编码和构建，未运行测试或安装到设备；目前是首版原生实现，尚未达到全部上游功能的原生等价。

## 开始使用

主标签为今日、任务、学习、生活、我的。默认空工作台；“我的 → 添加演示内容”可追加由本工程生成的示例，不会复制上游个人数据。今日提供日历、课表、番茄钟、复习池、记账和每日复盘入口。番茄钟独立倒计时，支持跨页继续、重置和本地结束提示音；不再关联任务或自动记入用时。生活页包含30分钟专注/5分钟休息的眼睛循环及提醒项目、队列和声音设置，旧计时历史保留。复习章节可分组折叠，独立选择小任务，编辑和原位置撤销删除，并查看原资料；任务阶段支持父子取消/重选/改期，今日推进可设置继续日期。记账包含分类预算、商户识别规则、储值实付与赠送、收支占比和趋势；微信CSV/XLSX可预览去重并选择更新分类。教务支持XLSX/CSV/TSV/ICS、预览修改及合并/重导，保留课程内容并保存导入前完整备份。

“我的 → 账号与云端”支持原生登录、手动读写 version 6 数据，上传带版本冲突保护。原生文档支持局部格式、段落样式、目录、撤销、网页文字整理粘贴和单元格编辑；私有附件支持选文件、分片上传、授权读取及PDF/图片/文本预览，需要先登录且上游已配置存储服务。原生会话仅在应用进程内跨页面共享，不与Web会话共享。原生AI助手支持流式对话、空间/课程上下文、完整变更预览、签名确认、批量/删除二次确认和课程笔记追加；更新结果下载前保留可导出完整备份。今日一言卡片和“一言图文与文集”提供短信连接、换句预取、公开缓存、配图清晰度、收藏、分页浏览及公开/私密文集新建；未知写入结果可单独检查。当前未进行真实账号联调。

## 构建

安装 DevEco Studio 和 HarmonyOS API26 SDK 后：

```sh
bash scripts/build.sh
```

默认从 `~/Applications/DevEco-Studio.app` 查找工具；可设置 `DEVECO_STUDIO_HOME`。脚本只调用 Debug `assembleHap`，不执行测试。

产物：`entry/build/default/outputs/default/entry-default-unsigned.hap`。工程没有签名配置，因此产物未签名；未自动安装、发布或提交代码。

## 目录与约定

- `abilities/`：Ability 与应用生命周期。
- `pages/main/`：主标签；其余 `pages/<业务>/`：二级页面。
- `components/<业务>/`：有复用需求或独立逻辑的组件。
- `domain/<业务>/`：业务规则、调度与导入解析。
- `services/storage/`：唯一持久化入口；Preferences 保存设置，应用私有 JSON 保存业务数据；写入发布 AppStorage 更新。
- `services/api/`、`services/files/`：云端与系统文件选择器。
- `models/`：version 6 数据类型；`state/`：跨页面临时状态；`config/constants.ets`：公共常量。
- `ui/`：界面辅助；`resources/base`、`resources/dark`：成对颜色资源。

页面使用 `HdsNavigation` / `HdsNavDestination`，应用内临时表单状态留在页面；偏好经统一 setter 持久化并通过 `@StorageLink` 绑定。栅格按窗口宽度而非设备型号重排，参考[华为响应式布局完整章节](https://developer.huawei.com/consumer/cn/doc/doccenter-multi-device/bpta-multi-device-responsive-layout)和[无障碍属性](https://developer.huawei.com/consumer/cn/doc/harmonyos-guides/arkts-universal-attributes-accessibility)。API 写法同时核对本地华为 SDK 声明。
