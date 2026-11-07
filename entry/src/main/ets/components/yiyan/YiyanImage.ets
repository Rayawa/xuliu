import { KEY_ACTIVE, KEY_CLOUD_SESSION } from '../../config/constants';
import { image } from '@kit.ImageKit';
import { YiyanImageLoader } from '../../services/yiyan/YiyanImages';

@Component
export struct YiyanImage {
  @StorageLink(KEY_ACTIVE) @Watch('activeChanged') private active: boolean = true;
  @StorageLink(KEY_CLOUD_SESSION) @Watch('activeChanged') private session: number = 0;
  @Prop source: string = '';
  @Prop clarity: number = 100;
  @Prop compact: boolean = false;
  @State private pixels: image.PixelMap | undefined = undefined;
  @State private status: string = 'loading';
  private loader: YiyanImageLoader = new YiyanImageLoader();
  private alive: boolean = true;
  private version: number = 0;

  aboutToAppear(): void { this.load(); }
  aboutToDisappear(): void { this.alive = false; this.version++; this.loader.cancel(); this.pixels?.release().catch(() => {}); this.pixels = undefined; }
  private activeChanged(): void {
    this.version++; this.loader.cancel();
    if (this.active && this.alive && !this.pixels) this.load();
  }
  private async load(): Promise<void> {
    if (!this.source || !this.active || !this.alive) return;
    const version = ++this.version;
    this.status = 'loading';
    try {
      const pixels = await this.loader.pixelMap(this.source);
      if (!this.alive || !this.active || version !== this.version) { await pixels.release(); return; }
      this.pixels = pixels; this.status = 'ready';
    } catch (_) { if (this.alive && version === this.version) this.status = 'error'; }
  }
  build() {
    Column({ space: 6 }) {
      if (this.pixels) {
        Image(this.pixels).width('100%').height(this.compact ? 130 : 240).objectFit(ImageFit.Cover)
          .blur((100 - Math.max(0, Math.min(100, this.clarity))) * 0.06).borderRadius(14).accessibilityText('一言图文配图')
      } else if (this.status === 'error') {
        Button('配图未载入，重试').onClick(() => this.load()).accessibilityText('重新读取一言配图，先通过序流服务读取原图，失败再从公开图片地址读取')
      } else { Text('正在载入配图…').fontSize(13).fontColor($r('app.color.text_secondary')) }
    }.width('100%')
  }
}
