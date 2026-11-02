import { common } from '@kit.AbilityKit';
import { LengthMetrics } from '@kit.ArkUI';
import { openLink } from '../../services/links/openLink';
import { privateBlobUrl } from '../../services/files/AttachmentTransfer';
import { Block, Attachment } from '../../models/Workspace';
import { uid } from '../../domain/workspace/WorkspaceDomain';
import { BLOCK_LABELS, BLOCK_TYPES, DOCUMENT_COLOR_NAMES, DOCUMENT_COLOR_RESOURCES, DOCUMENT_SIZE_NAMES, MAX_DOCUMENT_BLOCKS, MAX_TABLE_ROWS, MAX_TABLE_COLUMNS, MAX_TABLE_CELL_CHARS } from '../../config/constants';
import { RichTextBlock } from './RichTextBlock';
import { AttachmentPanel } from './AttachmentPanel';

@Component
export struct DocumentEditor {
  @Prop blocks: Block[] = [];
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

  private pending(scope: string, value: boolean): void {
    if (value) this.pendingScopes.add(scope); else this.pendingScopes.delete(scope);
    this.pendingFiles = this.pendingScopes.size > 0;
    this.onPendingChange(this.pendingFiles);
  }

  private commit(next: Block[], group: string = ''): void {
    if (this.readOnly) return;
    if (next.length > MAX_DOCUMENT_BLOCKS) { this.notice = '每份文档最多2000个内容块'; return; }
    const previous = JSON.stringify(this.blocks);
    if (JSON.stringify(next) === previous) return;
    if (!group || group !== this.lastGroup || Date.now() - this.lastEditAt > 800 || !this.undoStack.length) {
      if (previous.length <= 500000) this.undoStack.push(previous);
      while (this.undoStack.length > 20 || this.undoStack.reduce((sum, text) => sum + text.length, 0) > 1000000) this.undoStack.shift();
    }
    this.lastGroup = group; this.lastEditAt = Date.now(); this.redoStack = [];
    this.canUndo = this.undoStack.length > 0; this.canRedo = false; this.onChange(next);
  }

  private undo(): void {
    if (this.pendingFiles) return;
    const previous = this.undoStack.pop(); if (previous === undefined) return;
    this.redoStack.push(JSON.stringify(this.blocks));
    this.canUndo = this.undoStack.length > 0; this.canRedo = true; this.lastGroup = '';
    this.onChange(JSON.parse(previous) as Block[]);
  }

  private redo(): void {
    if (this.pendingFiles) return;
    const next = this.redoStack.pop(); if (next === undefined) return;
    this.undoStack.push(JSON.stringify(this.blocks));
    this.canUndo = true; this.canRedo = this.redoStack.length > 0; this.lastGroup = '';
    this.onChange(JSON.parse(next) as Block[]);
  }

  private patch(id: string, change: (block: Block) => void, group: string = ''): void {
    const next = JSON.parse(JSON.stringify(this.blocks)) as Block[];
    const block = next.find((item) => item.id === id); if (!block) return;
    change(block); this.commit(next, group);
  }

  private update(id: string, text: string): void {
    const block = this.blocks.find((item) => item.id === id); if (!block) return;
    if (block.type === 'table') {
      const rows = text.split('\n').map((line) => line.split('\t'));
      if (rows.length > MAX_TABLE_ROWS || rows.some((row) => row.length > MAX_TABLE_COLUMNS || row.some((cell) => cell.length > MAX_TABLE_CELL_CHARS))) {
        this.notice = '表格最多100行、30列，每格最多500字'; return;
      }
      this.patch(id, (item) => { item.rows = rows; }, `table:${id}`);
    } else this.patch(id, (item) => { item.url = text; }, `url:${id}`);
  }

  private value(block: Block): string {
    if (block.type === 'table') return (block.rows ?? []).map((row) => row.join('\t')).join('\n');
    return block.url ?? '';
  }

  private move(id: string, delta: number): void {
    const next = this.blocks.slice(); const index = next.findIndex((item) => item.id === id); const to = index + delta;
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
  private tablePreview(block: Block) {
    if ((block.rows?.length ?? 0) > 0) {
      Scroll() {
        Column({ space: 2 }) {
          ForEach((block.rows ?? []).slice(0, 20), (row: string[], rowIndex: number) => {
            Row({ space: 2 }) {
              ForEach(row, (cell: string, columnIndex: number) => {
                Text(cell || ' ').width(140).padding(8).fontColor($r('app.color.text_primary'))
                  .backgroundColor($r('app.color.surface_secondary')).copyOption(CopyOptions.LocalDevice)
                  .accessibilityText(`第${rowIndex + 1}行第${columnIndex + 1}列，${cell || '空白'}`)
              }, (_cell: string, columnIndex: number) => String(columnIndex))
            }
          }, (_row: string[], rowIndex: number) => String(rowIndex))
        }
      }.scrollable(ScrollDirection.Horizontal).width('100%')
      if ((block.rows?.length ?? 0) > 20) { Text('预览前20行，下方可编辑完整表格').fontColor($r('app.color.text_secondary')) }
    }
  }

  build() {
    Column({ space: 12 }) {
      Text('资料与笔记').fontSize(20).fontWeight(FontWeight.Bold).width('100%').fontColor($r('app.color.text_primary'))
      Flex({ wrap: FlexWrap.Wrap, space: { main: LengthMetrics.vp(8), cross: LengthMetrics.vp(8) } }) {
        Button(this.showContents ? '收起目录' : '文档目录').onClick(() => { this.showContents = !this.showContents; }).accessibilityText('展开或收起文档标题目录')
        if (!this.readOnly) {
          Button('撤销').enabled(this.canUndo && !this.pendingFiles).onClick(() => this.undo()).accessibilityText('撤销最近文档编辑或内容块删除')
          Button('重做').enabled(this.canRedo && !this.pendingFiles).onClick(() => this.redo()).accessibilityText('重做已撤销的文档编辑')
        }
      }
      if (this.showContents) {
        Column({ space: 6 }) {
          ForEach(this.blocks.filter((item) => item.type === 'heading'), (item: Block) => {
            Button(item.text || '未命名标题').onClick(() => {
              this.visibleBlocks = Math.max(this.visibleBlocks, this.blocks.findIndex((block) => block.id === item.id) + 1);
              this.focusId = item.id;
              this.getUIContext().getFocusController().requestFocus(`rich-${item.id}`);
            })
              .accessibilityText(`跳转到${item.text || '未命名标题'}`)
          }, (item: Block) => item.id)
        }.width('100%').alignItems(HorizontalAlign.Start)
      }
      ForEach(this.blocks.slice(0, this.visibleBlocks), (block: Block, index: number) => {
        Column({ space: 10 }) {
          if (!this.readOnly) {
            Flex({ wrap: FlexWrap.Wrap, space: { main: LengthMetrics.vp(6), cross: LengthMetrics.vp(6) } }) {
              Select(BLOCK_LABELS.map((value): SelectOption => ({ value })))
                .enabled(!this.pendingFiles).selected(Math.max(0, BLOCK_TYPES.indexOf(block.type))).value(BLOCK_LABELS[Math.max(0, BLOCK_TYPES.indexOf(block.type))])
                .onSelect((selected: number) => this.patch(block.id, (item) => { item.type = BLOCK_TYPES[selected]; if (item.type === 'heading') item.headingLevel = 2; }))
                .accessibilityText(`第${index + 1}块内容类型`)
              Button('上移').onClick(() => this.move(block.id, -1)).enabled(index > 0 && !this.pendingFiles).accessibilityText('上移内容块')
              Button('下移').onClick(() => this.move(block.id, 1)).enabled(index < this.blocks.length - 1 && !this.pendingFiles).accessibilityText('下移内容块')
              Button('段落样式').onClick(() => { this.paragraphId = this.paragraphId === block.id ? '' : block.id; }).accessibilityText('展开或收起整段样式工具')
              Button('删除').enabled(!this.pendingFiles).fontColor($r('app.color.danger'))
                .onClick(() => this.commit(this.blocks.filter((item) => item.id !== block.id))).accessibilityText(`删除第${index + 1}块内容，可撤销`)
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
            RichTextBlock({ block, readOnly: this.readOnly, focusRequested: this.focusId === block.id, onChange: (value: Block) => this.patch(value.id, (item) => {
              item.text = value.text; item.inlineRuns = value.inlineRuns;
            }, `text:${value.id}`) }).id(`rich-${block.id}`)
          } else {
            if (block.type === 'table') { this.tablePreview(block) }
            if (!this.readOnly) {
              TextArea({ text: this.value(block), placeholder: block.type === 'table' ? '粘贴表格：列用制表符分隔，行用换行分隔' : 'https://…' })
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
        }.width('100%').padding(12).borderRadius(12).backgroundColor($r('app.color.surface'))
      }, (block: Block, index: number) => `${block.id}-${index}-${block.type}`)
      if (this.visibleBlocks < this.blocks.length) {
        Button(`继续显示内容（${this.visibleBlocks}/${this.blocks.length}）`).onClick(() => { this.visibleBlocks += 20; })
          .accessibilityText('继续显示下一批文档内容，全部原始内容均已保留')
      }
      if (!this.readOnly) {
        Button('＋ 添加内容块').onClick(() => { this.visibleBlocks = this.blocks.length + 1; this.commit(this.blocks.concat([{ id: uid(), type: 'text', text: '' } as Block])); })
          .accessibilityText('添加正文内容块')
      }
      if (this.blocks.length === 0) { Text('把资料、待办和想法放在这里').fontColor($r('app.color.text_secondary')).padding(16) }
      if (this.notice) { Text(this.notice).fontColor($r('app.color.danger')) }
    }.width('100%').alignItems(HorizontalAlign.Start)
  }
}
