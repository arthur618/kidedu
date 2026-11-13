import { VisionDictationInput, VisionDictationOutput } from "../../contracts/schemas";
import { runAgent, type Dependencies } from "../shared";
import { system, buildStablePrefix, buildUser } from "./prompt";
import { fallback } from "./fallback";

export async function run(input: VisionDictationInput, deps: Dependencies): Promise<VisionDictationOutput> {
  const output = await runAgent(input, deps, {
    inputSchema: VisionDictationInput, outputSchema: VisionDictationOutput, agent: "vision_dictation",
    system, stablePrefix: buildStablePrefix, user: buildUser, fallback,
    images: (data) => [{ url: data.imageUrl }],
  });
  return output;
}
