import './styles.css';
import { renderAppShell } from './app/layouts/render-app-shell';
import { setupAiAssistantInteraction } from './modules/ai-assistant';

const app = document.getElementById('app');

if (app) {
  app.innerHTML = renderAppShell();
  setupAiAssistantInteraction();
}
