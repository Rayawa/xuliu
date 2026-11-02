import { common } from '@kit.AbilityKit';
import { LengthMetrics } from '@kit.ArkUI';
import { Attachment } from '../../models/Workspace';
import { AttachmentTransfer, ChosenAttachment, chooseAttachment } from '../../services/files/AttachmentTransfer';
import { currentCloudAccount } from '../../state/cloudSession';
import { KEY_CLOUD_SESSION, ROUTE_ATTACHMENT, ROUTE_CLOUD, MAX_ATTACHMENTS } from '../../config/constants';

@Component
export struct AttachmentPanel {
  @Consume('pageStack') private pageStack: NavPathStack;
  @Prop files: Attachment[] = [];
  @Prop scopeId: string = '';
  @Prop title: string = '附件';
  @Prop readOnly: boolean = false;
  @Prop imagesOnly: boolean = false;
  onChange: (files: Attachment[]) => void = () => {};
  onPendingChange: (pending: boolean) => void = () => {};
  @StorageLink(KEY_CLOUD_SESSION) @Watch('sessionChanged') private sessionRevision: number = 0;
  @State private chosen: ChosenAttachment | undefined = undefined;
  @State private busy: boolean = false;
  @State private loggedIn: boolean = false;
  @State private progress: number = 0;
  @State private message: string = '';
  @State private removed: Attachment | undefined = undefined;
  private removedIndex: number = 0;
  private transfer: AttachmentTransfer = new AttachmentTransfer();
  private alive: boolean = true;
  private attempt: number = 0;

  aboutToAppear(): void { this.sessionChanged(); }
  private sessionChanged(): void { this.loggedIn = !!currentCloudAccount(); }

  aboutToDisappear(): void {
    this.alive = false; this.transfer.dispose(); this.onPendingChange(false);
  }

  private async choose(): Promise<void> {
    try {
      if (this.files.length >= MAX_ATTACHMENTS) throw new Error('每个附件区域最多50个文件');
      const selected = await chooseAttachment(this.getUIContext().getHostContext() as common.UIAbilityContext);
      if (!selected || !this.alive) return;
      if (this.imagesOnly && !selected.mimeType.startsWith('image/')) throw new Error('请选择 JPG、PNG、WEBP 或 GIF 图片');
      this.chosen = selected; this.onPendingChange(true); this.message = '';
    } catch (error) { if (this.alive) this.message = (error as Error).message; }
  }

  private async upload(): Promise<void> {
    if (!this.chosen || this.busy) return;
    const attempt = ++this.attempt;
    this.busy = true; this.onPendingChange(true);
    try {
      const attachment = await this.transfer.upload(this.chosen, this.scopeId, (value) => {
        if (this.alive && attempt === this.attempt) this.progress = value;
      });
      if (!this.alive || attempt !== this.attempt) return;
      this.onChange(this.files.concat([attachment])); this.chosen = undefined;
      this.message = '上传完成，保存文档后保留关联'; this.onPendingChange(false);
    } catch (error) { if (this.alive && attempt === this.attempt) this.message = (error as Error).message; }
    finally { if (this.alive && attempt === this.attempt) { this.busy = false; this.progress = 0; } }
  }

  build() {
    Column({ space: 10 }) {
      Text(this.title).fontSize(17).fontWeight(FontWeight.Medium).fontColor($r('app.color.text_primary')).width('100%')
      ForEach(this.files, (file: Attachment, index: number) => {
        Flex({ wrap: FlexWrap.Wrap, space: { main: LengthMetrics.vp(8), cross: LengthMetrics.vp(8) } }) {
          Text(`${file.fileName} · ${(file.fileSize / 1024).toFixed(1)} KB`).fontColor($r('app.color.text_primary'))
          Button('预览 / 保存').onClick(() => this.pageStack.pushPath({ name: ROUTE_ATTACHMENT, param: file }))
            .accessibilityText(`预览或保存附件${file.fileName}`)
          if (!this.readOnly) {
            Button('移除').enabled(!this.busy).onClick(() => {
              this.removed = file; this.removedIndex = index;
              this.onChange(this.files.filter((item) => item.id !== file.id));
            }).accessibilityText(`移除文档中的${file.fileName}关联，不删除云端文件`)
          }
        }.width('100%')
      }, (file: Attachment) => file.id)
      if (this.removed && !this.readOnly) {
        Button('撤销移除附件').onClick(() => {
          if (!this.removed || this.files.length >= MAX_ATTACHMENTS || this.files.some((file) => file.id === this.removed?.id)) return;
          const files = this.files.slice(); files.splice(Math.min(this.removedIndex, files.length), 0, this.removed);
          this.onChange(files); this.removed = undefined;
        }).accessibilityText('恢复最近移除的附件关联')
      }
      if (!this.readOnly) {
        if (!this.loggedIn) {
          Button('登录后上传附件').onClick(() => this.pageStack.pushPath({ name: ROUTE_CLOUD })).accessibilityText('登录序流账号以使用私有附件')
        } else {
          Button('选择文件').enabled(!this.busy).onClick(() => this.choose()).accessibilityText(`选择${this.title}文件，最多50 MB`)
        }
        if (this.chosen) {
          Text(`待上传：${this.chosen.name} · ${(this.chosen.size / 1024).toFixed(1)} KB`).fontColor($r('app.color.text_secondary'))
          Button(this.busy ? `正在上传 ${this.progress}%` : '上传所选文件').enabled(!this.busy).onClick(() => this.upload())
            .accessibilityText('将所选文件上传至当前账号的私有资料库')
          Button(this.busy ? '取消上传' : '取消所选文件').onClick(() => {
            this.attempt++; this.transfer.cancel(); this.chosen = undefined; this.busy = false; this.onPendingChange(false);
          }).accessibilityText('取消此文件上传或选择')
          if (this.busy) { Progress({ value: this.progress, total: 100 }).width('100%').accessibilityText(`附件上传进度百分之${this.progress}`) }
        }
      }
      if (this.message) { Text(this.message).fontColor($r('app.color.text_secondary')) }
    }.width('100%').alignItems(HorizontalAlign.Start)
  }
}
