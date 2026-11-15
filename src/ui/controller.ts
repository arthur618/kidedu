import { RecoveryUnavailable } from "./recovery/store";
import type { SessionEvent } from "../contracts/orchestrator";
import { decodeScreen, type Packet, type ScreenDecoder, type View } from "./model";
import type { LearningService } from "./service";
export interface Snapshot { view?: View; busy: boolean; retry: boolean; notice?: string; restartAvailable?: boolean }
export class LearningController {
  private value: Snapshot = { busy: false, retry: false };
  private listeners = new Set<() => void>();
  private again?: () => Promise<Packet>;
  private quitting?: () => Promise<Packet>;
  private hasSession = false;
  private started = false;
  private disposed = false;
  leaveUnavailable = () => this.publish({ view: { screen: "ended" }, busy: false, retry: false });
  dispose = () => { this.disposed = true; this.quitting = undefined; this.service.dispose?.(); };
  constructor(private service: LearningService, private decode: ScreenDecoder = decodeScreen, private idFactory: () => string = () => crypto.randomUUID()) {}
  snapshot = () => this.value;
  subscribe = (callback: () => void) => { this.listeners.add(callback); return () => { this.listeners.delete(callback); }; };
  private publish(value: Snapshot) { this.value = value; this.listeners.forEach(fn => fn()); }
  private async run(operation: () => Promise<Packet>) {
    if (this.disposed || this.value.busy) return;
    this.again = operation;
    this.publish({ ...this.value, busy: true, retry: false });
    try {
      const packet = await operation();
      if (this.disposed) return;
      if (packet.sessionId) this.hasSession = true;
      const view = this.decode(packet);
      this.publish({ view, busy: false, retry: false, notice: packet.notice });
    } catch (error) { if (this.disposed) return; this.publish(error instanceof RecoveryUnavailable ? { busy: false, retry: false, restartAvailable: true } : { ...this.value, busy: false, retry: true }); }
    if (this.quitting) { const quit = this.quitting; this.quitting = undefined; if (this.hasSession) await this.run(quit); }
  }
  start = () => { if (this.started) return Promise.resolve(); this.started = true; const id = this.idFactory(); return this.run(() => this.service.start(id)); };
  restart = () => { const id = this.idFactory(); return this.run(() => this.service.restart ? this.service.restart(id) : this.service.start(id)); };
  retry = () => this.again ? this.run(this.again) : this.start();
  event = (event: SessionEvent) => {
    if (event.type === "quit" && this.value.busy) { if (!this.quitting) { const id = this.idFactory(); this.quitting = () => this.service.event(event, id); } return Promise.resolve(); }
    if (event.type === "quit" && !this.hasSession) return Promise.resolve();
    const id = this.idFactory();
    return this.run(() => this.service.event(event, id));
  };
  homework = (input: { imageDataUrl?: string; spokenText?: string }) => { const id = this.idFactory(); return this.run(() => this.service.homework(input, id)); };
  essay = (input: Parameters<NonNullable<LearningService["essay"]>>[0]) => { const id = this.idFactory(); return this.run(() => this.service.essay ? this.service.essay(input, id) : Promise.reject()); };
  reading = (input: { text: string }) => { const id = this.idFactory(); return this.run(() => this.service.reading ? this.service.reading(input, id) : Promise.reject()); };
  coach = (input: { char: string; text: string }) => { const id = this.idFactory(); return this.run(() => this.service.coach(input, id)); };
}
