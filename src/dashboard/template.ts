export function renderDashboardHtml(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=5.0">
  <title>safe-change Dashboard</title>
  <style>
    :root {
      --font-sans: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      --font-mono: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace;

      --bg-base: #f8fafc;
      --glass-surface: rgba(255, 255, 255, 0.75);
      --glass-surface-hover: rgba(255, 255, 255, 0.9);
      --glass-border: rgba(255, 255, 255, 0.85);
      --glass-border-subtle: rgba(226, 232, 240, 0.7);
      --glass-shadow: 0 10px 30px -5px rgba(15, 23, 42, 0.04), 0 0 0 1px rgba(226, 232, 240, 0.5), inset 0 1px 2px rgba(255, 255, 255, 0.9);
      --glass-shadow-hover: 0 20px 40px -10px rgba(15, 23, 42, 0.08), 0 0 0 1px rgba(203, 213, 225, 0.7), inset 0 1px 2px #ffffff;

      --text-primary: #0f172a;
      --text-secondary: #475569;
      --text-tertiary: #94a3b8;

      --status-clean: #059669;
      --status-clean-bg: rgba(16, 185, 129, 0.1);
      --status-clean-border: rgba(16, 185, 129, 0.25);
      --status-clean-glow: rgba(16, 185, 129, 0.25);

      --status-regression: #e11d48;
      --status-regression-bg: rgba(244, 63, 94, 0.1);
      --status-regression-border: rgba(244, 63, 94, 0.25);
      --status-regression-glow: rgba(244, 63, 94, 0.25);

      --status-warn: #d97706;
      --status-warn-bg: rgba(245, 158, 11, 0.1);
      --status-warn-border: rgba(245, 158, 11, 0.25);

      --status-info: #0284c7;
      --status-info-bg: rgba(14, 165, 233, 0.1);
      --status-info-border: rgba(14, 165, 233, 0.25);

      --accent-indigo: #4f46e5;
      --accent-indigo-bg: rgba(79, 70, 229, 0.08);
      --accent-indigo-border: rgba(79, 70, 229, 0.2);
    }

    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }

    body {
      font-family: var(--font-sans);
      font-size: 13px;
      line-height: 1.5;
      color: var(--text-primary);
      background-color: var(--bg-base);
      background-image:
        radial-gradient(ellipse at 10% 10%, rgba(99, 102, 241, 0.12) 0%, transparent 45%),
        radial-gradient(ellipse at 90% 15%, rgba(56, 189, 248, 0.15) 0%, transparent 45%),
        radial-gradient(ellipse at 80% 85%, rgba(244, 63, 94, 0.06) 0%, transparent 50%),
        radial-gradient(ellipse at 15% 85%, rgba(16, 185, 129, 0.1) 0%, transparent 45%),
        radial-gradient(ellipse at 50% 50%, rgba(139, 92, 246, 0.05) 0%, transparent 60%);
      background-attachment: fixed;
      background-size: cover;
      min-height: 100vh;
      -webkit-font-smoothing: antialiased;
      -moz-osx-font-smoothing: grayscale;
    }

    .mono {
      font-family: var(--font-mono);
    }

    .container {
      width: 100%;
      max-width: 1720px;
      margin: 0 auto;
      padding: clamp(16px, 2.5vw, 36px);
      display: flex;
      flex-direction: column;
      gap: 20px;
    }

    .glass {
      position: relative;
      background: var(--glass-surface);
      backdrop-filter: blur(24px) saturate(190%);
      -webkit-backdrop-filter: blur(24px) saturate(190%);
      border: 1px solid var(--glass-border);
      border-radius: 18px;
      box-shadow: var(--glass-shadow);
      transition: transform 0.2s cubic-bezier(0.16, 1, 0.3, 1), box-shadow 0.2s ease, border-color 0.2s ease;
    }

    .glass:hover {
      box-shadow: var(--glass-shadow-hover);
    }

    header.glass {
      display: flex;
      justify-content: space-between;
      align-items: center;
      flex-wrap: wrap;
      gap: 16px;
      padding: 16px 24px;
    }

    .brand-section {
      display: flex;
      align-items: center;
      gap: 14px;
    }

    .brand-icon {
      width: 42px;
      height: 42px;
      border-radius: 12px;
      background: linear-gradient(135deg, #0284c7 0%, #4f46e5 100%);
      display: flex;
      align-items: center;
      justify-content: center;
      color: #ffffff;
      box-shadow: 0 6px 16px rgba(2, 132, 199, 0.3);
      flex-shrink: 0;
    }

    .brand-icon svg {
      width: 22px;
      height: 22px;
      fill: none;
      stroke: currentColor;
      stroke-width: 2;
      stroke-linecap: round;
      stroke-linejoin: round;
    }

    .brand-title {
      font-size: 17px;
      font-weight: 700;
      letter-spacing: -0.3px;
      color: var(--text-primary);
      display: flex;
      align-items: center;
      gap: 8px;
      flex-wrap: wrap;
    }

    .brand-subtitle {
      font-size: 12px;
      color: var(--text-secondary);
      margin-top: 1px;
    }

    .header-actions {
      display: flex;
      align-items: center;
      gap: 12px;
      flex-wrap: wrap;
    }

    .connection-badge {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      background: rgba(255, 255, 255, 0.85);
      border: 1px solid var(--glass-border-subtle);
      padding: 6px 14px;
      border-radius: 20px;
      font-size: 11px;
      font-weight: 600;
      color: var(--text-secondary);
      box-shadow: 0 2px 6px rgba(0, 0, 0, 0.02);
    }

    .live-pulse {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: var(--status-clean);
      box-shadow: 0 0 10px var(--status-clean);
      animation: pulse 2.2s infinite ease-in-out;
    }

    @keyframes pulse {
      0%, 100% { opacity: 1; transform: scale(1); }
      50% { opacity: 0.4; transform: scale(0.85); }
    }

    .stats-row {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
      gap: 16px;
    }

    .stat-tile {
      padding: 18px 22px;
      display: flex;
      flex-direction: column;
      gap: 6px;
    }

    .stat-label-wrap {
      display: flex;
      justify-content: space-between;
      align-items: center;
    }

    .stat-label {
      font-size: 11px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.6px;
      color: var(--text-secondary);
    }

    .stat-icon {
      color: var(--text-tertiary);
    }

    .stat-icon svg {
      width: 16px;
      height: 16px;
      stroke: currentColor;
      fill: none;
      stroke-width: 2;
    }

    .stat-metric {
      font-size: 26px;
      font-weight: 800;
      letter-spacing: -0.6px;
      color: var(--text-primary);
      display: flex;
      align-items: baseline;
      gap: 8px;
      line-height: 1.1;
    }

    .stat-subtext {
      font-size: 12px;
      color: var(--text-tertiary);
      font-weight: 500;
    }

    .main-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(min(100%, 480px), 1fr));
      gap: 20px;
    }

    .panel {
      padding: 22px;
      display: flex;
      flex-direction: column;
    }

    .panel-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 12px;
      margin-bottom: 16px;
      padding-bottom: 14px;
      border-bottom: 1px solid var(--glass-border-subtle);
    }

    .panel-heading {
      font-size: 14px;
      font-weight: 700;
      color: var(--text-primary);
      display: flex;
      align-items: center;
      gap: 8px;
      letter-spacing: -0.2px;
    }

    .panel-pill {
      font-size: 11px;
      color: var(--text-tertiary);
      font-weight: 500;
    }

    .meta-table {
      width: 100%;
      border-collapse: collapse;
    }

    .meta-table tr {
      border-bottom: 1px solid var(--glass-border-subtle);
    }

    .meta-table tr:last-child {
      border-bottom: none;
    }

    .meta-table td {
      padding: 10px 0;
      vertical-align: middle;
      font-size: 12px;
    }

    .meta-table td.col-label {
      color: var(--text-secondary);
      font-weight: 500;
      width: 40%;
    }

    .meta-table td.col-value {
      color: var(--text-primary);
      font-weight: 600;
      text-align: right;
    }

    .checks-list {
      display: flex;
      flex-direction: column;
      gap: 8px;
      margin-top: 14px;
    }

    .check-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      background: rgba(255, 255, 255, 0.6);
      border: 1px solid var(--glass-border-subtle);
      padding: 10px 14px;
      border-radius: 12px;
      font-size: 12px;
    }

    .check-title {
      font-weight: 600;
      color: var(--text-primary);
      display: inline-flex;
      align-items: center;
      gap: 6px;
    }

    .check-meta {
      color: var(--text-tertiary);
      font-size: 11px;
    }

    .rules-list {
      display: flex;
      flex-direction: column;
      gap: 10px;
    }

    .rule-card {
      background: rgba(255, 255, 255, 0.65);
      border: 1px solid var(--glass-border-subtle);
      border-left: 4px solid var(--status-info);
      border-radius: 12px;
      padding: 14px 16px;
      box-shadow: 0 2px 6px rgba(0, 0, 0, 0.02);
      transition: background 0.15s ease;
    }

    .rule-card.rule-error {
      border-left-color: var(--status-regression);
    }

    .rule-card.rule-warn {
      border-left-color: var(--status-warn);
    }

    .rule-card:hover {
      background: rgba(255, 255, 255, 0.9);
    }

    .rule-head {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 8px;
      margin-bottom: 4px;
    }

    .rule-name {
      font-weight: 700;
      color: var(--text-primary);
      font-size: 13px;
    }

    .rule-desc {
      color: var(--text-secondary);
      font-size: 11px;
      margin-bottom: 8px;
      line-height: 1.4;
    }

    .rule-code {
      background: #ffffff;
      border: 1px solid var(--glass-border-subtle);
      padding: 3px 8px;
      border-radius: 6px;
      font-size: 11px;
      color: var(--accent-indigo);
      font-weight: 600;
      display: inline-block;
    }

    .timeline-card {
      padding: 22px;
    }

    .timeline-container {
      position: relative;
      display: flex;
      align-items: center;
      gap: 20px;
      overflow-x: auto;
      padding: 24px 12px;
      scrollbar-width: thin;
      scrollbar-color: var(--glass-border-subtle) transparent;
    }

    .timeline-container::-webkit-scrollbar {
      height: 6px;
    }

    .timeline-container::-webkit-scrollbar-thumb {
      background: var(--glass-border-subtle);
      border-radius: 4px;
    }

    .timeline-container::before {
      content: "";
      position: absolute;
      top: 50%;
      left: 16px;
      right: 16px;
      height: 3px;
      background: rgba(203, 213, 225, 0.7);
      border-radius: 2px;
      z-index: 1;
      transform: translateY(-50%);
    }

    .timeline-step {
      position: relative;
      z-index: 2;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 8px;
      flex-shrink: 0;
      cursor: pointer;
      transition: transform 0.18s cubic-bezier(0.16, 1, 0.3, 1);
    }

    .timeline-step:hover {
      transform: translateY(-3px);
    }

    .timeline-marker {
      width: 30px;
      height: 30px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 11px;
      font-weight: 800;
      border: 3px solid #ffffff;
      box-shadow: 0 4px 10px rgba(0, 0, 0, 0.08);
    }

    .timeline-marker.clean {
      background: linear-gradient(135deg, #10b981 0%, #059669 100%);
      color: #ffffff;
      box-shadow: 0 4px 12px var(--status-clean-glow);
    }

    .timeline-marker.regression {
      background: linear-gradient(135deg, #f43f5e 0%, #e11d48 100%);
      color: #ffffff;
      box-shadow: 0 4px 12px var(--status-regression-glow);
    }

    .timeline-time {
      font-size: 10px;
      font-weight: 600;
      color: var(--text-tertiary);
    }

    .timeline-label {
      font-size: 11px;
      font-weight: 600;
      color: var(--text-secondary);
      max-width: 140px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .table-card {
      padding: 22px;
    }

    .table-topbar {
      display: flex;
      justify-content: space-between;
      align-items: center;
      flex-wrap: wrap;
      gap: 12px;
      margin-bottom: 16px;
    }

    .filter-pills {
      display: flex;
      gap: 6px;
      background: rgba(241, 245, 249, 0.8);
      padding: 3px;
      border-radius: 8px;
      border: 1px solid var(--glass-border-subtle);
    }

    .filter-btn {
      background: transparent;
      border: none;
      color: var(--text-secondary);
      padding: 5px 12px;
      border-radius: 6px;
      font-size: 11px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.15s ease;
    }

    .filter-btn.active, .filter-btn:hover {
      background: #ffffff;
      color: var(--text-primary);
      box-shadow: 0 2px 6px rgba(0, 0, 0, 0.05);
    }

    .responsive-table-wrapper {
      width: 100%;
      overflow-x: auto;
      -webkit-overflow-scrolling: touch;
      border-radius: 12px;
      border: 1px solid var(--glass-border-subtle);
      background: rgba(255, 255, 255, 0.5);
    }

    table {
      width: 100%;
      border-collapse: collapse;
      text-align: left;
      min-width: 720px;
    }

    th {
      color: var(--text-secondary);
      background: rgba(248, 250, 252, 0.85);
      padding: 12px 16px;
      border-bottom: 1px solid var(--glass-border-subtle);
      font-size: 11px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.6px;
      white-space: nowrap;
    }

    td {
      padding: 13px 16px;
      border-bottom: 1px solid var(--glass-border-subtle);
      font-size: 12px;
      vertical-align: middle;
    }

    tr:last-child td {
      border-bottom: none;
    }

    tr:hover td {
      background: rgba(255, 255, 255, 0.8);
    }

    tr.row-regression td {
      background: rgba(244, 63, 94, 0.03);
    }

    tr.row-regression:hover td {
      background: rgba(244, 63, 94, 0.08);
    }

    .badge {
      display: inline-flex;
      align-items: center;
      padding: 3px 9px;
      border-radius: 6px;
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0.3px;
      white-space: nowrap;
    }

    .badge-clean {
      background: var(--status-clean-bg);
      color: var(--status-clean);
      border: 1px solid var(--status-clean-border);
    }

    .badge-regression {
      background: var(--status-regression-bg);
      color: var(--status-regression);
      border: 1px solid var(--status-regression-border);
    }

    .badge-info {
      background: var(--status-info-bg);
      color: var(--status-info);
      border: 1px solid var(--status-info-border);
    }

    .badge-warn {
      background: var(--status-warn-bg);
      color: var(--status-warn);
      border: 1px solid var(--status-warn-border);
    }

    .diff-badge {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      font-size: 11px;
      font-family: var(--font-mono);
      font-weight: 600;
      background: rgba(255, 255, 255, 0.85);
      padding: 2px 8px;
      border-radius: 6px;
      border: 1px solid var(--glass-border-subtle);
      white-space: nowrap;
    }

    .diff-add { color: var(--status-clean); }
    .diff-mod { color: var(--status-warn); }
    .diff-del { color: var(--status-regression); }

    .empty-state {
      padding: 36px 16px;
      text-align: center;
      color: var(--text-tertiary);
      font-style: italic;
    }

    @media (max-width: 768px) {
      .container {
        padding: 12px;
        gap: 14px;
      }
      header.glass {
        padding: 14px 16px;
      }
      .panel, .timeline-card, .table-card {
        padding: 16px;
      }
      .stat-metric {
        font-size: 22px;
      }
    }
  </style>
</head>
<body>
  <div class="container">
    <header class="glass">
      <div class="brand-section">
        <div class="brand-icon">
          <svg viewBox="0 0 24 24">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
          </svg>
        </div>
        <div>
          <div class="brand-title">
            safe-change dashboard
            <span class="badge badge-info" style="font-size: 10px; padding: 1px 6px;">v0.2.0</span>
          </div>
          <div class="brand-subtitle">Autonomous verification telemetry and safety sentinel</div>
        </div>
      </div>
      <div class="header-actions">
        <div class="connection-badge">
          <div class="live-pulse"></div>
          <span>127.0.0.1:4242</span>
        </div>
      </div>
    </header>

    <div class="stats-row">
      <div class="stat-tile glass">
        <div class="stat-label-wrap">
          <span class="stat-label">System State</span>
          <span class="stat-icon">
            <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/></svg>
          </span>
        </div>
        <div class="stat-metric" id="stat-system-state">Scanning...</div>
        <span class="stat-subtext" id="stat-system-sub">Verification guardrail</span>
      </div>

      <div class="stat-tile glass">
        <div class="stat-label-wrap">
          <span class="stat-label">Monitored Baseline</span>
          <span class="stat-icon">
            <svg viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
          </span>
        </div>
        <div class="stat-metric" id="stat-baseline-files">--</div>
        <span class="stat-subtext" id="stat-baseline-desc">Active repository scope</span>
      </div>

      <div class="stat-tile glass">
        <div class="stat-label-wrap">
          <span class="stat-label">Safety History</span>
          <span class="stat-icon">
            <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
          </span>
        </div>
        <div class="stat-metric" id="stat-runs-count">--</div>
        <span class="stat-subtext" id="stat-runs-sub">Persistent safety log entries</span>
      </div>

      <div class="stat-tile glass">
        <div class="stat-label-wrap">
          <span class="stat-label">Active Guardrails</span>
          <span class="stat-icon">
            <svg viewBox="0 0 24 24"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
          </span>
        </div>
        <div class="stat-metric" id="stat-rules-count">--</div>
        <span class="stat-subtext" id="stat-rules-sub">Configured safety policies</span>
      </div>
    </div>

    <div class="main-grid">
      <div class="panel glass" id="panel-status">
        <div class="panel-header">
          <div class="panel-heading">
            Panel 1 &mdash; Current Status
            <span class="panel-pill">Baseline Reference</span>
          </div>
          <span id="baseline-status-badge" class="badge badge-info">Checking</span>
        </div>
        <div id="status-content">
          <div class="empty-state">Loading status...</div>
        </div>
      </div>

      <div class="panel glass" id="panel-rules">
        <div class="panel-header">
          <div class="panel-heading">
            Panel 4 &mdash; Active Rules
            <span class="panel-pill">Policy Registry</span>
          </div>
          <span id="rules-count-badge" class="badge badge-info">0 Rules</span>
        </div>
        <div id="rules-content">
          <div class="empty-state">Loading rules...</div>
        </div>
      </div>
    </div>

    <div class="timeline-card glass">
      <div class="panel-header" style="margin-bottom: 4px;">
        <div class="panel-heading">
          Panel 3 &mdash; Regression Timeline
          <span class="panel-pill">Historical Verification Stream</span>
        </div>
        <span id="timeline-stats" style="font-size: 11px; color: var(--text-secondary); font-weight: 600;">0 runs tracked</span>
      </div>
      <div id="timeline-content" class="timeline-container">
        <div class="empty-state">Loading timeline...</div>
      </div>
    </div>

    <div class="table-card glass">
      <div class="table-topbar">
        <div class="panel-heading">
          Panel 2 &mdash; Log History
          <span class="panel-pill">Audit Trail</span>
        </div>
        <div class="filter-pills">
          <button class="filter-btn active" onclick="setFilter('all')">All</button>
          <button class="filter-btn" onclick="setFilter('clean')">Clean</button>
          <button class="filter-btn" onclick="setFilter('regression')">Regressions</button>
        </div>
      </div>
      <div class="responsive-table-wrapper">
        <table id="log-table">
          <thead>
            <tr>
              <th>Timestamp</th>
              <th>Execution ID</th>
              <th>Trigger</th>
              <th>Description</th>
              <th>File Changes</th>
              <th>Checks Verified</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody id="log-body">
            <tr><td colspan="7" class="empty-state">Loading history...</td></tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>

  <script>
    let globalLogEntries = [];
    let currentFilter = 'all';

    function setFilter(filter) {
      currentFilter = filter;
      document.querySelectorAll('.filter-btn').forEach(btn => {
        btn.classList.toggle('active', btn.textContent.toLowerCase() === filter);
      });
      renderLogTable();
    }

    async function loadData() {
      try {
        const [statusRes, logRes, configRes, rulesRes] = await Promise.all([
          fetch('/api/status').then(r => r.json()).catch(() => ({ hasBaseline: false })),
          fetch('/api/log').then(r => r.json()).catch(() => []),
          fetch('/api/config').then(r => r.json()).catch(() => ({})),
          fetch('/api/rules').then(r => r.json()).catch(() => [])
        ]);

        globalLogEntries = Array.isArray(logRes) ? logRes : [];
        updateHeroStats(statusRes, globalLogEntries, rulesRes);
        renderStatus(statusRes);
        renderTimeline(globalLogEntries);
        renderLogTable();
        renderRules(rulesRes);
      } catch (err) {
        console.error('Failed to load dashboard data:', err);
      }
    }

    function updateHeroStats(status, logs, rules) {
      const stateEl = document.getElementById('stat-system-state');
      const stateSub = document.getElementById('stat-system-sub');
      const baselineFilesEl = document.getElementById('stat-baseline-files');
      const baselineDescEl = document.getElementById('stat-baseline-desc');
      const runsCountEl = document.getElementById('stat-runs-count');
      const rulesCountEl = document.getElementById('stat-rules-count');

      const hasRegression = logs.some(e => e.regressionDetected);
      if (hasRegression) {
        stateEl.innerHTML = '<span style="color: var(--status-regression);">Regression</span>';
        stateSub.textContent = 'Active regression flagged';
      } else if (status && status.hasBaseline) {
        stateEl.innerHTML = '<span style="color: var(--status-clean);">Nominal</span>';
        stateSub.textContent = 'All passing, zero regressions';
      } else {
        stateEl.innerHTML = '<span style="color: var(--status-warn);">No Baseline</span>';
        stateSub.textContent = 'Execute safe-change save';
      }

      if (status && status.hasBaseline) {
        baselineFilesEl.textContent = status.fileCount + ' files';
        baselineDescEl.textContent = status.description || 'Recorded baseline';
      } else {
        baselineFilesEl.textContent = '0 files';
        baselineDescEl.textContent = 'No baseline snapshot';
      }

      runsCountEl.textContent = logs.length;
      rulesCountEl.textContent = Array.isArray(rules) ? rules.length : 0;
    }

    function renderStatus(status) {
      const container = document.getElementById('status-content');
      const badge = document.getElementById('baseline-status-badge');

      if (!status || !status.hasBaseline) {
        badge.className = 'badge badge-warn';
        badge.textContent = 'No Baseline';
        container.innerHTML = '<div class="empty-state">No baseline recorded yet. Run <code>safe-change save</code> to create one.</div>';
        return;
      }

      badge.className = 'badge badge-clean';
      badge.textContent = 'Verified Baseline';

      const checks = status.checks || [];
      const passedCount = checks.filter(c => c.passed).length;

      container.innerHTML = \`
        <table class="meta-table">
          <tbody>
            <tr>
              <td class="col-label">Recorded At</td>
              <td class="col-value mono">\${status.createdAt}</td>
            </tr>
            <tr>
              <td class="col-label">Description</td>
              <td class="col-value">\${status.description || '(no description)'}</td>
            </tr>
            <tr>
              <td class="col-label">Monitored Files</td>
              <td class="col-value mono">\${status.fileCount} files</td>
            </tr>
            <tr>
              <td class="col-label">Git Commit</td>
              <td class="col-value mono">\${status.git && status.git.headCommit ? status.git.headCommit.slice(0, 10) : 'n/a'}</td>
            </tr>
            <tr>
              <td class="col-label">Verification Rate</td>
              <td class="col-value" style="color: var(--status-clean);">\${passedCount} / \${checks.length} checks passing</td>
            </tr>
          </tbody>
        </table>
        <div class="checks-list">
          \${checks.map(c => \`
            <div class="check-row">
              <div>
                <span class="check-title mono">\${c.name}</span>
                <span class="check-meta">\${c.durationMs ? c.durationMs + 'ms' : ''}</span>
              </div>
              <span class="badge \${c.passed ? 'badge-clean' : 'badge-regression'}">
                \${c.passed ? 'PASSED' : 'FAILED'}
              </span>
            </div>
          \`).join('')}
        </div>
      \`;
    }

    function renderTimeline(entries) {
      const container = document.getElementById('timeline-content');
      const statsEl = document.getElementById('timeline-stats');

      if (!entries || entries.length === 0) {
        statsEl.textContent = '0 runs tracked';
        container.innerHTML = '<div class="empty-state">No history recorded yet. Baseline and check events will appear here.</div>';
        return;
      }

      statsEl.textContent = \`\${entries.length} runs tracked\`;

      container.innerHTML = entries.map((e, idx) => {
        const isReg = e.regressionDetected;
        const cls = isReg ? 'regression' : 'clean';
        const num = idx + 1;
        const shortId = e.id.slice(0, 6);
        const dateStr = new Date(e.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        const title = \`Run #\${num} [\${e.timestamp}]\nID: \${shortId}\nStatus: \${isReg ? 'REGRESSION' : 'CLEAN'}\nDescription: \${e.description || '(none)'}\`;

        return \`
          <div class="timeline-step" title="\${title}">
            <div class="timeline-marker \${cls}">\${num}</div>
            <span class="timeline-label">\${e.description || shortId}</span>
            <span class="timeline-time mono">\${dateStr}</span>
          </div>
        \`;
      }).join('');
    }

    function renderLogTable() {
      const tbody = document.getElementById('log-body');
      let filtered = globalLogEntries;
      if (currentFilter === 'clean') {
        filtered = filtered.filter(e => !e.regressionDetected);
      } else if (currentFilter === 'regression') {
        filtered = filtered.filter(e => e.regressionDetected);
      }

      if (!filtered || filtered.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" class="empty-state">No log entries found matching criteria.</td></tr>';
        return;
      }

      tbody.innerHTML = filtered.slice().reverse().map(e => {
        const rowCls = e.regressionDetected ? 'row-regression' : 'row-clean';
        const statusBadge = e.regressionDetected
          ? '<span class="badge badge-regression">REGRESSION</span>'
          : '<span class="badge badge-clean">CLEAN</span>';

        const triggerBadge = e.trigger === 'mcp'
          ? '<span class="badge badge-info">MCP</span>'
          : '<span class="badge" style="background: rgba(241,245,249,0.9); color: var(--text-secondary); border: 1px solid var(--glass-border-subtle);">CLI</span>';

        const fs = e.fileSummary || { added: 0, modified: 0, deleted: 0 };
        const diffPill = \`
          <div class="diff-badge mono">
            <span class="diff-add">+\${fs.added}</span>
            <span class="diff-mod">~\${fs.modified}</span>
            <span class="diff-del">-\${fs.deleted}</span>
          </div>
        \`;

        const checksList = (e.checkResults || []).map(c => {
          const pass = c.result === 'pass-pass' || c.result === 'fail-pass';
          const color = pass ? 'var(--status-clean)' : 'var(--status-regression)';
          return \`<span style="color: \${color}; font-size: 11px;" class="mono">\${c.name}</span>\`;
        }).join('<span style="color: var(--text-tertiary);">, </span>') || '<span style="color: var(--text-tertiary);">-</span>';

        return \`
          <tr class="\${rowCls}">
            <td class="mono" style="color: var(--text-secondary); font-size: 11px;">\${e.timestamp}</td>
            <td><code class="mono" style="color: var(--status-info); font-weight: 600;">\${e.id.slice(0, 8)}</code></td>
            <td>\${triggerBadge}</td>
            <td style="font-weight: 600; color: var(--text-primary);">\${e.description || '(no description)'}</td>
            <td>\${diffPill}</td>
            <td>\${checksList}</td>
            <td>\${statusBadge}</td>
          </tr>
        \`;
      }).join('');
    }

    function renderRules(rules) {
      const container = document.getElementById('rules-content');
      const badge = document.getElementById('rules-count-badge');

      if (!rules || rules.length === 0) {
        badge.className = 'badge';
        badge.style.background = 'rgba(241, 245, 249, 0.9)';
        badge.style.color = 'var(--text-secondary)';
        badge.textContent = '0 Rules';
        container.innerHTML = '<div class="empty-state">No rules configured. Run <code>safe-change rules add &lt;id&gt;</code> to activate guardrails.</div>';
        return;
      }

      badge.className = 'badge badge-info';
      badge.textContent = rules.length + ' Active';

      container.innerHTML = rules.map(r => {
        const isErr = r.severity === 'error';
        const cardCls = isErr ? 'rule-card rule-error' : 'rule-card rule-warn';
        const badgeCls = isErr ? 'badge-regression' : 'badge-warn';
        const pattern = r.condition && r.condition.pattern ? r.condition.pattern : (r.condition && r.condition.type ? r.condition.type : 'custom');

        return \`
          <div class="\${cardCls}">
            <div class="rule-head">
              <span class="rule-name">\${r.name || r.id}</span>
              <span class="badge \${badgeCls}">\${r.severity.toUpperCase()}</span>
            </div>
            <div class="rule-desc">\${r.description || ''}</div>
            <code class="rule-code mono">\${pattern}</code>
          </div>
        \`;
      }).join('');
    }

    loadData();
    setInterval(loadData, 3000);
  </script>
</body>
</html>`;
}
