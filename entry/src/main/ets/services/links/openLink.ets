import { common } from '@kit.AbilityKit';

export async function openLink(context: common.UIAbilityContext, url: string): Promise<void> {
  if (!/^https?:\/\//i.test(url)) throw new Error('请填写 http:// 或 https:// 开头的链接');
  await context.openLink(url, { appLinkingOnly: false });
}
