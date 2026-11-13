import { VisionDictationInput, type VisionDictationOutput } from "../../contracts/schemas";

export function fallback(input: unknown): VisionDictationOutput {
  const parsed = VisionDictationInput.pick({ expectedWords: true }).safeParse(input);
  return {
    // length(1) 按 UTF-16 计数，与现有契约保持一致。
    marks: parsed.success ? parsed.data.expectedWords.flatMap((word) => word.split("").map((expected, charIndex) => ({
      word, charIndex, expected, box: null, suspicious: true, confidence: 0,
    }))) : [],
    unreadable: true,
  };
}
