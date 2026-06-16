export const MESSAGE_STYLES: string = `
  * { box-sizing: border-box; margin: 0; padding: 0; }

  ha-card {
    padding: 20px;
    font-family: var(--paper-font-body1_-_font-family, system-ui, -apple-system, 'Segoe UI', Roboto, Helvetica, sans-serif);
    font-size: var(--paper-font-body1_-_font-size, 14px);
    color: var(--primary-text-color);
    background: transparent;
    box-shadow: none;
  }

  .section-header {
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.12em;
    color: var(--secondary-text-color);
    margin: 14px 0 8px 0;
    padding-bottom: 6px;
    border-bottom: 1px solid rgba(128, 128, 128, 0.2);
    display: flex;
    align-items: center;
    gap: 8px;
    text-transform: uppercase;
    opacity: 0.7;
  }
  .section-header:first-of-type {
    margin-top: 0;
  }

  .radio-group {
    display: flex;
    gap: 12px;
    margin: 12px 0 16px;
    background: rgba(128, 128, 128, 0.04);
    backdrop-filter: blur(4px);
    border-radius: 24px;
    padding: 4px;
    border: 1px solid rgba(128, 128, 128, 0.1);
  }
  .radio-option {
    display: flex;
    align-items: center;
    gap: 8px;
    flex: 1;
    padding: 8px 12px;
    border-radius: 20px;
    cursor: pointer;
    transition: all 0.2s ease;
    font-weight: 500;
    color: var(--secondary-text-color);
  }
  .radio-option:hover {
    background: rgba(128, 128, 128, 0.08);
  }
  .radio-option.selected {
    background: rgba(74, 222, 128, 0.12);
    color: var(--mesh-green);
    box-shadow: 0 0 6px rgba(74, 222, 128, 0.3);
  }
  .radio-option input {
    margin: 0;
    cursor: pointer;
    accent-color: var(--mesh-green);
  }

  .input-group {
    margin-bottom: 16px;
  }
  .label {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 11px;
    font-weight: 500;
    color: var(--secondary-text-color);
    margin-bottom: 6px;
    letter-spacing: -0.01em;
  }
  select, textarea {
    width: 100%;
    padding: 10px 14px;
    border-radius: 16px;
    border: 1px solid var(--divider-color, rgba(128, 128, 128, 0.2));
    background: var(--ha-card-background, var(--card-background-color, #2c2c3a));
    color: var(--primary-text-color);
    font-family: inherit;
    font-size: 14px;
    transition: all 0.2s ease;
  }
  select option {
    background: var(--ha-card-background, var(--card-background-color, #2c2c3a));
    color: var(--primary-text-color);
  }
  select:focus, textarea:focus {
    outline: none;
    border-color: var(--mesh-green);
  }
  textarea {
    resize: vertical;
  }

  button {
    width: 100%;
    padding: 12px 16px;
    border: none;
    border-radius: 24px;
    font-weight: 700;
    cursor: pointer;
    transition: transform 0.2s ease, background 0.2s ease, box-shadow 0.2s ease;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    font-family: inherit;
    font-size: 14px;
    background: linear-gradient(135deg, var(--mesh-green), #3b8c3e);
    color: white;
    margin: 16px 0 12px;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  }
  button:hover {
    transform: translateY(-1px);
    background: linear-gradient(135deg, #5ee090, #2f6e32);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  }

  .status {
    font-size: 12px;
    text-align: center;
    padding: 8px;
    border-radius: 20px;
    background: rgba(128, 128, 128, 0.04);
    backdrop-filter: blur(4px);
    margin: 12px 0 8px;
  }
    
  .message-item {
    cursor: pointer;
    transition: background-color 0.1s;
  }
  .message-item:hover {
    background-color: rgba(255,255,255,0.05);
  }
  .message-item:active {
    background-color: rgba(0,0,0,0.1);
  }

  .messages-section {
    margin-top: 20px;
    border-top: 1px solid rgba(128, 128, 128, 0.15);
    padding-top: 12px;
  }
  .messages-header {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--secondary-text-color);
    margin-bottom: 12px;
  }
  .refresh-btn {
    margin-left: auto;
    cursor: pointer;
    padding: 6px;
    border-radius: 50%;
    background: rgba(128, 128, 128, 0.05);
    transition: all 0.2s ease;
  }
  .refresh-btn:hover {
    background: rgba(128, 128, 128, 0.15);
    transform: rotate(15deg);
  }
  .message-link {
    color: var(--primary-color, #03a9f4);
    cursor: pointer;
    text-decoration: underline;
    transition: color 0.2s;
  }
  .message-link:hover {
    color: var(--accent-color, #1e88e5);
    text-decoration: none;
  }
  .message-link:active {
    opacity: 0.7;
  }
  .messages-list {
    max-height: 300px;
    overflow-y: auto;
    border-radius: 18px;
    background: rgba(128, 128, 128, 0.02);
    backdrop-filter: blur(2px);
  }
  .message-item {
    display: flex;
    align-items: flex-start;
    gap: 12px;
    padding: 12px;
    border-bottom: 1px solid rgba(128, 128, 128, 0.08);
    transition: background 0.2s;
  }
  .message-item:hover {
    background: rgba(128, 128, 128, 0.04);
  }
  .message-item.sent {
    flex-direction: row-reverse;
  }
  .message-icon {
    flex-shrink: 0;
    font-size: 18px;
  }
  .message-content {
    flex: 1;
    min-width: 0;
  }
  .message-item.sent .message-content {
    text-align: right;
  }
  .message-header {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    flex-wrap: wrap;
    gap: 4px;
    margin-bottom: 4px;
  }
  .message-item.sent .message-header {
    flex-direction: row-reverse;
  }
  .message-sender {
    font-weight: 700;
    font-size: 12px;
  }
  .message-sender.sent {
    color: var(--mesh-green);
  }
  .message-sender.received {
    color: var(--mesh-blue);
  }
  .message-time {
    font-size: 10px;
    color: var(--secondary-text-color);
    opacity: 0.7;
  }
  .message-text {
    font-size: 13px;
    word-break: break-word;
    line-height: 1.4;
  }
  .message-item.sent .message-text {
    background: rgba(74, 222, 128, 0.1);
    border-radius: 16px;
    padding: 8px 12px;
    display: inline-block;
    text-align: left;
  }

  .empty-messages {
    text-align: center;
    padding: 32px 20px;
    color: var(--secondary-text-color);
    font-size: 12px;
  }

  .author-info {
    font-size: 10px;
    color: var(--secondary-text-color);
    text-align: center;
    margin-top: 16px;
    padding-top: 12px;
    border-top: 1px solid rgba(128, 128, 128, 0.12);
    opacity: 0.6;
  }

  .messages-list::-webkit-scrollbar {
    width: 6px;
  }
  .messages-list::-webkit-scrollbar-track {
    background: rgba(128, 128, 128, 0.05);
    border-radius: 3px;
  }
  .messages-list::-webkit-scrollbar-thumb {
    background: rgba(128, 128, 128, 0.2);
    border-radius: 3px;
  }

  @keyframes spin {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
  }
  .loading-spinner ha-icon {
    animation: spin 1s linear infinite;
  }
`;