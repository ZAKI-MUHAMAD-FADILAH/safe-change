export function renderDashboardHtml(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=5.0">
  <title>safe-change Dashboard</title>
  <style>
    :root {
      --font-sf: -apple-system, BlinkMacSystemFont, "SF Pro Text", "SF Pro Display", "SF Pro", -apple-system, system-ui, "Helvetica Neue", Helvetica, Arial, sans-serif;
      --font-sf-mono: "SF Mono", SFMono-Regular, ui-monospace, Menlo, Monaco, Consolas, monospace;

      --bg-page: #f5f6fa;
      --glass-bg: rgba(255, 255, 255, 0.88);
      --glass-border: rgba(255, 255, 255, 0.95);
      --glass-outline: rgba(0, 0, 0, 0.06);
      --glass-shadow: 0 4px 20px -2px rgba(0, 0, 0, 0.05), 0 1px 3px 0 rgba(0, 0, 0, 0.02);
      --glass-shadow-hover: 0 8px 30px -4px rgba(0, 0, 0, 0.08), 0 2px 6px 0 rgba(0, 0, 0, 0.03);

      --text-main: #1d1d1f;
      --text-sub: #515154;
      --text-caption: #86868b;
      --divider: rgba(0, 0, 0, 0.06);

      --apple-blue: #0071e3;
      --apple-blue-bg: rgba(0, 113, 227, 0.09);
      --apple-green: #34c759;
      --apple-green-bg: rgba(52, 199, 89, 0.12);
      --apple-red: #ff3b30;
      --apple-red-bg: rgba(255, 59, 48, 0.11);
      --apple-orange: #ff9500;
      --apple-orange-bg: rgba(255, 149, 0, 0.12);
      --apple-purple: #af52de;
      --apple-purple-bg: rgba(175, 82, 222, 0.1);
    }

    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }

    body {
      font-family: var(--font-sf);
      font-size: 13px;
      line-height: 1.45;
      color: var(--text-main);
      background: var(--bg-page);
      background: linear-gradient(180deg, #f8f9fc 0%, #edf1f7 100%);
      min-height: 100vh;
      -webkit-font-smoothing: antialiased;
      -moz-osx-font-smoothing: grayscale;
      text-rendering: optimizeLegibility;
      letter-spacing: -0.01em;
    }

    .mono {
      font-family: var(--font-sf-mono);
      letter-spacing: -0.02em;
    }

    .container {
      width: 100%;
      max-width: 1360px;
      margin: 0 auto;
      padding: 28px 24px 48px;
      display: flex;
      flex-direction: column;
      gap: 20px;
    }

    .liquid-glass {
      background: var(--glass-bg);
      backdrop-filter: blur(20px);
      -webkit-backdrop-filter: blur(20px);
      border: 1px solid var(--glass-border);
      box-shadow: var(--glass-shadow);
      outline: 1px solid var(--glass-outline);
      border-radius: 16px;
      transition: transform 0.18s ease, box-shadow 0.18s ease;
    }

    .liquid-glass:hover {
      box-shadow: var(--glass-shadow-hover);
    }

    header.liquid-glass {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 16px 22px;
      flex-wrap: wrap;
      gap: 16px;
    }

    .brand-wrap {
      display: flex;
      align-items: center;
      gap: 14px;
    }

    .brand-icon {
      width: 40px;
      height: 40px;
      border-radius: 10px;
      background: linear-gradient(135deg, #0071e3 0%, #5856d6 100%);
      display: flex;
      align-items: center;
      justify-content: center;
      color: #ffffff;
      box-shadow: 0 4px 12px rgba(0, 113, 227, 0.28);
      flex-shrink: 0;
    }

    .brand-icon svg {
      width: 20px;
      height: 20px;
      fill: none;
      stroke: currentColor;
      stroke-width: 2;
      stroke-linecap: round;
      stroke-linejoin: round;
    }

    .brand-title {
      font-size: 16px;
      font-weight: 600;
      letter-spacing: -0.02em;
      color: var(--text-main);
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .brand-desc {
      font-size: 12px;
      color: var(--text-caption);
      margin-top: 1px;
    }

    .header-actions {
      display: flex;
      align-items: center;
      gap: 10px;
    }

    .live-chip {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      background: rgba(255, 255, 255, 0.9);
      border: 1px solid var(--divider);
      padding: 6px 13px;
      border-radius: 20px;
      font-size: 11px;
      font-weight: 600;
      color: var(--text-sub);
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04);
    }

    .live-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: var(--apple-green);
      box-shadow: 0 0 8px var(--apple-green);
      animation: pulse 2.4s infinite ease-in-out;
    }

    @keyframes pulse {
      0%, 100% { opacity: 1; transform: scale(1); }
      50% { opacity: 0.35; transform: scale(0.85); }
    }

    .stats-grid {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 16px;
    }

    .stat-card {
      padding: 18px 20px;
      display: flex;
      flex-direction: column;
      gap: 4px;
    }

    .stat-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
    }

    .stat-label {
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      color: var(--text-caption);
    }

    .stat-icon {
      color: var(--text-caption);
    }

    .stat-icon svg {
      width: 15px;
      height: 15px;
      stroke: currentColor;
      fill: none;
      stroke-width: 2;
    }

    .stat-value {
      font-size: 26px;
      font-weight: 700;
      letter-spacing: -0.03em;
      color: var(--text-main);
      line-height: 1.15;
      margin: 2px 0;
    }

    .stat-sub {
      font-size: 12px;
      color: var(--text-caption);
    }

    .panels-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 20px;
    }

    .panel-box {
      padding: 20px 22px;
      display: flex;
      flex-direction: column;
    }

    .panel-top {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 12px;
      padding-bottom: 14px;
      margin-bottom: 16px;
      border-bottom: 1px solid var(--divider);
    }

    .panel-heading {
      font-size: 14px;
      font-weight: 600;
      letter-spacing: -0.015em;
      color: var(--text-main);
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .panel-tag {
      font-size: 11px;
      color: var(--text-caption);
      font-weight: 400;
    }

    .meta-list {
      display: flex;
      flex-direction: column;
    }

    .meta-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 9px 0;
      border-bottom: 1px solid var(--divider);
      font-size: 13px;
    }

    .meta-row:last-child {
      border-bottom: none;
    }

    .meta-k {
      color: var(--text-caption);
      font-weight: 400;
    }

    .meta-v {
      color: var(--text-main);
      font-weight: 600;
      text-align: right;
    }

    .check-container {
      display: flex;
      flex-direction: column;
      gap: 8px;
      margin-top: 14px;
    }

    .check-pill {
      display: flex;
      justify-content: space-between;
      align-items: center;
      background: rgba(0, 0, 0, 0.02);
      border: 1px solid var(--divider);
      padding: 10px 14px;
      border-radius: 10px;
      font-size: 12px;
    }

    .check-name {
      font-weight: 600;
      color: var(--text-main);
    }

    .check-ms {
      color: var(--text-caption);
      font-size: 11px;
      margin-left: 6px;
    }

    .rules-container {
      display: flex;
      flex-direction: column;
      gap: 10px;
    }

    .rule-card {
      background: rgba(0, 0, 0, 0.02);
      border: 1px solid var(--divider);
      border-left: 3px solid var(--apple-blue);
      border-radius: 10px;
      padding: 12px 14px;
    }

    .rule-card.rule-error {
      border-left-color: var(--apple-red);
    }

    .rule-card.rule-warn {
      border-left-color: var(--apple-orange);
    }

    .rule-row-head {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 3px;
    }

    .rule-name {
      font-weight: 600;
      font-size: 13px;
      color: var(--text-main);
    }

    .rule-desc {
      font-size: 11px;
      color: var(--text-caption);
      margin-bottom: 6px;
      line-height: 1.35;
    }

    .rule-code {
      background: #ffffff;
      border: 1px solid var(--divider);
      padding: 2px 7px;
      border-radius: 5px;
      font-size: 11px;
      color: var(--apple-blue);
      font-weight: 600;
      display: inline-block;
    }

    .timeline-card {
      padding: 20px 22px;
    }

    .timeline-scroll {
      position: relative;
      display: flex;
      align-items: center;
      gap: 24px;
      overflow-x: auto;
      padding: 20px 8px 10px;
      scrollbar-width: thin;
      scrollbar-color: var(--divider) transparent;
    }

    .timeline-scroll::-webkit-scrollbar {
      height: 5px;
    }

    .timeline-scroll::-webkit-scrollbar-thumb {
      background: var(--divider);
      border-radius: 4px;
    }

    .timeline-scroll::before {
      content: "";
      position: absolute;
      top: 36px;
      left: 12px;
      right: 12px;
      height: 2px;
      background: rgba(0, 0, 0, 0.08);
      z-index: 1;
    }

    .timeline-item {
      position: relative;
      z-index: 2;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 6px;
      flex-shrink: 0;
      cursor: pointer;
      transition: transform 0.16s ease;
    }

    .timeline-item:hover {
      transform: translateY(-2px);
    }

    .timeline-circle {
      width: 28px;
      height: 28px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 11px;
      font-weight: 700;
      border: 2px solid #ffffff;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
    }

    .timeline-circle.clean {
      background: var(--apple-green);
      color: #ffffff;
    }

    .timeline-circle.regression {
      background: var(--apple-red);
      color: #ffffff;
    }

    .timeline-txt {
      font-size: 11px;
      font-weight: 600;
      color: var(--text-sub);
      max-width: 130px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .timeline-date {
      font-size: 10px;
      color: var(--text-caption);
    }

    .table-card {
      padding: 20px 22px;
    }

    .table-header-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      flex-wrap: wrap;
      gap: 12px;
      margin-bottom: 14px;
    }

    .segmented-control {
      display: inline-flex;
      background: rgba(118, 118, 128, 0.12);
      padding: 2px;
      border-radius: 8px;
      gap: 2px;
    }

    .segment-btn {
      background: transparent;
      border: none;
      color: var(--text-sub);
      padding: 4px 12px;
      border-radius: 6px;
      font-size: 12px;
      font-family: var(--font-sf);
      font-weight: 500;
      cursor: pointer;
      transition: all 0.15s ease;
    }

    .segment-btn.active {
      background: #ffffff;
      color: var(--text-main);
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
      font-weight: 600;
    }

    .table-wrapper {
      width: 100%;
      overflow-x: auto;
      border-radius: 10px;
      border: 1px solid var(--divider);
      background: #ffffff;
    }

    table {
      width: 100%;
      border-collapse: collapse;
      text-align: left;
      min-width: 700px;
    }

    th {
      color: var(--text-caption);
      background: rgba(0, 0, 0, 0.02);
      padding: 10px 14px;
      border-bottom: 1px solid var(--divider);
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.4px;
      white-space: nowrap;
    }

    td {
      padding: 11px 14px;
      border-bottom: 1px solid var(--divider);
      font-size: 12px;
      vertical-align: middle;
    }

    tr:last-child td {
      border-bottom: none;
    }

    tr:hover td {
      background: rgba(0, 113, 227, 0.02);
    }

    tr.row-regression td {
      background: rgba(255, 59, 48, 0.03);
    }

    tr.row-regression:hover td {
      background: rgba(255, 59, 48, 0.06);
    }

    .badge {
      display: inline-flex;
      align-items: center;
      padding: 2px 8px;
      border-radius: 6px;
      font-size: 11px;
      font-weight: 600;
      letter-spacing: -0.01em;
      white-space: nowrap;
    }

    .badge-clean {
      background: var(--apple-green-bg);
      color: #1f8b3c;
    }

    .badge-regression {
      background: var(--apple-red-bg);
      color: #d70015;
    }

    .badge-info {
      background: var(--apple-blue-bg);
      color: var(--apple-blue);
    }

    .badge-warn {
      background: var(--apple-orange-bg);
      color: #c93400;
    }

    .diff-pill {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      font-size: 11px;
      font-family: var(--font-sf-mono);
      font-weight: 600;
      background: rgba(0, 0, 0, 0.04);
      padding: 2px 7px;
      border-radius: 5px;
      white-space: nowrap;
    }

    .diff-add { color: #1f8b3c; }
    .diff-mod { color: #c93400; }
    .diff-del { color: #d70015; }

    .empty-state {
      padding: 30px 16px;
      text-align: center;
      color: var(--text-caption);
      font-size: 12px;
    }

    @media (max-width: 992px) {
      .stats-grid {
        grid-template-columns: repeat(2, 1fr);
      }
      .panels-grid {
        grid-template-columns: 1fr;
      }
    }

    @media (max-width: 560px) {
      .container {
        padding: 16px 12px;
        gap: 14px;
      }
      .stats-grid {
        grid-template-columns: 1fr;
      }
      header.liquid-glass {
        padding: 12px 14px;
      }
      .panel-box, .timeline-card, .table-card {
        padding: 14px 16px;
      }
      .stat-value {
        font-size: 22px;
      }
    }
  </style>
</head>
<body>
  <div class="container">
    <header class="liquid-glass">
      <div class="brand-wrap">
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
          <div class="brand-desc">Autonomous verification telemetry and safety sentinel</div>
        </div>
      </div>
      <div class="header-actions">
        <div class="live-chip">
          <div class="live-dot"></div>
          <span class="mono">127.0.0.1:4242</span>
        </div>
      </div>
    </header>

    <div class="stats-grid">
      <div class="stat-card liquid-glass">
        <div class="stat-header">
          <span class="stat-label">System State</span>
          <span class="stat-icon">
            <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/></svg>
          </span>
        </div>
        <div class="stat-value" id="stat-system-state">Scanning...</div>
        <span class="stat-sub" id="stat-system-sub">Verification guardrail</span>
      </div>

      <div class="stat-card liquid-glass">
        <div class="stat-header">
          <span class="stat-label">Monitored Baseline</span>
          <span class="stat-icon">
            <svg viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
          </span>
        </div>
        <div class="stat-value mono" id="stat-baseline-files">--</div>
        <span class="stat-sub" id="stat-baseline-desc">Active repository scope</span>
      </div>

      <div class="stat-card liquid-glass">
        <div class="stat-header">
          <span class="stat-label">Safety History</span>
          <span class="stat-icon">
            <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
          </span>
        </div>
        <div class="stat-value mono" id="stat-runs-count">--</div>
        <span class="stat-sub" id="stat-runs-sub">Persistent safety log entries</span>
      </div>

      <div class="stat-card liquid-glass">
        <div class="stat-header">
          <span class="stat-label">Active Guardrails</span>
          <span class="stat-icon">
            <svg viewBox="0 0 24 24"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
          </span>
        </div>
        <div class="stat-value mono" id="stat-rules-count">--</div>
        <span class="stat-sub" id="stat-rules-sub">Configured safety policies</span>
      </div>
    </div>

    <div class="panels-grid">
      <div class="panel-box liquid-glass" id="panel-status">
        <div class="panel-top">
          <div class="panel-heading">
            Panel 1 &mdash; Current Status
            <span class="panel-tag">Baseline Reference</span>
          </div>
          <span id="baseline-status-badge" class="badge badge-info">Checking</span>
        </div>
        <div id="status-content">
          <div class="empty-state">Loading status...</div>
        </div>
      </div>

      <div class="panel-box liquid-glass" id="panel-rules">
        <div class="panel-top">
          <div class="panel-heading">
            Panel 4 &mdash; Active Rules
            <span class="panel-tag">Policy Registry</span>
          </div>
          <span id="rules-count-badge" class="badge badge-info">0 Rules</span>
        </div>
        <div id="rules-content">
          <div class="empty-state">Loading rules...</div>
        </div>
      </div>
    </div>

    <div class="timeline-card liquid-glass">
      <div class="panel-top" style="margin-bottom: 2px;">
        <div class="panel-heading">
          Panel 3 &mdash; Regression Timeline
          <span class="panel-tag">Historical Verification Stream</span>
        </div>
        <span id="timeline-stats" class="mono" style="font-size: 11px; color: var(--text-caption);">0 runs tracked</span>
      </div>
      <div id="timeline-content" class="timeline-scroll">
        <div class="empty-state">Loading timeline...</div>
      </div>
    </div>

    <div class="table-card liquid-glass">
      <div class="table-header-row">
        <div class="panel-heading">
          Panel 2 &mdash; Log History
          <span class="panel-tag">Audit Trail</span>
        </div>
        <div class="segmented-control">
          <button class="segment-btn active" onclick="setFilter('all')">All</button>
          <button class="segment-btn" onclick="setFilter('clean')">Clean</button>
          <button class="segment-btn" onclick="setFilter('regression')">Regressions</button>
        </div>
      </div>
      <div class="table-wrapper">
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
      document.querySelectorAll('.segment-btn').forEach(btn => {
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
        stateEl.innerHTML = '<span style="color: var(--apple-red);">Regression</span>';
        stateSub.textContent = 'Active regression flagged';
      } else if (status && status.hasBaseline) {
        stateEl.innerHTML = '<span style="color: var(--apple-green);">Nominal</span>';
        stateSub.textContent = 'All passing, zero regressions';
      } else {
        stateEl.innerHTML = '<span style="color: var(--apple-orange);">No Baseline</span>';
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
        <div class="meta-list">
          <div class="meta-row">
            <span class="meta-k">Recorded At</span>
            <span class="meta-v mono">\${status.createdAt}</span>
          </div>
          <div class="meta-row">
            <span class="meta-k">Description</span>
            <span class="meta-v">\${status.description || '(no description)'}</span>
          </div>
          <div class="meta-row">
            <span class="meta-k">Monitored Files</span>
            <span class="meta-v mono">\${status.fileCount} files</span>
          </div>
          <div class="meta-row">
            <span class="meta-k">Git Commit</span>
            <span class="meta-v mono">\${status.git && status.git.headCommit ? status.git.headCommit.slice(0, 10) : 'n/a'}</span>
          </div>
          <div class="meta-row">
            <span class="meta-k">Verification Rate</span>
            <span class="meta-v" style="color: var(--apple-green);">\${passedCount} / \${checks.length} checks passing</span>
          </div>
        </div>
        <div class="check-container">
          \${checks.map(c => \`
            <div class="check-pill">
              <div>
                <span class="check-name mono">\${c.name}</span>
                <span class="check-ms mono">\${c.durationMs ? c.durationMs + 'ms' : ''}</span>
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
          <div class="timeline-item" title="\${title}">
            <div class="timeline-circle \${cls}">\${num}</div>
            <span class="timeline-txt">\${e.description || shortId}</span>
            <span class="timeline-date mono">\${dateStr}</span>
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
          : '<span class="badge" style="background: rgba(0,0,0,0.04); color: var(--text-sub);">CLI</span>';

        const fs = e.fileSummary || { added: 0, modified: 0, deleted: 0 };
        const diffPill = \`
          <div class="diff-pill mono">
            <span class="diff-add">+\${fs.added}</span>
            <span class="diff-mod">~\${fs.modified}</span>
            <span class="diff-del">-\${fs.deleted}</span>
          </div>
        \`;

        const checksList = (e.checkResults || []).map(c => {
          const pass = c.result === 'pass-pass' || c.result === 'fail-pass';
          const color = pass ? 'var(--apple-green)' : 'var(--apple-red)';
          return \`<span style="color: \${color}; font-size: 11px;" class="mono">\${c.name}</span>\`;
        }).join('<span style="color: var(--text-caption);">, </span>') || '<span style="color: var(--text-caption);">-</span>';

        return \`
          <tr class="\${rowCls}">
            <td class="mono" style="color: var(--text-caption); font-size: 11px;">\${e.timestamp}</td>
            <td><code class="mono" style="color: var(--apple-blue); font-weight: 600;">\${e.id.slice(0, 8)}</code></td>
            <td>\${triggerBadge}</td>
            <td style="font-weight: 600; color: var(--text-main);">\${e.description || '(no description)'}</td>
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
        badge.style.background = 'rgba(0,0,0,0.04)';
        badge.style.color = 'var(--text-caption)';
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
            <div class="rule-row-head">
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
