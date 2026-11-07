import { common } from '@kit.AbilityKit';
import { KEY_ACTIVE } from '../../config/constants';
import { readCleanClipboard } from '../../services/documents/ClipboardText';
import { insertPaste } from '../../domain/documents/CleanPaste';
import { compactRuns, sliceRuns } from '../../domain/documents/RichText';
import { LengthMetrics } from '@kit.ArkUI';
import { Block, InlineRun } from '../../models/Workspace';
import { editText, formatRuns, normalizedRuns, runAt } from '../../domain/documents/RichText';
import { DOCUMENT_COLOR_NAMES, DOCUMENT_COLOR_RESOURCES, DOCUMENT_SIZE_NAMES, MAX_BLOCK_TEXT_CHARS, MAX_DOCUMENT_BLOCKS } from '../../config/constants';

interface NativePaste { before: Block; start: number; end: number; }

@Component
export struct RichTextBlock {
  @Prop @Watch('modelChanged') block: Block = { id: '', type: 'text', text: '' };
  @Prop @Watch('focusChanged') focusRequested: boolean = false;
  @Prop @Watch('activityChanged') pageVisible: boolean = true;
  @Prop readOnly: boolean = false;
  onChange: (block: Block) => void = () => {};
  onPendingChange: (pending: boolean) => void = () => {};
  @StorageLink(KEY_ACTIVE) @Watch('activityChanged') private active: boolean = true;
  @State private pasteBusy: boolean = false;
  private alive: boolean = true;
  private pasteGeneration: number = 0;
  private nativePaste: NativePaste | undefined;
  @State private showFormat: boolean = false;
  @State private notice: string = '';
  private controller: RichEditorController = new RichEditorController();
  @State private ready: boolean = false;

  aboutToAppear(): void { this.draft = JSON.parse(JSON.stringify(this.block)) as Block; }
  aboutToDisappear(): void { this.alive = false; this.pasteGeneration++; this.nativePaste = undefined; this.onPendingChange(false); }
  private activityChanged(): void { if (!this.active || !this.pageVisible) { this.pasteGeneration++; this.nativePaste = undefined; this.pasteBusy = false; this.onPendingChange(false); } }
  private changing: boolean = false;
  private lastModel: string = '';
  private draft: Block = { id: '', type: 'text', text: '' };
  private selectionStart: number = 0;
  private selectionEnd: number = 0;
  private typingStyle: InlineRun | undefined;

  private focusChanged(): void {
    if (this.alive && this.ready && this.pageVisible && this.focusRequested) this.getUIContext().getFocusController().requestFocus(`rich-${this.block.id}`);
  }

  private modelChanged(): void {
    if (!this.ready || JSON.stringify(this.block) === this.lastModel) return;
    this.pasteGeneration++; this.nativePaste = undefined; this.pasteBusy = false; this.onPendingChange(false);
    this.draft = JSON.parse(JSON.stringify(this.block)) as Block;
    this.renderModel();
  }

  private fontSizeFor(value: string | undefined): number {
    const index = DOCUMENT_SIZE_NAMES.indexOf(value ?? 'normal');
    return [14, 16, 20, 26][index < 0 ? 1 : index];
  }

  private baseSize(): number {
    if (this.draft.fontSize) return this.fontSizeFor(this.draft.fontSize);
    if (this.draft.type === 'heading') return [28, 24, 20][Math.max(0, Math.min(2, (this.draft.headingLevel ?? 2) - 1))];
    return 16;
  }

  private style(run: InlineRun): RichEditorTextStyle {
    const strike = run.strike ?? (this.draft.textDecoration === 'line-through');
    const underline = run.underline ?? (this.draft.textDecoration === 'underline');
    const decoration = strike ? TextDecorationType.LineThrough : underline ? TextDecorationType.Underline : TextDecorationType.None;
    const family = run.fontFamily ?? this.draft.fontFamily;
    return {
      fontSize: run.fontSize ? this.fontSizeFor(run.fontSize) : this.baseSize(),
      fontColor: run.color ?? this.draft.color ?? $r('app.color.text_primary'),
      fontWeight: run.bold === true || (run.bold === undefined && (this.draft.fontWeight === 'bold' || this.draft.type === 'heading')) ? FontWeight.Bold : FontWeight.Normal,
      fontStyle: run.italic === true || (run.italic === undefined && this.draft.fontStyle === 'italic') ? FontStyle.Italic : FontStyle.Normal,
      decoration: { type: decoration },
      fontFamily: family === 'mono' ? 'monospace' : family === 'serif' ? 'serif' : 'sans-serif',
      textBackgroundStyle: { color: run.backgroundColor ?? this.draft.backgroundColor ?? $r('app.color.transparent') }
    };
  }

  private paragraphStyle(): RichEditorParagraphStyle {
    return { textAlign: this.draft.textAlign === 'center' ? TextAlign.Center : this.draft.textAlign === 'right' ? TextAlign.End : TextAlign.Start };
  }

  private renderModel(): void {
    this.changing = true;
    try {
      this.controller.deleteSpans();
      const runs = normalizedRuns(this.draft);
      runs.forEach((run) => this.controller.addTextSpan(run.text, { style: this.style(run), paragraphStyle: this.paragraphStyle() }));
      this.lastModel = JSON.stringify(this.draft);
      const length = (this.draft.text ?? '').length;
      this.controller.setSelection(Math.min(this.selectionStart, length), Math.min(this.selectionEnd, length));
    } finally { this.changing = false; }
  }

  private emit(): void {
    this.lastModel = JSON.stringify(this.draft);
    this.onChange(JSON.parse(this.lastModel) as Block);
  }

  private changed(): void {
    if (!this.alive || this.changing || !this.ready || this.readOnly) return;
    const spans = this.controller.getSpans();
    if (spans.some((span) => !!(span as RichEditorTextSpanResult).previewText)) return;
    const text = spans.map((span) => (span as RichEditorTextSpanResult).value ?? '').join('');
    if (text.length > MAX_BLOCK_TEXT_CHARS) { this.nativePaste = undefined; this.notice = '每个正文块最多4000字，可使用文档插入菜单粘贴为多个新内容块'; this.renderModel(); return; }
    if (this.nativePaste) { this.cleanNativePaste(spans as RichEditorTextSpanResult[], text); return; }
    if (text === (this.draft.text ?? '')) return;
    this.draft = editText(this.draft, text, this.typingStyle);
    this.emit();
  }

  private selection(): [number, number] {
    const length = (this.draft.text ?? '').length;
    try {
      const range = this.controller.getSelection().selection;
      if (range[0] >= 0 && range[1] >= range[0] && range[1] <= length) return range;
    } catch (_) {}
    return [Math.max(0, Math.min(length, this.selectionStart)), Math.max(0, Math.min(length, this.selectionEnd))];
  }
  private capturePaste(): void {
    const range = this.selection();
    this.nativePaste = { before: JSON.parse(JSON.stringify(this.draft)) as Block, start: Math.min(range[0], range[1]), end: Math.max(range[0], range[1]) };
  }
  private cleanNativePaste(spans: RichEditorTextSpanResult[], text: string): void {
    const paste = this.nativePaste; this.nativePaste = undefined; if (!paste) return;
    const original = paste.before.text ?? ''; const suffix = original.slice(paste.end); const end = text.length - suffix.length;
    if (!text.startsWith(original.slice(0, paste.start)) || !text.endsWith(suffix) || end < paste.start) {
      this.draft = editText(this.draft, text, this.typingStyle); this.renderModel(); this.emit(); return;
    }
    const runs: InlineRun[] = spans.map((span): InlineRun => ({ text: span.value ?? '',
      bold: span.textStyle?.fontWeight >= 600 || undefined, italic: span.textStyle?.fontStyle === FontStyle.Italic || undefined,
      underline: span.textStyle?.decoration?.type === TextDecorationType.Underline || undefined,
      strike: span.textStyle?.decoration?.type === TextDecorationType.LineThrough || undefined,
      fontFamily: /mono|consolas|cascadia/i.test(span.textStyle?.fontFamily ?? '') ? 'mono' : undefined }));
    const inserted = compactRuns(sliceRuns(runs, paste.start, end).map((run) => {
      run.text = run.text.replace(/\r\n?/g, '\n').replace(/\u00a0/g, ' '); return run;
    }));
    try {
      this.draft = insertPaste(paste.before, paste.start, paste.end, inserted);
      this.selectionStart = paste.start + inserted.reduce((sum, run) => sum + run.text.length, 0); this.selectionEnd = this.selectionStart;
      this.renderModel(); this.emit();
    } catch (error) { this.notice = (error as Error).message; this.draft = paste.before; this.renderModel(); }
  }
  private async pasteClean(): Promise<void> {
    if (!this.ready || this.readOnly || this.pasteBusy || !this.active || !this.pageVisible) return;
    const range = this.selection(); const base = JSON.stringify(this.draft); const generation = ++this.pasteGeneration;
    this.pasteBusy = true; this.onPendingChange(true);
    try {
      const value = await readCleanClipboard(this.getUIContext().getHostContext() as common.UIAbilityContext);
      if (!this.alive || !this.active || !this.pageVisible || this.readOnly || generation !== this.pasteGeneration) return;
      if (JSON.stringify(this.draft) !== base) throw new Error('粘贴期间正文已变化，未覆盖当前内容，请重新粘贴');
      if (!value.text) throw new Error('剪贴板没有可加入正文的文字，选区保持原样');
      this.draft = insertPaste(this.draft, range[0], range[1], value.runs);
      this.selectionStart = Math.min(range[0], range[1]) + value.text.length; this.selectionEnd = this.selectionStart;
      this.renderModel(); this.emit(); this.notice = value.notice;
    } catch (error) { if (this.alive && generation === this.pasteGeneration) this.notice = (error as Error).message; }
    finally { if (generation === this.pasteGeneration) { this.pasteBusy = false; this.onPendingChange(false); } }
  }

  private async colorHex(resource: Resource): Promise<string> {
    const context = this.getUIContext().getHostContext();
    if (!context) throw new Error('界面暂未就绪');
    const value = context.resourceManager.getColorSync(resource.id);
    return `#${(value & 0xFFFFFF).toString(16).padStart(6, '0')}`;
  }

  private apply(change: (run: InlineRun) => void): void {
    if (!this.alive || !this.ready || this.readOnly || !this.pageVisible) return;
    const start = Math.min(this.selectionStart, this.selectionEnd);
    const end = Math.max(this.selectionStart, this.selectionEnd);
    if (start === end) {
      const run = this.typingStyle ?? runAt(normalizedRuns(this.draft), start);
      change(run); this.typingStyle = run;
      this.controller.setTypingStyle(this.style(run));
    } else {
      const formatted = formatRuns(this.draft, start, end, change);
      if ((formatted.inlineRuns?.length ?? 0) > MAX_DOCUMENT_BLOCKS) { this.notice = '局部格式较多，请拆分内容块'; return; }
      this.draft = formatted;
      this.renderModel(); this.emit();
    }
  }

  private toggle(kind: string): void {
    const current = runAt(normalizedRuns(this.draft), this.selectionStart);
    const selected = kind === 'bold' ? current.bold ?? (this.draft.fontWeight === 'bold' || this.draft.type === 'heading') :
      kind === 'italic' ? current.italic ?? (this.draft.fontStyle === 'italic') :
        kind === 'underline' ? current.underline ?? (this.draft.textDecoration === 'underline') : current.strike ?? (this.draft.textDecoration === 'line-through');
    this.apply((run) => {
      if (kind === 'bold') run.bold = !selected;
      else if (kind === 'italic') run.italic = !selected;
      else if (kind === 'underline') run.underline = !selected;
      else run.strike = !selected;
    });
  }

  @Builder
  private formatToolbar() {
    Flex({ wrap: FlexWrap.Wrap, space: { main: LengthMetrics.vp(6), cross: LengthMetrics.vp(6) } }) {
      Button('加粗').onClick(() => this.toggle('bold')).accessibilityText('切换所选文字加粗')
      Button('斜体').onClick(() => this.toggle('italic')).accessibilityText('切换所选文字斜体')
      Button('下划线').onClick(() => this.toggle('underline')).accessibilityText('切换所选文字下划线')
      Button('删除线').onClick(() => this.toggle('strike')).accessibilityText('切换所选文字删除线')
      Select([{ value: '小字' }, { value: '正文' }, { value: '大字' }, { value: '特大' }]).value('字号')
        .onSelect((index: number) => this.apply((run) => { run.fontSize = DOCUMENT_SIZE_NAMES[index]; }))
        .accessibilityText('所选文字字号')
      Select([{ value: '无衬线' }, { value: '衬线' }, { value: '等宽' }]).value('字体')
        .onSelect((index: number) => this.apply((run) => { run.fontFamily = ['sans', 'serif', 'mono'][index]; }))
        .accessibilityText('所选文字字体')
      Select(DOCUMENT_COLOR_NAMES.map((value): SelectOption => ({ value }))).value('字色')
        .onSelect(async (index: number) => {
          try { const color = await this.colorHex(DOCUMENT_COLOR_RESOURCES[index]); this.apply((run) => { run.color = color; }); }
          catch (error) { this.notice = (error as Error).message; }
        }).accessibilityText('所选文字颜色')
      Button('高亮').onClick(async () => {
        try { const color = await this.colorHex($r('app.color.highlight')); this.apply((run) => { run.backgroundColor = color; }); }
        catch (error) { this.notice = (error as Error).message; }
      }).accessibilityText('给所选文字添加高亮背景')
      Button('清除格式').onClick(() => this.apply((run) => {
        run.bold = undefined; run.italic = undefined; run.underline = undefined; run.strike = undefined;
        run.color = undefined; run.backgroundColor = undefined; run.fontSize = undefined; run.fontFamily = undefined;
      })).accessibilityText('清除所选文字局部格式')
      Button('→').onClick(() => this.controller.addTextSpan('→', { offset: this.selectionStart, style: this.style(this.typingStyle ?? { text: '' }) }))
        .accessibilityText('插入箭头符号')
      Button('•').onClick(() => this.controller.addTextSpan('•', { offset: this.selectionStart, style: this.style(this.typingStyle ?? { text: '' }) }))
        .accessibilityText('插入圆点符号')
    }.width('100%')
  }

  build() {
    Column({ space: 8 }) {
      if (!this.readOnly) {
        Button(this.showFormat ? '收起文字格式' : '文字格式').onClick(() => { this.showFormat = !this.showFormat; })
          .accessibilityText('展开或收起局部文字格式工具')
        Row({ space: 10 }) {
          Text('整理粘贴').fontSize(14).fontColor($r('app.color.text_secondary'))
          PasteButton().enabled(this.ready && !this.pasteBusy).onClick((_event: ClickEvent, result: PasteButtonOnClickResult) => {
            if (result === PasteButtonOnClickResult.SUCCESS) this.pasteClean(); else this.notice = '未获得本次粘贴授权，正文未改变';
          })
        }.width('100%').accessibilityDescription('通过系统粘贴按钮整理网页文字，去除网页颜色和外部字体，保留列表与文字格式')
        if (this.pasteBusy) { Text('正在整理粘贴内容…').fontColor($r('app.color.text_secondary')) }
        if (this.showFormat) { this.formatToolbar() }
      }
      if (this.readOnly) {
        Text() {
          ForEach(normalizedRuns(this.block), (run: InlineRun, index: number) => {
            Span(run.text).fontColor(this.style(run).fontColor).fontSize(this.style(run).fontSize)
              .fontWeight(this.style(run).fontWeight).fontStyle(this.style(run).fontStyle)
              .fontFamily(this.style(run).fontFamily).decoration(this.style(run).decoration)
          }, (_run: InlineRun, index: number) => String(index))
        }.width('100%').copyOption(CopyOptions.LocalDevice).accessibilityText(this.block.text ?? '')
      } else {
      RichEditor({ controller: this.controller }).id(`rich-${this.block.id}`)
        .width('100%').constraintSize({ minHeight: 100, maxHeight: 600 })
        .backgroundColor($r('app.color.surface_secondary')).borderRadius(12).padding(12)
        .enabled(!this.readOnly && !this.pasteBusy).enablePreviewText(true)
        .onReady(() => { if (!this.alive) return; this.ready = true; this.draft = JSON.parse(JSON.stringify(this.block)) as Block; this.renderModel(); this.focusChanged(); })
        .onSelectionChange((range: RichEditorRange) => {
          this.selectionStart = range.start ?? 0; this.selectionEnd = range.end ?? this.selectionStart;
          if (this.selectionStart !== this.selectionEnd) this.typingStyle = undefined;
        })
        .onPaste(() => this.capturePaste())
        .aboutToIMEInput(() => { this.nativePaste = undefined; return true; })
        .onWillChange((value: RichEditorChangeValue) => {
          if (value.replacedImageSpans.length || value.replacedSymbolSpans.length) { this.nativePaste = undefined; this.notice = '图片和文件请通过附件添加'; return false; }
          return !this.readOnly && (this.changing || this.pageVisible);
        })
        .onDidChange(() => this.changed())
        .accessibilityText(this.block.type === 'heading' ? '文档标题正文，可选择文字设置格式' : '富文本正文，可选择文字设置格式')
      }
      if (this.notice) { Text(this.notice).fontColor($r('app.color.danger')) }
    }.width('100%').alignItems(HorizontalAlign.Start)
  }
}
