import type { SessionEvent } from "../contracts/orchestrator";
import { decodeScreen, type Packet, type ScreenDecoder, type View } from "./model";
import type { LearningService } from "./service";
export interface Snapshot { view?: View; busy: boolean; retry: boolean }
export class LearningController {
  private value: Snapshot = { busy: false, retry: false };
  private listeners = new Set<() => void>();
  private again?: () => Promise<Packet>;
  private quitting = false;
  private hasSession = false;
  constructor(private service: LearningService, private decode: ScreenDecoder = decodeScreen) {}
  snapshot = () => this.value;
  subscribe = (callback: () => void) => { this.listeners.add(callback); return () => { this.listeners.delete(callback); }; };
  private publish(value: Snapshot) { this.value = value; this.listeners.forEach(fn => fn()); }
  private async run(operation: () => Promise<Packet>) {
    if (this.value.busy) return;
    this.again = operation;
    this.publish({ ...this.value, busy: true, retry: false });
    try {
      const packet = await operation();
      if (packet.sessionId) this.hasSession = true;
      const view = this.decode(packet);
      this.publish({ view, busy: false, retry: false });
    } catch { this.publish({ ...this.value, busy: false, retry: true }); }
    if (this.quitting) { this.quitting = false; if (this.hasSession) await this.run(() => this.service.event({ type: "quit" })); }
  }
  start = () => this.run(() => this.service.start());
  retry = () => this.again ? this.run(this.again) : this.start();
  event = (event: SessionEvent) => {
    if (event.type === "quit" && this.value.busy) { this.quitting = true; return Promise.resolve(); }
    if (event.type === "quit" && !this.hasSession) return Promise.resolve();
    return this.run(() => this.service.event(event));
  };
  homework = (input: { imageDataUrl?: string; spokenText?: string }) => this.run(() => this.service.homework(input));
  coach = (input: { char: string; text: string }) => this.run(() => this.service.coach(input));
}
