import './styles.css';
import { renderAppShell } from './app/layouts/render-app-shell';

const app = document.getElementById('app');

if (app) {
  app.innerHTML = renderAppShell();
}
