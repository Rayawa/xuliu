import { lifeRuntime } from '../services/life/LifeRuntime';
import { clearCloudSession } from '../state/cloudSession';
import { UIAbility } from '@kit.AbilityKit';
import { window } from '@kit.ArkUI';
import { hilog } from '@kit.PerformanceAnalysisKit';
import { initializeAppState, setApplicationActive, setSaveError } from '../state/appState';
import { loadPersistedState, flushStorage } from '../services/storage/storage';

export default class EntryAbility extends UIAbility {
  onCreate(): void {
    initializeAppState();
    loadPersistedState(this.context).then(() => lifeRuntime().initialize(this.context)).catch((error: Error) => {
      setSaveError(error.message || '工作台加载失败，原有文件已保留');
      hilog.error(0, 'Xuliu', 'Storage initialization failed');
    });
  }

  onWindowStageCreate(stage: window.WindowStage): void {
    stage.loadContent('pages/Dashboard', (error) => {
      if (error.code) hilog.error(0, 'Xuliu', 'Cannot load main page: %{public}d', error.code);
    });
  }

  onForeground(): void { setApplicationActive(true); lifeRuntime().setActive(true); }
  onBackground(): void { setApplicationActive(false); lifeRuntime().setActive(false); flushStorage().catch(() => {}); }
  onDestroy(): void { lifeRuntime().dispose(); clearCloudSession(); setApplicationActive(false); flushStorage().catch(() => {}); }
}
