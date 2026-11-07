import { hdsPageTitle } from '../../ui/navigation/hdsTitleBar';
import { HdsNavDestination, HdsNavDestinationTitleMode } from '@kit.UIDesignKit';
import { FocusCard } from '../../components/life/FocusCard';

@Component
export struct FocusPage {
  @Consume('pageStack') private stack: NavPathStack;
  build() {
    HdsNavDestination() {
      Scroll() {
        Column({ space: 18 }) {
          FocusCard()
          Text('切换页面后继续计时；回到前台会按真实经过的时间更新。应用进程结束后本轮计时结束，已有历史记录保持原样。')
            .fontSize(13).fontColor($r('app.color.text_secondary')).width('100%')
        }.width('100%').constraintSize({ maxWidth: 650 }).padding(20)
      }.width('100%').height('100%').backgroundColor($r('app.color.background'))
    }.titleMode(HdsNavDestinationTitleMode.MINI)
    .titleBar(hdsPageTitle('番茄钟', () => this.stack.pop()))
  }
}
