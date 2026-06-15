export const STYLES: string = `
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

  /* ============================================ */
  /* GLOBALNE ZMIENNE I KOLORY */
  /* ============================================ */
  :host {
    --mesh-green: #4ade80;
    --mesh-blue: #60a5fa;
    --mesh-orange: #fb923c;
    --mesh-red: #f87171;
    --mesh-purple: #a78bfa;
    --glass-border: rgba(128, 128, 128, 0.15);
    --glass-shadow: 0 2px 8px rgba(0, 0, 0, 0.05);
    --glass-shadow-hover: 0 6px 16px rgba(0, 0, 0, 0.1);
  }

  ha-card {
    padding: 20px;
    font-family: var(--paper-font-body1_-_font-family, var(--primary-font-family, system-ui, -apple-system, 'Segoe UI', Roboto, Helvetica, sans-serif));
    font-size: var(--paper-font-body1_-_font-size, 14px);
    color: var(--primary-text-color);
    background: transparent;
    box-shadow: none;
  }

  /* Hub / Node shared */
  .hw-info { 
    font-size: var(--paper-font-caption_-_font-size, 12px); 
    opacity: 0.65;
    margin: 4px 0 6px; 
    letter-spacing: -0.01em;
  }
  .hub-name {
    font-weight: 600;
    font-size: 0.95rem;
    letter-spacing: -0.01em;
  }
  
  .count-badge {
    font-size: 10px;
    font-weight: 600;
    background: transparent;
    padding: 2px 10px;
    border-radius: 20px;
    border: 1px solid var(--glass-border);
    color: var(--secondary-text-color);
    letter-spacing: -0.01em;
    transition: all 0.2s ease;
  }
  .count-badge:hover {
    transform: scale(1.02);
  }
  
  .node-key { 
    font-family: var(--paper-font-code1_-_font-family, 'SF Mono', 'JetBrains Mono', monospace); 
    font-size: var(--paper-font-caption_-_font-size, 11px); 
    opacity: 0.6;
  }

  /* Status dots */
  .status-dot { 
    width: 10px; 
    height: 10px; 
    border-radius: 50%; 
    flex-shrink: 0; 
    display: inline-block;
    transition: box-shadow 0.3s ease;
  }
  .dot-online  { 
    background: var(--mesh-green); 
    box-shadow: 0 0 8px rgba(74, 222, 128, 0.6);
    animation: pulse-glow 2s ease-in-out infinite;
  }
  .dot-offline { 
    background: var(--secondary-text-color); 
    opacity: 0.4;
  }

  @keyframes pulse-glow {
    0%, 100% { box-shadow: 0 0 4px rgba(74, 222, 128, 0.4); }
    50% { box-shadow: 0 0 12px rgba(74, 222, 128, 0.8); }
  }

  /* Status text */
  .status-text {
    font-size: var(--paper-font-body1_-_font-size, 14px);
    font-weight: 700;
    letter-spacing: -0.01em;
  }
  .status-text.online { color: var(--mesh-green); }
  .status-text.offline { color: var(--secondary-text-color); opacity: 0.6; }

  /* Progress bars */
  .bar-row { 
    display: flex; 
    align-items: center; 
    justify-content: space-between; 
    margin: 12px 0 4px; 
    font-size: var(--paper-font-caption_-_font-size, 12px); 
  }
  .bar-label { 
    display: flex; 
    align-items: center; 
    gap: 5px; 
    color: var(--secondary-text-color);
    opacity: 0.7;
  }
  .bar-label-right { 
    display: flex; 
    align-items: center; 
    gap: 8px; 
  }
  .bar-val { 
    font-weight: 700; 
    color: var(--primary-text-color);
  }
  .bar-track { 
    height: 8px; 
    border-radius: 999px; 
    background: var(--glass-border);
    overflow: hidden; 
    margin-bottom: 8px; 
  }
  .bar-fill { 
    height: 100%; 
    border-radius: 999px; 
    transition: width 0.6s cubic-bezier(0.2, 0.9, 0.4, 1.1);
    box-shadow: 0 0 6px rgba(74, 222, 128, 0.3);
  }

  /* Chips */
  .chip-row, .node-chip-row { 
    display: flex; 
    flex-wrap: wrap; 
    gap: 8px; 
    margin: 6px 0; 
  }
  .chip {
    display: inline-flex; 
    align-items: center; 
    gap: 4px;
    font-size: var(--paper-font-caption_-_font-size, 12px); 
    font-weight: 500;
    background: transparent;
    padding: 6px 14px; 
    border-radius: 20px;
    color: var(--primary-text-color);
    border: 1px solid var(--glass-border);
    transition: transform 0.2s ease, box-shadow 0.2s ease;
  }
  .chip:hover {
    transform: translateY(-1px);
    box-shadow: 0 2px 6px rgba(0, 0, 0, 0.08);
  }
  .chip-label { 
    color: var(--secondary-text-color); 
    font-weight: 400; 
    opacity: 0.7;
  }

  /* RF chips */
  .rf-row { 
    display: flex; 
    justify-content: center;
    flex-wrap: nowrap;
    gap: 12px; 
    margin: 6px 0 8px;
    overflow-x: auto;
    padding: 2px 0 6px 0;
  }
  .rf-chip { 
    font-size: var(--paper-font-caption_-_font-size, 11px); 
    padding: 4px 8px; 
    border-radius: 16px; 
    background: transparent;
    color: var(--secondary-text-color);
    font-weight: 500;
    white-space: nowrap;
    transition: all 0.2s ease;
    border: 1px solid var(--glass-border);
  }
  .rf-chip:hover {
    transform: translateY(-1px);
  }

  /* MQTT pills */
  .mqtt-row { 
    display: flex; 
    flex-wrap: wrap; 
    align-items: center; 
    justify-content: center;
    gap: 6px; 
    margin: 6px 0; 
  }
  .mqtt-label { 
    font-size: 10px; 
    color: var(--secondary-text-color); 
    font-weight: 600; 
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }
  .mqtt-pill { 
    font-size: 10px;
    padding: 3px 10px;
    border-radius: 16px;
    font-weight: 500; 
    text-transform: capitalize;
    transition: transform 0.2s ease, box-shadow 0.2s ease;
    border: 1px solid var(--glass-border);
    white-space: nowrap;
    background: transparent;
  }
  .mqtt-pill:hover {
    transform: translateY(-1px);
  }
  .mqtt-pill.ok  { 
    color: var(--mesh-green); 
    border-color: rgba(74, 222, 128, 0.4);
  }
  .mqtt-pill.err { 
    color: var(--mesh-red); 
    border-color: rgba(248, 113, 113, 0.4);
  }

  /* Color helpers */
  .green  { color: var(--mesh-green); }
  .yellow { color: var(--mesh-orange); }
  .red    { color: var(--mesh-red); }
  .blue   { color: var(--mesh-blue); }
  .orange { color: var(--mesh-orange); }
  .dim    { color: var(--secondary-text-color); opacity: 0.5; }

  /* Clickable */
  .clickable { cursor: pointer; transition: opacity 0.2s ease; }
  .clickable:hover { opacity: 0.7; }

  /* Sections */
  .section-header {
    font-size: 10px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.12em;
    color: var(--secondary-text-color);
    margin: 14px 0 8px 0;
    padding-bottom: 6px;
    border-bottom: 1px solid var(--glass-border);
    opacity: 0.7;
  }
  .section-header:first-of-type {
    margin-top: 0;
  }

  /* Nodes section */
  .nodes-section { margin-top: 8px; }
  .section-label {
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.12em;
    color: var(--secondary-text-color);
    padding: 8px 2px 6px;
    text-transform: uppercase;
    opacity: 0.7;
  }

  /* Node block - systemowe tło */
  .node-block { 
    padding: 16px 18px 14px; 
    border-radius: 24px; 
    margin-bottom: 12px; 
    background: transparent;
    border: 1px solid var(--glass-border);
    box-shadow: var(--glass-shadow);
    transition: transform 0.2s ease, box-shadow 0.2s ease;
  }
  .node-block:hover {
    transform: translateY(-2px);
    box-shadow: var(--glass-shadow-hover);
  }
  
  .node-offline { 
    opacity: 0.5;
    filter: grayscale(0.2);
  }

  .node-header { 
    display: flex; 
    align-items: center; 
    justify-content: space-between; 
    flex-wrap: wrap; 
    gap: 10px; 
  }
  .node-left { 
    display: flex; 
    align-items: center; 
    gap: 10px; 
    flex-wrap: wrap; 
    flex: 1; 
    min-width: 0; 
  }
  .node-right { 
    display: flex; 
    align-items: center; 
    gap: 8px; 
    flex-wrap: wrap; 
  }
  .node-name {
    font-size: 1.15rem;
    font-weight: 700;
    letter-spacing: -0.02em;
    text-transform: capitalize;
    word-break: break-word;
    flex: 1;
    min-width: 0;
  }
  .type-badge {
    font-size: var(--paper-font-caption_-_font-size, 11px);
    color: var(--mesh-orange);
    background: transparent;
    padding: 4px 12px;
    border-radius: 20px;
    font-weight: 700;
    border: 1px solid rgba(251, 146, 60, 0.3);
    transition: all 0.2s ease;
  }
  .type-badge:hover {
    transform: translateY(-1px);
  }
  .node-header-badge {
    font-size: 10px;
    padding: 4px 10px;
    border-radius: 20px;
    background: transparent;
    white-space: nowrap;
    font-weight: 500;
    letter-spacing: -0.01em;
    border: 1px solid var(--glass-border);
  }

  .badge { 
    font-size: var(--paper-font-caption_-_font-size, 11px); 
    padding: 3px 10px; 
    border-radius: 20px; 
    background: transparent;
    color: var(--secondary-text-color); 
    font-weight: 500; 
    border: 1px solid var(--glass-border);
  }
  .badge.green  { color: var(--mesh-green); border-color: rgba(74, 222, 128, 0.3); }
  .badge.yellow { color: var(--mesh-orange); border-color: rgba(251, 146, 60, 0.3); }
  .badge.red    { color: var(--mesh-red); border-color: rgba(248, 113, 113, 0.3); }

  .node-route { 
    font-size: var(--paper-font-caption_-_font-size, 11px); 
    color: var(--secondary-text-color); 
    padding-left: 14px; 
    font-family: var(--paper-font-code1_-_font-family, monospace); 
    margin: 4px 0 8px; 
    overflow: hidden; 
    text-overflow: ellipsis; 
    white-space: nowrap;
    opacity: 0.6;
  }

  /* Signal row */
  .signal-row {
    display: flex;
    gap: 20px;
    margin: 12px 0 8px;
  }
  .signal-item {
    display: flex;
    align-items: baseline;
    gap: 6px;
    font-size: 13px;
  }
  .signal-label {
    font-weight: 500;
    color: var(--secondary-text-color);
    opacity: 0.7;
  }
  .signal-value {
    font-weight: 700;
    font-family: monospace;
    font-size: 14px;
  }

  /* Traffic grid */
  .traffic-grid {
    display: flex;
    justify-content: center;
    gap: 14px;
    flex-wrap: wrap;
    margin: 8px 0;
  }
  .traffic-item {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 12px;
    background: transparent;
    padding: 8px 18px;
    border-radius: 20px;
    border: 1px solid var(--glass-border);
    min-width: 120px;
    transition: transform 0.2s ease, box-shadow 0.2s ease;
  }
  .traffic-item:hover {
    transform: translateY(-1px);
    box-shadow: 0 2px 6px rgba(0, 0, 0, 0.08);
  }
  .traffic-label {
    font-size: 11px;
    color: var(--secondary-text-color);
    font-weight: 500;
    letter-spacing: -0.01em;
  }
  .traffic-value {
    font-weight: 800;
    font-size: 14px;
  }

  /* Advanced chips */
  .advanced-chips {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin: 10px 0 6px;
    justify-content: center;
  }
  .advanced-chip {
    font-size: 10px;
    padding: 4px 12px;
    background: transparent;
    border-radius: 20px;
    color: var(--secondary-text-color);
    border: 1px solid var(--glass-border);
    transition: all 0.2s ease;
  }
  .advanced-chip:hover {
    transform: translateY(-1px);
    box-shadow: 0 1px 4px rgba(0,0,0,0.05);
  }

  /* Loc row */
  .loc-row {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    margin: 8px 0;
    flex-wrap: wrap;
  }
  .loc-coords {
    font-family: var(--paper-font-code1_-_font-family, monospace);
    font-size: 11px;
    background: transparent;
    padding: 4px 12px;
    border-radius: 20px;
    border: 1px solid var(--glass-border);
    color: var(--primary-text-color);
  }
  .map-link {
    font-size: 11px;
    font-weight: 500;
    color: var(--mesh-blue);
    text-decoration: none;
    padding: 4px 12px;
    border-radius: 20px;
    background: transparent;
    white-space: nowrap;
    border: 1px solid rgba(96, 165, 250, 0.3);
    transition: all 0.2s ease;
  }
  .map-link:hover {
    transform: translateY(-1px);
  }

  .empty { 
    text-align: center; 
    color: var(--secondary-text-color); 
    font-size: var(--paper-font-caption_-_font-size, 12px); 
    padding: 32px 20px; 
    line-height: 1.7;
    background: transparent;
    border-radius: 24px;
    border: 1px solid var(--glass-border);
  }

  /* Grid row constraint */
  ha-card.grid-rows { height: 100%; overflow: hidden; }

  /* Neighbors section */
  .neighbors-section {
    margin-top: 8px;
    padding-top: 4px;
  
  }

  .neighbors-header {
    font-size: 10px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.12em;
    color: var(--secondary-text-color);
    margin: 8px 0 6px 0;
    padding-bottom: 6px;
    border-bottom: 1px solid var(--glass-border);
    opacity: 0.7;
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .neighbors-list {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .neighbor-row {
    display: flex;
    flex-direction: column;
    padding: 10px 14px;
    background: transparent;
    border-radius: 18px;
    border: 1px solid var(--glass-border);
    transition: transform 0.2s ease, box-shadow 0.2s ease;
  }
  .neighbor-row:hover {
    transform: translateY(-1px);
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
  }

  .neighbor-main {
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: 8px;
    width: 100%;
  }
  .neighbor-name {
    font-family: var(--paper-font-code1_-_font-family, monospace);
    font-size: 12px;
    font-weight: 700;
    color: var(--primary-text-color);
    max-width: 160px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .neighbor-snr {
    font-weight: 800;
    font-size: 12px;
    padding: 4px 10px;
    border-radius: 20px;
    background: transparent;
    border: 1px solid var(--glass-border);
  }
  .neighbor-snr.green { 
    color: var(--mesh-green); 
    border-color: rgba(74, 222, 128, 0.3);
  }
  .neighbor-snr.yellow { 
    color: var(--mesh-orange); 
    border-color: rgba(251, 146, 60, 0.3);
  }
  .neighbor-snr.orange { 
    color: var(--mesh-orange); 
    border-color: rgba(251, 146, 60, 0.3);
  }
  .neighbor-snr.red { 
    color: var(--mesh-red); 
    border-color: rgba(248, 113, 113, 0.3);
  }
  .neighbor-snr.dim { 
    color: var(--secondary-text-color); 
    opacity: 0.5; 
    font-weight: normal; 
  }

  .neighbor-stats {
    display: flex;
    flex-wrap: wrap;
    gap: 14px;
    align-items: center;
    margin-top: 6px;
    justify-content: center;
  }
  .neighbor-stat {
    font-size: 10px;
    color: var(--secondary-text-color);
    display: flex;
    align-items: center;
    gap: 4px;
    opacity: 0.6;
  }

  .neighbor-name.clickable, .neighbor-snr.clickable {
    cursor: pointer;
  }
  .neighbor-name.clickable:hover {
    color: var(--mesh-blue);
    text-decoration: underline;
  }
  .neighbor-snr.clickable:hover {
    opacity: 0.7;
  }

  /* Node title row */
  .node-title-row {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 8px;
    margin-top: 6px;
    margin-bottom: 6px;
    justify-content: flex-start;
    text-align: left;
  }

  .node-title-row .hub-name,
  .node-title-row .node-name {
    font-size: 0.95rem;
    font-weight: 600;
  }
  /* Szare, neutralne tło – bez niebieskiego odcienia */
  .node-block {
    background: rgba(128, 128, 128, 0.05);
    backdrop-filter: blur(8px);
    border: 1px solid rgba(128, 128, 128, 0.12);
    box-shadow: 0 8px 20px rgba(0, 0, 0, 0.08);
  }

  .node-block:hover {
    background: rgba(128, 128, 128, 0.08);
    box-shadow: 0 12px 28px rgba(0, 0, 0, 0.12);
  }

  .chip,
  .mqtt-pill,
  .neighbor-row,
  .traffic-item,
  .advanced-chip,
  .node-header-badge,
  .badge {
    background: rgba(128, 128, 128, 0.04);
    backdrop-filter: blur(4px);
    border: 1px solid rgba(128, 128, 128, 0.1);
  }

  .chip:hover,
  .mqtt-pill:hover,
  .neighbor-row:hover,
  .traffic-item:hover,
  .advanced-chip:hover {
    background: rgba(128, 128, 128, 0.07);
  }

  /* Dla paska baterii – delikatnie szary */
  .bar-track {
    background: rgba(128, 128, 128, 0.15);
  }

  /* Dla sekcji nagłówków – bez zmian */
  .section-header,
  .neighbors-header {
    border-bottom-color: rgba(128, 128, 128, 0.2);
  }

  /* Dark theme - tylko delikatne dostosowanie kolorów */
  @media (prefers-color-scheme: dark) {
    :host {
      --glass-border: rgba(255, 255, 255, 0.1);
    }
  }
`;