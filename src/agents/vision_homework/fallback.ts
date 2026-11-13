import type { VisionHomeworkOutput } from "../../contracts/schemas";

export function fallback(_input: unknown): VisionHomeworkOutput {
  return { items: [], unsure: true };
}
