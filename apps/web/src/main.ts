import './styles.css';
import { renderAppShell } from './app/layouts/render-app-shell';
import { isApiAvailable, loadPlatformState } from './app/state/platform-state';
import { setupAiAssistantInteraction } from './modules/ai-assistant';

const app = document.getElementById('app');

async function bootstrap() {
  const platform = await loadPlatformState();

  if (!app) {
    return;
  }

  app.innerHTML = renderAppShell(platform);
  setupAiAssistantInteraction();

  if (!isApiAvailable()) {
    const lead = document.querySelector('.lead');
    if (lead) {
      lead.textContent = '当前未连接到本地 server，页面正在使用内置演示状态。启动 apps/server 后将切换到真实服务端状态。';
    }
  }
}

void bootstrap();
