import { HdsListItemCard, IconSize, PrefixIcon } from '@kit.UIDesignKit';
import {
  DEFAULT_IMMERSIVE_MATERIAL_LEVEL, DEFAULT_LIGHT_FIELD_LEVEL, DEFAULT_VIBRATION_LEVEL,
  KEY_ACCENT, KEY_IMMERSIVE_MATERIAL_LEVEL, KEY_LIGHT_FIELD_LEVEL, KEY_REMINDERS, KEY_THEME, KEY_USERNAME,
  KEY_VIBRATION_LEVEL, LIST_ITEM_DIVIDER_HORIZONTAL_MARGIN, LIST_ITEM_PREFIX_MARGIN, LIST_ITEM_SUFFIX_MARGIN,
} from '../../config/constants';
import {
  setImmersiveMaterialLevel, setLightFieldLevel, setSetting, setVibrationLevel,
} from '../../services/storage/storage';
import { isHdrLightFieldSupported } from '../../ui/theme/visualEffects';
import { vibration } from '../../utils/device/vibration';
import { UsernameEditor } from './UsernameEditor';

const THEME_LABELS: string[] = ['跟随系统', '浅色', '深色'];
const ACCENT_LABELS: string[] = ['海蓝', '青色', '紫色', '琥珀'];
const VIBRATION_LABELS: string[] = ['关闭', '灵动', '硬朗'];
// 材质等级滑块方向与存储值相反：滑块 0 档为最流畅，2 档为最精美。
const MATERIAL_LABELS: string[] = ['流畅', '轻柔', '精美'];
const LIGHT_FIELD_LABELS: string[] = ['暗淡', '明亮', '高亮'];
const SLIDER_WIDTH: number = 190;
const OPTION_LABEL_WIDTH: number = 40;
const NARROW_SETTINGS_WIDTH: number = 330;
const SETTING_ITEM_HEIGHT: number = 68;
const SETTING_ITEM_HEIGHT_NARROW: number = 116;
const USERNAME_ITEM_HEIGHT_NARROW: number = 108;
const LIGHT_FIELD_HDR_LEVEL: number = 2;

@Component
export struct SettingsPanel {
  @StorageLink(KEY_USERNAME) private username: string = '朋友';
  @StorageLink(KEY_THEME) private theme: number = 0;
  @StorageLink(KEY_ACCENT) private accent: number = 0;
  @StorageLink(KEY_REMINDERS) private reminders: boolean = true;
  @StorageLink(KEY_VIBRATION_LEVEL) private vibrationLevel: number = DEFAULT_VIBRATION_LEVEL;
  @StorageLink(KEY_IMMERSIVE_MATERIAL_LEVEL) private immersiveMaterialLevel: number = DEFAULT_IMMERSIVE_MATERIAL_LEVEL;
  @StorageLink(KEY_LIGHT_FIELD_LEVEL) private lightFieldLevel: number = DEFAULT_LIGHT_FIELD_LEVEL;
  @State private contentWidth: number = 0;
  private readonly vibrationSupported: boolean = vibration.isSupported();
  onMessage: (message: string) => void = () => {};

  private usernamePrefixItem: PrefixIcon = new PrefixIcon({
    iconSize: IconSize.SYSTEM_ICON,
    iconValue: { image: $r('app.media.user') },
  });

  private themePrefixItem: PrefixIcon = new PrefixIcon({
    iconSize: IconSize.SYSTEM_ICON,
    iconValue: { image: $r('app.media.settings') },
  });

  private accentPrefixItem: PrefixIcon = new PrefixIcon({
    iconSize: IconSize.SYSTEM_ICON,
    iconValue: { image: $r('app.media.rcON') },
  });

  private reminderPrefixItem: PrefixIcon = new PrefixIcon({
    iconSize: IconSize.SYSTEM_ICON,
    iconValue: { image: $r('app.media.button') },
  });

  private vibrationPrefixItem: PrefixIcon = new PrefixIcon({
    iconSize: IconSize.SYSTEM_ICON,
    iconValue: { image: $r('app.media.vibrate') },
  });

  private materialPrefixItem: PrefixIcon = new PrefixIcon({
    iconSize: IconSize.SYSTEM_ICON,
    iconValue: { image: $r('app.media.immersive') },
  });

  private lightFieldPrefixItem: PrefixIcon = new PrefixIcon({
    iconSize: IconSize.SYSTEM_ICON,
    iconValue: { image: $r('app.media.light') },
  });

  private persistSetting(key: string, value: string | number | boolean): void {
    setSetting(key, value)
      .then((): void => this.onMessage('设置已保存'))
      .catch((error: Error): void => this.onMessage(error.message));
  }

  private persistUsername(value: string): void {
    this.persistSetting(KEY_USERNAME, value);
  }

  private isNarrowSettings(): boolean {
    return this.contentWidth > 0 && this.contentWidth < NARROW_SETTINGS_WIDTH;
  }

  private themeName(): string {
    if (this.theme === 1) {
      return '浅色';
    }

    if (this.theme === 2) {
      return '深色';
    }

    return '跟随系统';
  }

  private accentName(): string {
    if (this.accent === 1) {
      return '青色';
    }

    if (this.accent === 2) {
      return '紫色';
    }

    if (this.accent === 3) {
      return '琥珀';
    }

    return '海蓝';
  }

  private vibrationLevelName(): string {
    if (this.vibrationLevel === 0) {
      return '关闭';
    }

    if (this.vibrationLevel === 1) {
      return '灵动';
    }

    return '硬朗';
  }

  private materialLevelName(): string {
    if (this.immersiveMaterialLevel === 2) {
      return '流畅';
    }

    if (this.immersiveMaterialLevel === 1) {
      return '轻柔';
    }

    return '精美';
  }

  private lightFieldLevelName(): string {
    if (this.lightFieldLevel === 0) {
      return '暗淡';
    }

    if (this.lightFieldLevel === 2) {
      return '高亮';
    }

    return '明亮';
  }

  private persistLightFieldLevel(level: number): void {
    setLightFieldLevel(level).catch((error: Error): void => {
      console.error('[Xuliu][component/SettingsPanel][ERROR]', `保存光场视效失败: ${error.message}`);
    });
  }

  private showLightFieldPrompt(message: string): void {
    try {
      this.getUIContext().getPromptAction().showToast({ message: message, duration: 4000 });
    } catch (error) {
      console.warn('[Xuliu][component/SettingsPanel][WARN]', `显示光场视效提示失败: ${JSON.stringify(error)}`);
    }
  }

  private onLightFieldLevelChange(value: number, mode: SliderChangeMode): void {
    if (mode !== SliderChangeMode.Click && mode !== SliderChangeMode.End) {
      return;
    }

    const nextLevel: number = Math.round(value);
    vibration.dotVibration();

    if (!isHdrLightFieldSupported() && nextLevel === LIGHT_FIELD_HDR_LEVEL) {
      this.lightFieldLevel = 1;
      this.persistLightFieldLevel(1);
      this.showLightFieldPrompt('当前设备不支持全局HDR功能');
      return;
    }

    this.lightFieldLevel = nextLevel;
    this.persistLightFieldLevel(nextLevel);
    if (nextLevel === LIGHT_FIELD_HDR_LEVEL) {
      this.showLightFieldPrompt('光场视效将以HDR显示，该功能会显著提升亮度与功耗，部分设备不支持');
    }
  }

  @Builder
  private optionLabel(label: string, selected: boolean, accessibility: string): void {
    Text(label)
      .fontSize(12)
      .fontWeight(selected ? FontWeight.Medium : FontWeight.Regular)
      .fontColor(selected ? $r('app.color.diff_content') : $r('app.color.v3_text_secondary'))
      .width(OPTION_LABEL_WIDTH)
      .textAlign(TextAlign.Center)
      .accessibilityText(accessibility)
  }

  @Builder
  private lightFieldOptionLabel(label: string, level: number): void {
    Text(label)
      .fontSize(12)
      .fontWeight(this.lightFieldLevel === level ? FontWeight.Medium : FontWeight.Regular)
      .fontColor(level === LIGHT_FIELD_HDR_LEVEL && !isHdrLightFieldSupported() ?
        $r('app.color.v3_text_secondary') :
        this.lightFieldLevel === level ?
          $r('app.color.diff_content') : $r('app.color.v3_text_secondary'))
      .opacity(level === LIGHT_FIELD_HDR_LEVEL && !isHdrLightFieldSupported() ? 0.55 : 1)
      .decoration({
        type: level === LIGHT_FIELD_HDR_LEVEL && !isHdrLightFieldSupported() ?
          TextDecorationType.LineThrough : TextDecorationType.None,
        color: $r('app.color.v3_text_secondary'),
      })
      .width(OPTION_LABEL_WIDTH)
      .textAlign(TextAlign.Center)
      .accessibilityText(`${label}光场${this.lightFieldLevel === level ? '，已选择' : ''}${
        level === LIGHT_FIELD_HDR_LEVEL && !isHdrLightFieldSupported() ? '，当前设备不支持' : ''}`)
  }

  @Builder
  private divider(): void {
    Divider()
      .color($r('app.color.border'))
      .strokeWidth(0.5)
      .margin({
        left: LIST_ITEM_DIVIDER_HORIZONTAL_MARGIN,
        right: LIST_ITEM_DIVIDER_HORIZONTAL_MARGIN,
      })
  }

  @Builder
  private usernameItem(): void {
    HdsListItemCard({
      prefixItem: this.usernamePrefixItem,
      textItem: {
        customBuilder: () => {
          this.usernameContent();
        },
      },
      cardHeight: this.isNarrowSettings() ? USERNAME_ITEM_HEIGHT_NARROW : SETTING_ITEM_HEIGHT,
      cardBackgroundColor: $r('app.color.v3_surface'),
      cardBorderRadius: 0,
      hoverBorderRadius: 12,
      cardPrefixMargin: LIST_ITEM_PREFIX_MARGIN,
      cardSuffixMargin: LIST_ITEM_SUFFIX_MARGIN,
      accessibilityOptions: {
        accessibilityText: `首页称呼设置，当前${this.username || '朋友'}`,
      },
    })
  }

  @Builder
  private usernameContent(): void {
    UsernameEditor({
      initialUsername: this.username,
      narrow: this.isNarrowSettings(),
      onCommit: (value: string): void => this.persistUsername(value),
    })
  }

  @Builder
  private themeItem(): void {
    HdsListItemCard({
      prefixItem: this.themePrefixItem,
      textItem: {
        customBuilder: () => {
          this.themeContent();
        },
      },
      cardHeight: this.isNarrowSettings() ? SETTING_ITEM_HEIGHT_NARROW : SETTING_ITEM_HEIGHT,
      cardBackgroundColor: $r('app.color.v3_surface'),
      cardBorderRadius: 0,
      hoverBorderRadius: 12,
      cardPrefixMargin: LIST_ITEM_PREFIX_MARGIN,
      cardSuffixMargin: LIST_ITEM_SUFFIX_MARGIN,
      accessibilityOptions: {
        accessibilityText: `外观模式设置，当前${this.themeName()}`,
      },
    })
  }

  @Builder
  private themeContent(): void {
    Flex({ wrap: FlexWrap.Wrap, justifyContent: FlexAlign.SpaceBetween, alignItems: ItemAlign.Center }) {
      Text('外观')
        .fontSize(16)
        .fontColor($r('app.color.v3_text_primary'))
        .maxLines(2)
        .accessibilityText('外观')

      Column({ space: 1 }) {
        Slider({
          value: this.theme,
          min: 0,
          max: 2,
          step: 1,
          style: SliderStyle.InSet,
        })
          .width(SLIDER_WIDTH)
          .selectedColor($r('app.color.diff_content'))
          .trackColor($r('app.color.v3_surface_alt'))
          .blockBorderColor($r('app.color.v3_surface'))
          .showSteps(true)
          .showTips(false)
          .onChange((value: number, mode: SliderChangeMode): void => {
            if (mode === SliderChangeMode.Click || mode === SliderChangeMode.End) {
              vibration.dotVibration();
              this.persistSetting(KEY_THEME, Math.round(value));
            }
          })
          .accessibilityText(`外观，当前${this.themeName()}，共三档`)

        Row() {
          this.optionLabel(THEME_LABELS[0], this.theme === 0, `跟随系统外观${this.theme === 0 ? '，已选择' : ''}`)
          this.optionLabel(THEME_LABELS[1], this.theme === 1, `浅色外观${this.theme === 1 ? '，已选择' : ''}`)
          this.optionLabel(THEME_LABELS[2], this.theme === 2, `深色外观${this.theme === 2 ? '，已选择' : ''}`)
        }
        .width(SLIDER_WIDTH)
        .justifyContent(FlexAlign.SpaceBetween)
      }
      .width(SLIDER_WIDTH)
      .margin({ top: this.isNarrowSettings() ? 4 : 0 })
    }
    .width('100%')
    .padding({ right: 2 })
    .accessibilityGroup(false).accessibilityLevel('no')
    .accessibilityText(`外观，当前${this.themeName()}`)
  }

  @Builder
  private accentItem(): void {
    HdsListItemCard({
      prefixItem: this.accentPrefixItem,
      textItem: {
        customBuilder: () => {
          this.accentContent();
        },
      },
      cardHeight: this.isNarrowSettings() ? SETTING_ITEM_HEIGHT_NARROW : SETTING_ITEM_HEIGHT,
      cardBackgroundColor: $r('app.color.v3_surface'),
      cardBorderRadius: 0,
      hoverBorderRadius: 12,
      cardPrefixMargin: LIST_ITEM_PREFIX_MARGIN,
      cardSuffixMargin: LIST_ITEM_SUFFIX_MARGIN,
      accessibilityOptions: {
        accessibilityText: `主题色设置，当前${this.accentName()}`,
      },
    })
  }

  @Builder
  private accentContent(): void {
    Flex({ wrap: FlexWrap.Wrap, justifyContent: FlexAlign.SpaceBetween, alignItems: ItemAlign.Center }) {
      Text('主题色')
        .fontSize(16)
        .fontColor($r('app.color.v3_text_primary'))
        .maxLines(2)
        .accessibilityText('主题色')

      Column({ space: 1 }) {
        Slider({
          value: this.accent,
          min: 0,
          max: 3,
          step: 1,
          style: SliderStyle.InSet,
        })
          .width(SLIDER_WIDTH)
          .selectedColor($r('app.color.diff_content'))
          .trackColor($r('app.color.v3_surface_alt'))
          .blockBorderColor($r('app.color.v3_surface'))
          .showSteps(true)
          .showTips(false)
          .onChange((value: number, mode: SliderChangeMode): void => {
            if (mode === SliderChangeMode.Click || mode === SliderChangeMode.End) {
              vibration.dotVibration();
              this.persistSetting(KEY_ACCENT, Math.round(value));
            }
          })
          .accessibilityText(`主题色，当前${this.accentName()}，共四档`)

        Row() {
          this.optionLabel(ACCENT_LABELS[0], this.accent === 0, `海蓝主题色${this.accent === 0 ? '，已选择' : ''}`)
          this.optionLabel(ACCENT_LABELS[1], this.accent === 1, `青色主题色${this.accent === 1 ? '，已选择' : ''}`)
          this.optionLabel(ACCENT_LABELS[2], this.accent === 2, `紫色主题色${this.accent === 2 ? '，已选择' : ''}`)
          this.optionLabel(ACCENT_LABELS[3], this.accent === 3, `琥珀主题色${this.accent === 3 ? '，已选择' : ''}`)
        }
        .width(SLIDER_WIDTH)
        .justifyContent(FlexAlign.SpaceBetween)
      }
      .width(SLIDER_WIDTH)
      .margin({ top: this.isNarrowSettings() ? 4 : 0 })
    }
    .width('100%')
    .padding({ right: 2 })
    .accessibilityGroup(false).accessibilityLevel('no')
    .accessibilityText(`主题色，当前${this.accentName()}`)
  }

  @Builder
  private reminderItem(): void {
    HdsListItemCard({
      prefixItem: this.reminderPrefixItem,
      textItem: {
        customBuilder: () => {
          this.reminderContent();
        },
      },
      cardHeight: this.isNarrowSettings() ? SETTING_ITEM_HEIGHT_NARROW : SETTING_ITEM_HEIGHT,
      cardBackgroundColor: $r('app.color.v3_surface'),
      cardBorderRadius: 0,
      hoverBorderRadius: 12,
      cardPrefixMargin: LIST_ITEM_PREFIX_MARGIN,
      cardSuffixMargin: LIST_ITEM_SUFFIX_MARGIN,
      accessibilityOptions: {
        accessibilityText: `应用前台提醒设置，当前${this.reminders ? '已开启' : '已关闭'}`,
      },
    })
  }

  @Builder
  private reminderContent(): void {
    Flex({ wrap: FlexWrap.Wrap, justifyContent: FlexAlign.SpaceBetween, alignItems: ItemAlign.Center }) {
      Text('应用前台提醒')
        .fontSize(16)
        .fontColor($r('app.color.v3_text_primary'))
        .maxLines(2)
        .accessibilityText('应用前台提醒')

      Toggle({ type: ToggleType.Switch, isOn: this.reminders })
        .selectedColor($r('app.color.diff_content'))
        .margin({ top: this.isNarrowSettings() ? 4 : 0 })
        .onChange((enabled: boolean): void => {
          this.reminders = enabled;
          vibration.dotVibration();
          this.persistSetting(KEY_REMINDERS, enabled);
        })
        .accessibilityText(`应用前台提醒，当前${this.reminders ? '已开启' : '已关闭'}`)
    }
    .width('100%')
    .padding({ right: 2 })
    .accessibilityGroup(false).accessibilityLevel('no')
    .accessibilityText(`应用前台提醒，当前${this.reminders ? '已开启' : '已关闭'}`)
  }

  @Builder
  private vibrationLevelItem(): void {
    HdsListItemCard({
      prefixItem: this.vibrationPrefixItem,
      textItem: {
        customBuilder: () => {
          this.vibrationLevelContent();
        },
      },
      cardHeight: this.isNarrowSettings() ? SETTING_ITEM_HEIGHT_NARROW : SETTING_ITEM_HEIGHT,
      cardBackgroundColor: $r('app.color.v3_surface'),
      cardBorderRadius: 0,
      hoverBorderRadius: 12,
      cardPrefixMargin: LIST_ITEM_PREFIX_MARGIN,
      cardSuffixMargin: LIST_ITEM_SUFFIX_MARGIN,
      accessibilityOptions: {
        accessibilityText: `振动强度设置，当前${this.vibrationLevelName()}`,
      },
    })
  }

  @Builder
  private vibrationLevelContent(): void {
    Flex({ wrap: FlexWrap.Wrap, justifyContent: FlexAlign.SpaceBetween, alignItems: ItemAlign.Center }) {
      Text('振动强度')
        .fontSize(16)
        .fontColor($r('app.color.v3_text_primary'))
        .maxLines(2)
        .accessibilityText('振动强度')

      Column({ space: 1 }) {
        Slider({
          value: $$this.vibrationLevel,
          min: 0,
          max: 2,
          step: 1,
          style: SliderStyle.InSet,
        })
          .width(SLIDER_WIDTH)
          .selectedColor($r('app.color.diff_content'))
          .trackColor($r('app.color.v3_surface_alt'))
          .blockBorderColor($r('app.color.v3_surface'))
          .showSteps(true)
          .showTips(false)
          .onChange((value: number, mode: SliderChangeMode): void => {
            if (mode === SliderChangeMode.Click || mode === SliderChangeMode.End) {
              const nextLevel: number = Math.round(value);
              vibration.dotVibration();
              setVibrationLevel(nextLevel).catch((error: Error): void => {
                console.error('[Xuliu][component/SettingsPanel][ERROR]',
                  `保存振动强度失败: ${error.message}`);
              });
            }
          })
          .accessibilityText(`振动强度，当前${this.vibrationLevelName()}，共三档`)

        Row() {
          this.optionLabel(VIBRATION_LABELS[0], this.vibrationLevel === 0,
            `关闭振动${this.vibrationLevel === 0 ? '，已选择' : ''}`)
          this.optionLabel(VIBRATION_LABELS[1], this.vibrationLevel === 1,
            `灵动振动${this.vibrationLevel === 1 ? '，已选择' : ''}`)
          this.optionLabel(VIBRATION_LABELS[2], this.vibrationLevel === 2,
            `硬朗振动${this.vibrationLevel === 2 ? '，已选择' : ''}`)
        }
        .width(SLIDER_WIDTH)
        .justifyContent(FlexAlign.SpaceBetween)
      }
      .width(SLIDER_WIDTH)
      .margin({ top: this.isNarrowSettings() ? 4 : 0 })
    }
    .width('100%')
    .padding({ right: 2 })
    .accessibilityGroup(false).accessibilityLevel('no')
    .accessibilityText(`振动强度，当前${this.vibrationLevelName()}`)
  }

  @Builder
  private materialLevelItem(): void {
    HdsListItemCard({
      prefixItem: this.materialPrefixItem,
      textItem: {
        customBuilder: () => {
          this.materialLevelContent();
        },
      },
      cardHeight: this.isNarrowSettings() ? SETTING_ITEM_HEIGHT_NARROW : SETTING_ITEM_HEIGHT,
      cardBackgroundColor: $r('app.color.v3_surface'),
      cardBorderRadius: 0,
      hoverBorderRadius: 12,
      cardPrefixMargin: LIST_ITEM_PREFIX_MARGIN,
      cardSuffixMargin: LIST_ITEM_SUFFIX_MARGIN,
      accessibilityOptions: {
        accessibilityText: `材质等级设置，当前${this.materialLevelName()}`,
      },
    })
  }

  @Builder
  private materialLevelContent(): void {
    Flex({ wrap: FlexWrap.Wrap, justifyContent: FlexAlign.SpaceBetween, alignItems: ItemAlign.Center }) {
      Text('材质等级')
        .fontSize(16)
        .fontColor($r('app.color.v3_text_primary'))
        .maxLines(2)
        .accessibilityText('材质等级')

      Column({ space: 1 }) {
        Slider({
          value: 2 - this.immersiveMaterialLevel,
          min: 0,
          max: 2,
          step: 1,
          style: SliderStyle.InSet,
        })
          .width(SLIDER_WIDTH)
          .selectedColor($r('app.color.diff_content'))
          .trackColor($r('app.color.v3_surface_alt'))
          .blockBorderColor($r('app.color.v3_surface'))
          .showSteps(true)
          .showTips(false)
          .onChange((value: number, mode: SliderChangeMode): void => {
            if (mode === SliderChangeMode.Click || mode === SliderChangeMode.End) {
              const nextLevel: number = 2 - Math.round(value);
              this.immersiveMaterialLevel = nextLevel;
              vibration.dotVibration();
              setImmersiveMaterialLevel(nextLevel).catch((error: Error): void => {
                console.error('[Xuliu][component/SettingsPanel][ERROR]',
                  `保存材质等级失败: ${error.message}`);
              });
            }
          })
          .accessibilityText(`材质等级，当前${this.materialLevelName()}，共三档`)

        Row() {
          this.optionLabel(MATERIAL_LABELS[0], this.immersiveMaterialLevel === 2,
            `流畅材质${this.immersiveMaterialLevel === 2 ? '，已选择' : ''}`)
          this.optionLabel(MATERIAL_LABELS[1], this.immersiveMaterialLevel === 1,
            `轻柔材质${this.immersiveMaterialLevel === 1 ? '，已选择' : ''}`)
          this.optionLabel(MATERIAL_LABELS[2], this.immersiveMaterialLevel === 0,
            `精美材质${this.immersiveMaterialLevel === 0 ? '，已选择' : ''}`)
        }
        .width(SLIDER_WIDTH)
        .justifyContent(FlexAlign.SpaceBetween)
      }
      .width(SLIDER_WIDTH)
      .margin({ top: this.isNarrowSettings() ? 4 : 0 })
    }
    .width('100%')
    .padding({ right: 2 })
    .accessibilityGroup(false).accessibilityLevel('no')
    .accessibilityText(`材质等级，当前${this.materialLevelName()}`)
  }

  @Builder
  private lightFieldLevelItem(): void {
    HdsListItemCard({
      prefixItem: this.lightFieldPrefixItem,
      textItem: {
        customBuilder: () => {
          this.lightFieldLevelContent();
        },
      },
      cardHeight: this.isNarrowSettings() ? SETTING_ITEM_HEIGHT_NARROW : SETTING_ITEM_HEIGHT,
      cardBackgroundColor: $r('app.color.v3_surface'),
      cardBorderRadius: 0,
      hoverBorderRadius: 12,
      cardPrefixMargin: LIST_ITEM_PREFIX_MARGIN,
      cardSuffixMargin: LIST_ITEM_SUFFIX_MARGIN,
      accessibilityOptions: {
        accessibilityText: `光场视效设置，当前${this.lightFieldLevelName()}`,
      },
    })
  }

  @Builder
  private lightFieldLevelContent(): void {
    Flex({ wrap: FlexWrap.Wrap, justifyContent: FlexAlign.SpaceBetween, alignItems: ItemAlign.Center }) {
      Text('光场视效')
        .fontSize(16)
        .fontColor($r('app.color.v3_text_primary'))
        .maxLines(2)
        .accessibilityText('光场视效')

      Column({ space: 1 }) {
        Slider({
          value: $$this.lightFieldLevel,
          min: 0,
          max: 2,
          step: 1,
          style: SliderStyle.InSet,
        })
          .width(SLIDER_WIDTH)
          .selectedColor($r('app.color.diff_content'))
          .trackColor($r('app.color.v3_surface_alt'))
          .blockBorderColor($r('app.color.v3_surface'))
          .showSteps(true)
          .showTips(false)
          .onChange((value: number, mode: SliderChangeMode): void => {
            this.onLightFieldLevelChange(value, mode);
          })
          .accessibilityText(`光场视效，当前${this.lightFieldLevelName()}，共三档`)

        Row() {
          this.lightFieldOptionLabel(LIGHT_FIELD_LABELS[0], 0)
          this.lightFieldOptionLabel(LIGHT_FIELD_LABELS[1], 1)
          this.lightFieldOptionLabel(LIGHT_FIELD_LABELS[2], 2)
        }
        .width(SLIDER_WIDTH)
        .justifyContent(FlexAlign.SpaceBetween)
      }
      .width(SLIDER_WIDTH)
      .margin({ top: this.isNarrowSettings() ? 4 : 0 })
    }
    .width('100%')
    .padding({ right: 2 })
    .accessibilityGroup(false).accessibilityLevel('no')
    .accessibilityText(`光场视效，当前${this.lightFieldLevelName()}`)
  }

  build() {
    Column() {
      this.usernameItem()

      this.divider()

      this.themeItem()

      this.divider()

      this.accentItem()

      this.divider()

      this.reminderItem()

      if (this.vibrationSupported) {
        this.divider()

        this.vibrationLevelItem()
      }

      this.divider()

      this.materialLevelItem()

      this.divider()

      this.lightFieldLevelItem()
    }
    .width('100%')
    .borderRadius(16)
    .backgroundColor($r('app.color.v3_surface'))
    .shadow({
      radius: 8,
      color: $r('app.color.v3_shadow'),
      offsetY: 2,
    })
    .clip(true)
    .onAreaChange((_oldValue: Area, newValue: Area): void => {
      this.contentWidth = Number(newValue.width);
    })
    .accessibilityGroup(false).accessibilityLevel('no')
    .accessibilityText('应用设置')
  }
}
