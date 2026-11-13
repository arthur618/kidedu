# 子智能体模型分配

总设计师维护。2026-11-13按负责人要求评估并落实；这是任务分配判断，不是这些模型在本仓库上的基准测试结论。

| 工作 | 剩余复杂度与主要风险 | 指定模型 | 推理档位 |
| --- | --- | --- | --- |
| C2孩子端界面 | 中高：已有草稿，需交互、截图、响应式与接口适配收尾 | gpt-6.1-terra | high |
| C4内容生产流水线 | 中高：已有主体，需审批凭据、状态推进与approved不可覆盖的严谨收尾 | gpt-6.1-sol | medium |
| C6评测脚本 | 高：并发计量、兜底不能掩盖失败、阈值退出码、private数据隔离 | gpt-6.1-sol | high |
| C7后续集成 | 高：跨模块契约、事务与外部I/O边界、完整失败路径 | gpt-6.1-sol | high |
| 批量、规则明确的辅助小包 | 低：明确规范后的样例扩充、文档整理、机械检查 | gpt-6-luna | low或medium |

C7尚未派发。Luna不会独立承担审批完整性、隐私隔离或状态机集成。Astra不作常规实现默认；确有已定位而当前模型无法解决的难点时，才由总设计师决定局部升级。不要为几行机械操作额外开agent，能由shell完成的检查直接用工具。

## 选择依据与成本口径

官方将[Terra](https://developers.openai.com/api/docs/models/gpt-6.1-terra)定位于视觉推理、精确电脑操作与写作，将[Sol](https://developers.openai.com/api/docs/models/gpt-6.1-sol)用于复杂编程，将[Luna](https://developers.openai.com/api/docs/models/gpt-6-luna)用于聚焦、高吞吐任务。

[Codex官方计费说明](https://learn.chatgpt.com/docs/pricing)列出的Standard每百万非缓存输入/输出token费率：Sol为50/250 credits，Terra为25/125，Luna为2.5/12.5，Astra为250/1250。这只支持同速率、同token数的比较，不代表任务总费用；缓存、推理量、上下文和返工都会改变用量。当前子agent工具的服务档位由宿主提供，本对话只显式指定model和reasoning_effort，不把API价格当作账户最终账单。

## 执行纪律

- 新agent用fork_turns=none，提示只包含该任务、worktree、必要规则和当前恢复点，不复制整段总设计师历史。
- 继续使用原独立worktree和草稿，先检查后补齐，不重复实现已有部分。
- 实现者不再自行派子agent；总设计师统一控制并发与模型。当前上限3个实现agent加总设计师。
- 常规实现先使用上表配置；同一明确问题反复失败时先给总设计师根因和证据，由总设计师决定局部升推理档位或换模型，不自动扩大范围。
- 必须保留全部既定验收标准，不能通过删难例、减测试或伪造真实模型结果节省成本。
- 总设计师继续在独立克隆验收，作者不验收自己的交付；模型便宜不降低验收要求。

## 本轮恢复

此前三个agent因workspace out of credits停止。当前只读账户查询显示ordinaryUsageAllowed=true；显式指定模型的新agent已能执行，因此不再把此前错误概括成所有模型都不可用。附加credits无余额这一事实不等于可以保证后续一直可用；若再次拒绝，保留草稿并报告，不反复切模型重试。

| 任务 | 当前agent | 原worktree |
| --- | --- | --- |
| C2 | /root/resume_c2_terra | /Users/lihao/.codex/worktrees/yuwen-c2-ui/yuwen-banxue |
| C4 | /root/resume_c4_sol | /Users/lihao/.codex/worktrees/yuwen-c4-content/yuwen-banxue |
| C6 | /root/resume_c6_sol | /Users/lihao/.codex/worktrees/yuwen-c6-evals/yuwen-banxue |

本轮仍只完成C6脚本验收，真实模型评测稍后；项目运行时DeepSeek路由红线不受开发agent模型分配影响。


## 初步执行结果

C2由Terra high交付9ec4086，C4由Sol medium交付725b22c；均已提交、工作区干净，等待独立验收。C6仍由Sol high执行。这表明所选模型已能恢复实际工作，不代表已测得完整任务费用或质量优于其他模型，最终以独立验收和返工结果评估。

## 本轮最终结果（2026-11-13）

C2 Terra high、C4 Sol medium、C6 Sol high均完成返工并通过独立验收，最终合入main。主线635测试及生产构建通过，C2独立浏览器9项通过。此前恢复agent表仅为历史标识，不代表仍有实现任务运行。C7仍计划Sol high，待总设计师完成派发前设计；不因GitHub同步自动启动新实现。本轮没有可核算的逐任务完整费用数据，不宣称已实测成本最优。

## C7实际派发（2026-11-14）

C7由/root/implement_c7_sol使用gpt-6.1-sol high单独实施。高复杂度来自跨模块、持久幂等、事务边界和隐私；不同时启动其他实现者，避免接口协调返工。不为机械检查再开agent，分阶段定向测试，最终构建只在必要时执行。

## C7完成与后续分档（2026-11-14）

C7由Sol high单agent实现并在原上下文返工；Sol medium仅聚焦命令恢复/照片隔离审查一次。独立验收及main666测试、构建、浏览器10项通过。未统计到完整逐任务账单，不宣称成本最优。

后续C8A接口与测试可用Sol medium；真实语音供应商、取消/隐私接线的C8B用Sol high。C9/C10有答案泄露/代写及活动恢复边界，C11有批处理幂等与家长鉴权，建议Sol high；机械检查仍直接用工具。各任务先冻结scope再派发，不为低复杂度工作堆agent。
