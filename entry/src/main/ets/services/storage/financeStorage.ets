import { FinanceState } from '../../models/Workspace';
import { getWorkspace, saveWorkspace } from './storage';

export async function changeFinance(change: (finance: FinanceState) => void): Promise<void> {
  const data = getWorkspace();
  change(data.finance);
  await saveWorkspace(data);
}
