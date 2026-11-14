# 本地夜间批处理

在已迁移的SQLite库上显式运行一个孩子、一个日历日：

```sh
npm run nightly -- --child-id <孩子ID> --date 2026-11-14
npm run nightly -- --child-id <孩子ID> --date 2026-11-14 --timezone UTC --retry-failed
```

默认时区是Asia/Shanghai，只支持它与UTC。没有全库扫描、自动cron或部署步骤。配置沿用现有LlmClient的DeepSeek校验；不提供凭据时返回事实摘要，复述评分为null。运行结果为契约DailyReport JSON，公共retellScores使用固定参考说明；原始评分理由只留私有NightlyStep。

调度器可导入`createNightlyRunner()`并传入相同请求；`now`与模型工厂仅供本地编造数据测试注入。公开读取使用`getDailyReport(childId,date,timezone)`。本模块不提供家长鉴权或HTTP端点。

原始学习来源、私有快照、每步输入指纹和公开发布分别持久化；相同派生输入的成功步骤可跨来源版本复用。失败默认复用诚实退路，只有显式`--retry-failed`重试。新增来源版本不覆盖历史job；旧job迟到不得覆盖新job发布。每次实际调用产生白名单Turn，复用步骤通过reusedFromJobId追溯原任务，不伪造新调用。

这是单Node/SQLite试点：同任务使用持久租约和CAS，模型等待不占数据库事务。进程在外部调用返回但结果落盘前崩溃时，恢复可能再次调用并计费；此窗口连调用计量也可能尚未落盘，因此不保证费用恰好一次。没有验证多实例部署或真实模型质量。原始学习流水与学习记录不会被本任务删除。
