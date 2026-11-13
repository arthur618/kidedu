#!/usr/bin/env bash
# 用法：bash scripts/verify.sh [任务号]
# 提交前自查用，总设计师验收时也跑这一条。
set -euo pipefail
TASK="${1:-}"
echo "== 1/4 类型检查 =="; npm run -s typecheck
echo "== 2/4 测试 =="; npm test -s
if [ -n "$TASK" ]; then
  echo "== 3/4 范围检查 =="; node scripts/check-scope.mjs "$TASK"
  echo "== 4/4 报告文件 =="; test -s "reports/$TASK.md" && echo "reports/$TASK.md 存在" || { echo "缺少 reports/$TASK.md"; exit 1; }
else
  echo "== 3/4、4/4 跳过（没有给任务号）=="
fi
echo "全部通过。"
