import { SessionRecoveryHintSchema, type SessionRecoveryHint } from '../../contracts/session';
export type RecoveryStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
export class RecoveryUnavailable extends Error {}
export function createRecoveryStore(childId: string, lessonId: string, storage: () => RecoveryStorage | null = () => typeof window === 'undefined' ? null : window.sessionStorage) {
  const key = `yuwen-recovery:v1:${encodeURIComponent(childId)}:${encodeURIComponent(lessonId)}`;
  return {
    load(): SessionRecoveryHint | null {
      try {
        const raw = storage()?.getItem(key); if (!raw) return null;
        if (raw.length > 8192) { storage()?.removeItem(key); return null; }
        const parsed = SessionRecoveryHintSchema.safeParse(JSON.parse(raw));
        if (parsed.success && parsed.data.childId === childId && parsed.data.lessonId === lessonId) return parsed.data;
        storage()?.removeItem(key);
      } catch { try { storage()?.removeItem(key); } catch {} }
      return null;
    },
    save(hint: SessionRecoveryHint) { try { const parsed = SessionRecoveryHintSchema.parse(hint); storage()?.setItem(key, JSON.stringify(parsed)); } catch {} },
    clear() { try { storage()?.removeItem(key); } catch {} },
  };
}
