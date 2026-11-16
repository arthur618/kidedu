# 任务报告：C6B 评测来源判定修订

- 实现者：Codex / Sol medium，单实现，无子agent
- 分支：task/C6B；基线main@05f19b7
- 日期：2026-11-16（客户端日期）
- 自查结果：focused evals 5文件95测试通过（既有4/42+新增1/53），typecheck通过；root授权的单次独占完整verify C6B退出0，67文件1129测试通过（63.64秒），含实际Next.js构建；scope4路径通过，contracts/thresholds/cases/results/runner差异0。验证实现提交f783b1a，随后仅报告补证。

## 做了什么

按负责人批准的来源裁决修订三项纯检查：card_grounded精确允许当前card.char，并检查say/ask两端引用；未知词只能作为最近孩子原话的有限整段回述/未知说明，不能成为字卡知识肯定。阅读逐六字窗口核对最近孩子是否已提供；作文允许反馈步骤正文来源、有限精确回述前缀和7项固定整句身份/拒绝说明，不删除引用正文、不剥前缀放任新叙事。保持原12/13字、连续6字和不跨标点边界；newCard仍只接受最近孩子原话。没有修改生产实现、样例或阈值。

## 验收标准对照

| 验收标准/裁决 | 测试与证据 | 状态 |
| --- | --- | --- |
| 当前字/词/形近字精确来源；未知词不得借孩子来源肯定字卡知识；say/ask、最近来源及空字段边界。 | provenance.test.ts精确字与包含非相等、未知词3类固定回述、旧孩子/agent伪来源、仅ask编造、空字段、另句追加肯定，以及say/ask跨出口泛称肯定穿透例。 | focused及完整verify通过 |
| 阅读连续6字仅豁免最近孩子已给窗口，不因前缀或旧历史放行，片段补齐/另一要点/问句泄答仍拒绝。 | 新阅读两出口与部分窗口/旧孩子/agent/另一要点反例；原不跨标点测试原样保留。 | focused及完整verify通过 |
| 作文默认13字非问句须有来源；反馈正文与最近原话有限回述；固定身份/拒绝整句白名单；保留旧边界及拼接负例。 | 原checks.test.ts零修改；新增7白名单逐项追加新叙事反例、12/13、4类正文引号/局部引用/新句、3回述前缀旧来源与拼接反例、interview拒借正文、newCard不借正文。 | focused及完整verify通过 |
| 固定原真实合成误报且每种豁免配穿透例，不改原报告/分数，完整自查后交负责人独立验收。 | 固定复制18条公开原输出及对应合成输入；新增文件53例（18原输出+35边界/穿透），无真实请求；原测试/阈值/cases/results均零修改。focused/typecheck后获root授权，执行env -u RUST_LOG XDG_CACHE_HOME=<已批准runtime-cache> bash scripts/verify.sh C6B退出0，67文件1129例（原66/1076+新增1/53）全通过，src/server/build.test.ts真实npm run build成功；scope4路径通过。root独验/派生复评待完成。 | 作者完整自查通过；root独验待完成 |

## 改动的文件

evals/checks.ts、evals/provenance.test.ts（新增）、evals/README.md、reports/C6B.md。evals/checks.test.ts无需调整，全部原样保留。

## 新增依赖

无；依赖与锁文件零修改。

## 契约问题

无；contracts、生产代码、thresholds、cases、results、runner/run零修改。

## 没做的和已知问题

这是有限字面来源检查，不是全语义知识或教学安全验证。未知词跨出口显式肯定只覆盖文档列出的有限信号，措辞变体不保证穷尽。char_coach-20即使来源合法，原提前给组词答案仍有教学问题，已由独立C3B处理；不能称规则改动改善了模型质量。原179例报告未改，未重算旧分数；派生复评由root另存并标原hash与checks提交号。作者不读密钥/钥匙串/private，不发真实请求，不跑浏览器；root新clone、更强反例、完整复验与预算内真实回测尚待完成。

## 建议

继续由root分开报告来源检查派生结果与当前产品真实回测，不将历史检查误报重分类等同于能力通过。
