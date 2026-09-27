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

    /* Hero Stats with Fintech Transfer Card Opacity Aesthetic */
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
      position: relative;
      overflow: hidden;
    }

    .stat-card-watermark {
      position: absolute;
      right: 12px;
      bottom: 6px;
      width: 68px;
      height: 68px;
      opacity: 0.08;
      pointer-events: none;
      z-index: 0;
      transition: opacity 0.2s ease, transform 0.2s ease;
    }

    .stat-card:hover .stat-card-watermark {
      opacity: 0.14;
      transform: scale(1.08);
    }

    .stat-card-watermark svg {
      width: 100%;
      height: 100%;
      stroke: currentColor;
      fill: none;
      stroke-width: 1.5;
    }

    .stat-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      position: relative;
      z-index: 1;
    }

    .stat-label {
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      color: var(--text-caption);
    }

    .stat-badge-icon {
      width: 32px;
      height: 32px;
      border-radius: 9px;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
      transition: background 0.2s ease, color 0.2s ease;
    }

    .stat-badge-icon svg {
      width: 16px;
      height: 16px;
      stroke: currentColor;
      fill: none;
      stroke-width: 2;
      stroke-linecap: round;
      stroke-linejoin: round;
    }

    .stat-badge-blue {
      background: var(--apple-blue-bg);
      color: var(--apple-blue);
    }

    .stat-badge-purple {
      background: var(--apple-purple-bg);
      color: var(--apple-purple);
    }

    .stat-badge-orange {
      background: var(--apple-orange-bg);
      color: var(--apple-orange);
    }

    .stat-badge-state {
      background: var(--apple-green-bg);
      color: var(--apple-green);
    }

    .stat-value {
      font-size: 26px;
      font-weight: 700;
      letter-spacing: -0.03em;
      color: var(--text-main);
      line-height: 1.15;
      margin: 2px 0;
      position: relative;
      z-index: 1;
    }

    .stat-sub {
      font-size: 12px;
      color: var(--text-caption);
      position: relative;
      z-index: 1;
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

    /* Enhanced Panel 3 — Regression Timeline */
    .timeline-card {
      padding: 22px;
      display: flex;
      flex-direction: column;
      gap: 14px;
    }

    .timeline-header-bar {
      display: flex;
      justify-content: space-between;
      align-items: center;
      flex-wrap: wrap;
      gap: 12px;
      padding-bottom: 14px;
      border-bottom: 1px solid var(--divider);
    }

    .timeline-indicators {
      display: flex;
      align-items: center;
      gap: 8px;
      flex-wrap: wrap;
    }

    .timeline-stream-wrapper {
      position: relative;
      width: 100%;
    }

    .timeline-stream {
      display: flex;
      align-items: stretch;
      gap: 12px;
      overflow-x: auto;
      padding: 4px 2px 14px;
      scroll-behavior: smooth;
      scrollbar-width: thin;
      scrollbar-color: var(--divider) transparent;
      -webkit-overflow-scrolling: touch;
    }

    .timeline-stream::-webkit-scrollbar {
      height: 6px;
    }

    .timeline-stream::-webkit-scrollbar-thumb {
      background: rgba(0, 0, 0, 0.12);
      border-radius: 4px;
    }

    .timeline-node-card {
      flex: 0 0 280px;
      background: rgba(255, 255, 255, 0.92);
      border: 1px solid var(--glass-border);
      outline: 1px solid var(--divider);
      border-radius: 14px;
      padding: 16px;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      gap: 12px;
      cursor: pointer;
      position: relative;
      box-shadow: 0 2px 10px rgba(0, 0, 0, 0.03);
      transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
    }

    .timeline-node-card:hover {
      transform: translateY(-3px);
      box-shadow: 0 8px 24px -4px rgba(0, 0, 0, 0.09);
      outline-color: var(--apple-blue);
    }

    .timeline-node-card.selected {
      outline: 2px solid var(--apple-blue);
      box-shadow: 0 8px 24px -2px rgba(0, 113, 227, 0.25);
      background: #ffffff;
    }

    .timeline-node-card.card-clean {
      border-top: 3px solid var(--apple-green);
    }

    .timeline-node-card.card-regression {
      border-top: 3px solid var(--apple-red);
    }

    .timeline-card-top {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 8px;
    }

    .timeline-run-badge {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      font-size: 11px;
      font-weight: 700;
      color: var(--text-main);
    }

    .timeline-card-desc {
      font-size: 13px;
      font-weight: 600;
      color: var(--text-main);
      line-height: 1.35;
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
      overflow: hidden;
      min-height: 35px;
    }

    .timeline-card-metrics {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 8px;
      font-size: 11px;
      color: var(--text-caption);
    }

    .timeline-card-footer {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding-top: 10px;
      border-top: 1px solid var(--divider);
      font-size: 11px;
    }

    .timeline-connector {
      display: flex;
      align-items: center;
      justify-content: center;
      color: var(--text-caption);
      flex: 0 0 16px;
    }

    .timeline-connector svg {
      width: 16px;
      height: 16px;
      stroke: currentColor;
      fill: none;
      stroke-width: 2;
    }

    .timeline-inspector {
      background: rgba(255, 255, 255, 0.95);
      border: 1px solid var(--divider);
      border-radius: 12px;
      padding: 16px 20px;
      display: flex;
      flex-direction: column;
      gap: 12px;
      box-shadow: 0 4px 16px rgba(0, 0, 0, 0.04);
      animation: fadeIn 0.2s ease;
    }

    @keyframes fadeIn {
      from { opacity: 0; transform: translateY(4px); }
      to { opacity: 1; transform: translateY(0); }
    }

    .inspector-head {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding-bottom: 10px;
      border-bottom: 1px solid var(--divider);
    }

    .inspector-title {
      font-size: 13px;
      font-weight: 600;
      color: var(--text-main);
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .inspector-checks {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
      gap: 8px;
    }

    .inspector-check-pill {
      background: rgba(0, 0, 0, 0.02);
      border: 1px solid var(--divider);
      padding: 6px 10px;
      border-radius: 8px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 11px;
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
      <!-- Card 1: System State -->
      <div class="stat-card liquid-glass">
        <div class="stat-card-watermark" id="stat-state-watermark" style="color: var(--apple-green);">
          <svg viewBox="0 0 24 24"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="m9 12 2 2 4-4"/></svg>
        </div>
        <div class="stat-header">
          <span class="stat-label">System State</span>
          <div class="stat-badge-icon stat-badge-state" id="stat-state-badge">
            <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/></svg>
          </div>
        </div>
        <div class="stat-value" id="stat-system-state">Scanning...</div>
        <span class="stat-sub" id="stat-system-sub">Verification guardrail</span>
      </div>

      <!-- Card 2: Monitored Baseline -->
      <div class="stat-card liquid-glass">
        <div class="stat-card-watermark" style="color: var(--apple-blue);">
          <svg viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
        </div>
        <div class="stat-header">
          <span class="stat-label">Monitored Baseline</span>
          <div class="stat-badge-icon stat-badge-blue">
            <svg viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
          </div>
        </div>
        <div class="stat-value mono" id="stat-baseline-files">--</div>
        <span class="stat-sub" id="stat-baseline-desc">Active repository scope</span>
      </div>

      <!-- Card 3: Safety History -->
      <div class="stat-card liquid-glass">
        <div class="stat-card-watermark" style="color: var(--apple-purple);">
          <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
        </div>
        <div class="stat-header">
          <span class="stat-label">Safety History</span>
          <div class="stat-badge-icon stat-badge-purple">
            <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
          </div>
        </div>
        <div class="stat-value mono" id="stat-runs-count">--</div>
        <span class="stat-sub" id="stat-runs-sub">Persistent safety log entries</span>
      </div>

      <!-- Card 4: Active Guardrails -->
      <div class="stat-card liquid-glass">
        <div class="stat-card-watermark" style="color: var(--apple-orange);">
          <svg viewBox="0 0 24 24"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
        </div>
        <div class="stat-header">
          <span class="stat-label">Active Guardrails</span>
          <div class="stat-badge-icon stat-badge-orange">
            <svg viewBox="0 0 24 24"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
          </div>
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

    <div class="timeline-card liquid-glass" id="panel-timeline">
      <div class="timeline-header-bar">
        <div class="panel-heading">
          Panel 3 &mdash; Regression Timeline
          <span class="panel-tag">Historical Verification Stream</span>
        </div>
        <div class="timeline-indicators" id="timeline-metrics-bar">
          <span id="timeline-stats" class="badge badge-info mono">0 runs tracked</span>
          <div class="segmented-control">
            <button class="segment-btn" onclick="scrollTimeline('start')">Earliest</button>
            <button class="segment-btn" onclick="scrollTimeline('end')">Latest</button>
          </div>
        </div>
      </div>
      <div class="timeline-stream-wrapper">
        <div id="timeline-content" class="timeline-stream">
          <div class="empty-state">Loading timeline...</div>
        </div>
      </div>
      <div id="timeline-inspector" class="timeline-inspector" style="display: none;"></div>
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
    let selectedTimelineId = null;

    function setFilter(filter) {
      currentFilter = filter;
      document.querySelectorAll('.table-header-row .segment-btn').forEach(btn => {
        btn.classList.toggle('active', btn.textContent.toLowerCase() === filter);
      });
      renderLogTable();
    }

    function scrollTimeline(pos) {
      const el = document.getElementById('timeline-content');
      if (!el) return;
      if (pos === 'start') {
        el.scrollTo({ left: 0, behavior: 'smooth' });
      } else {
        el.scrollTo({ left: el.scrollWidth, behavior: 'smooth' });
      }
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
      const stateBadge = document.getElementById('stat-state-badge');
      const stateWatermark = document.getElementById('stat-state-watermark');
      const baselineFilesEl = document.getElementById('stat-baseline-files');
      const baselineDescEl = document.getElementById('stat-baseline-desc');
      const runsCountEl = document.getElementById('stat-runs-count');
      const rulesCountEl = document.getElementById('stat-rules-count');

      const hasRegression = logs.some(e => e.regressionDetected);
      if (hasRegression) {
        stateEl.innerHTML = '<span style="color: var(--apple-red);">Regression</span>';
        stateSub.textContent = 'Active regression flagged';
        if (stateBadge) {
          stateBadge.style.background = 'var(--apple-red-bg)';
          stateBadge.style.color = 'var(--apple-red)';
        }
        if (stateWatermark) {
          stateWatermark.style.color = 'var(--apple-red)';
        }
      } else if (status && status.hasBaseline) {
        stateEl.innerHTML = '<span style="color: var(--apple-green);">Nominal</span>';
        stateSub.textContent = 'All passing, zero regressions';
        if (stateBadge) {
          stateBadge.style.background = 'var(--apple-green-bg)';
          stateBadge.style.color = 'var(--apple-green)';
        }
        if (stateWatermark) {
          stateWatermark.style.color = 'var(--apple-green)';
        }
      } else {
        stateEl.innerHTML = '<span style="color: var(--apple-orange);">No Baseline</span>';
        stateSub.textContent = 'Execute safe-change save';
        if (stateBadge) {
          stateBadge.style.background = 'var(--apple-orange-bg)';
          stateBadge.style.color = 'var(--apple-orange)';
        }
        if (stateWatermark) {
          stateWatermark.style.color = 'var(--apple-orange)';
        }
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

    function selectTimelineRun(id) {
      selectedTimelineId = (selectedTimelineId === id) ? null : id;
      renderTimeline(globalLogEntries);
    }

    function renderTimeline(entries) {
      const container = document.getElementById('timeline-content');
      const metricsBar = document.getElementById('timeline-metrics-bar');
      const inspector = document.getElementById('timeline-inspector');

      if (!entries || entries.length === 0) {
        metricsBar.innerHTML = '<span id="timeline-stats" class="badge badge-info mono">0 runs tracked</span>';
        container.innerHTML = '<div class="empty-state">No history recorded yet. Baseline and check events will appear here.</div>';
        if (inspector) inspector.style.display = 'none';
        return;
      }

      const total = entries.length;
      const cleanCount = entries.filter(e => !e.regressionDetected).length;
      const regCount = entries.filter(e => e.regressionDetected).length;
      const stability = Math.round((cleanCount / total) * 100);

      metricsBar.innerHTML = \`
        <span id="timeline-stats" class="badge badge-info mono">\${total} runs tracked</span>
        <span class="badge badge-clean mono">\${cleanCount} clean</span>
        \${regCount > 0 ? \`<span class="badge badge-regression mono">\${regCount} regression\${regCount > 1 ? 's' : ''}</span>\` : ''}
        <span class="badge mono" style="background: rgba(0,0,0,0.04); color: var(--text-sub);">\${stability}% stability</span>
        <div class="segmented-control" style="margin-left: 6px;">
          <button class="segment-btn" onclick="scrollTimeline('start')">Earliest</button>
          <button class="segment-btn" onclick="scrollTimeline('end')">Latest</button>
        </div>
      \`;

      let html = '';
      entries.forEach((e, idx) => {
        const num = idx + 1;
        const isReg = e.regressionDetected;
        const isSelected = selectedTimelineId === e.id;
        const cardCls = isReg ? 'card-regression' : 'card-clean';
        const shortId = e.id.slice(0, 8);
        const dateStr = new Date(e.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });

        const fs = e.fileSummary || { added: 0, modified: 0, deleted: 0 };
        const checks = e.checkResults || [];
        const passedChecks = checks.filter(c => c.result === 'pass-pass' || c.result === 'fail-pass').length;
        const checksSummary = checks.length > 0 ? \`\${passedChecks}/\${checks.length} checks\` : 'No checks';

        const triggerPill = e.trigger === 'mcp'
          ? '<span class="badge badge-info" style="font-size: 10px; padding: 1px 6px;">MCP</span>'
          : '<span class="badge" style="font-size: 10px; padding: 1px 6px; background: rgba(0,0,0,0.04); color: var(--text-sub);">CLI</span>';

        const statusBadge = isReg
          ? '<span class="badge badge-regression"><span class="live-dot" style="background: var(--apple-red); width: 6px; height: 6px; margin-right: 4px;"></span>REGRESSION</span>'
          : '<span class="badge badge-clean"><span class="live-dot" style="background: var(--apple-green); width: 6px; height: 6px; margin-right: 4px;"></span>CLEAN</span>';

        if (idx > 0) {
          html += \`
            <div class="timeline-connector">
              <svg viewBox="0 0 24 24"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
            </div>
          \`;
        }

        html += \`
          <div class="timeline-node-card \${cardCls} \${isSelected ? 'selected' : ''}" onclick="selectTimelineRun('\${e.id}')">
            <div class="timeline-card-top">
              <span class="timeline-run-badge mono">RUN #\${num}</span>
              <div style="display: flex; gap: 4px; align-items: center;">
                \${triggerPill}
                \${statusBadge}
              </div>
            </div>

            <div class="timeline-card-desc">\${e.description || '(no description)'}</div>

            <div class="timeline-card-metrics">
              <span class="mono" style="color: var(--apple-blue); font-weight: 600;">#\${shortId}</span>
              <span class="mono" style="display: flex; align-items: center; gap: 4px;">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                \${dateStr}
              </span>
            </div>

            <div class="timeline-card-footer">
              <div class="diff-pill mono">
                <span class="diff-add">+\${fs.added}</span>
                <span class="diff-mod">~\${fs.modified}</span>
                <span class="diff-del">-\${fs.deleted}</span>
              </div>
              <span class="mono" style="color: var(--text-caption); font-size: 11px;">\${checksSummary}</span>
            </div>
          </div>
        \`;
      });

      container.innerHTML = html;

      // Render inspector if an entry is selected
      if (selectedTimelineId && inspector) {
        const selectedEntry = entries.find(e => e.id === selectedTimelineId);
        if (selectedEntry) {
          const runNum = entries.indexOf(selectedEntry) + 1;
          const checks = selectedEntry.checkResults || [];
          const fs = selectedEntry.fileSummary || { added: 0, modified: 0, deleted: 0, unchanged: 0 };
          const isReg = selectedEntry.regressionDetected;

          inspector.style.display = 'flex';
          inspector.innerHTML = \`
            <div class="inspector-head">
              <div class="inspector-title">
                <span class="mono" style="font-weight: 700; color: var(--apple-blue);">RUN #\${runNum} INSPECTOR</span>
                <span class="mono" style="color: var(--text-caption); font-size: 12px;">ID: \${selectedEntry.id}</span>
                <span class="badge \${isReg ? 'badge-regression' : 'badge-clean'}">\${isReg ? 'REGRESSION DETECTED' : 'CLEAN'}</span>
              </div>
              <div style="display: flex; gap: 8px;">
                <button class="segment-btn active" onclick="focusAuditRun('\${selectedEntry.id}')">View in Audit Table</button>
                <button class="segment-btn" onclick="selectTimelineRun('\${selectedEntry.id}')">Close</button>
              </div>
            </div>
            <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 12px;">
              <div>
                <span style="color: var(--text-caption); font-size: 11px;">Description: </span>
                <span style="font-weight: 600; color: var(--text-main);">\${selectedEntry.description || '(none)'}</span>
              </div>
              <div class="mono" style="font-size: 11px; color: var(--text-caption);">
                Timestamp: \${selectedEntry.timestamp} | Trigger: \${selectedEntry.trigger.toUpperCase()}
              </div>
            </div>
            <div class="inspector-checks">
              \${checks.length > 0 ? checks.map(c => {
                const pass = c.result === 'pass-pass' || c.result === 'fail-pass';
                return \`
                  <div class="inspector-check-pill mono">
                    <span style="font-weight: 600;">\${c.name}</span>
                    <span class="badge \${pass ? 'badge-clean' : 'badge-regression'}" style="font-size: 10px;">\${c.result}</span>
                  </div>
                \`;
              }).join('') : '<div class="empty-state" style="padding: 10px; width: 100%;">No checks run during this entry</div>'}
            </div>
          \`;
        } else {
          inspector.style.display = 'none';
        }
      } else if (inspector) {
        inspector.style.display = 'none';
      }
    }

    function focusAuditRun(id) {
      const row = document.querySelector(\`tr[data-id="\${id}"]\`);
      if (row) {
        row.scrollIntoView({ behavior: 'smooth', block: 'center' });
        row.style.outline = '2px solid var(--apple-blue)';
        setTimeout(() => { row.style.outline = ''; }, 3000);
      } else {
        const table = document.getElementById('log-table');
        if (table) table.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
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
          <tr class="\${rowCls}" data-id="\${e.id}">
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
