import { getWorkspace, saveWorkspace } from '../../services/storage/storage';
import { entries, addDays } from '../../domain/workspace/WorkspaceDomain';
import { KEY_ACCENT } from '../../config/constants';
import { WorkspaceEntry } from '../../models/Workspace';
import { entrySubtitle, localDate } from '../../domain/workspace/WorkspaceDomain';
import { ACCENT_RESOURCES } from '../../config/constants';

@Component
export struct EntryCard {
  @Prop item: WorkspaceEntry = { id: '', title: '' };
  @Prop collection: string = 'tasks';
  @StorageLink(KEY_ACCENT) private accent: number = 0;
  onOpen: () => void = () => {};
  onToggle: () => void = () => {};

  private async schedule(action: string): Promise<void> {
    try {
      const data = getWorkspace();
      const item = entries(data, this.collection).find((v) => v.id === this.item.id);
      if (!item) return;
      const today = localDate();
      if (action === 'dismiss') item.dismissedTodayDate = today;
      else {
        item.plannedDate = action === 'today' ? today : addDays(today, 1);
        item.dismissedTodayDate = undefined;
        if (this.collection === 'tasks') item.today = action === 'today';
        if (action === 'advance') {
          const dates = item.progressedDates ?? [];
          if (!dates.includes(today)) dates.push(today);
          item.progressedDates = dates;
        }
      }
      await saveWorkspace(data);
    } catch (error) {
      this.getUIContext().getPromptAction().showToast({ message: (error as Error).message });
    }
  }

  build() {
    Row({ space: 12 }) {
      if (this.collection === 'tasks' || this.collection === 'milestones' || this.collection === 'habits') {
        Checkbox({ name: this.item.id })
          .select(this.collection === 'habits' ? this.item.lastCompletedDate === localDate() : this.item.done === true)
          .selectedColor(ACCENT_RESOURCES[this.accent])
          .onChange(() => this.onToggle())
          .accessibilityText(`${this.item.done ? '取消完成' : '完成'}${this.item.title}`)
      }
      Column({ space: 6 }) {
        Text(this.item.title).fontSize(17).fontWeight(FontWeight.Medium)
          .fontColor($r('app.color.text_primary')).width('100%')
        Text(entrySubtitle(this.item) || '点击记录更多内容')
          .fontSize(13).fontColor($r('app.color.text_secondary')).width('100%').maxLines(2)
        if (this.item.progress !== undefined && typeof this.item.progress === 'number' &&
          (this.collection !== 'tasks' || this.item.mode === 'multi')) {
          Progress({ value: this.item.progress as number, total: 100, type: ProgressType.Linear })
            .color(ACCENT_RESOURCES[this.accent]).width('100%')
            .accessibilityText(`进度百分之${this.item.progress}`)
        }
      }
      .layoutWeight(1).alignItems(HorizontalAlign.Start)
      .onClick(() => this.onOpen()).accessibilityText(`打开${this.item.title}`).accessibilityRole(AccessibilityRoleType.BUTTON)
      if (this.collection === 'tasks' || (this.collection === 'milestones' && (!!this.item.courseId || this.item.alsoTask))) {
        Button('更多').bindMenu([
          { value: '今天做', action: () => this.schedule('today') },
          { value: '取消今天', action: () => this.schedule('dismiss') },
          { value: '推迟一天', action: () => this.schedule('postpone') },
          { value: '今天已推进，明天继续', action: () => this.schedule('advance') }
        ]).accessibilityText(`${this.item.title}的安排操作`)
      }
      Button('详情').type(ButtonType.Normal).borderRadius(12)
        .fontColor(ACCENT_RESOURCES[this.accent]).backgroundColor($r('app.color.surface_secondary'))
        .onClick(() => this.onOpen()).accessibilityText(`查看${this.item.title}详情`)
    }
    .width('100%').padding(16).borderRadius(16).backgroundColor($r('app.color.surface'))
  }
}
