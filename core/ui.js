(() => {
  const grid = document.getElementById('projectGrid');
  const statusMap = {
    live: '使用中',
    updating: '持續更新',
    planned: '預留'
  };

  const escapeHtml = (value = '') => String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');

  const renderCard = (project) => {
    const tag = project.url ? 'a' : 'article';
    const href = project.url ? ` href="${escapeHtml(project.url)}"` : '';
    const dataProject = project.url ? ` data-project="${escapeHtml(project.id)}"` : '';
    const target = project.external ? ' target="_blank" rel="noopener"' : '';
    const status = statusMap[project.status] || project.status;
    const action = project.url ? '進入資料庫 <b>→</b>' : 'COMING SOON';

    return `<${tag} class="project-card ${escapeHtml(project.theme)}"${href}${dataProject}${target}>
      <div class="project-top"><span class="project-code">${escapeHtml(project.code)}</span><span class="status ${escapeHtml(project.status)}">${escapeHtml(status)}</span></div>
      <div><small>${escapeHtml(project.subtitle)}</small><h3>${escapeHtml(project.title)}</h3><p>${escapeHtml(project.description)}</p></div>
      <span class="enter${project.url ? '' : ' muted'}">${action}</span>
    </${tag}>`;
  };

  async function loadProjects() {
    try {
      const response = await fetch(window.DMVAULT_CONFIG.projectsIndex, { cache: 'no-store' });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const projects = await response.json();
      grid.innerHTML = projects.map(renderCard).join('');
      grid.querySelectorAll('[data-project]').forEach((link) => {
        link.addEventListener('click', () => {
          window.DMVAULT_ANALYTICS?.track('enter_project', { project_target: link.dataset.project });
        });
      });
    } catch (error) {
      console.error('Unable to load project list:', error);
      grid.innerHTML = '<p class="load-error">作品清單暫時無法載入，請重新整理頁面。</p>';
    }
  }

  document.addEventListener('DOMContentLoaded', loadProjects);
})();
