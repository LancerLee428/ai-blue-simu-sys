(function(){let e=document.createElement(`link`).relList;if(e&&e.supports&&e.supports(`modulepreload`))return;for(let e of document.querySelectorAll(`link[rel="modulepreload"]`))n(e);new MutationObserver(e=>{for(let t of e)if(t.type===`childList`)for(let e of t.addedNodes)e.tagName===`LINK`&&e.rel===`modulepreload`&&n(e)}).observe(document,{childList:!0,subtree:!0});function t(e){let t={};return e.integrity&&(t.integrity=e.integrity),e.referrerPolicy&&(t.referrerPolicy=e.referrerPolicy),e.crossOrigin===`use-credentials`?t.credentials=`include`:e.crossOrigin===`anonymous`?t.credentials=`omit`:t.credentials=`same-origin`,t}function n(e){if(e.ep)return;e.ep=!0;let n=t(e);fetch(e.href,n)}})();var e=[{path:`/ontology`,label:`Ontology`,description:`统一对象模型、对象源与关系建模入口。`},{path:`/scenario-workspace`,label:`Scenario Workspace`,description:`想定工作空间、对象投影与版本上下文。`},{path:`/situation-workbench`,label:`Situation Workbench`,description:`态势工作台、地球引擎与空间部署工作面。`},{path:`/ai-assistant`,label:`AI Assistant`,description:`上下文问答、结构化辅助与智能部署入口。`},{path:`/governance`,label:`Governance`,description:`权限、审计、版本与可信治理能力。`}];function t(e){return`
    <nav class="side-navigation">
      <p class="section-title">Platform Bones</p>
      <ul>
        ${e.map(e=>`
              <li>
                <span class="nav-label">${e.label}</span>
                <span class="nav-description">${e.description}</span>
              </li>
            `).join(``)}
      </ul>
    </nav>
  `}function n(){return`
    <article class="module-card">
      <p class="module-kicker">Ontology Seed</p>
      <h2>统一对象模型</h2>
      <ul>
        <li>ForceUnit / Platform / GeoZone / Mission</li>
        <li>统一对象身份与关系类型</li>
        <li>兵力装备源作为基线事实入口</li>
      </ul>
    </article>
  `}function r(){return`
    <article class="module-card">
      <p class="module-kicker">Scenario Workspace</p>
      <h2>想定工作空间</h2>
      <ul>
        <li>创建场景 / 保存版本</li>
        <li>源对象投影到想定</li>
        <li>形成持续编辑上下文</li>
      </ul>
    </article>
  `}function i(){return`
    <article class="module-card">
      <p class="module-kicker">Situation Workbench</p>
      <h2>态势工作台</h2>
      <ul>
        <li>地球引擎承载空间态势</li>
        <li>部署位置与对象状态联动</li>
        <li>对象详情与空间上下文切换</li>
      </ul>
    </article>
  `}function a(){return`
    <article class="module-card module-card-accent">
      <p class="module-kicker">AI Assistant</p>
      <h2>智能问答与智能部署</h2>
      <ul>
        <li>上下文感知问答</li>
        <li>结构化风险提示与摘要</li>
        <li>Chat 式部署入口：例如“在台湾部署对抗兵力”</li>
      </ul>
    </article>
  `}function o(){return`
    <article class="module-card">
      <p class="module-kicker">Governance</p>
      <h2>治理与可信性</h2>
      <ul>
        <li>RBAC 与基础权限边界</li>
        <li>版本留痕与对象审计</li>
        <li>AI 输出与部署动作审计</li>
      </ul>
    </article>
  `}function s(){return`
    <main class="platform-shell">
      <aside class="platform-sidebar">
        <div>
          <p class="eyebrow">AI Blue Simulation System</p>
          <h1>智能蓝军平台</h1>
          <p class="lead">
            围绕 Ontology、Scenario Workspace、Situation Workbench、AI Assistant、Governance
            五根骨架构建第一版可运行平台。
          </p>
        </div>
        ${t(e)}
      </aside>
      <section class="platform-content">
        <div class="module-grid">
          ${n()}
          ${r()}
          ${i()}
          ${a()}
          ${o()}
        </div>
      </section>
    </main>
  `}var c=document.getElementById(`app`);c&&(c.innerHTML=s());