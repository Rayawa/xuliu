import { curves, UIContext } from '@kit.ArkUI';
import {
  STAGGER_ENTER_DELAY_MS,
  STAGGER_ENTER_DURATION_MS,
  STAGGER_ENTER_INTERVAL_MS,
} from '../../config/constants';

/**
 * Dashboard 的列表页分组入场节奏。
 *
 * 单一 animStep 驱动任意数量的分组，避免为每组分别声明状态和定时器；
 * MyPage 与 Dashboard 的“我的”页使用同一组时长常量。
 */
export function startStaggerEnterAnimation(
  context: UIContext,
  stepCount: number,
  updateStep: (step: number) => void,
): number[] {
  const timers: number[] = [];
  for (let step = 1; step <= stepCount; step++) {
    const targetStep = step;
    timers.push(setTimeout((): void => {
      context.animateTo({
        duration: STAGGER_ENTER_DURATION_MS,
        curve: curves.springMotion(0.35, 0.75),
      }, (): void => updateStep(targetStep));
    }, STAGGER_ENTER_DELAY_MS + (step - 1) * STAGGER_ENTER_INTERVAL_MS));
  }
  return timers;
}

export function cancelStaggerEnterAnimation(timers: number[]): void {
  for (const timer of timers) {
    clearTimeout(timer);
  }
}
