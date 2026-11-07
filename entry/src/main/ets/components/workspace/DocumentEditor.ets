import { FrameScheduler } from '../../utils/runtime/FrameScheduler';
import { readCleanClipboard } from '../../services/documents/ClipboardText';
import { pasteAsBlocks } from '../../domain/documents/CleanPaste';
import { TableEditor } from './TableEditor';
import { KEY_ACTIVE, MAX_FILE_BYTES, MAX_DOCUMENT_HISTORY_STEPS, MAX_DOCUMENT_HISTORY_CHARS } from '../../config/constants';
import { common } from '@kit.AbilityKit';
import { LengthMetrics } from '@kit.ArkUI';
import { openLink } from '../../services/links/openLink';
import { privateBlobUrl } from '../../services/files/AttachmentTransfer';
import { Block, Attachment } from '../../models/Workspace';
import { uid } from '../../domain/workspace/WorkspaceDomain';
import { BLOCK_LABELS, BLOCK_TYPES, DOCUMENT_COLOR_NAMES, DOCUMENT_COLOR_RESOURCES, DOCUMENT_SIZE_NAMES, MAX_DOCUMENT_BLOCKS } from '../../config/constants';
import { RichTextBlock } from './RichTextBlock';
import { AttachmentPanel } from './AttachmentPanel';

@Component
export struct DocumentEditor {
  @Prop @Watch('modelChanged') blocks: Block[] = [];
  @Prop @Watch('activityChanged') pageVisible: boolean = true;
  @Prop @Watch('scopeChanged') documentKey: string = '';
  @StorageLink(KEY_ACTIVE) @Watch('activityChanged') private active: boolean = true;
  @State private content: Block[] = [];
  @State private showInsert: boolean = false;
  @State private pasteBusy: boolean = false;
  private alive: boolean = true;
  private pasteGeneration: number = 0;
  private lastEmitted: string = '';
  private frames: FrameScheduler = new FrameScheduler();
  @Prop readOnly: boolean = false;
  onChange: (blocks: Block[]) => void = () => {};
  onPendingChange: (pending: boolean) => void = () => {};
  @State private canUndo: boolean = false;
  @State private canRedo: boolean = false;
  @State private showContents: boolean = false;
  @State private paragraphId: string = '';
  @State private notice: string = '';
  @State private pendingFiles: boolean = false;
  @State private visibleBlocks: number = 20;
  @State private attachmentToolsId: string = '';
  @State private focusId: string = '';
  private undoStack: string[] = [];
  private redoStack: string[] = [];
  private lastEditAt: number = 0;
  private lastGroup: string = '';
  private pendingScopes: Set<string> = new Set();

  aboutToAppear(): void { this.modelChanged(); }
  aboutToDisappear(): void { this.alive = false; this.pasteGeneration++; this.frames.cancel(); this.onPendingChange(false); }
  private activityChanged(): void {
    if (!this.active || !this.pageVisible) { this.pasteGeneration++; this.frames.cancel(); this.pasteBusy = false; this.pending('paste', false); }
  }
  private modelChanged(): void {
    const raw = JSON.stringify(this.blocks); if (raw === this.lastEmitted) return;
    this.content = JSON.parse(raw) as Block[]; this.lastEmitted = raw;
    this.undoStack = []; this.redoStack = []; this.canUndo = false; this.canRedo = false; this.lastGroup = '';
  }
  private scopeChanged(): void {
    this.pasteGeneration++; this.frames.cancel(); this.showInsert = false; this.pasteBusy = false;
    this.pendingScopes.clear(); this.pendingFiles = false; this.onPendingChange(false);
    this.lastEmitted = ''; this.modelChanged(); this.visibleBlocks = 20; this.focusId = ''; this.attachmentToolsId = ''; this.paragraphId = '';
  }
  private trimHistory(): void {
    while (this.undoStack.length + this.redoStack.length > MAX_DOCUMENT_HISTORY_STEPS ||
      this.undoStack.concat(this.redoStack).reduce((sum, text) => sum + text.length, 0) > MAX_DOCUMENT_HISTORY_CHARS) {
      if (this.undoStack.length > 1) this.undoStack.shift(); else if (this.redoStack.length > 1) this.redoStack.shift(); else break;
    }
  }
  private applyContent(next: Block[]): void {
    this.lastEmitted = JSON.stringify(next); this.content = JSON.parse(this.lastEmitted) as Block[];
    this.onChange(JSON.parse(this.lastEmitted) as Block[]);
  }

  private pending(scope: string, value: boolean): void {
    if (value) this.pendingScopes.add(scope); else this.pendingScopes.delete(scope);
    this.pendingFiles = this.pendingScopes.size > 0;
    this.onPendingChange(this.pendingFiles);
  }

  private commit(next: Block[], group: string = ''): boolean {
    if (this.readOnly) return false;
    if (next.length > MAX_DOCUMENT_BLOCKS) { this.notice = '每份文档最多2000个内容块'; return false; }
    const previous = JSON.stringify(this.content); const raw = JSON.stringify(next); if (raw === previous) return true;
    if (!group || group !== this.lastGroup || Date.now() - this.lastEditAt > 800 || !this.undoStack.length) {
      if (previous.length <= MAX_FILE_BYTES) this.undoStack.push(previous);
    }
    this.redoStack = []; this.trimHistory(); this.lastGroup = group; this.lastEditAt = Date.now();
    this.canUndo = this.undoStack.length > 0; this.canRedo = false; this.applyContent(next); return true;
  }
  private undo(): void {
    if (this.readOnly || this.pendingFiles) return;
    const previous = this.undoStack.pop(); if (previous === undefined) return;
    this.redoStack.push(JSON.stringify(this.content)); this.trimHistory(); this.lastGroup = '';
    this.canUndo = this.undoStack.length > 0; this.canRedo = this.redoStack.length > 0;
    this.applyContent(JSON.parse(previous) as Block[]);
  }
  private redo(): void {
    if (this.readOnly || this.pendingFiles) return;
    const next = this.redoStack.pop(); if (next === undefined) return;
    this.undoStack.push(JSON.stringify(this.content)); this.trimHistory(); this.lastGroup = '';
    this.canUndo = this.undoStack.length > 0; this.canRedo = this.redoStack.length > 0;
    this.applyContent(JSON.parse(next) as Block[]);
  }

  private patch(id: string, change: (block: Block) => void, group: string = ''): void {
    const next = JSON.parse(JSON.stringify(this.content)) as Block[];
    const block = next.find((item) => item.id === id); if (!block) return;
    change(block); this.commit(next, group);
  }

  private update(id: string, text: string): void { this.patch(id, (item) => { item.url = text; }, `url:${id}`); }
  private value(block: Block): string { return block.url ?? ''; }
  private addBlock(type: string): void {
    if (this.pendingFiles) return;
    const block: Block = { id: uid(), type };
    if (type === 'table') block.rows = [['项目', '内容'], ['', '']];
    else if (type === 'heading') { block.text = ''; block.headingLevel = 2; }
    else if (type === 'checklist') { block.text = ''; block.checked = false; }
    else if (type === 'text') block.text = '';
    if (this.commit(this.content.concat([block]))) { this.visibleBlocks = this.content.length; this.showInsert = false; }
  }
  private async pasteBlocks(): Promise<void> {
    if (this.readOnly || this.pendingFiles || !this.active || !this.pageVisible) return;
    const generation = ++this.pasteGeneration; const key = this.documentKey; this.pasteBusy = true; this.pending('paste', true);
    try {
      const value = await readCleanClipboard(this.getUIContext().getHostContext() as common.UIAbilityContext);
      if (!this.alive || !this.active || !this.pageVisible || this.readOnly || generation !== this.pasteGeneration || key !== this.documentKey) return;
      const blocks = pasteAsBlocks(value, uid); if (!blocks.length) throw new Error('剪贴板没有可加入文档的正文');
      if (this.commit(this.content.concat(blocks))) {
        this.visibleBlocks = Math.min(this.content.length, Math.max(this.visibleBlocks, 20)); this.showInsert = false;
        this.notice = `已在文档末尾加入${blocks.length}个新内容块，原内容保留，可撤销${value.notice ? `。${value.notice}` : ''}`;
      }
    } catch (error) { if (this.alive && generation === this.pasteGeneration) this.notice = (error as Error).message; }
    finally { if (generation === this.pasteGeneration) { this.pasteBusy = false; this.pending('paste', false); } }
  }

  private move(id: string, delta: number): void {
    const next = this.content.slice(); const index = next.findIndex((item) => item.id === id); const to = index + delta;
    if (index < 0 || to < 0 || to >= next.length) return;
    const item = next.splice(index, 1)[0]; next.splice(to, 0, item); this.commit(next);
  }

  private blockAttachment(block: Block): Attachment[] {
    if (!block.url || !privateBlobUrl(block.url)) return [];
    return [{ id: block.id, url: block.url, fileName: block.fileName || '附件', fileSize: block.fileSize ?? 0,
      mimeType: block.mimeType || (block.type === 'image' ? 'image/jpeg' : 'application/octet-stream'), uploadedAt: block.uploadedAt ?? '' }];
  }

  private async paragraphColor(id: string, index: number): Promise<void> {
    try {
      const context = this.getUIContext().getHostContext(); if (!context) return;
      const color = context.resourceManager.getColorSync(DOCUMENT_COLOR_RESOURCES[index].id);
      this.patch(id, (item) => { item.color = `#${(color & 0xFFFFFF).toString(16).padStart(6, '0')}`; });
    } catch (error) { this.notice = (error as Error).message; }
  }

  @Builder
  private paragraphTools(block: Block) {
    Flex({ wrap: FlexWrap.Wrap, space: { main: LengthMetrics.vp(6), cross: LengthMetrics.vp(6) } }) {
      if (block.type === 'heading') {
        Select([{ value: '一级标题' }, { value: '二级标题' }, { value: '三级标题' }]).value(`${block.headingLevel ?? 2}级标题`)
          .onSelect((index: number) => this.patch(block.id, (item) => { item.headingLevel = index + 1; }))
          .accessibilityText('设置标题层级')
      }
      Select([{ value: '小字' }, { value: '正文' }, { value: '大字' }, { value: '特大' }]).value('段落字号')
        .onSelect((index: number) => this.patch(block.id, (item) => { item.fontSize = DOCUMENT_SIZE_NAMES[index]; }))
        .accessibilityText('设置整段字号')
      Select([{ value: '无衬线' }, { value: '衬线' }, { value: '等宽' }]).value('段落字体')
        .onSelect((index: number) => this.patch(block.id, (item) => { item.fontFamily = ['sans', 'serif', 'mono'][index]; }))
        .accessibilityText('设置整段字体')
      Select([{ value: '左对齐' }, { value: '居中' }, { value: '右对齐' }]).value('对齐')
        .onSelect((index: number) => this.patch(block.id, (item) => { item.textAlign = ['left', 'center', 'right'][index]; }))
        .accessibilityText('设置整段对齐方式')
      Select(DOCUMENT_COLOR_NAMES.map((value): SelectOption => ({ value }))).value('段落颜色')
        .onSelect((index: number) => this.paragraphColor(block.id, index)).accessibilityText('设置整段文字颜色')
      Button('段落加粗').onClick(() => this.patch(block.id, (item) => { item.fontWeight = item.fontWeight === 'bold' ? 'normal' : 'bold'; }))
        .accessibilityText('切换整段加粗')
      Button('段落斜体').onClick(() => this.patch(block.id, (item) => { item.fontStyle = item.fontStyle === 'italic' ? 'normal' : 'italic'; }))
        .accessibilityText('切换整段斜体')
    }.width('100%')
  }

  @Builder
  private insertTools() {
    if (this.showInsert && !this.readOnly) {
      Flex({ wrap: FlexWrap.Wrap, space: { main: LengthMetrics.vp(8), cross: LengthMetrics.vp(8) } }) {
        ForEach(BLOCK_TYPES, (type: string, index: number) => {
          Button(BLOCK_LABELS[index]).enabled(!this.pendingFiles).onClick(() => this.addBlock(type)).accessibilityText(`在文档末尾添加${BLOCK_LABELS[index]}内容块`)
        }, (type: string) => type)
        Text('粘贴为新内容块').fontColor($r('app.color.text_secondary'))
        PasteButton().enabled(!this.pendingFiles).onClick((_event: ClickEvent, result: PasteButtonOnClickResult) => {
          if (result === PasteButtonOnClickResult.SUCCESS) this.pasteBlocks(); else this.notice = '未获得本次粘贴授权，文档未改变';
        })
      }.width('100%').accessibilityDescription('粘贴为新内容块会把完整文字加入文档末尾，不覆盖原内容，较长正文自动分块并保留局部格式')
    }
  }

  build() {
    Column({ space: 12 }) {
      Text('资料与笔记').fontSize(20).fontWeight(FontWeight.Bold).width('100%').fontColor($r('app.color.text_primary'))
      Flex({ wrap: FlexWrap.Wrap, space: { main: LengthMetrics.vp(8), cross: LengthMetrics.vp(8) } }) {
        if (this.content.some((block) => block.type === 'heading')) {
          Button(this.showContents ? '收起目录' : '文档目录').onClick(() => { this.showContents = !this.showContents; }).accessibilityText('展开或收起文档标题目录')
        }
        if (!this.readOnly) {
          Button(this.showInsert ? '收起插入' : '插入内容').onClick(() => { this.showInsert = !this.showInsert; }).accessibilityText('展开内容块和整理粘贴的紧凑插入菜单')
          Button('撤销').enabled(this.canUndo && !this.pendingFiles).onClick(() => this.undo()).accessibilityText('撤销最近文档编辑或内容块删除')
          Button('重做').enabled(this.canRedo && !this.pendingFiles).onClick(() => this.redo()).accessibilityText('重做已撤销的文档编辑')
        }
      }
      this.insertTools()
      if (this.pasteBusy) { Text('正在整理完整剪贴板内容…').fontColor($r('app.color.text_secondary')) }
      if (this.showContents && this.content.some((block) => block.type === 'heading')) {
        Column({ space: 6 }) {
          ForEach(this.content.filter((item) => item.type === 'heading'), (item: Block) => {
            Button(item.text || '未命名标题').onClick(() => {
              this.visibleBlocks = Math.max(this.visibleBlocks, this.content.findIndex((block) => block.id === item.id) + 1);
              this.focusId = item.id;
              this.frames.request(this.getUIContext(), () => {
                if (!this.alive || !this.pageVisible) return;
                try { this.getUIContext().getFocusController().requestFocus(this.readOnly ? `block-${item.id}` : `rich-${item.id}`); } catch (_) {}
              });
            })
              .accessibilityText(`跳转到${item.text || '未命名标题'}`)
          }, (item: Block) => item.id)
        }.width('100%').alignItems(HorizontalAlign.Start)
      }
      ForEach(this.content.slice(0, this.visibleBlocks), (block: Block, index: number) => {
        Column({ space: 10 }) {
          if (!this.readOnly) {
            Flex({ wrap: FlexWrap.Wrap, space: { main: LengthMetrics.vp(6), cross: LengthMetrics.vp(6) } }) {
              Select(BLOCK_LABELS.map((value): SelectOption => ({ value })))
                .enabled(!this.pendingFiles).selected(Math.max(0, BLOCK_TYPES.indexOf(block.type))).value(BLOCK_LABELS[Math.max(0, BLOCK_TYPES.indexOf(block.type))])
                .onSelect((selected: number) => this.patch(block.id, (item) => { item.type = BLOCK_TYPES[selected]; if (item.type === 'heading') item.headingLevel = 2; }))
                .accessibilityText(`第${index + 1}块内容类型`)
              Button('上移').onClick(() => this.move(block.id, -1)).enabled(index > 0 && !this.pendingFiles).accessibilityText('上移内容块')
              Button('下移').onClick(() => this.move(block.id, 1)).enabled(index < this.content.length - 1 && !this.pendingFiles).accessibilityText('下移内容块')
              Button('段落样式').onClick(() => { this.paragraphId = this.paragraphId === block.id ? '' : block.id; }).accessibilityText('展开或收起整段样式工具')
              Button('删除').enabled(!this.pendingFiles).fontColor($r('app.color.danger'))
                .onClick(() => this.commit(this.content.filter((item) => item.id !== block.id))).accessibilityText(`删除第${index + 1}块内容，可撤销`)
            }
            if (this.paragraphId === block.id) { this.paragraphTools(block) }
          }
          if (block.type === 'checklist') {
            Checkbox().select(block.checked ?? false).enabled(!this.readOnly)
              .onChange((value: boolean) => this.patch(block.id, (item) => { item.checked = value; })).accessibilityText(`待办：${block.text ?? ''}`)
          }
          if (block.type === 'image' && block.url && !privateBlobUrl(block.url)) {
            Image(block.url).width('100%').height(180).objectFit(ImageFit.Contain).accessibilityText(block.text || block.fileName || '笔记图片')
          }
          if (['text', 'heading', 'checklist'].includes(block.type)) {
            RichTextBlock({ block, pageVisible: this.pageVisible, readOnly: this.readOnly, focusRequested: this.focusId === block.id,
              onPendingChange: (value: boolean) => this.pending(`paste:${block.id}`, value), onChange: (value: Block) => this.patch(value.id, (item) => {
              item.text = value.text; item.inlineRuns = value.inlineRuns;
            }, `text:${value.id}`) })
          } else if (block.type === 'table') {
            TableEditor({ rows: block.rows ?? [], pageVisible: this.pageVisible, readOnly: this.readOnly, blockId: block.id,
              onPendingChange: (value: boolean) => this.pending(`table:${block.id}`, value),
              onChange: (rows: string[][], group: string) => this.patch(block.id, (item) => { item.rows = rows; }, group ? `table:${block.id}:${group}` : '') })
          } else {
            if (!this.readOnly) {
              TextInput({ text: block.text ?? '', placeholder: '标题或说明（可选）' }).maxLength(4000)
                .onChange((value: string) => this.patch(block.id, (item) => { item.text = value; item.inlineRuns = undefined; }, `caption:${block.id}`))
                .accessibilityText('图片、链接或文件的标题与说明')
              TextArea({ text: this.value(block), placeholder: 'https://…' })
                .constraintSize({ minHeight: 70, maxHeight: 220 }).width('100%').fontColor($r('app.color.text_primary'))
                .backgroundColor($r('app.color.surface_secondary')).onChange((value: string) => this.update(block.id, value))
                .accessibilityText(`第${index + 1}块${BLOCK_LABELS[Math.max(0, BLOCK_TYPES.indexOf(block.type))]}`)
            }
          }
          if (block.type === 'link' && block.url) {
            Button('打开链接').onClick(async () => {
              try { await openLink(this.getUIContext().getHostContext() as common.UIAbilityContext, block.url ?? ''); }
              catch (error) { this.notice = (error as Error).message; }
            }).accessibilityText(`打开笔记链接${block.text ?? ''}`)
          }
          if (block.type === 'image' || block.type === 'file') {
            AttachmentPanel({ files: this.blockAttachment(block), title: block.type === 'image' ? '图片文件' : '文件', scopeId: block.id,
              readOnly: this.readOnly, imagesOnly: block.type === 'image', onPendingChange: (value: boolean) => this.pending(`file:${block.id}`, value),
              onChange: (files: Attachment[]) => this.patch(block.id, (item) => {
                const file = files[files.length - 1]; item.url = file?.url; item.fileName = file?.fileName;
                item.fileSize = file?.fileSize; item.mimeType = file?.mimeType; item.uploadedAt = file?.uploadedAt;
              }) })
          }
          if (['text', 'heading', 'checklist'].includes(block.type)) {
            if (!this.readOnly) {
              Button('内嵌图片与文件').enabled(!this.pendingFiles).onClick(() => { this.attachmentToolsId = this.attachmentToolsId === block.id ? '' : block.id; })
                .accessibilityText('展开或收起此内容块的内嵌附件')
            }
            if (this.attachmentToolsId === block.id || (block.embeddedImages?.length ?? 0) > 0) {
              AttachmentPanel({ files: block.embeddedImages ?? [], title: '正文内嵌图片', scopeId: `images:${block.id}`, imagesOnly: true,
              readOnly: this.readOnly, onPendingChange: (value: boolean) => this.pending(`images:${block.id}`, value),
              onChange: (files: Attachment[]) => this.patch(block.id, (item) => { item.embeddedImages = files; }) })
            }
            if (this.attachmentToolsId === block.id || (block.embeddedFiles?.length ?? 0) > 0) {
              AttachmentPanel({ files: block.embeddedFiles ?? [], title: '正文内嵌文件', scopeId: `embedded:${block.id}`,
              readOnly: this.readOnly, onPendingChange: (value: boolean) => this.pending(`embedded:${block.id}`, value),
              onChange: (files: Attachment[]) => this.patch(block.id, (item) => { item.embeddedFiles = files; }) })
            }
          }
        }.id(`block-${block.id}`).focusable(true).width('100%').padding(12).borderRadius(12).backgroundColor($r('app.color.surface'))
      }, (block: Block, index: number) => `${this.documentKey}:${block.id}-${index}-${block.type}`)
      if (this.visibleBlocks < this.content.length) {
        Button(`继续显示内容（${this.visibleBlocks}/${this.content.length}）`).onClick(() => { this.visibleBlocks += 20; })
          .accessibilityText('继续显示下一批文档内容，全部原始内容均已保留')
      }
      if (!this.readOnly) {
        Button('＋ 添加内容块').enabled(!this.pendingFiles).onClick(() => this.addBlock('text'))
          .accessibilityText('添加正文内容块')
      }
      if (this.content.length === 0) { Text('把资料、待办和想法放在这里').fontColor($r('app.color.text_secondary')).padding(16) }
      if (this.notice) { Text(this.notice).fontColor($r('app.color.danger')) }
    }.width('100%').alignItems(HorizontalAlign.Start)
  }
}
