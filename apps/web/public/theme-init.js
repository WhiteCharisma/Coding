// Runs before the app loads to avoid a flash of the wrong theme.
(function () {
  try {
    var root = document.documentElement;
    var theme = localStorage.getItem('cn.theme') || 'dark';
    if (theme === 'system') theme = window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
    root.setAttribute('data-theme', theme === 'light' ? 'light' : 'dark');
    var motion = localStorage.getItem('cn.motion');
    if (motion === 'reduced') root.setAttribute('data-motion', 'reduced');
    var density = localStorage.getItem('cn.density');
    if (density === 'compact') root.setAttribute('data-density', 'compact');
  } catch {
    /* storage unavailable: keep defaults */
  }
})();
