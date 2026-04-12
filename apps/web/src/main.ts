import './styles.css';
import { renderAppShell } from './app/layouts/render-app-shell';
import { loadPlatformState } from './app/state/platform-state';
import { setupAiAssistantInteraction } from './modules/ai-assistant';

const app = document.getElementById('app');

async function bootstrap() {
  const platform = await loadPlatformState();

  if (!app) {
    return;
  }

  app.innerHTML = renderAppShell(platform);
  setupAiAssistantInteraction();
}

void bootstrap();
