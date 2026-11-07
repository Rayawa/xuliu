import { hdsPageTitle } from '../../ui/navigation/hdsTitleBar';
import { HdsNavDestination, HdsNavDestinationTitleMode } from '@kit.UIDesignKit';

interface PrivacySection {
  title: string;
  body: string;
}

const PRIVACY_SECTIONS: PrivacySection[] = [
  { title: '本机记录', body: '任务、课程、笔记、习惯、复盘和账目保存在应用私有目录。设置保存在系统 Preferences。应用保留上一份本机数据备份，系统备份范围由应用备份配置决定。' },
  { title: '网络与云端', body: '本机工作台不自动上传。当你登录、打开云端或 AI 页面、阅读一言、上传附件或确认同步时，会访问序流服务。原生云端密码不保存；会话仅保留在本次应用进程内，退出登录或应用进程结束时清除。' },
  { title: '原生 AI 助手', body: '问题与选定云端空间或课程上下文经序流服务发送到 DeepSeek。修改先展示服务端预览并由你确认，批量或删除另需再次确认。对话、签名和确认令牌只在内存保留；下载结果前保存本机完整备份。' },
  { title: '一言图文与文集', body: '一言连接需先登录序流。手机号、短信验证码和连接会话仅在内存中使用；公开图文与配图清晰度可缓存在本机，私人文集不写入本机存储。配图先由序流读取，失败时直接访问一言公开图片地址，不向图片站点发送登录凭据。收藏与新建文集仅在你主动操作时提交。' },
  { title: '云端工作台', body: '完整云端工作台由 ArkWeb 加载，使用独立 Web 会话；云端存储、AI 和私有附件按该服务的规则处理。Web 登录状态可能保留在系统 Web 存储中，可在云端页面退出账号。' },
  { title: '文件、图片与粘贴', body: '整理粘贴只在你点击系统粘贴按钮时读取剪贴板，在本机清理网页样式；不会执行网页内容或读取外部资源。导入和导出由系统文件选择器授权。导出文件可能包含你的个人记录，请自行选择保存位置。远程公开图片会在打开相应笔记时访问该图片地址。私有附件通过当前账号授权读取，预览缓存退出页面后删除。HTML 附件预览不运行脚本或访问网络。' },
  { title: '提醒与计时', body: '生活提醒在前台排队显示，可选择本地提示音与音量；仅你主动开启时请求系统通知授权，测试通知也须主动点击；不申请后台闹钟权限。番茄钟及 30/5 眼睛循环跨页继续、回到前台按时间更新，不启用后台常驻服务。计时状态只存本次进程，既有历史用时不清除。' },
];

@Component
export struct PrivacyPage {
  @Consume('pageStack') private pageStack: NavPathStack;

  build() {
    HdsNavDestination() {
      Scroll() {
        Column({ space: 20 }) {
          Blank().height(100).width('100%').accessibilityLevel('no')
          Text('你的记录，由你管理')
            .fontSize(28)
            .fontWeight(FontWeight.Bold)
            .fontColor($r('app.color.text_primary'))
            .width('100%')
          ForEach(PRIVACY_SECTIONS, (section: PrivacySection) => {
            Column({ space: 8 }) {
              Text(section.title).fontSize(18).fontWeight(FontWeight.Medium)
                .fontColor($r('app.color.text_primary')).width('100%')
              Text(section.body).fontSize(15).fontColor($r('app.color.text_secondary'))
                .width('100%')
            }
            .width('100%')
            .padding(18)
            .borderRadius(16)
            .backgroundColor($r('app.color.surface'))
            .border({ width: 1, color: $r('app.color.border') })
            .shadow({ radius: 12, color: $r('app.color.card_shadow'), offsetY: 3 })
            .accessibilityGroup(true)
            .accessibilityText(`${section.title}。${section.body}`)
          }, (section: PrivacySection) => section.title)
          Blank().height(28).width('100%').accessibilityLevel('no')
        }
        .width('100%')
        .constraintSize({ maxWidth: 800 })
        .padding(20)
        .alignItems(HorizontalAlign.Start)
      }
      .width('100%')
      .height('100%')
      .backgroundColor($r('app.color.background'))
      .expandSafeArea([SafeAreaType.SYSTEM], [SafeAreaEdge.TOP, SafeAreaEdge.BOTTOM])
      .accessibilityText('序流隐私说明')
    }
    .titleMode(HdsNavDestinationTitleMode.MINI)
    .titleBar(hdsPageTitle('隐私说明', () => this.pageStack.pop()))
    .ignoreLayoutSafeArea([LayoutSafeAreaType.SYSTEM], [LayoutSafeAreaEdge.TOP, LayoutSafeAreaEdge.BOTTOM])
  }
}
