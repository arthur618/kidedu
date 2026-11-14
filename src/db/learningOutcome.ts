import { LearningOutcomeSchema, type LearningOutcome } from "../contracts/nightly";
import { getPrisma } from "./client";
/** 仅追加。同操作同内容是重放，内容变化必须报错，不覆盖旧流水。 */
export async function appendLearningOutcome(value: LearningOutcome): Promise<void> {
  const item = LearningOutcomeSchema.parse(value);
  const where = { commandScope_commandKey_effectIndex: { commandScope: item.commandScope, commandKey: item.commandKey, effectIndex: item.effectIndex } };
  const old = await getPrisma().learningOutcome.findUnique({ where });
  if (old) {
    if (Object.keys(item).some(key => old[key as keyof typeof old] !== item[key as keyof typeof item])) throw new Error("学习流水与原操作不一致。");
    return;
  }
  await getPrisma().learningOutcome.create({ data: item });
}
/** 只在C7新会话start事务调用，不能给旧会话补标记。 */
export async function markLearningCoverage(sessionId: string, startedAt: string): Promise<void> {
  await getPrisma().sessionLearningCoverage.create({ data: { sessionId, startedAt } });
}
