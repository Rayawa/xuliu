import { vibration } from '../../utils/device/vibration';
import { KEY_VIBRATION_LEVEL } from '../../config/constants';

@Component
export struct UsernameEditor {
    @Prop @Watch('onInitialUsernameChanged') initialUsername: string = '';
    @Prop narrow: boolean = false;
    onCommit?: (value: string) => void;
    @StorageLink(KEY_VIBRATION_LEVEL) vibrationLevel: number = 1;
    @State private draftUsername: string = '';
    @State private showHelp: boolean = false;
    private editing: boolean = false;
    private lastCommittedUsername: string = '';

    aboutToAppear(): void {
        this.draftUsername = this.initialUsername;
        this.lastCommittedUsername = this.initialUsername.trim();
    }

    aboutToDisappear(): void {
        this.commitDraft();
    }

    private onInitialUsernameChanged(): void {
        if (this.editing) return;
        this.draftUsername = this.initialUsername;
        this.lastCommittedUsername = this.initialUsername.trim();
    }

    private commitDraft(): void {
        const username = this.draftUsername.trim();
        if (this.draftUsername !== username) this.draftUsername = username;
        if (username === this.lastCommittedUsername) return;
        this.lastCommittedUsername = username;
        if (this.onCommit) this.onCommit(username || '朋友');
    }

    build() {
        Flex({
            wrap: FlexWrap.Wrap,
            justifyContent: FlexAlign.SpaceBetween,
            alignItems: ItemAlign.Center
        }) {
            Text('首页称呼')
                .fontSize(16)
                .fontColor($r('app.color.v3_text_primary'))
                .maxLines(2)
                .accessibilityText('首页称呼')

            Row({ space: 8 }) {
                TextInput({
                    text: this.draftUsername,
                    placeholder: '朋友'
                })
                    .layoutWeight(1)
                    .constraintSize({ minWidth: 120 })
                    .height(40)
                    .enableKeyboardOnFocus(false)
                    .backgroundColor($r('app.color.v3_surface_alt'))
                    .onChange((value: string): void => {
                        this.draftUsername = value;
                    })
                    .onEditChange((isEditing: boolean): void => {
                        this.editing = isEditing;
                        if (!isEditing) this.commitDraft();
                    })
                    .onSubmit((): void => this.commitDraft())
                    .accessibilityText(
                        `首页称呼输入框，当前为${this.draftUsername || '朋友'}`
                    )

                Image($r('app.media.question'))
                    .height(22)
                    .width(22)
                    .objectFit(ImageFit.Contain)
                    .clickEffect({ level: ClickEffectLevel.LIGHT, scale: 0.9 })
                    .onClick((): void => {
                        if (this.vibrationLevel > 0) vibration.dotVibration();
                        this.showHelp = !this.showHelp;
                    })
                    .bindPopup(this.showHelp, {
                        message: '此称呼显示在本机今日页；留空时使用“朋友”。',
                        onStateChange: (event): void => {
                            if (!event.isVisible) this.showHelp = false;
                        },
                    })
                    .accessibilityText('查看用户名说明')
            }
            .width(this.narrow ? '100%' : 204)
            .margin({ top: this.narrow ? 4 : 0 })
        }
        .padding({ right: 7 })
        .width('100%')
        .accessibilityGroup(false).accessibilityLevel('no')
        .accessibilityText(`首页称呼设置，当前${this.draftUsername || '朋友'}`)
    }
}
