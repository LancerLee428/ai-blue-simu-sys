import './styles.css';
import { renderAppShell } from './app/layouts/render-app-shell';
import { isApiAvailable, loadPlatformState } from './app/state/platform-state';
import { setupAiAssistantInteraction } from './modules/ai-assistant';

const app = document.getElementById('app');

function renderConnectionBanner(connected: boolean) {
  return `
    <div class="connection-banner ${connected ? 'connection-banner-online' : 'connection-banner-offline'}">
      <strong>${connected ? '已连接本地服务端' : '当前处于演示模式'}</strong>
      <span>${
        connected
          ? '平台状态、AI 草案与写回操作均来自本地 server。'
          : '未检测到本地 server，页面正在使用内置演示状态。启动 apps/server 后将自动切换。'
      }</span>
    </div>
  `;
}

async function bootstrap() {
  const platform = await loadPlatformState();

  if (!app) {
    return;
  }

  const connected = isApiAvailable();
  app.innerHTML = `${renderConnectionBanner(connected)}${renderAppShell(platform)}`;
  setupAiAssistantInteraction();
}

void bootstrap();
