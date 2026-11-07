import { LengthMetrics } from '@kit.ArkUI';
import { HdsNavigationTitleBarOptions, ScrollEffectType } from '@kit.UIDesignKit';
import {
  HDS_MATERIAL_TYPE_ADAPTIVE, HDS_TITLE_SIZE_SMALL,
} from '../../config/constants';
import { immersiveMaterialLevel } from '../../state/appState';

export function hdsPageTitle(title: string, onBack: () => void): HdsNavigationTitleBarOptions {
  return {
    style: {
      scrollEffectOpts: {
        enableScrollEffect: false,
        scrollEffectType: ScrollEffectType.GRADIENT_BLUR,
        blurEffectiveStartOffset: LengthMetrics.vp(0),
        blurEffectiveEndOffset: LengthMetrics.vp(20),
      },
      originalStyle: {
        backgroundStyle: { backgroundColor: $r('app.color.transparent') },
        contentStyle: {
          titleStyle: { mainTitleColor: $r('app.color.text_primary') },
          backIconStyle: {
            backgroundColor: $r('app.color.surface_secondary'),
            iconColor: $r('app.color.text_primary'),
          },
        },
      },
      scrollEffectStyle: {
        backgroundStyle: { backgroundColor: $r('app.color.transparent') },
        contentStyle: {
          titleStyle: { mainTitleColor: $r('app.color.text_primary') },
          backIconStyle: {
            backgroundColor: $r('app.color.surface_secondary'),
            iconColor: $r('app.color.text_primary'),
          },
        },
      },
      systemMaterialEffect: {
        materialType: HDS_MATERIAL_TYPE_ADAPTIVE,
        materialLevel: immersiveMaterialLevel(),
      },
    },
    content: {
      title: { mainTitle: title, mainTitleSize: HDS_TITLE_SIZE_SMALL },
      backIcon: { action: onBack },
    },
  };
}
