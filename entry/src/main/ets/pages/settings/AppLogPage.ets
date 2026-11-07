import { hdsPageTitle } from '../../ui/navigation/hdsTitleBar';
import { HdsNavDestination, HdsNavDestinationTitleMode } from '@kit.UIDesignKit';
import { APP_VERSION, UPSTREAM_COMMIT } from '../../config/constants';

interface NativeLog {
  date: string;
  title: string;
  changes: string[];
}

const NATIVE_LOGS: NativeLog[] = [
  {
    date: '2026-11-03', title: '一言、复习和日常',
    changes: [
      '一言新增短信连接、换句预取、公开图文缓存、清晰度与重试、文集收藏和分页浏览。未知写入结果可单独检查。',
      '复习池新增课程分组、独立编辑、小任务修改与删除撤销；任务阶段支持取消、重选和双向改期。',
      '番茄钟改为独立倒计时；生活管理新增 30/5 眼睛循环、多个提醒排队和本地声音设置。历史用时保留。',
      '文档支持整理粘贴、长文分块追加、表格单元格编辑和结构操作撤销。',
    ],
  },
  {
    date: '2026-11-02', title: '原生工作台',
    changes: [
      '建立目标 API26、最低 API23 的原生工程，使用 Hds 导航与分层目录。',
      '增加今日、任务、课程、学习、工作研究、工具、笔记、生活记录、日历、复习、专注和记账。',
      '新增原生账号登录、手动云端读写、富文本和私有附件，以及 AI 流式对话与修改确认。',
      '按课表安排每日简短学习，保留个人资料、附件和已完成历史。',
    ],
  },
];

@Component
export struct AppLogPage {
  @Consume('pageStack') private pageStack: NavPathStack;

  build() {
    HdsNavDestination() {
      Scroll() {
        Column({ space: 18 }) {
          Blank().height(100).width('100%').accessibilityLevel('no')
          Text(`序流 ${APP_VERSION}`)
            .fontSize(28).fontWeight(FontWeight.Bold)
            .fontColor($r('app.color.text_primary')).width('100%')
          ForEach(NATIVE_LOGS, (log: NativeLog) => {
            Column({ space: 10 }) {
              Text(log.date).fontSize(13).fontColor($r('app.color.text_secondary')).width('100%')
              Text(log.title).fontSize(20).fontWeight(FontWeight.Medium)
                .fontColor($r('app.color.text_primary')).width('100%')
              ForEach(log.changes, (change: string) => {
                Text(`• ${change}`).fontSize(15).fontColor($r('app.color.text_secondary')).width('100%')
              }, (change: string) => change)
            }
            .width('100%').padding(18).borderRadius(16)
            .backgroundColor($r('app.color.surface'))
            .border({ width: 1, color: $r('app.color.border') })
            .shadow({ radius: 12, color: $r('app.color.card_shadow'), offsetY: 3 })
            .accessibilityGroup(true)
            .accessibilityText(`${log.date}，${log.title}。${log.changes.join('；')}`)
          }, (log: NativeLog) => log.date)
          Text(`上游参考提交：${UPSTREAM_COMMIT}`)
            .fontSize(12).fontColor($r('app.color.text_secondary')).width('100%')
          Blank().height(28).width('100%').accessibilityLevel('no')
        }
        .width('100%').constraintSize({ maxWidth: 800 })
        .padding(20).alignItems(HorizontalAlign.Start)
      }
      .width('100%').height('100%')
      .backgroundColor($r('app.color.background'))
      .expandSafeArea([SafeAreaType.SYSTEM], [SafeAreaEdge.TOP, SafeAreaEdge.BOTTOM])
      .accessibilityText('可滚动的序流更新日志')
    }
    .titleMode(HdsNavDestinationTitleMode.MINI)
    .titleBar(hdsPageTitle('更新日志', () => this.pageStack.pop()))
    .ignoreLayoutSafeArea([LayoutSafeAreaType.SYSTEM], [LayoutSafeAreaEdge.TOP, LayoutSafeAreaEdge.BOTTOM])
  }
}
