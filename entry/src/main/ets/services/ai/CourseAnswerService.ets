import { blocksFor, setBlocks } from '../../domain/workspace/WorkspaceDomain';
import { CloudApi } from '../api/CloudApi';
import { currentCloudAccount } from '../../state/cloudSession';
import { Block } from '../../models/Workspace';
import { getWorkspace, saveWorkspace } from '../storage/storage';
import { MAX_DOCUMENT_BLOCKS } from '../../config/constants';

export async function insertCourseAnswer(api: CloudApi, owner: string, courseId: string, blocks: Block[]): Promise<string> {
  if (!currentCloudAccount() || currentCloudAccount()?.id !== owner) throw new Error('只能插入自己空间中的课程笔记');
  const remote = await api.read(owner); const course = remote.data?.courses.find((entry) => entry.id === courseId);
  if (!remote.data || remote.readOnly || !course) throw new Error('云端课程不存在或只读，请先同步课程');
  const existing = blocksFor(course);
  const additions = blocks.filter((block) => !existing.some((entry) => entry.id === block.id));
  if (existing.length + additions.length > MAX_DOCUMENT_BLOCKS) throw new Error('课程文档内容块已达上限');
  if (additions.length) { setBlocks(course, existing.concat(additions)); await api.save(remote.data, remote.revision); }
  const local = getWorkspace(); const localCourse = local.courses.find((entry) => entry.id === courseId);
  if (!localCourse) return '已插入云端课程笔记；本机尚无同编号课程，可下载云端工作台查看';
  const localBlocks = blocksFor(localCourse); const newBlocks = blocks.filter((block) => !localBlocks.some((entry) => entry.id === block.id));
  if (localBlocks.length + newBlocks.length > MAX_DOCUMENT_BLOCKS) return '已插入云端课程笔记；本机内容块已达上限，未覆盖本机笔记';
  setBlocks(localCourse, localBlocks.concat(newBlocks));
  try { if (newBlocks.length) await saveWorkspace(local); }
  catch (_) { return '云端已插入，本机保存未完成；可重试插入以核对同一组笔记，不会重复新增'; }
  return '已插入云端和本机课程笔记，原有内容保留';
}
