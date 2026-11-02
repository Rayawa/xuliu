import { clearCloudSession } from '../state/cloudSession';
import { UIAbility } from '@kit.AbilityKit';
import { window } from '@kit.ArkUI';
import { hilog } from '@kit.PerformanceAnalysisKit';
import { initializeAppState, setApplicationActive } from '../state/appState';
import { loadPersistedState, flushStorage } from '../services/storage/storage';
import { KEY_SAVE_ERROR } from '../config/constants';

export default class EntryAbility extends UIAbility {
  onCreate(): void {
    initializeAppState();
    loadPersistedState(this.context).catch((error: Error) => {
      AppStorage.setOrCreate(KEY_SAVE_ERROR, error.message || '工作台加载失败，原有文件已保留');
      hilog.error(0, 'Xuliu', 'Storage initialization failed');
    });
  }

  onWindowStageCreate(stage: window.WindowStage): void {
    stage.loadContent('pages/Index', (error) => {
      if (error.code) hilog.error(0, 'Xuliu', 'Cannot load main page: %{public}d', error.code);
    });
  }

  onForeground(): void { setApplicationActive(true); }
  onBackground(): void { setApplicationActive(false); flushStorage().catch(() => {}); }
  onDestroy(): void { clearCloudSession(); setApplicationActive(false); flushStorage().catch(() => {}); }
}
