import { CharCoachInput, CharCoachOutput } from "../../contracts/schemas";
import { runAgent, type Dependencies } from "../shared";
import { system, buildStablePrefix, buildUser } from "./prompt";
import { fallback } from "./fallback";

export async function run(input: CharCoachInput, deps: Dependencies): Promise<CharCoachOutput> {
  const output = await runAgent(input, deps, {
    inputSchema: CharCoachInput, outputSchema: CharCoachOutput, agent: "char_coach",
    system, stablePrefix: buildStablePrefix, user: buildUser, fallback,
  });
  return output;
}
