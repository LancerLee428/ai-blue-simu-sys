import { ONTOLOGY_ROOTS } from '@ai-blue-simu-sys/ontology';

export function renderOntologyModule() {
  return `
    <article class="module-card">
      <p class="module-kicker">Ontology Seed</p>
      <h2>统一对象模型</h2>
      <p class="module-summary">首期种子对象：${ONTOLOGY_ROOTS.join(' / ')}</p>
      <ul>
        <li>统一对象身份与关系类型</li>
        <li>兵力装备源作为基线事实入口</li>
        <li>为场景投影、AI 上下文和后续规则扩展提供公共语义底座</li>
      </ul>
    </article>
  `;
}
