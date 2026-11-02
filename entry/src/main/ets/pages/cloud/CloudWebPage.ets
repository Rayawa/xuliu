import { common } from '@kit.AbilityKit';
import { picker } from '@kit.CoreFileKit';
import { openLink } from '../../services/links/openLink';
import { HdsNavDestination, HdsNavDestinationTitleMode } from '@kit.UIDesignKit';
import { webview } from '@kit.ArkWeb';
import { CLOUD_ORIGIN } from '../../config/constants';

@Component
export struct CloudWebPage {
  @Consume('pageStack') private pageStack: NavPathStack;
  @State private error: string = '';
  private controller: webview.WebviewController = new webview.WebviewController();

  private async chooseFile(result: FileSelectorResult): Promise<void> {
    try {
      const documentPicker = new picker.DocumentViewPicker(this.getUIContext().getHostContext() as common.UIAbilityContext);
      const options = new picker.DocumentSelectOptions(); options.maxSelectNumber = 1;
      result.handleFileList(await documentPicker.select(options));
    } catch (_) { result.handleFileList([]); }
  }

  build() {
    HdsNavDestination() {
      Column({ space: 8 }) {
        Text('云端模式 · AI 与私有附件由序流服务提供').fontSize(13).fontColor($r('app.color.text_secondary')).padding(10)
        if (this.error) { Text(this.error).fontColor($r('app.color.danger')) }
        Web({ src: CLOUD_ORIGIN, controller: this.controller }).layoutWeight(1).width('100%')
          .javaScriptAccess(true).domStorageAccess(true).fileAccess(false).mixedMode(MixedMode.None)
          .onLoadIntercept((event) => {
            const url = event.data.getRequestUrl();
            return !(url === CLOUD_ORIGIN || url.startsWith(`${CLOUD_ORIGIN}/`) || url === 'about:blank');
          })
          .onShowFileSelector((event: OnShowFileSelectorEvent) => { this.chooseFile(event.result); return true; })
          .onErrorReceive(() => { this.error = '页面加载失败，请检查网络后重试'; })
          .accessibilityText('序流官方云端工作台')
        Button('在系统浏览器打开').onClick(async () => {
          try { await openLink(this.getUIContext().getHostContext() as common.UIAbilityContext, CLOUD_ORIGIN); }
          catch (error) { this.error = (error as Error).message; }
        }).accessibilityText('在系统浏览器打开完整序流工作台')
        Button('重新加载').onClick(() => { this.error = ''; this.controller.refresh(); }).accessibilityText('重新加载云端工作台')
      }.width('100%').height('100%').backgroundColor($r('app.color.background'))
    }.titleMode(HdsNavDestinationTitleMode.MINI)
    .titleBar({ content: { title: { mainTitle: '云端工作台' }, backIcon: { action: () => this.pageStack.pop() } } })
    .onBackPressed(() => { if (this.controller.accessBackward()) { this.controller.backward(); return true; } return false; })
  }
}
