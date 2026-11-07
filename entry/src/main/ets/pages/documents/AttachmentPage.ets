import { hdsPageTitle } from '../../ui/navigation/hdsTitleBar';
import { HdsNavDestination, HdsNavDestinationTitleMode } from '@kit.UIDesignKit';
import { common } from '@kit.AbilityKit';
import { fileIo as fs, fileUri, picker } from '@kit.CoreFileKit';
import { util } from '@kit.ArkTS';
import { webview } from '@kit.ArkWeb';
import { PdfView, pdfViewManager, pdfService } from '@kit.PDFKit';
import { Attachment } from '../../models/Workspace';
import { MAX_FILE_BYTES } from '../../config/constants';
import { AttachmentTransfer } from '../../services/files/AttachmentTransfer';
import { onSessionInvalidated, sessionEpoch } from '../../state/cloudSession';

@Component
export struct AttachmentPage {
  @Consume('pageStack') private pageStack: NavPathStack;
  @Prop attachment: Attachment = { id: '', url: '', fileName: '', fileSize: 0, mimeType: '', uploadedAt: '' };
  @State private cachePath: string = '';
  @State private busy: boolean = false;
  @State private progress: number = 0;
  @State private message: string = '';
  @State private text: string = '';
  @State private password: string = '';
  @State private passwordRequired: boolean = false;
  private transfer: AttachmentTransfer = new AttachmentTransfer();
  private pdf: pdfViewManager.PdfController = new pdfViewManager.PdfController();
  private web: webview.WebviewController = new webview.WebviewController();
  private alive: boolean = true;
  private pdfMounted: boolean = false;
  private pdfLoading: boolean = false;
  private stopSessionListener: () => void = () => {};

  aboutToAppear(): void {
    this.stopSessionListener = onSessionInvalidated(() => {
      this.transfer.cancel(); this.releaseFile(); this.message = '账号已变化，请重新登录后读取文件';
    });
  }

  aboutToDisappear(): void {
    this.alive = false; this.password = ''; this.transfer.dispose(); this.stopSessionListener(); this.releaseFile();
  }

  private releaseFile(): void {
    try { this.pdf.releaseDocument(); } catch (_) {}
    if (this.cachePath) {
      try { if (fs.accessSync(this.cachePath)) fs.unlinkSync(this.cachePath); } catch (_) {}
    }
    this.cachePath = ''; this.text = ''; this.password = ''; this.pdfMounted = false;
  }

  private async loadPdf(): Promise<void> {
    if (!this.pdfMounted || !this.cachePath || this.pdfLoading) return;
    this.pdfLoading = true;
    const epoch = sessionEpoch();
    try {
      this.pdf.releaseDocument();
      const result = await this.pdf.loadDocument(this.cachePath, this.password);
      if (!this.alive || epoch !== sessionEpoch()) { this.pdf.releaseDocument(); return; }
      this.passwordRequired = result === pdfService.ParseResult.PARSE_ERROR_PASSWORD;
      this.message = result === pdfService.ParseResult.PARSE_SUCCESS ? '' : this.passwordRequired ? '此 PDF 需要正确密码' : `PDF 无法预览（${result}），可以保存原文件`;
    } catch (error) { if (this.alive) this.message = (error as Error).message; }
    finally { this.pdfLoading = false; }
  }

  private async download(): Promise<void> {
    if (this.busy) return;
    this.busy = true; this.message = '';
    try {
      const path = await this.transfer.download(this.getUIContext().getHostContext() as common.UIAbilityContext, this.attachment,
        (value) => { if (this.alive) this.progress = value; });
      if (!this.alive) { fs.unlinkSync(path); return; }
      this.cachePath = path;
      if (this.attachment.mimeType.startsWith('text/') || /\.(md|txt|csv|html?)$/i.test(this.attachment.fileName)) {
        const file = await fs.open(path, fs.OpenMode.READ_ONLY);
        try {
          const size = Math.min(fs.statSync(file.fd).size, MAX_FILE_BYTES);
          const bytes = new ArrayBuffer(size); const count = await fs.read(file.fd, bytes);
          this.text = util.TextDecoder.create('utf-8', { ignoreBOM: true }).decodeToString(new Uint8Array(bytes, 0, count));
          if (this.attachment.fileSize > MAX_FILE_BYTES) this.message = '仅预览前2 MB内容，保存可获得完整文件';
        } finally { await fs.close(file); }
      }
    } catch (error) { if (this.alive) this.message = (error as Error).message; }
    finally { if (this.alive) this.busy = false; }
  }

  private async saveFile(): Promise<void> {
    if (!this.cachePath) return;
    try {
      const view = new picker.DocumentViewPicker(this.getUIContext().getHostContext() as common.UIAbilityContext);
      const options = new picker.DocumentSaveOptions(); options.newFileNames = [this.attachment.fileName];
      const selected = await view.save(options); if (!selected.length) return;
      const source = await fs.open(this.cachePath, fs.OpenMode.READ_ONLY);
      const target = await fs.open(selected[0], fs.OpenMode.CREATE | fs.OpenMode.WRITE_ONLY | fs.OpenMode.TRUNC);
      try { await fs.copyFile(source.fd, target.fd); } finally { await fs.close(source); await fs.close(target); }
      this.message = '文件已保存到所选位置';
    } catch (error) { this.message = (error as Error).message; }
  }

  build() {
    HdsNavDestination() {
      Column({ space: 12 }) {
        Text(this.attachment.fileName).fontSize(20).fontWeight(FontWeight.Bold).fontColor($r('app.color.text_primary'))
        if (!this.cachePath) {
          Button(this.busy ? `读取中 ${this.progress}%` : '读取私有附件').enabled(!this.busy).onClick(() => this.download())
            .accessibilityText('使用当前账号读取此私有附件')
          if (this.busy) { Progress({ value: this.progress, total: 100 }).width('100%') }
        } else {
          if (this.attachment.mimeType.startsWith('image/')) {
            Image(fileUri.getUriFromPath(this.cachePath)).width('100%').layoutWeight(1).objectFit(ImageFit.Contain)
              .accessibilityText(`附件图片${this.attachment.fileName}`)
          } else if (this.attachment.mimeType === 'application/pdf' || /\.pdf$/i.test(this.attachment.fileName)) {
            PdfView({ controller: this.pdf, pageLayout: pdfService.PageLayout.LAYOUT_SINGLE,
              pageFit: pdfService.PageFit.FIT_WIDTH, isContinuous: true, showScroll: true })
              .width('100%').layoutWeight(1).onAppear(() => { this.pdfMounted = true; this.loadPdf(); })
              .accessibilityText(`PDF附件${this.attachment.fileName}，可连续滚动阅读`)
            if (this.passwordRequired) {
              TextInput({ text: this.password, placeholder: 'PDF 密码' }).type(InputType.Password)
                .onChange((value: string) => { this.password = value; }).accessibilityText('PDF文件密码，仅在本次预览使用')
              Button('打开 PDF').onClick(() => this.loadPdf()).accessibilityText('使用输入的密码打开 PDF')
            }
          } else if (/\.html?$/i.test(this.attachment.fileName) || this.attachment.mimeType === 'text/html') {
            Web({ src: 'about:blank', controller: this.web }).width('100%').layoutWeight(1)
              .javaScriptAccess(false).fileAccess(false).domStorageAccess(false).blockNetwork(true)
              .onControllerAttached(() => this.web.loadData(this.text, 'text/html', 'UTF-8'))
              .accessibilityText('HTML附件静态预览，脚本和网络访问已关闭')
          } else if (this.text) {
            Scroll() { Text(this.text).width('100%').fontColor($r('app.color.text_primary')).copyOption(CopyOptions.LocalDevice) }
              .width('100%').layoutWeight(1).accessibilityText('文本附件正文')
          } else {
            Text('此格式可保存原文件后使用支持它的应用打开。').fontColor($r('app.color.text_secondary')).layoutWeight(1)
          }
          Button('保存原文件').onClick(() => this.saveFile()).accessibilityText('通过系统文件选择器保存完整附件')
        }
        if (this.message) { Text(this.message).fontColor($r('app.color.text_secondary')) }
      }.width('100%').height('100%').padding(20).backgroundColor($r('app.color.background'))
    }.titleMode(HdsNavDestinationTitleMode.MINI)
    .titleBar(hdsPageTitle('附件预览', () => this.pageStack.pop()))
  }
}
