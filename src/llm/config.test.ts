import { describe, expect, it } from "vitest";
import runtimeConfigJson from "../../config/models.json";
import { RUNTIME_AGENTS, type ModelConfig } from "../contracts/llm";
import { loadRuntimeConfig } from "./config";

function fixture(): ModelConfig {
  return JSON.parse(JSON.stringify(runtimeConfigJson)) as ModelConfig;
}

describe("loadRuntimeConfig", () => {
  it("接受八个运行时 Agent 全为 deepseek 的配置", () => {
    const config = loadRuntimeConfig(fixture());
    expect(Object.keys(config).sort()).toEqual([...RUNTIME_AGENTS].sort());
    for (const agent of RUNTIME_AGENTS) {
      expect(config[agent].provider).toBe("deepseek");
    }
  });

  describe.each(RUNTIME_AGENTS)("红线：%s", (agent) => {
    it(`provider 改成 openai 时抛错，错误信息包含 ${agent}`, () => {
      const config = fixture();
      config[agent] = { ...config[agent], provider: "openai" };

      expect(() => loadRuntimeConfig(config)).toThrowError();
      expect(() => loadRuntimeConfig(config)).toThrow(agent);
    });
  });

  it("结构不合法时抛错", () => {
    const config = fixture();
    config.char_coach.timeoutMs = 0;
    expect(() => loadRuntimeConfig(config)).toThrow(/配置格式不正确/);
  });

  it("缺少任何一个 Agent 都拒绝", () => {
    const config = fixture() as unknown as Record<string, unknown>;
    delete config.report;
    expect(() => loadRuntimeConfig(config)).toThrow(/report/);
  });

  it("没有可以跳过 provider 检查的参数或开关", () => {
    expect(loadRuntimeConfig.length).toBe(1);
  });
});
