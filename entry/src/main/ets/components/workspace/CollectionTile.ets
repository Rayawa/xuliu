import { curves } from '@kit.ArkUI';
import { hdsEffect } from '@kit.UIDesignKit';
import { CollectionDefinition } from '../../models/Workspace';
import { pressLightFieldFilter, pressVisualEffect } from '../../ui/theme/visualEffects';

@Component
export struct CollectionTile {
  @Prop item: CollectionDefinition = {
    key: '', title: '', caption: '', group: '', symbol: $r('sys.symbol.book'),
  };
  @Prop count: number = 0;
  @Prop accent: Resource = $r('app.color.accent');
  @State private pressed: boolean = false;
  onOpen: () => void = () => {};

  build() {
    Column({ space: 12 }) {
      Row() {
        SymbolGlyph(this.item.symbol).fontSize(28).fontColor([this.accent]).accessibilityLevel('no')
        Blank()
        Text(String(this.count)).fontColor($r('app.color.text_secondary'))
      }.width('100%')
      Text(this.item.title).fontSize(20).fontWeight(FontWeight.Bold)
        .fontColor($r('app.color.text_primary')).width('100%')
      Text(this.item.caption).fontSize(14).fontColor($r('app.color.text_secondary')).width('100%')
    }
    .width('100%').padding(20).borderRadius(20)
    .backgroundColor($r('app.color.surface'))
    .border({ width: 1, color: $r('app.color.border') })
    .shadow({ radius: 12, color: $r('app.color.card_shadow'), offsetY: 3 })
    .scale({ x: this.pressed ? 0.985 : 1, y: this.pressed ? 0.985 : 1 })
    .animation({ duration: 130, curve: curves.springMotion(0.35, 0.9) })
    .visualEffect(pressVisualEffect(this.pressed, hdsEffect.PointLightIlluminatedType.BORDER))
    .compositingFilter(pressLightFieldFilter(this.pressed))
    .onTouch((event: TouchEvent): void => {
      if (event.type === TouchType.Down) this.pressed = true;
      else if (event.type === TouchType.Up || event.type === TouchType.Cancel) this.pressed = false;
    })
    .onClick(() => this.onOpen())
    .accessibilityGroup(true)
    .accessibilityRole(AccessibilityRoleType.BUTTON)
    .accessibilityText(`${this.item.title}，${this.count}项。${this.item.caption}`)
  }
}
