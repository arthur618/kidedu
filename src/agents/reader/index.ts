import { ReaderInput, ReaderOutput } from "../../contracts/schemas";
import { runAgent, type Dependencies } from "../shared";
import { system, buildStablePrefix, buildUser } from "./prompt";
import { fallback } from "./fallback";

export async function run(input: ReaderInput, deps: Dependencies): Promise<ReaderOutput> {
  const output = await runAgent(input, deps, {
    inputSchema: ReaderInput, outputSchema: ReaderOutput, agent: "reader",
    system, stablePrefix: buildStablePrefix, user: buildUser, fallback,
  });
  return output;
}
