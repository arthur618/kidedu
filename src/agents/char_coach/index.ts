import { CharCoachInput, CharCoachOutput } from "../../contracts/schemas";
import { runAgent, type Dependencies } from "../shared";
import { system, buildStablePrefix, buildUser } from "./prompt";
import { fallback } from "./fallback";

export async function run(input: CharCoachInput, deps: Dependencies): Promise<CharCoachOutput> {
  const output = await runAgent(input, deps, {
    inputSchema: CharCoachInput, outputSchema: CharCoachOutput, agent: "char_coach",
    system, stablePrefix: buildStablePrefix, user: buildUser, fallback,
  });
  const parsed = CharCoachInput.safeParse(input);
  if (!parsed.success || parsed.data.step !== "make_word") return output;
  const data = parsed.data;
  const latestChild = [...data.history].reverse().find(item => item.role === "child")?.text ?? "";
  const candidate = output.say + (output.ask ?? "");
  // 只检查字卡原词的连续字面出现；孩子最近已提供的词可以确认。
  const leaksWord = data.card.words.some(word => word.length > 0 &&
    candidate.includes(word) && !latestChild.includes(word));
  if (!leaksWord) return output;
  if (output.next === "escalate") return {
    say: "这个我还不知道，我记下来了", ask: null, next: "escalate", usedCardFields: ["words"],
  };
  return {
    say: latestChild.trim() && !data.card.words.includes(latestChild)
      ? "这个词我还不认识，你再想一个书上的"
      : "再想一个书上的词。",
    ask: "你想到了哪个词？",
    next: "wait_child",
    usedCardFields: ["words"],
  };
}
