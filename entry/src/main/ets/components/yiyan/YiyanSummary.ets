import { KEY_CLOUD_SESSION, KEY_ACTIVE, KEY_YIYAN_CLARITY, YIYAN_DEFAULT_CLARITY, ROUTE_YIYAN } from '../../config/constants';
import { YiyanView, YiyanCard, emptyYiyanView } from '../../models/YiyanModels';
import { yiyanService } from '../../services/yiyan/YiyanService';
import { YiyanQuote } from './YiyanQuote';

@Component
export struct YiyanSummary {
  @Consume('pageStack') private stack: NavPathStack;
  @StorageLink(KEY_CLOUD_SESSION) @Watch('sessionChanged') private session: number = 0;
  @StorageLink(KEY_ACTIVE) @Watch('visibilityChanged') private active: boolean = true;
  @StorageLink(KEY_YIYAN_CLARITY) private clarity: number = YIYAN_DEFAULT_CLARITY;
  @State private view: YiyanView = emptyYiyanView();
  private visible: boolean = false;
  private stopListening: (() => void) | undefined;
  aboutToDisappear(): void { this.stopListening?.(); this.stopListening = undefined; }
  private sessionChanged(): void { if (this.visible && this.active) yiyanService().start(); }
  private visibilityChanged(): void {
    if (this.visible && this.active) {
      if (!this.stopListening) { this.stopListening = yiyanService().subscribe((view) => { this.view = view; }); yiyanService().start(); }
    } else { this.stopListening?.(); this.stopListening = undefined; }
  }
  build() {
    Column({ space: 14 }) {
      Row() {
        Text('一言').fontSize(21).fontWeight(FontWeight.Bold).fontColor($r('app.color.text_primary')).layoutWeight(1)
        Button('图文与文集').onClick(() => this.stack.pushPath({ name: ROUTE_YIYAN })).accessibilityText('打开一言图文、连接设置、收藏和文集')
      }.width('100%')
      if (this.view.card) {
        ForEach([this.view.card], (card: YiyanCard) => { YiyanQuote({ card, clarity: this.clarity, compact: true }) }, (card: YiyanCard) => JSON.stringify(card))
      } else { Text('留一点空白，读一句喜欢的话。').fontColor($r('app.color.text_secondary')).width('100%') }
      if (this.view.connected) {
        Button(this.view.busy ? '正在读取…' : '换一句').enabled(!this.view.busy).onClick(() => yiyanService().changeCard()).accessibilityText('换一条一言历史图文')
      } else { Button('连接一言').onClick(() => this.stack.pushPath({ name: ROUTE_YIYAN })).accessibilityText('打开一言账号连接页') }
      if (this.view.notice && !this.view.library && !this.view.loginOpen) { Text(this.view.notice).fontSize(13).fontColor($r('app.color.text_secondary')) }
    }.padding(18).width('100%').borderRadius(18).backgroundColor($r('app.color.surface'))
      .border({ width: 1, color: $r('app.color.border') })
      .shadow({ radius: 12, color: $r('app.color.card_shadow'), offsetY: 3 })
      .onVisibleAreaChange([0], (visible: boolean) => { this.visible = visible; this.visibilityChanged(); })
  }
}
