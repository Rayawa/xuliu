import { getWorkspace, saveWorkspace } from '../storage/storage';
import { applyStudyPlan } from '../../domain/workspace/StudyAutomation';
import { localDate } from '../../domain/workspace/WorkspaceDomain';

let lastSignature: string = '';
let refreshing: boolean = false;

export async function refreshStudyPlan(): Promise<void> {
  if (refreshing) return;
  const data = getWorkspace();
  const signature = `${localDate()}:${JSON.stringify(data.courses)}:${JSON.stringify(data.timetableSettings)}:${data.studyAutomation.enabled}`;
  if (signature === lastSignature) return;
  refreshing = true;
  try {
    const result = applyStudyPlan(data);
    if (result.changed) await saveWorkspace(data);
    lastSignature = signature;
  } finally { refreshing = false; }
}
