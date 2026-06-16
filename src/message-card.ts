import type { HomeAssistant, MeshcoreMessageCardConfig } from "./types.js";
import { escapeHtml } from "./helpers.js";
import { STYLES } from "./styles.js";
import { MESSAGE_STYLES } from "./message-styles.js";
import { makeLocalize, type LocalizeFunc } from "./localize.js";
import { discoverHubs } from "./discovery.js";

export class MeshcoreMessageCard extends HTMLElement {
  private _hass?: HomeAssistant;
  private _config?: MeshcoreMessageCardConfig;
  private _messageType: "channel" | "contact" = "channel";
  private _lastMessages: any[] = [];
  private _isLoading = false;
  private _refreshCount = 0;
  private _lastSelectedValue: string | null = null;
  private _isUpdating = false;
  private _initialized = false;

  private static _globalContactsCache: any[] | null = null;
  private static _globalChannelsCache: any[] | null = null;

  constructor() {
    super();
    this.attachShadow({ mode: "open" });
  }

  disconnectedCallback() {}

  setConfig(config: MeshcoreMessageCardConfig): void {
    this._config = config;
    this._render();
  }

  set hass(hass: HomeAssistant) {
    const oldHass = this._hass;
    this._hass = hass;
    
    if (oldHass && oldHass.states !== hass.states) {
      MeshcoreMessageCard._globalContactsCache = null;
      MeshcoreMessageCard._globalChannelsCache = null;
    }

    const targetSelect = this.shadowRoot?.querySelector("#target-select") as HTMLSelectElement | null;
    if (targetSelect && document.activeElement === targetSelect) {
      return;
    }
    
    if (this._initialized) {
      this._updateTargetListOnly();
    } else {
      this._render();
    }
  }

  // ---------- Helpers: auth, hub name, lists ----------
  private _getAuthToken(): string | null {
    const hass = this._hass as any;
    if (hass?.connection?.options?.authToken) return hass.connection.options.authToken;
    if (hass?.auth?.data?.access_token) return hass.auth.data.access_token;
    return null;
  }

  private _getMyHubName(): string {
    if (!this._hass) return "Hub";
    const hubs = discoverHubs(this._hass);
    if (hubs.length > 0) {
      return hubs[0].name;
    }
    const channelSelect = Object.values(this._hass.states).find(
      (state) => state.entity_id === "select.meshcore_channel"
    );
    if (channelSelect && channelSelect.attributes.friendly_name) {
      const friendly = channelSelect.attributes.friendly_name;
      const match = friendly.match(/MeshCore\s+([^\s(]+)/i);
      if (match) return match[1];
    }
    for (const [entityId, state] of Object.entries(this._hass.states)) {
      if ((entityId.includes("_node_status") || entityId.includes("_status")) && state.attributes?.adv_name) {
        return state.attributes.adv_name;
      }
    }
    return "Hub";
  }

  private _getChannels(): any[] {
    if (!this._hass) return [];
    if (MeshcoreMessageCard._globalChannelsCache) return MeshcoreMessageCard._globalChannelsCache;

    const channelSelect = Object.values(this._hass.states).find(
      (state) => state.entity_id === "select.meshcore_channel"
    );
    if (!channelSelect) return [];

    const options = channelSelect.attributes.options || [];
    const channels = options.map((opt: string, idx: number) => {
      let name = opt;
      let channelIdx = idx;
      const match = opt.match(/^(\d+):\s*(.+)$/);
      if (match) {
        channelIdx = parseInt(match[1]);
        name = match[2];
      } else {
        const altMatch = opt.match(/^(.+?)\s*\((\d+)\)$/);
        if (altMatch) {
          name = altMatch[1];
          channelIdx = parseInt(altMatch[2]);
        }
      }
      return { idx: channelIdx, name, entityId: channelSelect.entity_id, state: channelSelect };
    });

    MeshcoreMessageCard._globalChannelsCache = channels;
    return channels;
  }

  private _getContacts(): any[] {
    if (!this._hass) return [];
    if (MeshcoreMessageCard._globalContactsCache) return MeshcoreMessageCard._globalContactsCache;

    const contactSelect = Object.values(this._hass.states).find(
      (state) => state.entity_id === "select.meshcore_contact"
    );
    if (!contactSelect) return [];

    const options = contactSelect.attributes.options || [];
    const contacts: any[] = [];
    for (const name of options) {
      let advId: string | null = null;
      for (const [entityId, state] of Object.entries(this._hass.states)) {
        if (!/^binary_sensor\.meshcore_.*_contact$/.test(entityId)) continue;
        const attrs = state.attributes as any;
        if (attrs.adv_name === name) {
          advId = attrs.adv_id;
          if (!advId) {
            const match = entityId.match(/meshcore_.*?_([a-f0-9]+)_contact$/);
            if (match) advId = match[1];
          }
          break;
        }
      }
      contacts.push({
        name,
        id: advId || name,
        advId: advId,
        entityId: contactSelect.entity_id,
        contactEntityId: null,
        lastSeen: null,
        state: contactSelect,
      });
    }

    MeshcoreMessageCard._globalContactsCache = contacts;
    return contacts;
  }

  // ---------- Fetch entity and logbook ----------
  private _findMessagesEntity(id: number | string, type: "channel" | "contact"): string | null {
    if (!this._hass) return null;
    if (type === "channel") {
      const channelIdx = id as number;
      for (const [entityId] of Object.entries(this._hass.states)) {
        if (entityId.includes(`_ch_${channelIdx}_messages`) && entityId.startsWith("binary_sensor.meshcore")) {
          return entityId;
        }
      }
      return null;
    } else {
      const contactName = id as string;
      const contact = this._getContacts().find(c => c.name === contactName);
      if (!contact || !contact.advId) return null;
      for (const [entityId] of Object.entries(this._hass.states)) {
        if (entityId.includes("_messages") && !entityId.includes("_ch_") && entityId.includes(contact.advId!)) {
          return entityId;
        }
      }
      const shortId = contact.advId.substring(0, 6);
      for (const [entityId] of Object.entries(this._hass.states)) {
        if (entityId.includes(`_${shortId}_messages`) && entityId.startsWith("binary_sensor.meshcore")) {
          return entityId;
        }
      }
      return null;
    }
  }

  private async _fetchLogbook(entityId: string): Promise<any[]> {
    const endTime = new Date();
    const startTime = new Date();
    startTime.setDate(startTime.getDate() - 1);
    startTime.setHours(0, 0, 0, 0);

    const apiUrl = `/api/logbook/${startTime.toISOString()}?end_time=${encodeURIComponent(endTime.toISOString())}&entity=${encodeURIComponent(entityId)}`;
    const authToken = this._getAuthToken();
    if (!authToken) throw new Error("No auth token");
    const response = await fetch(apiUrl, {
      headers: { Authorization: `Bearer ${authToken}` },
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    return Array.isArray(data) ? data : [];
  }

  // ---------- Parse single logbook entry ----------
  private _parseLogbookEntry(item: any, myHubName: string): any {
    const fullText = item.message || "";
    let sender = "";
    let content = fullText;

    const colonIndex = fullText.indexOf(": ");
    if (colonIndex !== -1) {
      const before = fullText.substring(0, colonIndex);
      content = fullText.substring(colonIndex + 2);
      const gtIndex = before.lastIndexOf(">");
      if (gtIndex !== -1) {
        sender = before.substring(gtIndex + 1).trim();
      } else {
        sender = before.trim();
      }
    }

    const isSent = sender.toLowerCase() === myHubName.toLowerCase();
    return {
      text: content,
      sender: sender || "?",
      time: new Date(item.when).getTime() / 1000,
      direction: isSent ? "sent" : "received",
    };
  }

  // ---------- Loading messages ----------
  private async _loadChannelMessages(channelIdx: number, callId: number): Promise<any[]> {
    const entityId = this._findMessagesEntity(channelIdx, "channel");
    if (!entityId) return [];

    const entries = await this._fetchLogbook(entityId);
    if (callId !== this._refreshCount) return [];

    const myHubName = this._getMyHubName();
    const messages = entries.map((item) => this._parseLogbookEntry(item, myHubName));
    messages.sort((a, b) => b.time - a.time);
    return messages.slice(0, 20);
  }

  private async _loadContactMessages(contactName: string, callId: number): Promise<any[]> {
    const entityId = this._findMessagesEntity(contactName, "contact");
    if (!entityId) {
      throw new Error("contact_unavailable");
    }

    const entries = await this._fetchLogbook(entityId);
    if (callId !== this._refreshCount) return [];

    const myHubName = this._getMyHubName();
    const messages = entries.map((item) => this._parseLogbookEntry(item, myHubName));
    messages.sort((a, b) => b.time - a.time);
    return messages.slice(0, 20);
  }

  private async _loadMessages(): Promise<void> {
    if (this._isLoading) return;
    const targetSelect = this.shadowRoot?.querySelector("#target-select") as HTMLSelectElement | null;
    const targetValue = targetSelect?.value;
    if (!targetValue) {
      this._lastMessages = [];
      this._renderMessages();
      return;
    }
    this._isLoading = true;
    this._refreshCount++;
    const callId = this._refreshCount;
    this._renderMessages(true);
    try {
      let messages: any[] = [];
      if (this._messageType === "channel") {
        messages = await this._loadChannelMessages(parseInt(targetValue), callId);
      } else {
        messages = await this._loadContactMessages(targetValue, callId);
      }
      if (callId !== this._refreshCount) return;
      this._lastMessages = messages;
      this._renderMessages(false);
    } catch (error: any) {
      if (error.message === "contact_unavailable") {
        const t = this._getTranslations();
        this._lastMessages = [
          {
            text: t("message-card.contact_unavailable"),
            sender: "",
            time: Date.now() / 1000,
            direction: "error",
          },
        ];
        this._renderMessages(false);
      } else {
        // Error silently ignored (no console output)
        this._lastMessages = [];
        this._renderMessages(false);
      }
    } finally {
      this._isLoading = false;
    }
  }

  // ---------- Sending message (with auto-refresh after 5s) ----------
  private _sendMessage(): void {
    const t = this._getTranslations();
    const targetSelect = this.shadowRoot?.querySelector("#target-select") as HTMLSelectElement | null;
    const messageInput = this.shadowRoot?.querySelector("#message-input") as HTMLTextAreaElement | null;
    const statusDiv = this.shadowRoot?.querySelector("#status") as HTMLElement | null;
    const targetValue = targetSelect?.value;
    const message = messageInput?.value.trim();

    if (!targetValue) {
      if (statusDiv) statusDiv.textContent = t("message-card.error_recipient");
      return;
    }
    if (!message) {
      if (statusDiv) statusDiv.textContent = t("message-card.error_message");
      return;
    }
    if (statusDiv) {
      statusDiv.textContent = t("message-card.sending");
      statusDiv.style.color = "var(--secondary-text-color)";
    }

    const hass = this._hass as any;
    let serviceCall: Promise<any>;
    if (this._messageType === "channel") {
      serviceCall = hass.callService("meshcore", "send_channel_message", {
        channel_idx: parseInt(targetValue),
        message,
      });
    } else {
      serviceCall = hass.callService("meshcore", "send_message", {
        node_id: targetValue,
        message,
      });
    }
    serviceCall
      .then(() => {
        const typeName = this._messageType === "channel" ? t("message-card.to_channel") : t("message-card.direct");
        if (statusDiv) {
          statusDiv.textContent = t("message-card.sent", { type: typeName });
          statusDiv.style.color = "var(--success-color)";
        }
        if (messageInput) messageInput.value = "";

        setTimeout(() => {
          this._loadMessages();
        }, 7000);

        setTimeout(() => {
          if (statusDiv) statusDiv.textContent = "";
        }, 5000);
      })
      .catch(() => {
        if (statusDiv) {
          statusDiv.textContent = t("message-card.error_general", { error: "Unknown error" });
          statusDiv.style.color = "var(--error-color)";
        }
        setTimeout(() => {
          if (statusDiv) statusDiv.textContent = "";
        }, 5000);
      });
  }

  // ---------- Linkify – convert URLs to clickable links ----------
  private _linkify(text: string): string {
    if (!text) return "";
    // Escape entire text, then replace URLs with links
    const escaped = escapeHtml(text);
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    return escaped.replace(urlRegex, (url) => {
      return `<a class="message-link" data-url="${escapeHtml(url)}" href="#">${escapeHtml(url)}</a>`;
    });
  }

  // ---------- Copy link on click ----------
  private _setupLinkListeners(): void {
    const container = this.shadowRoot?.querySelector("#messages-container");
    if (!container) return;

    if ((container as any)._linkListener) {
      container.removeEventListener("click", (container as any)._linkListener);
    }

    const onLinkClick = (e: Event) => {
      const target = e.target as HTMLElement;
      const link = target.closest(".message-link") as HTMLAnchorElement;
      if (!link) return;

      e.preventDefault();
      e.stopPropagation();

      const url = link.getAttribute("data-url") || link.textContent || "";
      if (!url) return;

      this._copyUrl(url, link);
    };

    container.addEventListener("click", onLinkClick);
    (container as any)._linkListener = onLinkClick;
  }

  private async _copyUrl(url: string, linkElement: HTMLElement): Promise<void> {
    const t = this._getTranslations();

    // Create overlay with message on link
    const overlay = document.createElement("span");
    overlay.textContent = t("message-card.copied");
    overlay.style.cssText = `
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      background: rgba(0,0,0,0.75);
      color: white;
      padding: 2px 10px;
      border-radius: 12px;
      font-size: 12px;
      font-weight: 500;
      pointer-events: none;
      white-space: nowrap;
      z-index: 10;
      opacity: 0;
      transition: opacity 0.2s;
    `;
    // Set relative position on link
    linkElement.style.position = "relative";
    linkElement.appendChild(overlay);

    // Show overlay with animation
    requestAnimationFrame(() => {
      overlay.style.opacity = "1";
    });

    try {
      await navigator.clipboard.writeText(url);
    } catch {
      // Fallback
      const textarea = document.createElement("textarea");
      textarea.value = url;
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.select();
      try {
        document.execCommand("copy");
      } catch (_) {
        // Fallback failed, silently ignore
      }
      document.body.removeChild(textarea);
    }

    // Hide overlay after 1.5s
    setTimeout(() => {
      overlay.style.opacity = "0";
      setTimeout(() => {
        if (overlay.parentNode) overlay.remove();
      }, 300);
    }, 1500);
  }

  // ---------- Copy full message (long press) ----------
  private _setupCopyListeners(): void {
    const container = this.shadowRoot?.querySelector("#messages-container");
    if (!container) return;

    if ((container as any)._copyListeners) {
      container.removeEventListener("pointerdown", (container as any)._copyListeners.pointerdown);
      container.removeEventListener("pointerup", (container as any)._copyListeners.pointerup);
      container.removeEventListener("pointerleave", (container as any)._copyListeners.pointerleave);
    }

    let pressTimer: number | null = null;
    let targetElement: HTMLElement | null = null;

    const onPointerDown = (e: Event) => {
      // If clicked on a link, don't trigger long press (handled separately)
      const target = (e as PointerEvent).target as HTMLElement;
      if (target.closest(".message-link")) return;

      const messageItem = target.closest(".message-item") as HTMLElement;
      if (!messageItem) return;
      targetElement = messageItem;
      pressTimer = window.setTimeout(() => {
        this._handleCopyFullMessage(messageItem);
        // Visual feedback
        messageItem.style.backgroundColor = "var(--primary-color, #03a9f4)";
        messageItem.style.transition = "background-color 0.2s";
        setTimeout(() => {
          messageItem.style.backgroundColor = "";
        }, 300);
      }, 500);
    };

    const onPointerUp = () => {
      if (pressTimer) {
        clearTimeout(pressTimer);
        pressTimer = null;
      }
      if (targetElement) {
        targetElement.style.backgroundColor = "";
        targetElement = null;
      }
    };

    const onPointerLeave = onPointerUp;

    container.addEventListener("pointerdown", onPointerDown);
    container.addEventListener("pointerup", onPointerUp);
    container.addEventListener("pointerleave", onPointerLeave);

    (container as any)._copyListeners = {
      pointerdown: onPointerDown,
      pointerup: onPointerUp,
      pointerleave: onPointerLeave,
    };
  }

  private async _handleCopyFullMessage(messageItem: HTMLElement): Promise<void> {
    const textElement = messageItem.querySelector(".message-text") as HTMLElement;
    if (!textElement) return;

    // Get full text without HTML tags (e.g. links)
    const fullText = textElement.textContent?.trim() || "";
    const t = this._getTranslations();

    const overlay = document.createElement("div");
    overlay.textContent = t("message-card.copied");
    overlay.style.cssText = `
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      background: rgba(0,0,0,0.75);
      color: white;
      padding: 6px 14px;
      border-radius: 20px;
      font-size: 14px;
      font-weight: 500;
      pointer-events: none;
      z-index: 10;
      white-space: nowrap;
      box-shadow: 0 2px 8px rgba(0,0,0,0.3);
      opacity: 0;
      transition: opacity 0.2s;
    `;
    messageItem.style.position = "relative";
    messageItem.appendChild(overlay);

    requestAnimationFrame(() => {
      overlay.style.opacity = "1";
    });

    try {
      await navigator.clipboard.writeText(fullText);
    } catch {
      const textarea = document.createElement("textarea");
      textarea.value = fullText;
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.select();
      try {
        document.execCommand("copy");
      } catch (_) {
        // Fallback failed, silently ignore
      }
      document.body.removeChild(textarea);
    }

    setTimeout(() => {
      overlay.style.opacity = "0";
      setTimeout(() => {
        if (overlay.parentNode) overlay.remove();
      }, 300);
    }, 1500);
  }

  // ---------- Update select list ----------
  private _updateTargetListOnly(): void {
    if (this._isUpdating) return;
    
    const targetSelect = this.shadowRoot?.querySelector("#target-select") as HTMLSelectElement | null;
    if (!targetSelect) return;

    const t = this._getTranslations();
    let newOptionsHtml = `<option value="">${t("message-card.select_prompt")}</option>`;
    let labelText = "";

    if (this._messageType === "channel") {
      const channels = this._getChannels();
      labelText = t("message-card.select_channel");
      for (const ch of channels) {
        newOptionsHtml += `<option value="${ch.idx}">${escapeHtml(ch.name)} (kanał ${ch.idx})</option>`;
      }
    } else {
      const contacts = this._getContacts();
      labelText = t("message-card.select_contact");
      for (const contact of contacts) {
        newOptionsHtml += `<option value="${escapeHtml(contact.name)}">${escapeHtml(contact.name)}</option>`;
      }
    }

    if (targetSelect.innerHTML === newOptionsHtml) {
      return;
    }

    // Aktualizacja tylko gdy faktycznie są zmiany
    this._isUpdating = true;
    const currentValue = targetSelect.value;
    const targetLabelSpan = this.shadowRoot?.querySelector("#target-label span:last-child");
    if (targetLabelSpan) targetLabelSpan.textContent = labelText;

    targetSelect.innerHTML = newOptionsHtml;
    if (currentValue && Array.from(targetSelect.options).some((opt) => opt.value === currentValue)) {
      targetSelect.value = currentValue;
    }
    this._isUpdating = false;
  }

  private _fullUpdate(): void {
    const targetSelect = this.shadowRoot?.querySelector("#target-select") as HTMLSelectElement | null;
    const newValue = targetSelect?.value || null;
    if (newValue !== this._lastSelectedValue) {
      this._lastSelectedValue = newValue;
      if (newValue) {
        this._loadMessages();
      } else {
        this._lastMessages = [];
        this._renderMessages(false);
      }
    }
  }

  private _onTypeChange(event: Event): void {
    this._messageType = (event.target as HTMLInputElement).value as "channel" | "contact";
    this._updateTargetListOnly();
    const targetSelect = this.shadowRoot?.querySelector("#target-select") as HTMLSelectElement | null;
    if (targetSelect && targetSelect.value) {
      this._lastSelectedValue = targetSelect.value;
      this._loadMessages();
    } else {
      this._lastMessages = [];
      this._renderMessages(false);
    }
    const radioGroup = this.shadowRoot?.querySelector(".radio-group");
    if (radioGroup) {
      const options = radioGroup.querySelectorAll(".radio-option");
      options.forEach((opt) => opt.classList.remove("selected"));
      const activeLabel = radioGroup
        .querySelector(`.radio-option input[value="${this._messageType}"]`)
        ?.closest(".radio-option");
      if (activeLabel) activeLabel.classList.add("selected");
    }
  }

  // ---------- Format time ----------
  private _formatTime(timestamp: number | null): string {
    if (!timestamp) return "";
    const t = this._getTranslations();
    const now = Math.floor(Date.now() / 1000);
    let diff = now - timestamp;
    diff = Math.floor(diff);
    if (diff < 0) diff = 0;
    if (diff < 60) return t("message-card.seconds_ago", { n: diff });
    if (diff < 3600) return t("message-card.minutes_ago", { n: Math.floor(diff / 60) });
    if (diff < 86400) return t("message-card.hours_ago", { n: Math.floor(diff / 3600) });
    return t("message-card.days_ago", { n: Math.floor(diff / 86400) });
  }

  // ---------- Render messages ----------
  private _renderMessages(loading = false): void {
    const container = this.shadowRoot?.querySelector("#messages-container");
    if (!container) return;
    const t = this._getTranslations();

    if (this._lastMessages.length === 1 && this._lastMessages[0].direction === "error") {
      const err = this._lastMessages[0];
      container.innerHTML = `<div class="empty-messages" style="color: var(--error-color);">
        <ha-icon icon="mdi:alert-circle"></ha-icon><br>${escapeHtml(err.text)}</div>`;
      return;
    }

    if (loading) {
      container.innerHTML = `<div class="empty-messages loading-spinner">
        <ha-icon icon="mdi:loading" style="--mdc-icon-size: 28px;"></ha-icon><br>${t("message-card.loading")}</div>`;
      return;
    }

    if (this._lastMessages.length === 0) {
      container.innerHTML = `<div class="empty-messages">
        <ha-icon icon="mdi:message-text-off" style="--mdc-icon-size: 32px;"></ha-icon><br>${t("message-card.no_messages")}</div>`;
      return;
    }

    const messagesHtml = this._lastMessages
      .map((msg) => {
        const isSent = msg.direction === "sent";
        const senderName = msg.sender;
        const timeStr = this._formatTime(msg.time);
        const messageClass = isSent ? "sent" : "";
        // Use linkify to display content with links
        const messageHtml = this._linkify(msg.text);
        return `
          <div class="message-item ${messageClass}" style="position: relative;">
            <div class="message-icon">
              <ha-icon icon="${isSent ? "mdi:arrow-up-bold" : "mdi:arrow-down-bold"}" 
                       style="color: ${isSent ? "var(--mesh-green)" : "var(--mesh-blue)"}"></ha-icon>
            </div>
            <div class="message-content">
              <div class="message-header">
                <span class="message-sender ${isSent ? "sent" : "received"}">${escapeHtml(senderName)}</span>
                ${timeStr ? `<span class="message-time">${timeStr}</span>` : ""}
              </div>
              <div class="message-text">${messageHtml}</div>
            </div>
          </div>
        `;
      })
      .join("");

    container.innerHTML = `<div class="messages-list">${messagesHtml}</div>`;

    // Add listeners for links and long press
    this._setupLinkListeners();
    this._setupCopyListeners();
  }

  // ---------- Translations ----------
  private _getTranslations(): LocalizeFunc {
    return makeLocalize(this._hass?.language ?? this._hass?.locale?.language ?? "en");
  }

  // ---------- Main render ----------
  private _render(): void {
    if (!this._hass || !this._config) return;
    const t = this._getTranslations();
    const channels = this._getChannels();
    const contacts = this._getContacts();

    if (channels.length === 0 && contacts.length === 0) {
      this.shadowRoot!.innerHTML = `<style>${STYLES}${MESSAGE_STYLES}</style>
        <ha-card>
          <div class="empty-messages">
            <ha-icon icon="mdi:message-alert" style="--mdc-icon-size: 36px;"></ha-icon><br>
            ${t("message-card.no_channels")}
          </div>
          <div class="author-info">${t("message-card.author")}</div>
        </ha-card>`;
      this._initialized = true;
      return;
    }

    this.shadowRoot!.innerHTML = `<style>${STYLES}${MESSAGE_STYLES}</style>
      <ha-card>
        <div class="section-header">
          <ha-icon icon="mdi:message-text"></ha-icon>
          <span>${t("message-card.send_message")}</span>
        </div>

        <div class="radio-group">
          <label class="radio-option ${this._messageType === "channel" ? "selected" : ""}">
            <input type="radio" name="message-type" value="channel" ${this._messageType === "channel" ? "checked" : ""}>
            <ha-icon icon="mdi:pound"></ha-icon>
            <span>${t("message-card.channel")}</span>
          </label>
          <label class="radio-option ${this._messageType === "contact" ? "selected" : ""}">
            <input type="radio" name="message-type" value="contact" ${this._messageType === "contact" ? "checked" : ""}>
            <ha-icon icon="mdi:account"></ha-icon>
            <span>${t("message-card.contact")}</span>
          </label>
        </div>

        <div class="input-group">
          <div class="label" id="target-label">
            <ha-icon icon="mdi:chat"></ha-icon>
            <span>${this._messageType === "channel" ? t("message-card.select_channel") : t("message-card.select_contact")}</span>
          </div>
          <select id="target-select">
            <option value="">${t("message-card.select_prompt")}</option>
          </select>
        </div>

        <div class="input-group">
          <div class="label">
            <ha-icon icon="mdi:message"></ha-icon>
            <span>${t("message-card.message_placeholder")}</span>
          </div>
          <textarea id="message-input" rows="3" placeholder="${t("message-card.message_placeholder")}"></textarea>
        </div>

        <button id="send-btn">
          <ha-icon icon="mdi:send"></ha-icon>
          ${t("message-card.send")}
        </button>

        <div id="status" class="status"></div>

        <div class="messages-section">
          <div class="messages-header">
            <ha-icon icon="mdi:history"></ha-icon>
            <span>${t("message-card.message_history")} ${t("message-card.today")}</span>
            <ha-icon icon="mdi:refresh" class="refresh-btn" id="refresh-history"></ha-icon>
          </div>
          <div id="messages-container">
            <div class="empty-messages">
              ${t("message-card.select_channel")}...
            </div>
          </div>
        </div>
      </ha-card>`;

    const radioChannel = this.shadowRoot!.querySelector('input[value="channel"]');
    const radioContact = this.shadowRoot!.querySelector('input[value="contact"]');
    if (radioChannel) radioChannel.addEventListener("change", (e) => this._onTypeChange(e));
    if (radioContact) radioContact.addEventListener("change", (e) => this._onTypeChange(e));

    const sendBtn = this.shadowRoot!.querySelector("#send-btn");
    if (sendBtn) sendBtn.addEventListener("click", () => this._sendMessage());

    const refreshBtn = this.shadowRoot!.querySelector("#refresh-history");
    if (refreshBtn) refreshBtn.addEventListener("click", () => this._loadMessages());

    const targetSelect = this.shadowRoot!.querySelector("#target-select");
    if (targetSelect) targetSelect.addEventListener("change", () => this._fullUpdate());

    const updateRadioStyles = () => {
      const opts = this.shadowRoot!.querySelectorAll(".radio-option");
      opts.forEach((opt) => opt.classList.remove("selected"));
      const activeLabel = this.shadowRoot!
        .querySelector(`.radio-option input[value="${this._messageType}"]`)
        ?.closest(".radio-option");
      if (activeLabel) activeLabel.classList.add("selected");
    };
    if (radioChannel) radioChannel.addEventListener("change", updateRadioStyles);
    if (radioContact) radioContact.addEventListener("change", updateRadioStyles);

    this._updateTargetListOnly();
    this._fullUpdate();
    this._initialized = true;
  }

  getCardSize(): number {
    return 7;
  }
}

// ---------- Editor ----------
export class MeshcoreMessageCardEditor extends HTMLElement {
  private _config?: MeshcoreMessageCardConfig;

  setConfig(config: MeshcoreMessageCardConfig): void {
    this._config = { ...config };
  }

  set hass(_hass: HomeAssistant) {}

  connectedCallback(): void {
    while (this.lastChild) this.removeChild(this.lastChild);
    const msg = document.createElement("p");
    msg.style.cssText = "margin: 16px; color: var(--secondary-text-color); font-size: 14px;";
    msg.textContent = "The message card automatically discovers channels and contacts. No manual configuration needed.";
    this.appendChild(msg);
  }
}