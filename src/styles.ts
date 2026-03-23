export const STYLES: string = `
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

  ha-card {
    padding: 16px;
    font-family: var(--paper-font-body1_-_font-family, var(--primary-font-family, system-ui, sans-serif));
    font-size: var(--paper-font-body1_-_font-size, 14px);
    color: var(--primary-text-color);
  }

  /* Hub / Node shared */
  .hw-info { font-size: var(--paper-font-caption_-_font-size, 12px); color: var(--secondary-text-color); margin: 4px 0 6px; }
  .count-badge { font-size: var(--paper-font-caption_-_font-size, 12px); font-weight: 600; background: var(--secondary-background-color); padding: 3px 10px; border-radius: 20px; }
  .node-key { font-family: var(--paper-font-code1_-_font-family, monospace); font-size: var(--paper-font-caption_-_font-size, 12px); }

  /* Status dots */
  .status-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; display: inline-block; }
  .dot-online  { background: var(--success-color, #4caf50); box-shadow: 0 0 5px var(--success-color, #4caf50); }
  .dot-offline { background: var(--secondary-text-color); }

  /* Progress bars */
  .bar-row { display: flex; align-items: center; justify-content: space-between; margin: 10px 0 3px; font-size: var(--paper-font-caption_-_font-size, 12px); }
  .bar-label { display: flex; align-items: center; gap: 5px; color: var(--secondary-text-color); }
  .bar-label-right { display: flex; align-items: center; gap: 8px; }
  .bar-val { font-weight: 600; color: var(--primary-text-color); }
  .bar-track { height: 5px; border-radius: 3px; background: var(--secondary-background-color); overflow: hidden; margin-bottom: 8px; }
  .bar-fill { height: 100%; border-radius: 3px; transition: width 0.4s; }

  /* Chips */
  .chip-row, .node-chip-row { display: flex; flex-wrap: wrap; gap: 5px; margin: 5px 0; }
  .chip {
    display: inline-flex; align-items: center; gap: 3px;
    font-size: var(--paper-font-caption_-_font-size, 12px); font-weight: 500;
    background: var(--secondary-background-color); padding: 4px 10px; border-radius: 8px;
    color: var(--primary-text-color);
  }
  .chip-label { color: var(--secondary-text-color); font-weight: 400; }

  /* RF chips */
  .rf-row { display: flex; flex-wrap: wrap; gap: 5px; margin: 4px 0 6px; }
  .rf-chip { font-size: var(--paper-font-caption_-_font-size, 12px); padding: 2px 8px; border-radius: 6px; background: var(--secondary-background-color); color: var(--primary-color); font-weight: 500; }

  /* MQTT pills */
  .mqtt-row { display: flex; flex-wrap: wrap; align-items: center; gap: 5px; margin: 4px 0 6px; }
  .mqtt-label { font-size: var(--paper-font-caption_-_font-size, 12px); color: var(--secondary-text-color); font-weight: 500; margin-right: 2px; }
  .mqtt-pill { font-size: var(--paper-font-caption_-_font-size, 12px); padding: 3px 10px; border-radius: 20px; font-weight: 500; text-transform: capitalize; }
  .mqtt-pill.ok  { color: var(--success-color, #4caf50); background: rgba(76,175,80,0.12); }
  .mqtt-pill.err { color: var(--error-color, #f44336); background: rgba(244,67,54,0.12); }

  /* Color helpers */
  .green  { color: var(--success-color, #4caf50); }
  .yellow { color: var(--warning-color, #ff9800); }
  .red    { color: var(--error-color, #f44336); }
  .blue   { color: var(--primary-color); }
  .dim    { color: var(--secondary-text-color); }

  /* Clickable */
  .clickable { cursor: pointer; transition: opacity 0.15s; }
  .clickable:hover { opacity: 0.65; }

  /* Nodes section */
  .nodes-section { margin-top: 8px; }
  .section-label {
    font-size: var(--paper-font-caption_-_font-size, 12px); font-weight: 700;
    letter-spacing: 0.08em; color: var(--secondary-text-color); padding: 6px 2px 4px;
    text-transform: uppercase;
  }

  .node-block { padding: 10px 12px 8px; border-radius: var(--ha-card-border-radius, 12px); margin-bottom: 6px; border: 1px solid var(--divider-color); background: var(--secondary-background-color); }
  .node-offline { opacity: 0.5; }

  .node-header { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 4px; }
  .node-left { display: flex; align-items: center; gap: 6px; }
  .node-right { display: flex; align-items: center; gap: 4px; flex-wrap: wrap; }
  .node-name { font-weight: 600; text-transform: capitalize; }
  .type-badge { font-size: var(--paper-font-caption_-_font-size, 12px); color: var(--accent-color); background: var(--secondary-background-color); padding: 1px 6px; border-radius: 5px; font-weight: 600; border: 1px solid var(--divider-color); }

  .badge { font-size: var(--paper-font-caption_-_font-size, 12px); padding: 2px 7px; border-radius: 5px; background: var(--secondary-background-color); color: var(--secondary-text-color); font-weight: 500; }
  .badge.green  { color: var(--success-color, #4caf50); }
  .badge.yellow { color: var(--warning-color, #ff9800); }
  .badge.red    { color: var(--error-color, #f44336); }

  .node-route { font-size: var(--paper-font-caption_-_font-size, 12px); color: var(--secondary-text-color); padding-left: 14px; font-family: var(--paper-font-code1_-_font-family, monospace); margin: 2px 0 4px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

  /* Node traffic grid */
  .node-traffic { display: grid; grid-template-columns: repeat(auto-fill, minmax(70px, 1fr)); gap: 6px 4px; margin: 6px 0 2px; background: var(--secondary-background-color); border-radius: 8px; padding: 8px 10px; border: 1px solid var(--divider-color); }
  .tc { display: flex; flex-direction: column; gap: 2px; }
  .tc-label { font-size: var(--paper-font-caption_-_font-size, 12px); color: var(--secondary-text-color); }
  .tc-val { font-weight: 700; }

  .loc-row { display: flex; align-items: center; gap: 6px; margin: 5px 0; }
  .map-link { font-size: var(--paper-font-caption_-_font-size, 12px); font-weight: 500; color: var(--primary-color); text-decoration: none; padding: 4px 8px; border-radius: 8px; background: var(--secondary-background-color); white-space: nowrap; border: 1px solid var(--divider-color); }
  .map-link:hover { opacity: 0.75; }

  .empty { text-align: center; color: var(--secondary-text-color); font-size: var(--paper-font-caption_-_font-size, 12px); padding: 24px 16px; line-height: 1.7; }

  /* Grid row constraint — clip content to the assigned grid height */
  ha-card.grid-rows { height: 100%; overflow: hidden; }
`;
