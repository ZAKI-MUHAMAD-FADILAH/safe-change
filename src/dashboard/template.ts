export function renderDashboardHtml(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>safe-change Dashboard</title>
  <style>
    :root {
      --bg: #0d1117;
      --card-bg: #161b22;
      --card-border: #30363d;
      --text: #c9d1d9;
      --text-muted: #8b949e;
      --green: #3fb950;
      --green-bg: rgba(63, 185, 80, 0.15);
      --red: #f85149;
      --red-bg: rgba(248, 81, 73, 0.15);
      --blue: #58a6ff;
      --blue-bg: rgba(88, 166, 255, 0.15);
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background: var(--bg);
      color: var(--text);
      font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace;
      font-size: 13px;
      line-height: 1.5;
      padding: 24px;
    }
    header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 24px;
      padding-bottom: 16px;
      border-bottom: 1px solid var(--card-border);
    }
    h1 { font-size: 18px; font-weight: 600; color: #fff; }
    .badge {
      display: inline-block;
      padding: 2px 8px;
      border-radius: 12px;
      font-size: 11px;
      font-weight: 600;
    }
    .badge-clean { background: var(--green-bg); color: var(--green); border: 1px solid var(--green); }
    .badge-regression { background: var(--red-bg); color: var(--red); border: 1px solid var(--red); }
    .badge-info { background: var(--blue-bg); color: var(--blue); border: 1px solid var(--blue); }
    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(420px, 1fr));
      gap: 20px;
      margin-bottom: 20px;
    }
    .card {
      background: var(--card-bg);
      border: 1px solid var(--card-border);
      border-radius: 6px;
      padding: 16px;
    }
    .card-title {
      font-size: 14px;
      font-weight: 600;
      color: #fff;
      margin-bottom: 12px;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .meta-list { list-style: none; }
    .meta-list li {
      display: flex;
      justify-content: space-between;
      padding: 6px 0;
      border-bottom: 1px solid #21262d;
    }
    .meta-list li:last-child { border-bottom: none; }
    .meta-label { color: var(--text-muted); }
    .meta-val { color: #fff; font-weight: 500; }
    .timeline-container {
      display: flex;
      align-items: center;
      gap: 8px;
      overflow-x: auto;
      padding: 12px 0;
    }
    .timeline-dot {
      width: 14px;
      height: 14px;
      border-radius: 50%;
      flex-shrink: 0;
      cursor: pointer;
      position: relative;
    }
    .dot-clean { background: var(--green); box-shadow: 0 0 6px rgba(63, 185, 80, 0.4); }
    .dot-regression { background: var(--red); box-shadow: 0 0 6px rgba(248, 81, 73, 0.4); }
    table { width: 100%; border-collapse: collapse; text-align: left; }
    th { color: var(--text-muted); padding: 8px; border-bottom: 1px solid var(--card-border); font-size: 12px; }
    td { padding: 8px; border-bottom: 1px solid #21262d; font-size: 12px; }
    tr.row-clean:hover { background: rgba(63, 185, 80, 0.05); }
    tr.row-regression { background: rgba(248, 81, 73, 0.08); }
    tr.row-regression:hover { background: rgba(248, 81, 73, 0.12); }
    .text-green { color: var(--green); }
    .text-red { color: var(--red); }
    .empty-state { color: var(--text-muted); font-style: italic; padding: 12px 0; }
  </style>
</head>
<body>
  <header>
    <div>
      <h1>safe-change dashboard</h1>
      <span style="color: var(--text-muted); font-size: 11px;">Local repository safety net</span>
    </div>
    <div id="live-indicator" class="badge badge-info">127.0.0.1</div>
  </header>

  <div class="grid">
    <div class="card" id="panel-status">
      <div class="card-title">Panel 1 &mdash; Current Status</div>
      <div id="status-content">Loading...</div>
    </div>

    <div class="card" id="panel-rules">
      <div class="card-title">Panel 4 &mdash; Active Rules</div>
      <div id="rules-content">Loading...</div>
    </div>
  </div>

  <div class="card" style="margin-bottom: 20px;">
    <div class="card-title">Panel 3 &mdash; Regression Timeline</div>
    <div id="timeline-content" class="timeline-container">Loading...</div>
  </div>

  <div class="card">
    <div class="card-title">Panel 2 &mdash; Log History</div>
    <div style="overflow-x: auto;">
      <table id="log-table">
        <thead>
          <tr>
            <th>Timestamp</th>
            <th>ID</th>
            <th>Description</th>
            <th>Status</th>
            <th>Files</th>
            <th>Checks</th>
          </tr>
        </thead>
        <tbody id="log-body">
          <tr><td colspan="6" class="empty-state">Loading history...</td></tr>
        </tbody>
      </table>
    </div>
  </div>

  <script>
    async function loadData() {
      try {
        const [statusRes, logRes, configRes, rulesRes] = await Promise.all([
          fetch('/api/status').then(r => r.json()),
          fetch('/api/log').then(r => r.json()),
          fetch('/api/config').then(r => r.json()),
          fetch('/api/rules').then(r => r.json()).catch(() => [])
        ]);

        renderStatus(statusRes);
        renderTimeline(logRes);
        renderLog(logRes);
        renderRules(rulesRes);
      } catch (err) {
        console.error('Failed to load dashboard data:', err);
      }
    }

    function renderStatus(status) {
      const container = document.getElementById('status-content');
      if (!status.hasBaseline) {
        container.innerHTML = '<div class="empty-state">No baseline recorded yet. Run "safe-change save" to create one.</div>';
        return;
      }
      const passedCount = (status.checks || []).filter(c => c.passed).length;
      const totalChecks = (status.checks || []).length;
      container.innerHTML = \`
        <ul class="meta-list">
          <li><span class="meta-label">Recorded At</span><span class="meta-val">\${status.createdAt}</span></li>
          <li><span class="meta-label">Description</span><span class="meta-val">\${status.description || '(none)'}</span></li>
          <li><span class="meta-label">Baseline Files</span><span class="meta-val">\${status.fileCount}</span></li>
          <li><span class="meta-label">Git Commit</span><span class="meta-val">\${status.git && status.git.headCommit ? status.git.headCommit.slice(0, 8) : 'n/a'}</span></li>
          <li><span class="meta-label">Last Checks</span><span class="meta-val">\${passedCount}/\${totalChecks} passing</span></li>
        </ul>
      \`;
    }

    function renderTimeline(entries) {
      const container = document.getElementById('timeline-content');
      if (!entries || entries.length === 0) {
        container.innerHTML = '<div class="empty-state">No log entries available for timeline.</div>';
        return;
      }
      container.innerHTML = entries.map(e => {
        const cls = e.regressionDetected ? 'dot-regression' : 'dot-clean';
        const title = \`[\${e.timestamp}] \${e.id.slice(0, 8)} - \${e.regressionDetected ? 'REGRESSION' : 'CLEAN'}\`;
        return \`<div class="timeline-dot \${cls}" title="\${title}"></div>\`;
      }).join('');
    }

    function renderLog(entries) {
      const tbody = document.getElementById('log-body');
      if (!entries || entries.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="empty-state">No log entries found.</td></tr>';
        return;
      }
      tbody.innerHTML = entries.slice().reverse().map(e => {
        const rowCls = e.regressionDetected ? 'row-regression' : 'row-clean';
        const statusBadge = e.regressionDetected
          ? '<span class="badge badge-regression">REGRESSION</span>'
          : '<span class="badge badge-clean">CLEAN</span>';
        const files = \`+\${e.fileSummary.added} ~\${e.fileSummary.modified} -\${e.fileSummary.deleted}\`;
        const checksSummary = (e.checkResults || []).map(c => c.name + ':' + c.result).join(', ') || 'none';
        return \`
          <tr class="\${rowCls}">
            <td>\${e.timestamp}</td>
            <td><code>\${e.id.slice(0, 8)}</code></td>
            <td>\${e.description || '(no description)'}</td>
            <td>\${statusBadge}</td>
            <td>\${files}</td>
            <td>\${checksSummary}</td>
          </tr>
        \`;
      }).join('');
    }

    function renderRules(rules) {
      const container = document.getElementById('rules-content');
      if (!rules || rules.length === 0) {
        container.innerHTML = '<div class="empty-state">No rules configured.</div>';
        return;
      }
      container.innerHTML = \`
        <ul class="meta-list">
          \${rules.map(r => \`
            <li>
              <div>
                <strong style="color: #fff;">\${r.name || r.id}</strong>
                <div style="font-size: 11px; color: var(--text-muted);">\${r.description || ''}</div>
              </div>
              <span class="badge \${r.severity === 'error' ? 'badge-regression' : 'badge-info'}">\${r.severity}</span>
            </li>
          \`).join('')}
        </ul>
      \`;
    }

    loadData();
    setInterval(loadData, 5000);
  </script>
</body>
</html>`;
}
