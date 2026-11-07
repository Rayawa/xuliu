import { common } from '@kit.AbilityKit';
import { media } from '@kit.MediaKit';
import { audio } from '@kit.AudioKit';
import { ALERT_TONE_IDS } from '../../config/constants';

interface SoundHandle {
  player: media.AVPlayer; path: string; close: () => Promise<void>; timer: number; answer: (ready: boolean) => void; answered: boolean; cleanup?: Promise<void>;
}

/** Serialized ownership prevents closing a raw resource descriptor while a newer preview is using it. */
export class ReminderSound {
  private context: common.ApplicationContext | undefined;
  private current: SoundHandle | undefined;
  private generation: number = 0;
  private queue: Promise<void> = Promise.resolve();
  private active: boolean = false;

  initialize(context: common.UIAbilityContext): void { this.context = context.getApplicationContext(); }
  setActive(active: boolean): void { this.active = active; if (!active) this.stop(); }
  async play(tone: string, volume: number): Promise<boolean> {
    if (!canIUse('SystemCapability.Multimedia.Media.AVPlayer') || !this.context || !this.active || !ALERT_TONE_IDS.includes(tone) || !Number.isFinite(volume) || volume <= 0) return false;
    const generation = ++this.generation;
    const operation = this.queue.then(() => this.start(generation, tone, Math.min(100, volume) / 100));
    this.queue = operation.then(() => {}).catch(() => {});
    try { return await operation; } catch (_) { return false; }
  }
  stop(): void {
    this.generation++;
    const operation = this.queue.then(async () => { if (this.current) await this.release(this.current); });
    this.queue = operation.catch(() => {});
  }
  private valid(generation: number): boolean { return this.active && generation === this.generation; }
  private respond(handle: SoundHandle, ready: boolean): void {
    if (handle.answered) return;
    handle.answered = true; handle.answer(ready);
  }
  private release(handle: SoundHandle): Promise<void> {
    if (handle.cleanup) return handle.cleanup;
    this.respond(handle, false); clearTimeout(handle.timer);
    handle.cleanup = this.cleanup(handle); return handle.cleanup;
  }
  private async cleanup(handle: SoundHandle): Promise<void> {
    try { handle.player.off('stateChange'); handle.player.off('error'); } catch (_) {}
    try { await handle.player.release(); } catch (_) {}
    try { await handle.close(); } catch (_) {}
    if (this.current === handle) this.current = undefined;
  }
  private async start(generation: number, tone: string, volume: number): Promise<boolean> {
    if (this.current) await this.release(this.current);
    if (!this.context || !this.valid(generation)) return false;
    const resources = this.context.resourceManager;
    const path = `tones/${tone}.wav`; let player: media.AVPlayer | undefined; let opened = false;
    try {
      const descriptor = await resources.getRawFd(path); opened = true;
      player = await media.createAVPlayer();
      if (!this.valid(generation)) { await player.release(); await resources.closeRawFd(path); return false; }
      const currentPlayer = player;
      return await new Promise<boolean>((resolve) => {
        const handle: SoundHandle = { player: currentPlayer, path, close: () => resources.closeRawFd(path), timer: -1, answer: resolve, answered: false };
        this.current = handle;
        const fail = (): void => { this.respond(handle, false); this.release(handle); };
        handle.timer = setTimeout(fail, 4000);
        currentPlayer.on('error', () => fail());
        currentPlayer.on('stateChange', (state: string) => {
          if (!this.valid(generation)) { fail(); return; }
          try {
            if (state === 'initialized') {
              currentPlayer.audioRendererInfo = { usage: audio.StreamUsage.STREAM_USAGE_NOTIFICATION, rendererFlags: 0 };
              currentPlayer.prepare().catch(() => fail());
            } else if (state === 'prepared') { currentPlayer.setVolume(volume); currentPlayer.play().catch(() => fail()); }
            else if (state === 'playing') {
              this.respond(handle, true); clearTimeout(handle.timer); handle.timer = setTimeout(() => this.release(handle), 2500);
            } else if (state === 'completed' || state === 'error') this.release(handle);
          } catch (_) { fail(); }
        });
        try { currentPlayer.fdSrc = { fd: descriptor.fd, offset: descriptor.offset, length: descriptor.length }; } catch (_) { fail(); }
      });
    } catch (_) {
      if (this.current && this.current.player === player) await this.release(this.current);
      else {
        try { await player?.release(); } catch (_) {}
        if (opened) try { await resources.closeRawFd(path); } catch (_) {}
      }
      return false;
    }
  }
}
