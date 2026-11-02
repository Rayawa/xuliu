import { HdsNavDestination, HdsNavDestinationTitleMode } from '@kit.UIDesignKit';
import { APP_VERSION, UPSTREAM_COMMIT, CLOUD_ORIGIN } from '../../config/constants';

@Component
export struct InfoPage {
  @Consume('pageStack') private pageStack: NavPathStack;
  @Prop privacy: boolean = false;

  build() {
    HdsNavDestination() {
      Scroll() {
        Column({ space: 18 }) {
          Text(this.privacy ? '你的记录，由你管理' : `序流 ${APP_VERSION}`).fontSize(28).fontWeight(FontWeight.Bold).fontColor($r('app.color.text_primary'))
          if (this.privacy) {
            Text('本机记录\n任务、课程、笔记、习惯、复盘和账目保存在应用私有目录。设置保存在系统 Preferences。应用保留上一份本机数据备份，系统备份范围由应用备份配置决定。')
            Text('网络与云端\n本机工作台不自动上传。只有你主动登录、读取、上传附件或确认同步时，才会访问序流服务。原生云端密码不保存；会话仅保留在本次应用进程内，退出登录或应用进程结束时清除。')
            Text('云端工作台\n完整云端工作台由 ArkWeb 加载，使用独立 Web 会话；云端存储、AI 和私有附件按该服务的规则处理。Web 登录状态可能保留在系统 Web 存储中，可在云端页面退出账号。')
            Text('文件与图片\n导入和导出由系统文件选择器授权。导出文件可能包含你的个人记录，请自行选择保存位置。远程公开图片会在打开相应笔记时访问该图片地址。私有附件通过当前账号授权读取，预览缓存退出页面后删除。HTML附件预览不运行脚本或访问网络。')
            Text('提醒与计时\n提醒只在应用前台运行，不申请后台闹钟或通知权限。计时不会启用后台常驻服务。')
          } else {
            Text('2026-11-02 · 原生工作台\n建立 API26 / API23 工程与 Hds 导航。增加今日、任务、课程、学习、工作研究、工具、笔记与生活记录。按课表安排每日简短学习，保留个人资料和已完成历史。')
            Text('新增日历、课表导入预览、复习章节与小任务、专注计时、每日复盘、记账、预算、储值和微信账单导入。')
            Text('采用 Dashboard 的分层目录、统一持久化入口与 AppStorage 状态边界，补充响应式布局、深浅色资源和中文无障碍标签。')
            Text('新增原生账号登录与手动云端读写，云端保存带版本冲突保护。新增原生富文本、段落样式、目录与撤销；支持私有附件分片上传、授权读取、PDF与图片/文本预览。AI仍可通过云端工作台使用。')
            Text(`参考提交：${UPSTREAM_COMMIT}\n服务：${CLOUD_ORIGIN}\n记录由你整理，进度由你掌握。`)
          }
        }.width('100%').constraintSize({ maxWidth: 800 }).padding(24).alignItems(HorizontalAlign.Start)
      }.width('100%').height('100%').backgroundColor($r('app.color.background'))
    }.titleMode(HdsNavDestinationTitleMode.MINI)
    .titleBar({ content: { title: { mainTitle: this.privacy ? '隐私说明' : '更新日志' }, backIcon: { action: () => this.pageStack.pop() } } })
  }
}
