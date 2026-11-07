import { TextModifier } from '@kit.ArkUI';
import { HdsListItemCard, IconSize, PrefixIcon, SuffixCustomBuilder } from '@kit.UIDesignKit';
import { KEY_VIBRATION_LEVEL, LIST_ITEM_PREFIX_MARGIN, LIST_ITEM_SUFFIX_MARGIN } from '../../config/constants';
import { vibration } from '../../utils/device/vibration';

@Component
export struct SettingsLinkRow {
  @Prop label: string = '';
  @Prop icon: Resource = $r('sys.symbol.square_grid_2x2');
  @StorageLink(KEY_VIBRATION_LEVEL) private vibrationLevel: number = 1;
  onOpen: () => void = () => {};

  @Builder
  private arrow(): void {
    Image($r('app.media.right')).width(20).height(20)
      .objectFit(ImageFit.Contain).accessibilityLevel('no')
  }

  build() {
    HdsListItemCard({
      prefixItem: new PrefixIcon({
        iconSize: IconSize.SYSTEM_ICON,
        iconValue: { image: this.icon },
      }),
      textItem: {
        primaryText: {
          text: this.label,
          modifier: new TextModifier()
            .fontSize(16)
            .fontColor($r('app.color.v3_text_primary')),
        },
      },
      suffixItem: new SuffixCustomBuilder(() => { this.arrow() }),
      onClick: () => {
        if (this.vibrationLevel > 0) vibration.dotVibration();
        this.onOpen();
      },
      cardHeight: 54,
      cardBackgroundColor: $r('app.color.v3_surface'),
      cardBorderRadius: 0,
      hoverBorderRadius: 12,
      cardPrefixMargin: LIST_ITEM_PREFIX_MARGIN,
      cardSuffixMargin: LIST_ITEM_SUFFIX_MARGIN,
      accessibilityOptions: { accessibilityText: `进入${this.label}` },
    })
  }
}
