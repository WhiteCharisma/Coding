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
    // Window colour of the glass frames (stores/ui.ts → applyGlass).
    var glass = JSON.parse(localStorage.getItem('cn.glass') || 'null');
    if (glass && typeof glass === 'object') {
      if (typeof glass.h === 'number') root.style.setProperty('--frame-h', String(glass.h));
      if (typeof glass.c === 'number') root.style.setProperty('--frame-c', String(glass.c));
      if (typeof glass.strength === 'number') root.style.setProperty('--frame-strength', String(glass.strength / 100));
      if (glass.transparency === false) root.setAttribute('data-transparency', 'off');
    }
  } catch {
    /* storage unavailable: keep defaults */
  }
})();
