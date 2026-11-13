import { VisionHomeworkInput, VisionHomeworkOutput } from "../../contracts/schemas";
import { runAgent, type Dependencies } from "../shared";
import { system, buildStablePrefix, buildUser } from "./prompt";
import { fallback } from "./fallback";

export async function run(input: VisionHomeworkInput, deps: Dependencies): Promise<VisionHomeworkOutput> {
  const output = await runAgent(input, deps, {
    inputSchema: VisionHomeworkInput, outputSchema: VisionHomeworkOutput, agent: "vision_homework",
    system, stablePrefix: buildStablePrefix, user: buildUser, fallback,
    images: (data) => data.imageUrl ? [{ url: data.imageUrl }] : [],
  });
  return output;
}
