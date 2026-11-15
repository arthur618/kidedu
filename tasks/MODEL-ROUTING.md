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

## C8A实际派发（2026-11-14）

C8A使用Sol medium单agent，理由是供应商无关、默认关闭、契约与10条标准明确；录音生命周期和媒体隔离由root独立复验，不以降低标准节省用量。若定位出medium无法解决的具体难点才局部升档；不另开同功能实现agent，也不为机械检查开子agent。

## C8A完成（2026-11-14）

C8A由单个Sol medium完成，原上下文按正式review返工一次；root独立验收679测试、实际构建、21浏览器与自编探针通过，无新增实现或审查agent。未获得逐任务完整账单，不据此声称成本最优；本轮证明所选档位可在不降低标准下完成该范围。真实供应商接入仍未做，C9复杂阅读/隐私边界按计划Sol high。

## C9实际派发（2026-11-14）

C9选Sol high单agent：已有稳定C7/C8基础，但私有参考要点、日志白名单、事务检查点和恢复关联复杂，不使用便宜模型独立承担这些边界。不另开重复实现/机械审查agent；focused回归后串行一次最终全套与浏览器，root独立验收。外部接口真实联调按负责人决定延后。

## C9完成与C10派发（2026-11-14）

C9由单Sol high实现，作者自审修正边界后root独立验收697测试/构建、23浏览器和额外探针通过，未新增审查agent。C10仍Sol high单实现，复杂度集中在来源子串/禁止代写、实际入口路由、反馈引用与持久恢复。不把每个小测试变更都立即全套build：集中自审、focused，再一次最终全套/浏览器；root独立检查照常。没有逐任务账单，不声称实测成本最优。

## C10完成与C11A派发（2026-11-14）

C10单Sol high按正式review在原上下文返工一次，root独立781测试/构建、27浏览器与五出口探针通过，未新增审查agent。C11A仍单Sol high：真实流水来源、事务observer、跨日事实、持久步骤/依赖失效和租约发布边界复杂；C11B鉴权/归属也计划high，顺序实施避免共享runtime/Prisma冲突。不为机械操作开新agent，不重复已知返工版本全套build，作者focused后最终全套，root仍新clone独立复验。

## DeepSeek协议小包D2B（2026-11-14）

D2B选择单Sol medium：既有调用层与明确官方协议，只修请求预算/结束状态/拒答与fixture，根不引入自由工具/新SDK。C11A保留high上下文，C8B实际音频编码/取消/隐私复杂，后续high；公开资料离线检索C4B可medium。共用全套构建串行，不为机械操作再开agent。一次额度中断后只读证明普通用量仍允许，原agent一次恢复成功，没有消费reset、购买或反复切模型。

## C8B代码阶段分档（2026-11-14）

C8B单Sol high：跨浏览器实际音频解码/重采样/PCM编码、实际时长、上游取消/并发与媒体生命周期，复杂度高于D2B纯协议小包。D2B medium已完成本地自查交root，C11A仍保留high原上下文完成，无重复实现agent；root将所有整套构建/浏览器串行。真实key/模型评测不含在本地通过声明中。

## C11B实际分档（2026-11-14）

C11A由原Sol high恢复并完成，独立817测试/构建、27浏览器和额外对账通过，无新增重复实现。C11B仍Sol high：鉴权/跨孩子归属/CSRF/并发审计和请求生命周期高风险；与语音代码路径分离，Root处理空配置样例合并，构建排队。D2B medium已交付，继续root独立验收，不为机械工作开低档agent。

- C4B：Sol medium，固定单次离线检索与受限文件输出，复用契约/Node fetch，无需高档模型。root独立读生产代码及验收；全套build/browser串行。

- C11C：Sol medium，2个生产文件内的明确评分资格/来源版本修正，复用现有真实流水与持久步骤；不使用额外审查agent，root独立复验。

- C12：复用Sol high实现agent，跨服务端检查点/媒体缺失/客户端持久标识与生命周期，需高思考；单实现，root另clone验收，不新增审查agent。

- C13：复用Sol medium，精确依赖/测试API兼容维护，root复核官方路径与最终差异。已有测试路径按实际编译差异逐项授权，不全树开放；重大Zod契约迁移另包，当前不动。
