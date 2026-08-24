(function () {
  'use strict';
  if (!/\/categorias\.html$/i.test(location.pathname)) return;

  const style = document.createElement('style');
  style.id = 'categoryOrganizationLayoutStyles';
  style.textContent = `
    .category-filter-panel.category-organization-layout {
      display: grid !important;
      grid-template-columns: minmax(0, 1fr) minmax(190px, auto) auto;
      grid-template-areas:
        "search classification clear"
        "status status status";
      align-items: end;
      gap: 14px;
    }
    .category-filter-panel.category-organization-layout .filter-field-grow {
      min-width: 0;
      grid-area: search;
    }
    .category-filter-panel.category-organization-layout #categoryTypeFilterField,
    .category-filter-panel.category-organization-layout #categoryClassificationField {
      grid-area: classification;
      min-width: 0;
    }
    .category-filter-panel.category-organization-layout #clearCategorySearch {
      grid-area: clear;
      min-height: 46px;
      white-space: nowrap;
      align-self: end;
      justify-self: end;
    }
    .category-filter-panel.category-organization-layout #categoryFilterStatus {
      grid-area: status;
      margin: 0;
    }
    .category-organization-hint {
      margin: -4px 0 14px;
      font-size: .84rem;
      opacity: .62;
    }
    @media (max-width: 820px) {
      .category-filter-panel.category-organization-layout {
        grid-template-columns: minmax(0, 1fr) minmax(190px, auto) auto;
      }
    }
    @media (max-width: 620px) {
      .category-filter-panel.category-organization-layout {
        grid-template-columns: 1fr;
        grid-template-areas:
          "search"
          "classification"
          "clear"
          "status";
      }
      .category-filter-panel.category-organization-layout #clearCategorySearch {
        width: 100%;
        justify-self: stretch;
      }
    }
  `;
  document.head.appendChild(style);

  function setup() {
    const panel = document.querySelector('.category-filter-panel');
    if (!panel) return;
    panel.classList.add('category-organization-layout');

    const toolbar = panel.previousElementSibling;
    const isMaster = sessionStorage.getItem('role') === 'master';
    if (isMaster && toolbar && !toolbar.querySelector('.category-organization-hint')) {
      const hint = document.createElement('p');
      hint.className = 'category-organization-hint';
      hint.textContent = 'O mestre pode classificar as categorias e arrastá-las para definir a ordem da campanha.';
      toolbar.insertAdjacentElement('afterend', hint);
    }

    const applyOrder = () => {
      const field = document.getElementById('categoryClassificationField');
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
