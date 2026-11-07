import { hdsPageTitle } from '../../ui/navigation/hdsTitleBar';
import { common } from '@kit.AbilityKit';
import { exportDocument } from '../../services/files/WorkspaceFiles';
import { HdsNavDestination, HdsNavDestinationTitleMode } from '@kit.UIDesignKit';
import { LengthMetrics } from '@kit.ArkUI';
import { CloudApi } from '../../services/api/CloudApi';
import { AiChatService } from '../../services/ai/AiChatService';
import { insertCourseAnswer } from '../../services/ai/CourseAnswerService';
import { courseAnswerBlocks } from '../../domain/ai/CourseAnswer';
import { AiConversationView, AiMessageView, AiProposalView } from '../../models/AiModels';
import { CloudAccount, CloudRecord, Block } from '../../models/Workspace';
import { sessionEpoch, currentCloudAccount, currentCloudAccounts } from '../../state/cloudSession';
import { KEY_CLOUD_SESSION, ROUTE_CLOUD } from '../../config/constants';
import { getWorkspace, saveWithCheckpoint, workspaceCheckpoints, readWorkspaceCheckpoint } from '../../services/storage/storage';
import { AiProposalCard } from '../../components/ai/AiProposalCard';

@Component
export struct AiAssistantPage {
  @Consume('pageStack') private stack: NavPathStack;
  @Prop targetCourseId: string = '';
  @StorageLink(KEY_CLOUD_SESSION) @Watch('sessionChanged') private sessionRevision: number = 0;
  @State private accounts: CloudAccount[] = [];
  @State private owner: string = '';
  @State private courseId: string = '';
  @State private record: CloudRecord | undefined = undefined;
  @State private messages: AiMessageView[] = [];
  @State private busy: boolean = false;
  @State private pending: boolean = false;
  @State private loading: boolean = false;
  @State private error: string = '';
  @State private notice: string = '';
  @State private input: string = '';
  @State private showScope: boolean = false;
  @State private autoSync: boolean = true;
  @State private uncertain: boolean = false;
  @State private inserting: string = '';
  private alive: boolean = true;
  private contextVersion: number = 0;
  private baseLocal: string = '';
  private baseCloud: string = '';
  private api: CloudApi = new CloudApi();
  private insertedBlocks: Map<string, Block[]> = new Map();
  private list: Scroller = new Scroller();
  private chat: AiChatService = new AiChatService((view: AiConversationView) => this.updated(view), () => this.canWrite(),
    () => this.applied(), () => this.beforeWrite());

  aboutToAppear(): void { this.sessionChanged(); }
  aboutToDisappear(): void { this.alive = false; this.chat.dispose(); this.api.dispose(); this.insertedBlocks.clear(); }

  private updated(view: AiConversationView): void {
    if (!this.alive) return;
    this.messages = view.messages; this.busy = view.busy; this.pending = view.pending; this.error = view.error; this.uncertain = view.uncertain;
  }
  private sessionChanged(): void {
    this.contextVersion++; this.api.cancel(); this.loading = false;
    this.accounts = currentCloudAccounts(); this.owner = currentCloudAccount()?.id ?? ''; this.record = undefined;
    this.courseId = ''; this.baseLocal = ''; this.baseCloud = ''; this.inserting = ''; this.notice = ''; this.chat.reset(this.owner, ''); this.insertedBlocks.clear();
  }
  private canWrite(): boolean { return !!currentCloudAccount() && this.owner === currentCloudAccount()?.id && !!this.record && this.record.owner === this.owner && !this.record.readOnly && !this.loading && !this.inserting; }

  private async invoke(action: () => Promise<void>): Promise<void> {
    try { await action(); } catch (error) { if (this.alive) this.notice = (error as Error).message; }
  }

  private async loadContext(reset: boolean = false): Promise<void> {
    if (!currentCloudAccount()) { this.notice = '请先登录序流账号'; return; }
    if (this.loading || this.busy) return;
    const version = ++this.contextVersion; const epoch = sessionEpoch();
    this.loading = true;
    try {
      const session = await this.api.session(); if (!this.alive || version !== this.contextVersion || epoch !== sessionEpoch()) return; this.accounts = session.visibleAccounts;
      if (!this.owner || !this.accounts.some((account) => account.id === this.owner)) this.owner = session.account.id;
      const record = await this.api.read(this.owner); if (!this.alive || version !== this.contextVersion || epoch !== sessionEpoch()) return;
      this.record = record;
      if (!this.courseId && this.targetCourseId && record.data?.courses.some((course) => course.id === this.targetCourseId)) this.courseId = this.targetCourseId;
      if (reset || !this.messages.length) this.chat.reset(this.owner, this.courseId);
      this.notice = record.readOnly ? '当前空间只读，可以提问与总结，不能确认修改' : '已读取云端空间；本机尚未上传的修改不在云端AI上下文中';
    } catch (error) { if (this.alive) this.notice = (error as Error).message; }
    finally { if (this.alive && version === this.contextVersion) this.loading = false; }
  }

  private async beforeWrite(): Promise<void> {
    if (!this.canWrite()) throw new Error('当前空间只读，不能写入');
    const owner = this.owner; const version = this.contextVersion;
    const record = await this.api.read(owner);
    if (!this.alive || record.readOnly || owner !== this.owner || version !== this.contextVersion) throw new Error('当前空间已变化，请重新读取');
    this.record = record; this.baseLocal = JSON.stringify(getWorkspace()); this.baseCloud = JSON.stringify(record.data);
  }

  private async applied(): Promise<void> {
    const owner = this.owner; const version = this.contextVersion;
    const record = await this.api.read(owner); if (!this.alive || owner !== this.owner || version !== this.contextVersion) return;
    this.record = record; this.notice = '修改已写入云端';
    if (!record.data || !this.autoSync) return;
    if (!this.baseLocal || this.baseLocal !== this.baseCloud || JSON.stringify(getWorkspace()) !== this.baseLocal) {
      this.notice = '云端已修改；本机另有未同步内容，未自动覆盖。可核对后下载云端结果'; return;
    }
    const cloud = record.data; const base = this.baseLocal;
    await saveWithCheckpoint((current) => {
      if (!this.alive || owner !== this.owner || version !== this.contextVersion || JSON.stringify(current) !== base) throw new Error('本机记录已变化，未覆盖');
      return cloud;
    }, 'ai-results');
    this.baseLocal = JSON.stringify(getWorkspace()); this.baseCloud = JSON.stringify(record.data); this.notice = '修改已同步到本机，更新前完整备份已保留';
  }

  private async downloadResult(): Promise<void> {
    if (!this.record?.data || this.loading || this.busy) return;
    const owner = this.owner; const version = this.contextVersion;
    const answer = await this.getUIContext().getPromptAction().showDialog({ title: '用云端结果替换本机？',
      message: '将先保存本机完整备份，再下载当前云端工作台。本机尚未上传的内容会被云端版本替换。',
      buttons: [{ text: '取消', color: $r('app.color.accent') }, { text: '备份并下载', color: $r('app.color.danger') }] });
    if (answer.index !== 1 || !this.alive || this.busy || this.loading || owner !== this.owner || version !== this.contextVersion) return;
    this.loading = true;
    try {
      const record = await this.api.read(owner);
      if (!this.alive || owner !== this.owner || version !== this.contextVersion) return;
      if (!record.data) throw new Error('云端还没有工作台数据');
      const cloud = record.data;
      await saveWithCheckpoint((current) => {
        if (!this.alive || owner !== this.owner || version !== this.contextVersion) throw new Error('当前空间已变化，未下载');
        return cloud;
      }, 'ai-results');
      this.record = record; this.notice = '已下载云端结果，本机更新前完整备份已保留';
    } finally { this.loading = false; }
  }

  private async uploadLocal(): Promise<void> {
    if (!this.canWrite() || this.busy || this.pending || this.loading) return;
    const owner = this.owner; const version = this.contextVersion; const epoch = sessionEpoch();
    this.loading = true;
    try {
      const record = await this.api.read(owner); const local = getWorkspace();
      const answer = await this.getUIContext().getPromptAction().showDialog({ title: '上传本机后开始新对话？',
        message: `将本机${local.tasks.length}个任务、${local.courses.length}门课程及其余完整内容上传到自己的云端空间，以版本${record.revision}为基础；当前对话将清空。云端版本变化时会拒绝覆盖。`,
        buttons: [{ text: '取消', color: $r('app.color.accent') }, { text: '确认上传', color: $r('app.color.accent') }] });
      if (answer.index !== 1 || !this.alive || owner !== this.owner || epoch !== sessionEpoch() || version !== this.contextVersion) return;
      await this.api.save(local, record.revision);
      if (!this.alive || owner !== this.owner || version !== this.contextVersion) return;
      this.record = await this.api.read(owner);
      if (!this.courseId && this.targetCourseId && this.record.data?.courses.some((course) => course.id === this.targetCourseId)) this.courseId = this.targetCourseId;
      this.chat.reset(this.owner, this.courseId); this.notice = '本机内容已上传，现在可就这些内容提问';
    } finally { this.loading = false; }
  }

  private async exportBackup(): Promise<void> {
    const backup = workspaceCheckpoints('ai-results')[0];
    if (!backup) { this.notice = '暂无AI结果下载前备份'; return; }
    const saved = await exportDocument(this.getUIContext().getHostContext() as common.UIAbilityContext,
      readWorkspaceCheckpoint(backup.name), `序流AI更新前完整备份-${backup.name}`);
    if (this.alive) this.notice = saved ? '已导出完整备份，可从我的页面导入恢复' : '已取消导出';
  }

  private async insertAnswer(message: AiMessageView): Promise<void> {
    if (!this.canWrite() || !this.courseId || this.inserting) return;
    const index = this.messages.findIndex((entry) => entry.id === message.id);
    const question = this.messages.slice(0, index).reverse().find((entry) => entry.role === 'user')?.text ?? '';
    const owner = this.owner; const courseId = this.courseId; const version = this.contextVersion;
    const key = `${owner}:${courseId}:${message.id}`;
    let blocks = this.insertedBlocks.get(key); if (!blocks) { blocks = courseAnswerBlocks(question, message.text); this.insertedBlocks.set(key, blocks); }
    this.inserting = message.id;
    try {
      const notice = await insertCourseAnswer(this.api, owner, courseId, blocks);
      if (!this.alive || owner !== this.owner || version !== this.contextVersion) return;
      this.notice = notice; this.record = await this.api.read(owner);
    } finally { this.inserting = ''; }
  }

  private send(): void {
    const text = this.input.trim(); if (!text || this.busy || this.pending || !this.record) return;
    this.input = ''; this.notice = ''; this.invoke(() => this.chat.send(text));
  }

  @Builder
  private proposal(tool: AiProposalView) {
    AiProposalCard({ value: tool,
      onPreview: () => this.invoke(async () => { await this.chat.preview(tool.messageId, tool.toolCallId, true); }),
      onApprove: () => this.invoke(() => this.chat.respond(tool.messageId, tool.toolCallId, true)),
      onReject: () => this.invoke(() => this.chat.respond(tool.messageId, tool.toolCallId, false)),
      onSecond: () => this.invoke(() => this.chat.executeSecond(tool.messageId, tool.toolCallId)),
      onCancelSecond: () => this.chat.cancelSecond(tool.messageId, tool.toolCallId) })
  }

  build() {
    HdsNavDestination() {
      Column({ space: 10 }) {
        if (!currentCloudAccount()) {
          Text('登录后可使用序流的DeepSeek助手').fontSize(20).fontColor($r('app.color.text_primary'))
          Button('登录账号').onClick(() => this.stack.pushPath({ name: ROUTE_CLOUD })).accessibilityText('登录序流账号以使用原生AI助手')
        } else {
          Row({ space: 8 }) {
            Text(`${this.accounts.find((account) => account.id === this.owner)?.displayName ?? '当前空间'}${this.record?.readOnly ? ' · 只读' : ''}`)
              .layoutWeight(1).fontWeight(FontWeight.Bold).fontColor($r('app.color.text_primary'))
            Button('空间与课程').onClick(() => { this.showScope = !this.showScope; }).accessibilityText('展开或收起AI当前空间和课程设置')
          }.width('100%')
          if (this.showScope) {
            GridRow({ columns: 12, gutter: 12 }) {
              GridCol({ span: { xs: 12, sm: 12, md: 6 } }) {
                Select(this.accounts.map((account): SelectOption => ({ value: account.displayName })))
                  .value(this.accounts.find((account) => account.id === this.owner)?.displayName ?? '').enabled(!this.busy && !this.loading)
                  .onSelect((index: number) => { this.chat.reset('', ''); this.owner = this.accounts[index].id; this.courseId = ''; this.record = undefined; this.invoke(() => this.loadContext(true)); })
                  .accessibilityText('选择AI可见空间，切换后清空当前对话')
              }
              GridCol({ span: { xs: 12, sm: 12, md: 6 } }) {
                Select(([{ value: '不限定课程' }] as SelectOption[]).concat((this.record?.data?.courses ?? []).map((course): SelectOption => ({ value: course.title }))))
                  .value(this.record?.data?.courses.find((course) => course.id === this.courseId)?.title ?? '不限定课程').enabled(!this.busy && !this.loading)
                  .onSelect((index: number) => { this.courseId = index > 0 ? this.record?.data?.courses[index - 1].id ?? '' : ''; this.chat.reset(this.owner, this.courseId); })
                  .accessibilityText('选择AI当前课程，切换后清空当前对话')
              }
            }
            Row() {
              Text('安全时自动下载AI修改结果').layoutWeight(1).fontColor($r('app.color.text_secondary'))
              Toggle({ type: ToggleType.Switch, isOn: this.autoSync }).onChange((value: boolean) => { this.autoSync = value; })
                .accessibilityText('仅本机没有独立修改且与云端基线相同时自动下载AI结果')
            }.width('100%')
          }
          Flex({ wrap: FlexWrap.Wrap, space: { main: LengthMetrics.vp(6), cross: LengthMetrics.vp(6) } }) {
            Button(this.loading ? '读取中…' : '刷新云端').enabled(!this.loading && !this.busy).onClick(() => this.invoke(() => this.loadContext())).accessibilityText('读取AI当前云端空间，核对执行结果')
            Button('上传本机后提问').enabled(this.canWrite() && !this.pending && !this.loading && !this.busy).onClick(() => this.invoke(() => this.uploadLocal())).accessibilityText('预览确认后将本机完整工作台同步到自己的云端空间，再开始新对话')
            Button('下载云端结果').enabled(!!this.record?.data && !this.loading && !this.busy).onClick(() => this.invoke(() => this.downloadResult())).accessibilityText('先备份再确认用云端结果替换本机工作台')
            Button('导出更新前备份').enabled(!this.busy && !this.loading).onClick(() => this.invoke(() => this.exportBackup())).accessibilityText('导出最近一次下载AI结果前的本机完整备份，可从我的页面导入恢复')
            Button('新对话').enabled(!this.busy && !this.loading).onClick(() => { this.chat.reset(this.owner, this.courseId); this.notice = ''; }).accessibilityText('清空本次AI对话并开始新对话')
          }
        }
        List({ space: 12, scroller: this.list }) {
          ForEach(this.messages, (message: AiMessageView) => {
            ListItem() {
              Column({ space: 12 }) {
                Text(message.role === 'user' ? '你' : '序流AI').fontWeight(FontWeight.Bold).fontColor($r('app.color.text_secondary')).width('100%')
                if (message.text) { Text(message.text).fontSize(17).fontColor($r('app.color.text_primary')).width('100%').copyOption(CopyOptions.LocalDevice) }
                ForEach(message.tools, (tool: AiProposalView) => { this.proposal(tool) }, (tool: AiProposalView) => tool.toolCallId)
                if (message.proof) {
                  Text(`${message.proof.verified ? 'DeepSeek官方响应' : '返回模型未通过核验'} · ${message.proof.responseModel ?? ''}${message.proof.totalTokens ? ` · ${message.proof.totalTokens} tokens` : ''}`)
                    .fontSize(12).fontColor($r('app.color.text_secondary')).width('100%')
                  if (message.proof.responseId) { Text(`响应ID：${message.proof.responseId.slice(0, 8)}…${message.proof.responseId.slice(-8)}`).fontSize(12).fontColor($r('app.color.text_secondary')) }
                }
                if (message.role === 'assistant' && message.text && this.courseId) {
                  Button(this.inserting === message.id ? '插入中…' : '插入课程笔记').enabled(this.canWrite() && !this.busy && !this.inserting)
                    .onClick(() => this.invoke(() => this.insertAnswer(message))).accessibilityText('将本次问题和回答追加到当前云端及本机课程笔记，保留原有内容')
                }
              }.width('100%').padding(16).borderRadius(16).backgroundColor(message.role === 'user' ? $r('app.color.surface_secondary') : $r('app.color.surface'))
            }
          }, (message: AiMessageView) => `${message.id}-${message.version}`)
        }.width('100%').layoutWeight(1)
        if (this.uncertain) { Text('此前确认的修改结果需要核对，请刷新云端；不要重新生成同一批修改。').fontColor($r('app.color.danger')) }
        if (this.error) { Text(this.error).fontColor($r('app.color.danger')) }
        if (this.notice) { Text(this.notice).fontSize(13).fontColor($r('app.color.text_secondary')) }
        TextArea({ text: this.input, placeholder: '询问任务、课程或提出修改…' }).maxLength(4000).constraintSize({ minHeight: 70, maxHeight: 140 })
          .onChange((value: string) => { this.input = value; }).enabled(!!this.record && !this.busy && !this.pending && !this.loading).accessibilityText('向序流AI提问或提出修改要求')
        Row({ space: 12 }) {
          Button('发送').enabled(!!this.record && !this.busy && !this.pending && !this.loading && !!this.input.trim()).onClick(() => this.send()).accessibilityText('发送当前问题到序流AI服务')
          if (this.busy) { Button('停止生成').onClick(() => this.chat.stop()).accessibilityText('停止接收本次AI生成，已确认修改须核对云端状态') }
        }
      }.width('100%').height('100%').padding(16).constraintSize({ maxWidth: 1200 }).backgroundColor($r('app.color.background'))
    }.titleMode(HdsNavDestinationTitleMode.MINI)
    .titleBar(hdsPageTitle('序流AI助手', () => this.stack.pop()))
    .onShown(() => { if (currentCloudAccount() && !this.record) this.invoke(() => this.loadContext(true)); })
  }
}
