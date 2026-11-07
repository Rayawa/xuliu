import { reconcileTaskStages } from '../../domain/workspace/TaskStages';
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
    const before = JSON.stringify(data.tasks);
    const result = applyStudyPlan(data); reconcileTaskStages(data, localDate());
    if (result.changed || before !== JSON.stringify(data.tasks)) await saveWorkspace(data);
    lastSignature = signature;
  } finally { refreshing = false; }
}
