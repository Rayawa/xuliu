import { LengthMetrics } from '@kit.ArkUI';
import { AiProposalView, AiPreviewOperation, emptyAiProposal } from '../../models/AiModels';

@Component
export struct AiProposalCard {
  @Prop value: AiProposalView = emptyAiProposal();
  onPreview: () => void = () => {};
  onApprove: () => void = () => {};
  onReject: () => void = () => {};
  onSecond: () => void = () => {};
  onCancelSecond: () => void = () => {};
  @State private visible: number = 20;

  private readLabel(): string {
    return this.value.name === 'getWorkspaceOverview' ? '读取空间概况' : this.value.name === 'readWorkspaceModule' ? '读取工作台内容' : this.value.name === 'searchWorkspace' ? '搜索工作台' : '工具调用';
  }

  build() {
    Column({ space: 10 }) {
      if (this.value.name !== 'applyWorkspaceChanges') {
        Text(`${this.readLabel()} · ${this.value.state === 'output-available' ? '已完成' : this.value.state === 'output-error' ? '未完成' : '处理中'}`)
          .fontColor($r('app.color.text_secondary'))
      } else if (this.value.status === 'applied') {
        Text('修改已写入云端').fontWeight(FontWeight.Bold).fontColor($r('app.color.accent'))
      } else if (this.value.state === 'output-denied' || this.value.message === '已取消此提案') {
        Text(this.value.message || '已取消，数据没有变化').fontColor($r('app.color.text_secondary'))
      } else if (this.value.state === 'output-error' || this.value.status === 'conflict') {
        Text(this.value.message || '云端数据已变化，请重新生成提案').fontColor($r('app.color.danger'))
      } else if (this.value.stage) {
        Text(this.value.stage === 'second' ? this.value.risk === 'bulk' ? '再次确认 · 批量修改' : '再次确认 · 包含删除' : '等待确认')
          .fontSize(18).fontWeight(FontWeight.Bold).fontColor(this.value.stage === 'second' ? $r('app.color.danger') : $r('app.color.text_primary'))
        Text(this.value.summary || '请核对以下修改').fontColor($r('app.color.text_primary'))
        Text(`目标：你自己的云端空间 · ${this.value.operations.length}项操作`).fontColor($r('app.color.text_secondary'))
        ForEach(this.value.operations.slice(0, this.visible), (operation: AiPreviewOperation) => {
          Text(`${operation.index + 1}. ${operation.description}`).fontColor($r('app.color.text_primary'))
            .copyOption(CopyOptions.LocalDevice).width('100%')
        }, (operation: AiPreviewOperation) => String(operation.index))
        if (this.visible < this.value.operations.length) {
          Button(`继续查看剩余${this.value.operations.length - this.visible}项`).onClick(() => { this.visible += 20; })
            .accessibilityText('展开更多修改前后值和目标说明')
        }
        if (this.value.previewStatus === 'loading') { Text('正在核对云端版本和具体变更…').fontColor($r('app.color.text_secondary')) }
        if (this.value.previewError) { Text(this.value.previewError).fontColor($r('app.color.danger')) }
        if (!this.value.latest) { Text('此提案已被后续消息取代，不能继续确认').fontColor($r('app.color.text_secondary')) }
        if (this.value.stage === 'second') { Text(this.value.status === 'uncertain' ? '上次执行结果待核对；仅重试同一提案可避免重复修改。' : '第一次确认尚未写入，再次确认后才会执行。').fontColor($r('app.color.text_secondary')) }
        Flex({ wrap: FlexWrap.Wrap, space: { main: LengthMetrics.vp(8), cross: LengthMetrics.vp(8) } }) {
          Button('重新核对预览').enabled(this.value.latest && this.value.previewStatus !== 'loading').onClick(() => this.onPreview()).accessibilityText('重新从云端核对完整提案预览')
          if (this.value.stage === 'first') {
            Button('取消提案').onClick(() => this.onReject()).accessibilityText('拒绝此修改提案')
            Button('确认这些修改').enabled(this.value.canConfirm).onClick(() => this.onApprove()).accessibilityText('确认所列全部修改，执行前再次核对云端版本')
          } else if (this.value.stage === 'second') {
            if (this.value.status !== 'uncertain') { Button('取消').onClick(() => this.onCancelSecond()).accessibilityText('取消二次确认，不执行此提案') }
            Button(this.value.status === 'uncertain' ? '重试同一提案' : '再次确认并执行').enabled(this.value.canConfirm).onClick(() => this.onSecond()).accessibilityText('再次确认并执行已预览的批量或删除修改')
          }
        }
      } else {
        Text(this.value.state === 'approval-responded' ? '已确认，等待其余确认或执行结果…' : '正在整理修改提案…').fontColor($r('app.color.text_secondary'))
      }
      if (this.value.message && this.value.state !== 'output-denied') { Text(this.value.message).fontSize(13).fontColor($r('app.color.text_secondary')) }
    }.width('100%').padding(14).borderRadius(14).backgroundColor($r('app.color.surface_secondary'))
  }
}
