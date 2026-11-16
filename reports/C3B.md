# 任务报告：C3B 组词提示泄答修复

- 实现者：Codex / Sol medium，单实现，无子agent
- 分支：task/C3B；基线main@372a18b
- 日期：2026-11-16（客户端日期）
- 自查结果：focused src/agents 7文件104测试通过（既有80+新增24）；typecheck通过；root授权独占完整verify C3B退出0，66文件1076测试通过（67.14秒），含实际Next.js生产构建；scope4路径通过，contracts零差异。验证实现提交2b016c5，随后仅本报告补证。

## 做了什么

保留原runAgent/LlmClient调用，在make_word实际run返回前检查say+ask是否连续出现字卡words原词；仅最后一条role=child原话逐字提供过的词允许出现。未提供的完整词改为安全提示并wait_child，不增加调用、不推进学习状态；已有非空未收录回答保留“这个词我还不认识，你再想一个书上的”。正常升级不变，夹带答案的escalate改固定未知话术并保留escalate语义。单字词也检测，失败兜底不再把单字词完整答案当首字提示。

## 验收标准对照

| 验收标准 | 对应测试/证据 | 状态 |
| --- | --- | --- |
| 真实失败输入/输出固定回归：say休息/午休、仅ask、无引号/不同引号均不泄答；等待、不记对，不改原输入或候选。 | word-hints.test.ts固定char_coach-20合成输入和实际候选；5种引号/无引号、ask泄答与step_done替换；输入和候选深比较不变、仅一次模型调用。 | focused及完整verify通过 |
| 最近孩子已提供完整词可确认；首字/安全问题合法；单字不能泄答案；非make_word/escalate/失败兜底保持；不删旧断言。 | 新24例覆盖最近child（忽略更早child和agent）、孩子已给一个词仍拦另一个、无回答/空白、首字/通用问句、单字say/ask及fallback、explain/make_sentence、正常/夹带答案escalate、3种失败各一次调用；既有80例完整通过，旧测试未改。 | focused及完整verify通过 |
| focused后独占verify含实际build、scope/contracts0/报告准确/干净提交；root新clone与真实定向回测。 | typecheck/focused后获root独占授权，执行env -u RUST_LOG XDG_CACHE_HOME=<已批准runtime-cache> bash scripts/verify.sh C3B退出0；66文件1076测试通过（原65/1052+新增1/24），src/server/build.test.ts真实npm run build成功；scope4路径通过、contracts零差异，原测试零修改/删除。root独立验收及预算内真实回测待负责人完成。 | 作者完整自查通过；root独验待完成 |

## 改动的文件

src/agents/char_coach/index.ts、fallback.ts、新增word-hints.test.ts；reports/C3B.md。

## 新增依赖

无；依赖、锁文件零修改。

## 契约问题

无；契约、shared、其他Agent、guard、server、编排器、config、提示词、评测与阈值零修改。

## 没做的和已知问题

作者不读密钥/钥匙串/.env/private或真实孩子数据，不发真实调用，不跑浏览器；所有回归使用公开合成材料和假LlmClient。检查限于字卡原词的连续字面出现，不是全语义评判器，不宣称解决全部C6失分或改写旧成绩。对单字词采用通用提示；正常多字词首字提示和既有失败兜底保留。root实际服务链探针/真实定向回测尚待完成。

## 建议

由root独立验证临时SQLite计量与学习状态未推进，并在预算内重跑针对性合成组词样例；评测规则误报继续单独裁决。
