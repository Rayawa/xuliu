import { FrameScheduler } from '../../utils/runtime/FrameScheduler';
import { common } from '@kit.AbilityKit';
import { LengthMetrics } from '@kit.ArkUI';
import { KEY_ACTIVE, MAX_TABLE_ROWS, MAX_TABLE_COLUMNS, MAX_TABLE_CELL_CHARS } from '../../config/constants';
import { assertTable, tableColumnCount, tableTsv, parseTableTsv, pastedTable } from '../../domain/documents/TableData';
import { readCleanClipboard } from '../../services/documents/ClipboardText';

@Component
export struct TableEditor {
  @Prop @Watch('modelChanged') rows: string[][] = [];
  @Prop @Watch('activityChanged') pageVisible: boolean = true;
  @Prop readOnly: boolean = false;
  @Prop blockId: string = '';
  @StorageLink(KEY_ACTIVE) @Watch('activityChanged') private active: boolean = true;
  onChange: (rows: string[][], group: string) => void = () => {};
  onPendingChange: (pending: boolean) => void = () => {};
  @State private cells: string[][] = [];
  @State private visibleRows: number = 20;
  @State private editRow: number = -1;
  @State private editColumn: number = -1;
  @State private showBulk: boolean = false;
  @State private bulk: string = '';
  @State private notice: string = '';
  @State private busy: boolean = false;
  private bulkBase: string = '';
  private lastEmitted: string = '';
  private alive: boolean = true;
  private generation: number = 0;
  private focusFrame: FrameScheduler = new FrameScheduler();

  aboutToAppear(): void { this.modelChanged(); }
  aboutToDisappear(): void { this.alive = false; this.generation++; this.focusFrame.cancel(); this.onPendingChange(false); }
  private activityChanged(): void { if (!this.active || !this.pageVisible) { this.generation++; this.focusFrame.cancel(); this.busy = false; this.onPendingChange(false); } }
  private modelChanged(): void {
    const raw = JSON.stringify(this.rows); if (raw === this.lastEmitted) return;
    this.cells = JSON.parse(raw) as string[][]; this.lastEmitted = raw; this.editRow = -1; this.editColumn = -1;
  }
  private columns(): number[] { const values: number[] = []; for (let index = 0; index < tableColumnCount(this.cells); index++) values.push(index); return values; }
  private emit(rows: string[][], group: string = ''): void {
    if (this.readOnly) return;
    try {
      assertTable(rows); this.lastEmitted = JSON.stringify(rows); this.cells = rows.map((row) => row.slice());
      this.onChange(rows.map((row) => row.slice()), group); this.notice = '';
    } catch (error) { this.notice = (error as Error).message; }
  }
  private cellId(row: number, column: number): string { return `cell-${this.blockId}-${row}-${column}`; }
  private selectCell(row: number, column: number): void {
    if (this.readOnly || this.busy || !this.active || !this.pageVisible) return;
    this.editRow = row; this.editColumn = column;
    try {
      this.focusFrame.request(this.getUIContext(), () => {
        if (!this.alive || !this.pageVisible || this.editRow < 0) return;
        try { this.getUIContext().getFocusController().requestFocus(this.cellId(this.editRow, this.editColumn)); } catch (_) {}
      });
    } catch (_) {}
  }
  private setCell(row: number, column: number, value: string): void {
    if (this.editRow !== row || this.editColumn !== column || this.busy || this.readOnly) return;
    if (!this.cells[row]) return;
    const next = this.cells.slice(); const changed = this.cells[row].slice();
    while (changed.length <= column) changed.push(''); changed[column] = value; next[row] = changed;
    this.emit(next, `cell:${row}:${column}`);
  }
  private addRow(): void {
    if (this.cells.length >= MAX_TABLE_ROWS) { this.notice = '表格最多100行'; return; }
    const width = this.cells.length ? tableColumnCount(this.cells) : 2;
    const row: string[] = []; for (let index = 0; index < width; index++) row.push(''); this.emit(this.cells.concat([row])); this.visibleRows = this.cells.length;
  }
  private addColumn(): void {
    const width = tableColumnCount(this.cells); if (width >= MAX_TABLE_COLUMNS) { this.notice = '表格最多30列'; return; }
    const next: string[][] = this.cells.length ? this.cells.map((row) => { const cells = row.slice(); while (cells.length <= width) cells.push(''); return cells; }) : [['', '']]; this.emit(next);
  }
  private removeSelection(column: boolean): void {
    if (this.editRow < 0 || this.editColumn < 0) return;
    const next = column ? this.cells.map((row) => row.filter((_cell, index: number) => index !== this.editColumn)) : this.cells.filter((_row, index: number) => index !== this.editRow);
    this.editRow = -1; this.editColumn = -1; this.emit(next);
  }
  private openBulk(): void { this.showBulk = !this.showBulk; if (this.showBulk) this.resetBulk(); }
  private resetBulk(): void { this.bulk = tableTsv(this.cells); this.bulkBase = JSON.stringify(this.cells); }
  private applyBulk(): void {
    try {
      const next = parseTableTsv(this.bulk);
      if (JSON.stringify(this.cells) !== this.bulkBase && JSON.stringify(this.cells) !== JSON.stringify(next)) throw new Error('表格已变化，整表输入已保留；请核对后重新读取');
      this.editRow = -1; this.editColumn = -1; this.emit(next); this.bulkBase = JSON.stringify(next); this.showBulk = false;
    } catch (error) { this.notice = (error as Error).message; }
  }
  private async pasteTable(): Promise<void> {
    if (this.busy || this.readOnly || !this.active || !this.pageVisible) return;
    const base = JSON.stringify(this.cells); const generation = ++this.generation;
    this.busy = true; this.onPendingChange(true);
    try {
      const value = await readCleanClipboard(this.getUIContext().getHostContext() as common.UIAbilityContext);
      if (!this.alive || !this.active || !this.pageVisible || generation !== this.generation || this.readOnly) return;
      if (JSON.stringify(this.cells) !== base) throw new Error('粘贴期间表格已变化，未替换原内容');
      const rows = pastedTable(value); this.editRow = -1; this.editColumn = -1; this.emit(rows);
      this.notice = value.mergedCells ? '已保留表格文字，合并布局已转为普通单元格，请核对' : '已粘贴为表格，可通过文档撤销恢复原表';
    } catch (error) { if (this.alive && generation === this.generation) this.notice = (error as Error).message; }
    finally { if (generation === this.generation) { this.busy = false; this.onPendingChange(false); } }
  }

  build() {
    Column({ space: 10 }) {
      Text(`${this.cells.length}行 · ${tableColumnCount(this.cells)}列${this.readOnly ? '' : ' · 点击单元格编辑'}`).fontSize(13).fontColor($r('app.color.text_secondary')).width('100%')
      Scroll() {
        Column({ space: 3 }) {
          ForEach(this.cells.slice(0, this.visibleRows), (_row: string[], rowIndex: number) => {
            Row({ space: 3 }) {
              ForEach(this.columns(), (columnIndex: number) => {
                if (!this.readOnly && this.editRow === rowIndex && this.editColumn === columnIndex) {
                  TextArea({ text: this.cells[rowIndex]?.[columnIndex] ?? '', placeholder: '单元格内容' }).id(this.cellId(rowIndex, columnIndex)).width(160).constraintSize({ minHeight: 68, maxHeight: 200 })
                    .maxLength(MAX_TABLE_CELL_CHARS).enabled(!this.busy).fontColor($r('app.color.text_primary')).backgroundColor($r('app.color.surface_secondary'))
                    .onChange((value: string) => this.setCell(rowIndex, columnIndex, value)).accessibilityText(`编辑第${rowIndex + 1}行第${columnIndex + 1}列，最多五百字`)
                } else {
                  Text(this.cells[rowIndex]?.[columnIndex] ?? '').width(160).padding(10).constraintSize({ minHeight: 48 }).fontColor($r('app.color.text_primary'))
                    .backgroundColor($r('app.color.surface_secondary')).copyOption(CopyOptions.LocalDevice)
                    .onClick(() => this.selectCell(rowIndex, columnIndex))
                    .accessibilityText(`第${rowIndex + 1}行第${columnIndex + 1}列，${this.cells[rowIndex]?.[columnIndex] || '空白'}${this.readOnly ? '' : '，点击编辑'}`)
                    .accessibilityRole(this.readOnly ? AccessibilityRoleType.TEXT : AccessibilityRoleType.BUTTON)
                }
              }, (column: number) => String(column))
            }
          }, (_row: string[], index: number) => String(index))
        }
      }.scrollable(ScrollDirection.Horizontal).width('100%')
      if (this.visibleRows < this.cells.length) { Button('继续显示表格行').onClick(() => { this.visibleRows += 20; }).accessibilityText('显示接下来的二十行，全部表格数据保留') }
      if (!this.readOnly) {
        Flex({ wrap: FlexWrap.Wrap, space: { main: LengthMetrics.vp(8), cross: LengthMetrics.vp(8) } }) {
          Button('添加一行').enabled(!this.busy && this.cells.length < MAX_TABLE_ROWS).onClick(() => this.addRow()).accessibilityText('在表格末尾添加一行')
          Button('添加一列').enabled(!this.busy && tableColumnCount(this.cells) < MAX_TABLE_COLUMNS).onClick(() => this.addColumn()).accessibilityText('在表格末尾添加一列')
          Button('完成单元格').enabled(!this.busy && this.editRow >= 0).onClick(() => { this.editRow = -1; this.editColumn = -1; }).accessibilityText('结束当前单元格编辑，内容已保留在文档草稿')
          Button('删除选中行').enabled(!this.busy && this.editRow >= 0).onClick(() => this.removeSelection(false)).accessibilityText('删除当前单元格所在行，可通过文档撤销恢复')
          Button('删除选中列').enabled(!this.busy && this.editColumn >= 0).onClick(() => this.removeSelection(true)).accessibilityText('删除当前单元格所在列，可通过文档撤销恢复')
          Button(this.showBulk ? '收起整表输入' : '整表输入').enabled(!this.busy).onClick(() => this.openBulk()).accessibilityText('展开或收起以制表符和换行编辑整张表格的输入区')
        }
        Row({ space: 10 }) {
          Text('用剪贴板替换整表').fontColor($r('app.color.text_secondary'))
          PasteButton().enabled(!this.busy).onClick((_event: ClickEvent, result: PasteButtonOnClickResult) => {
            if (result === PasteButtonOnClickResult.SUCCESS) this.pasteTable(); else this.notice = '未获得本次粘贴授权，原表格未改变';
          })
        }.width('100%').accessibilityDescription('通过系统粘贴按钮读取剪贴板表格并替换当前表格，可撤销')
        if (this.showBulk) {
          TextArea({ text: this.bulk, placeholder: '列以制表符分隔，行以换行分隔' }).enabled(!this.busy).constraintSize({ minHeight: 100, maxHeight: 240 })
            .onChange((value: string) => { this.bulk = value; }).accessibilityText('编辑完整表格，支持引号包裹的单元格换行和制表符')
          Row({ space: 10 }) {
            Button('应用整表输入').enabled(!this.busy).onClick(() => this.applyBulk()).accessibilityText('验证行列数量后应用整表输入，格式无效时保留原表')
            Button('重新读取整表').enabled(!this.busy).onClick(() => this.resetBulk()).accessibilityText('放弃整表输入草稿，重新读取当前表格内容')
          }
        }
      }
      if (this.busy) { Text('正在整理剪贴板表格…').fontColor($r('app.color.text_secondary')) }
      if (this.notice) { Text(this.notice).fontColor($r('app.color.text_secondary')).width('100%') }
    }.width('100%').alignItems(HorizontalAlign.Start)
  }
}
