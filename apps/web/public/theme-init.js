// Runs before the app loads to avoid a flash of the wrong theme.
(function () {
  try {
    var root = document.documentElement;
    // Daylight (light) is the default look; Twilight (dark) is chosen in Settings or by the system.
    var theme = localStorage.getItem('cn.theme') || 'light';
    if (theme === 'system') theme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    root.setAttribute('data-theme', theme === 'dark' ? 'dark' : 'light');
    var motion = localStorage.getItem('cn.motion');
    if (motion === 'reduced' || motion === 'calm') root.setAttribute('data-motion', motion);
    var density = localStorage.getItem('cn.density');
    if (density === 'compact') root.setAttribute('data-density', 'compact');
  } catch {
    /* storage unavailable: keep defaults */
  }
})();
