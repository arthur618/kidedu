# 项目接续说明

更新时间：2026-11-14。远端：https://github.com/arthur618/kidedu 。先读本文件与tasks/STATUS.md；docs/HANDOFF.md保留最初交接背景，旧进度不再代表现状。

## 当前主线

- C1、D2、D1、C3、C5、C2、C4、C6、C7均已合并；契约2.2，新增HTTP响应契约src/contracts/session.ts，原业务契约保留。
- C7最终交付task/C7@1baf3be，合并d149377。第二次独立验收关闭照片重放/快照与取消耗时问题，reviews/C7.md保留首次与二次记录。
- 独立克隆666测试、实际生产构建、10项浏览器、六组自编探针通过；真实main重新npm ci后666测试及构建通过。
- 认字回路已接上真实编排器/DB/Agent/护栏，完整链路用假模型验证；真实DeepSeek模型质量、可用型号和图片能力没有实测，不宣称已公开上线。
- 当前没有仍在实现的子agent；已完成工作不要重新启动覆盖。主对话仍只做设计/契约/验收，后续实现另派独立agent。

## 下一项任务

C8–C11任务书已建立，均未派发：
- C8-speech.md：先C8A供应商无关接口/测试与文字退路，后C8B国内真实ASR/TTS；负责人尚未提供供应商信息，不搜索密钥、不调用真实音频服务。
- C9-reading.md：approved选文、点字查卡、文字复述/追问；keyPoints绝不可返回前端。
- C10-essay.md：采访与孩子原话素材卡、读后提问；不代写。
- C11-nightly-parent.md：真实数据汇总、批处理幂等、日报、家长鉴权及Incident人工复核。

文件均位于tasks/codex/。派发前总设计师需冻结该任务新增共享契约与精确scope，再按复杂度选模型，不能让实现者自行扩contracts或借用C7写权限。原真实C6评测按负责人决定延后，依赖审计欠账仍在。

## 换电脑继续的顺序

1. 获取远端main，读AGENTS.md、docs/ARCHITECTURE.md、docs/WORKFLOW.md、src/contracts所有文件、看板和对应任务/review。当前契约共有4个文件，不再只有原3个。
2. 先检查远端/本地分支和未提交内容，保留另一台电脑的工作；不强推，不用旧恢复包覆盖后续提交。
3. npm ci后按迁移初始化本机开发数据库，必要时导入编造seed。生产孩子数据不参与测试；不要让编码agent读取真实private音频/照片。
4. 本地孩子端入口为/learn。真实模型配置未验证时，不把页面能打开当模型质量通过；调试/验收仅使用编造数据、假模型或经负责人安排的本机真实评测。
5. RUST_LOG可能干扰Prisma临时建库，测试前清除；回环浏览器测试清除http/https/all_proxy并设置NO_PROXY。Next构建/全套verify/浏览器串行排队，不复用已有服务。
6. 环境变量、SSH私钥、node_modules、缓存不随Git迁移；只配置本机，不在聊天贴密钥。Playwright缓存已改为继承环境变量或os.tmpdir，不硬编码原电脑路径。

## 验收和权限

实现者只改任务scope及报告，不改契约/reviews/主验证脚本/看板；总设计师在独立克隆重新安装、复跑、读代码并试合最新main。通过后负责人已授权本对话直接本地合并并同步本GitHub仓库，无需负责人执行终端命令。

本轮C7使用单个Sol high实现，Sol medium只做一次聚焦恢复审查；返工沿用原实现上下文，没有自动派更多实现者。模型分配依据与历史见tasks/MODEL-ROUTING.md。
