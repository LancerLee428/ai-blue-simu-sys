import type { ModuleDescriptor } from '@ai-blue-simu-sys/shared';

export function renderNavigation(routes: ModuleDescriptor[]) {
  return `
    <nav class="side-navigation">
      <p class="section-title">Platform Bones</p>
      <ul>
        ${routes
          .map(
            (route) => `
              <li>
                <span class="nav-label">${route.title}</span>
                <span class="nav-description">${route.description}</span>
              </li>
            `,
          )
          .join('')}
      </ul>
    </nav>
  `;
}
