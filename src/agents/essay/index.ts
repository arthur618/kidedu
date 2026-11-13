import { EssayInput, EssayOutput } from "../../contracts/schemas";
import { runAgent, type Dependencies } from "../shared";
import { system, buildStablePrefix, buildUser } from "./prompt";
import { fallback } from "./fallback";

export async function run(input: EssayInput, deps: Dependencies): Promise<EssayOutput> {
  const output = await runAgent(input, deps, {
    inputSchema: EssayInput, outputSchema: EssayOutput, agent: "essay",
    system, stablePrefix: buildStablePrefix, user: buildUser, fallback,
  });
  // 从最近一条 child 消息取原话；最后一条 agent 消息不能充当素材来源。
  const parsed = EssayInput.safeParse(input);
  const lastChild = parsed.success ? [...parsed.data.history].reverse().find((item) => item.role === "child") : undefined;
  if (output.newCard !== null && (!output.newCard || !lastChild?.text.includes(output.newCard))) {
    return { ...output, newCard: null };
  }
  return output;
}
