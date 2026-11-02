import { PromptAction } from '@kit.ArkUI';

export function leaveWithUnsaved(prompt: PromptAction, stack: NavPathStack, dirty: boolean): void {
  if (!dirty) { stack.pop(); return; }
  prompt.showDialog({ title: '离开编辑？', message: '尚未保存的更改将被丢弃。',
    buttons: [{ text: '继续编辑', color: $r('app.color.accent') }, { text: '放弃更改', color: $r('app.color.danger') }]
  }).then((result) => { if (result.index === 1) stack.pop(); }).catch(() => {});
}
