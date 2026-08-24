(function () {
  'use strict';
  if (!/\/categorias\.html$/i.test(location.pathname)) return;

  const style = document.createElement('style');
  style.id = 'categoryOrganizationLayoutStyles';
  style.textContent = `
    .category-filter-panel.category-organization-layout {
      display: grid !important;
      grid-template-columns: minmax(0, 1fr) auto minmax(220px, 270px);
      align-items: end;
      gap: 14px;
    }
    .category-filter-panel.category-organization-layout .filter-field-grow {
      min-width: 0;
      grid-column: 1;
    }
    .category-filter-panel.category-organization-layout #clearCategorySearch {
      grid-column: 2;
      white-space: nowrap;
      min-height: 48px;
    }
    .category-filter-panel.category-organization-layout #categoryTypeFilterField {
      grid-column: 3;
      min-width: 0;
    }
    .category-filter-panel.category-organization-layout #categoryFilterStatus {
      grid-column: 1 / -1;
      margin: 0;
    }
    .category-organization-hint {
      margin: -4px 0 14px;
      font-size: .84rem;
      opacity: .62;
    }
    @media (max-width: 820px) {
      .category-filter-panel.category-organization-layout {
        grid-template-columns: minmax(0, 1fr) minmax(170px, 220px);
      }
      .category-filter-panel.category-organization-layout .filter-field-grow {
        grid-column: 1 / -1;
      }
      .category-filter-panel.category-organization-layout #clearCategorySearch {
        grid-column: 1;
      }
      .category-filter-panel.category-organization-layout #categoryTypeFilterField {
        grid-column: 2;
      }
    }
    @media (max-width: 560px) {
      .category-filter-panel.category-organization-layout {
        grid-template-columns: 1fr;
      }
      .category-filter-panel.category-organization-layout #clearCategorySearch,
      .category-filter-panel.category-organization-layout #categoryTypeFilterField {
        grid-column: 1;
      }
    }
  `;
  document.head.appendChild(style);

  function setup() {
    const panel = document.querySelector('.category-filter-panel');
    if (!panel) return;
    panel.classList.add('category-organization-layout');

    const toolbar = panel.previousElementSibling;
    const masterToolbar = toolbar?.querySelector('.master-toolbar');
    const isMaster = sessionStorage.getItem('role') === 'master';
    if (isMaster && toolbar && !toolbar.querySelector('.category-organization-hint')) {
      const hint = document.createElement('p');
      hint.className = 'category-organization-hint';
      hint.textContent = 'O mestre pode classificar as categorias e arrastá-las para definir a ordem da campanha.';
      toolbar.insertAdjacentElement('afterend', hint);
    }

    const applyOrder = () => {
      const field = document.getElementById('categoryTypeFilterField');
      const clear = document.getElementById('clearCategorySearch');
      if (!field || !clear) return false;
      panel.appendChild(field);
      panel.appendChild(clear);
      const status = document.getElementById('categoryFilterStatus');
      if (status) panel.appendChild(status);
      return true;
    };

    if (applyOrder()) return;
    const observer = new MutationObserver(() => {
      if (applyOrder()) observer.disconnect();
    });
    observer.observe(panel, { childList: true });
    setTimeout(() => observer.disconnect(), 5000);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', setup, { once: true });
  } else {
    setup();
  }
})();
