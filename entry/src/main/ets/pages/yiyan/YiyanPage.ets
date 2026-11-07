import { hdsPageTitle } from '../../ui/navigation/hdsTitleBar';
import { FrameScheduler } from '../../utils/runtime/FrameScheduler';
import { HdsNavDestination, HdsNavDestinationTitleMode } from '@kit.UIDesignKit';
import { LengthMetrics } from '@kit.ArkUI';
import { KEY_CLOUD_SESSION, KEY_ACTIVE, KEY_YIYAN_CLARITY, YIYAN_DEFAULT_CLARITY, ROUTE_CLOUD } from '../../config/constants';
import { currentCloudAccount } from '../../state/cloudSession';
import { setSetting } from '../../services/storage/storage';
import { yiyanService } from '../../services/yiyan/YiyanService';
import { YiyanView, YiyanCard, YiyanBook, YiyanLibraryCard, emptyYiyanView } from '../../models/YiyanModels';
import { YiyanBookSource, YiyanCardSource } from '../../models/YiyanListSource';
import { YiyanImage } from '../../components/yiyan/YiyanImage';
import { YiyanQuote } from '../../components/yiyan/YiyanQuote';
import { YiyanLibraryCardView } from '../../components/yiyan/YiyanLibraryCardView';

@Component
export struct YiyanPage {
  @Consume('pageStack') private stack: NavPathStack;
  @StorageLink(KEY_CLOUD_SESSION) @Watch('sessionChanged') private session: number = 0;
  @StorageLink(KEY_ACTIVE) @Watch('visibilityChanged') private active: boolean = true;
  @StorageLink(KEY_YIYAN_CLARITY) private clarity: number = YIYAN_DEFAULT_CLARITY;
  @State private view: YiyanView = emptyYiyanView();
  @State private phone: string = '';
  @State private code: string = '';
  @State private nameDraft: string = '';
  @State private bookVisibility: string = 'private';
  @State private showNew: boolean = false;
  @State private showSettings: boolean = false;
  @State private now: number = Date.now();
  @State private localNotice: string = '';
  private libraryScroller: Scroller = new Scroller();
  private scrollFrame: FrameScheduler = new FrameScheduler();
  private books: YiyanBookSource = new YiyanBookSource();
  private cards: YiyanCardSource = new YiyanCardSource();
  private stopListening: (() => void) | undefined;
  private shown: boolean = false;
  private clock: number = -1;

  aboutToDisappear(): void { this.shown = false; this.detach(); }
  private sessionChanged(): void { this.phone = ''; this.code = ''; this.localNotice = ''; if (this.shown && this.active) yiyanService().start(); }
  private visibilityChanged(): void { if (this.shown && this.active) this.attach(); else this.detach(); }
  private attach(): void {
    if (this.stopListening) return;
    this.stopListening = yiyanService().subscribe((view) => {
      const previous = this.view; this.view = view;
      if (JSON.stringify(previous.books) !== JSON.stringify(view.books)) this.books.replace(view.books);
      if (previous.selected?.id !== view.selected?.id || JSON.stringify(previous.cards) !== JSON.stringify(view.cards)) this.cards.replace(view.cards);
      if (previous.selected?.id !== view.selected?.id || previous.page !== view.page || previous.library !== view.library) {
        try {
          this.scrollFrame.request(this.getUIContext(), () => {
            if (this.shown && this.active && this.view.library) this.libraryScroller.scrollToIndex(0, false, ScrollAlign.START);
          });
        } catch (_) {}
      }
      this.syncClock();
      if (view.connected && !view.loginOpen) { this.phone = ''; this.code = ''; }
      if (previous.busy === 'create' && !view.busy && !view.pending && !view.selected) { this.showNew = false; this.nameDraft = ''; }
    });
    this.syncClock(); yiyanService().start();
  }
  private syncClock(): void {
    this.now = Date.now();
    const needed = this.view.retryAt > this.now || this.view.refreshAt > this.now;
    if (!needed && this.clock >= 0) { clearInterval(this.clock); this.clock = -1; }
    if (needed && this.stopListening && this.clock < 0) this.clock = setInterval(() => this.syncClock(), 1000);
  }
  private detach(): void {
    this.scrollFrame.cancel();
    this.stopListening?.(); this.stopListening = undefined; this.phone = ''; this.code = '';
    if (this.clock >= 0) clearInterval(this.clock); this.clock = -1;
  }
  private async saveClarity(value: number): Promise<void> {
    try { await setSetting(KEY_YIYAN_CLARITY, Math.round(value)); }
    catch (error) { this.localNotice = (error as Error).message; }
  }
  private leave(): void {
    if (this.view.busy) { this.stack.pop(); return; }
    if (this.view.library) yiyanService().closeLibrary();
    else if (this.view.loginOpen) { this.phone = ''; this.code = ''; yiyanService().closeLogin(); }
    else this.stack.pop();
  }
  private connect(): void { const code = this.code.trim(); this.code = ''; yiyanService().signIn(this.phone.trim(), code); }
  private remaining(deadline: number): number { return Math.max(0, Math.ceil((deadline - this.now) / 1000)); }
  private saved(bookId: string): boolean { return !!this.view.card && this.view.saved.includes(`${this.view.card.id}:${bookId}`); }

  @Builder
  private statusMessage() {
    if (this.view.notice) { Text(this.view.notice).fontSize(14).fontColor($r('app.color.text_secondary')).width('100%').accessibilityText(this.view.notice) }
    if (this.localNotice) { Text(this.localNotice).fontColor($r('app.color.danger')).width('100%') }
    if (this.view.pending) {
      Text(`${this.view.pending.kind === 'create' ? '新建文集' : '收藏'}结果待核对，请先检查；检查操作不会重复提交写入。`)
        .fontColor($r('app.color.text_secondary')).width('100%')
      Button(this.view.busy === 'check' ? '检查中…' : '检查上次操作结果').enabled(!this.view.busy && this.view.connected)
        .onClick(() => yiyanService().checkResult()).accessibilityText('仅检查上次收藏或新建文集是否已经成功，不重复写入')
    }
  }

  @Builder
  private connectionForm() {
    if (this.view.loginOpen) {
      Column({ space: 12 }) {
        Text('连接一言账号').fontSize(20).fontWeight(FontWeight.Bold).fontColor($r('app.color.text_primary')).width('100%')
        Text('手机号和验证码只用于本次连接，不写入本机存储；断开不会退出手机端账号。').fontColor($r('app.color.text_secondary'))
        TextInput({ text: this.phone, placeholder: '一言手机号' }).type(InputType.PhoneNumber).maxLength(11).enabled(!this.view.busy)
          .onChange((value: string) => { this.phone = value.replace(/\D/g, ''); }).accessibilityText('用于连接一言的手机号，仅在当前表单内使用')
        Button(this.remaining(this.view.retryAt) ? `${this.remaining(this.view.retryAt)}秒后重发` : '发送验证码')
          .enabled(!this.view.busy && !this.remaining(this.view.retryAt) && /^1[3-9]\d{9}$/.test(this.phone.trim()))
          .onClick(() => yiyanService().sendCode(this.phone.trim())).accessibilityText('向填写的一言手机号发送短信验证码')
        TextInput({ text: this.code, placeholder: '短信验证码' }).type(InputType.Number).maxLength(8).enabled(!this.view.busy)
          .onChange((value: string) => { this.code = value.replace(/\D/g, ''); }).accessibilityText('填写一言短信验证码，提交后立即清空')
        Flex({ wrap: FlexWrap.Wrap, space: { main: LengthMetrics.vp(8), cross: LengthMetrics.vp(8) } }) {
          Button(this.view.busy === 'sign-in' ? '连接中…' : '连接一言').enabled(!this.view.busy && this.view.codeSent && /^\d{4,8}$/.test(this.code.trim()) && /^1[3-9]\d{9}$/.test(this.phone.trim()))
            .onClick(() => this.connect()).accessibilityText('使用短信验证码连接当前一言账号')
          Button('关闭表单').enabled(!this.view.busy).onClick(() => { this.phone = ''; this.code = ''; yiyanService().closeLogin(); }).accessibilityText('关闭一言连接表单并清空手机号和验证码')
        }
      }.padding(16).borderRadius(16).backgroundColor($r('app.color.surface')).width('100%')
    }
  }

  @Builder
  private newBookForm() {
    if (this.showNew) {
      Column({ space: 10 }) {
        TextInput({ text: this.nameDraft, placeholder: '文集名称' }).maxLength(60).enabled(!this.view.busy)
          .onChange((value: string) => { this.nameDraft = value; }).accessibilityText('新建一言文集名称，最多六十字')
        Select([{ value: '私密文集' }, { value: '公开文集' }]).selected(this.bookVisibility === 'private' ? 0 : 1)
          .value(this.bookVisibility === 'private' ? '私密文集' : '公开文集').enabled(!this.view.busy)
          .onSelect((index: number) => { this.bookVisibility = index === 0 ? 'private' : 'public'; }).accessibilityText('新文集可见范围，默认私密，可明确选择公开')
        if (this.bookVisibility === 'public') { Text('公开文集可被其他一言用户看到。').fontColor($r('app.color.text_secondary')) }
        Button(this.view.library === 'choose' ? '新建并收藏' : '新建文集').enabled(!this.view.busy && !this.view.pending && !!this.nameDraft.trim())
          .onClick(() => yiyanService().createBook(this.nameDraft, this.bookVisibility)).accessibilityText('按所选公开或私密范围新建一言文集；选择收藏模式时随后收藏当前图文')
      }.padding(14).width('100%').borderRadius(14).backgroundColor($r('app.color.surface'))
    }
  }

  @Builder
  private libraryHeader() {
    Column({ space: 12 }) {
      Text(this.view.selected?.name ?? (this.view.library === 'choose' ? '收藏到文集' : '我的文集')).fontSize(22).fontWeight(FontWeight.Bold).fontColor($r('app.color.text_primary')).width('100%')
      this.connectionForm()
      if (this.view.library === 'choose' && this.view.card) { Text(this.view.card.text.slice(0, 200)).fontColor($r('app.color.text_secondary')).width('100%') }
      Flex({ wrap: FlexWrap.Wrap, space: { main: LengthMetrics.vp(8), cross: LengthMetrics.vp(8) } }) {
        Button(this.view.selected ? '返回文集' : '刷新文集').enabled(!this.view.busy).onClick(() => yiyanService().openLibrary(this.view.library)).accessibilityText('重新读取一言文集列表')
        Button(this.showNew ? '收起新建' : '新建文集').enabled(!this.view.busy && !this.view.pending && !this.view.needsReconnect && this.view.connected)
          .onClick(() => { this.showNew = !this.showNew; }).accessibilityText('展开或收起新建一言文集表单')
        Button('返回图文').enabled(!this.view.busy).onClick(() => yiyanService().closeLibrary()).accessibilityText('关闭文集并返回当前一言图文')
      }
      this.newBookForm()
      this.statusMessage()
      if (this.view.selected && this.view.library === 'choose') {
        Button(this.saved(this.view.selected.id) ? '已收藏到此文集' : '收藏到此文集')
          .enabled(!this.view.busy && !this.view.pending && !this.saved(this.view.selected.id))
          .onClick(() => { if (this.view.selected) yiyanService().favorite(this.view.selected.id); }).accessibilityText('将当前一言图文收藏到正在查看的文集')
      }
    }.width('100%').alignItems(HorizontalAlign.Start)
  }

  @Builder
  private libraryBody() {
    List({ space: 14, scroller: this.libraryScroller }) {
      ListItem() { this.libraryHeader() }
      if (this.view.selected) {
        LazyForEach(this.cards, (card: YiyanLibraryCard) => {
          ListItem() { YiyanLibraryCardView({ card }) }
        }, (card: YiyanLibraryCard) => `${card.id}-${this.cards.version}`)
      } else {
        LazyForEach(this.books, (book: YiyanBook) => {
          ListItem() {
            Column({ space: 10 }) {
              ForEach(book.image ? [book.image] : [], (source: string) => { YiyanImage({ source, compact: true }) }, (source: string) => source)
              Button(book.name).enabled(!this.view.busy).onClick(() => yiyanService().openBook(book.id)).accessibilityText(`打开文集${book.name}`)
              Text(`${book.count}条 · ${book.private === null ? '可见范围未知' : book.private ? '私密' : '公开'}${book.id === this.view.defaultBookId ? ' · 默认文集' : ''}`)
                .fontSize(13).fontColor($r('app.color.text_secondary'))
              if (this.view.library === 'choose') {
                Button(this.saved(book.id) ? '已收藏' : '收藏到此文集').enabled(!this.view.busy && !this.view.pending && !this.saved(book.id))
                  .onClick(() => yiyanService().favorite(book.id)).accessibilityText(`将当前一言图文收藏到${book.name}`)
              }
            }.padding(16).width('100%').borderRadius(16).backgroundColor($r('app.color.surface')).alignItems(HorizontalAlign.Start)
          }
        }, (book: YiyanBook) => `${book.id}-${this.books.version}`)
      }
      ListItem() {
        Column({ space: 10 }) {
          if (this.view.busy) { Text('正在读取或处理…').fontColor($r('app.color.text_secondary')) }
          if (!this.view.busy && (this.view.selected ? !this.view.cards.length : !this.view.books.length)) { Text('暂无内容').fontColor($r('app.color.text_secondary')) }
          if (this.view.selected) {
            Text(`第${this.view.page}页 · 本页${this.view.cards.length}条`).fontSize(13).fontColor($r('app.color.text_secondary'))
          }
          if (this.view.selected && this.view.page > 1) {
            Button('上一页图文').enabled(!this.view.busy).onClick(() => yiyanService().previousBookPage()).accessibilityText('读取当前文集上一页图文')
          }
          if (this.view.selected && this.view.cursor) {
            Button('下一页图文').enabled(!this.view.busy).onClick(() => { if (this.view.selected) yiyanService().openBook(this.view.selected.id, true); }).accessibilityText('读取当前文集更早的下一页图文，仅保留当前页以控制内存')
          }
        }.width('100%')
      }
    }.width('100%').layoutWeight(1).cachedCount(2)
  }

  @Builder
  private mainBody() {
    Scroll() {
      Column({ space: 16 }) {
        if (!currentCloudAccount()) {
          Text('登录序流后连接你的一言账号。上次公开图文可离线查看。').fontColor($r('app.color.text_secondary'))
          Button('登录序流').onClick(() => this.stack.pushPath({ name: ROUTE_CLOUD })).accessibilityText('打开序流账号登录页')
        }
        if (this.view.card) {
          ForEach([this.view.card], (card: YiyanCard) => { YiyanQuote({ card, clarity: this.clarity }) }, (card: YiyanCard) => JSON.stringify(card))
        } else { Text('连接一言后，在这里阅读历史图文。').fontColor($r('app.color.text_secondary')) }
        Flex({ wrap: FlexWrap.Wrap, space: { main: LengthMetrics.vp(8), cross: LengthMetrics.vp(8) } }) {
          Button(this.remaining(this.view.refreshAt) ? '稍候换句' : '换一句').enabled(!this.view.busy && !this.remaining(this.view.refreshAt) && this.view.connected)
            .onClick(() => yiyanService().changeCard()).accessibilityText('换一条一言历史图文，优先使用预取图文')
          Button(this.saved(this.view.defaultBookId) ? '已收藏' : '收藏到默认文集').enabled(!this.view.busy && !this.view.pending && !!this.view.card && this.view.connected && !this.saved(this.view.defaultBookId))
            .onClick(() => yiyanService().favorite()).accessibilityText('将当前图文收藏到自己的一言默认文集')
          Button('选择其他文集').enabled(!this.view.busy && !!this.view.card).onClick(() => yiyanService().openLibrary('choose')).accessibilityText('选择其他一言文集收藏当前图文')
          Button('打开文集').enabled(!this.view.busy).onClick(() => yiyanService().openLibrary()).accessibilityText('读取并浏览自己的一言文集')
        }
        this.statusMessage()
        if (this.showSettings || !this.view.connected) {
          Column({ space: 12 }) {
            Text(`配图清晰度 ${Math.round(this.clarity)}%`).fontColor($r('app.color.text_secondary')).width('100%')
            Slider({ value: this.clarity, min: 0, max: 100, step: 5 }).onChange((value: number, mode: SliderChangeMode) => {
              this.clarity = Math.round(value); if (mode === SliderChangeMode.End || mode === SliderChangeMode.Click) this.saveClarity(value);
            }).accessibilityText('设置一言配图清晰度，零至百分之一百')
            Button(this.view.connected ? '切换或重新连接一言账号' : '连接一言').enabled(!this.view.busy && !!currentCloudAccount())
              .onClick(() => yiyanService().openLogin()).accessibilityText('展开一言短信验证码连接表单')
            if (this.view.connected) {
              Button('断开一言').enabled(!this.view.busy).onClick(() => { this.phone = ''; this.code = ''; yiyanService().disconnect(); }).accessibilityText('断开当前应用中的一言连接，不退出手机端一言账号')
            }
          }.width('100%')
        }
        this.connectionForm()
      }.width('100%').alignItems(HorizontalAlign.Start).padding({ bottom: 20 })
    }.width('100%').layoutWeight(1)
  }

  build() {
    HdsNavDestination() {
      Column({ space: 14 }) {
        Row({ space: 8 }) {
          Text(this.view.checking ? '正在检查连接…' : this.view.connected ? '已连接一言' : '尚未连接一言').layoutWeight(1).fontColor($r('app.color.text_secondary'))
          Button('连接设置').enabled(!this.view.busy).onClick(() => {
            if (this.view.library) { yiyanService().closeLibrary(); this.showSettings = true; }
            else this.showSettings = !this.showSettings;
          }).accessibilityText('展开或收起一言连接与配图设置')
        }.width('100%')
        if (this.view.library) { this.libraryBody() } else { this.mainBody() }
      }.width('100%').height('100%').padding(16).constraintSize({ maxWidth: 1000 }).backgroundColor($r('app.color.background'))
    }.titleMode(HdsNavDestinationTitleMode.MINI)
    .titleBar(hdsPageTitle('一言图文', () => this.leave()))
    .onBackPressed(() => { this.leave(); return true; })
    .onShown(() => { this.shown = true; this.visibilityChanged(); })
    .onHidden(() => { this.shown = false; this.detach(); })
  }
}
