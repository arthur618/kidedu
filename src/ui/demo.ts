/** 仅预览和测试使用的假服务；不被真实入口引用。 */
import type { SessionState } from "../contracts/orchestrator";
import { SessionEventSchema } from "../contracts/orchestrator";
import type { CharCard } from "../contracts/schemas";
import type { Packet } from "./model";
import type { LearningService } from "./service";
export const demoCard: CharCard = { id: "fixture-shan", char: "山", pinyin: "shān", radical: "山", explain: "看看字卡里这个字的样子。", words: ["高山"], confusable: [], dictationContext: "山，高山的山", audioUrl: null, source: "仅用于界面测试的编造字卡", status: "approved" };
export const demoPhoto = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAALQAAAC0CAIAAACyr5FlAAADEklEQVR4nO3UQUocYRhFUfcWcOD+95FxcCJiEIk+R9L/7dSBO214Vd/penj+81v6sofjC5QNDs3g0AwOzeDQDA7N4NAMDs3g0AwOzeDQDA7N4NAMDs3g0AwOzeDQDA7N4NAMDs3g0AwOzeDQDA7N4NAMDs3g0AwOzeDQDI6//Xp6PL6hFhyvLD52fE+nq+P4RwYfH4MDjtmlcXwpg4/3Lo3jefs4PqwQHHDM4IBjBgccMzjgmMEBxwwOOGZwwDGDA44ZHHDM4IBjBgccMzjgmMEBxwwOOGZwwDGDA44ZHHDM4IBjBgccMzjgmMEBxwwOOGZwwDGDA44ZHHDM4IBjBgccMzjgmMEBxwyOLo7jM+Ao4oiMuTqOz5c4fpLOmPM4an9TON47iaPw/OsYp/asMUf2HMMRef5v7pF6M3DA0dpzBkfq49lZUtvT+nLAkdoDR2hJbQ8coSW1PXCEltT2wBFaUtsDR2hJbQ8coSW1PXCEltT2wBFaUtsDR2hJbQ8coSW1PXCEltT2wBFaUtsDR2hJbQ8coSW1PXCEltT2wBFaUtsDR2hJbQ8coSW1PXCEltT2wBFaUtsDR2hJbQ8coSW1PXCEltT2wBFaUtsDR2hJbQ8coSW1PXAYM4PDmBkcuTGdPXDkxnT2wJEb09kDR25MZw8cuTGdPXDkxnT2wJEb09kDR25MZw8cuTGdPXDkxnT2wJEb09kDR25MZw8cuTGdPXDkxnT2wJEb09kDR25MZw8cuTGdPXDkxnT2wJEb09kDR25MZw8cuTGdPXDkxnT2wJEb09kDR25MZw8cuTGdPXDkxnT2wJEb09kDR25MZw8cuTGdPXD8wJj18x/vxq/lEjhudjw4HAwOOJLBofMy4Liz4FBCxkkcfJRZwHH3x/ufcdzMx/G3fKcdxvGW+zVL4FAzODSDQzM4NINDMzg0g0MzODSDQzM4NINDMzg0g0MzODSDQzM4NINDMzg0g0MzODSDQzM4NINDMzg0g0MzODSDQzM4NINDMzg0g0MzODSDQzM4NINDMzg0g0MzODR7Af7EFknLri6qAAAAAElFTkSuQmCC";
export function demoPacket(screen: SessionState, photo = demoPhoto): Packet {
  const data: Partial<Record<SessionState, unknown>> = {
    homework_confirm: { items: [{ id: "fictional-homework", text: "认一认今天的生字", kind: "recognize", supported: true, done: false }] },
    recognize: { char: "山", word: "高山" },
    understand: { card: demoCard, say: demoCard.explain, ask: "你想到了哪个词？" },
    dictation_play: { cards: [demoCard] },
    dictation_compare: { imageUrl: photo, chars: ["山"], marks: [{ word: "山", charIndex: 0, expected: "山", box: [0.1, 0.1, 0.8, 0.8], suspicious: true, confidence: 0.7 }] },
    wrap_up: { learned: ["山"], revisit: ["山"] },
  };
  return { sessionId: "fixture-session", state: screen, effects: screen === "ended" ? [] : [{ type: "show", screen, data: data[screen] }] };
}
export function createDemoService(initial: SessionState = "homework_capture", record: (type: string) => void = () => {}): LearningService {
  let state = initial;
  let photo = demoPhoto;
  function next(screen: SessionState) { state = screen; return Promise.resolve(demoPacket(state, photo)); }
  return {
    start: () => { record("start"); return next(state); },
    homework: input => { record("homework"); if (state !== "homework_capture" || (!input.spokenText && !input.imageDataUrl)) return Promise.reject(); return next("homework_confirm"); },
    coach: input => { record("coach"); if (state !== "understand" || input.char !== "山") return Promise.reject(); return next("dictation_play"); },
    event: input => {
      const event = SessionEventSchema.parse(input); record(event.type);
      if (event.type === "quit") return next(state === "wrap_up" || state === "ended" ? "ended" : "wrap_up");
      if (state === "homework_confirm" && event.type === "homework_confirmed") return next("recognize");
      if (state === "recognize" && event.type === "recognize_result") return next("understand");
      if (state === "dictation_play" && event.type === "dictation_played") return next("dictation_capture");
      if (state === "dictation_capture" && event.type === "dictation_photo") { photo = event.imageUrl; return next("dictation_compare"); }
      if (state === "dictation_compare" && event.type === "dictation_confirmed") return next("reading_offer");
      if (state === "reading_offer" && event.type === "reading_choice") return next(event.accept ? "reading" : "wrap_up");
      if (state === "wrap_up" && event.type === "wrap_up_done") return next("ended");
      return Promise.reject(new Error("unexpected_demo_event"));
    },
  };
}
