import type { AppRoute } from '../router/routes';

export function renderNavigation(routes: AppRoute[]) {
  return `
    <nav class="side-navigation">
      <p class="section-title">Platform Bones</p>
      <ul>
        ${routes
          .map(
            (route) => `
              <li>
                <span class="nav-label">${route.label}</span>
                <span class="nav-description">${route.description}</span>
              </li>
            `,
          )
          .join('')}
      </ul>
    </nav>
  `;
}
