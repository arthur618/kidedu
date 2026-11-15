// 仅由recovery.browser.ts在内存编译并通过测试HTTP服务加载，不是生产路由。
import React, { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { HttpLearningApp } from '../HttpLearningApp';
declare global { interface Window { recoveryHarness: { bind: (childId: string, lessonId: string) => void; show: (value: boolean) => void } } }
function Fixture() {
  const [binding, bind] = useState({ childId: 'child-test-1', lessonId: 'c7-lesson' });
  const [visible, show] = useState(true);
  useEffect(() => { window.recoveryHarness = { bind: (childId, lessonId) => bind({ childId, lessonId }), show }; }, []);
  return visible ? <HttpLearningApp childId={binding.childId} lessonId={binding.lessonId}/> : <p>已离开学习。</p>;
}
createRoot(document.getElementById('root')!).render(<StrictMode><Fixture/></StrictMode>);
