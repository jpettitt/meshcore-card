# MeshCore Card

A custom [Home Assistant](https://www.home-assistant.io/) Lovelace card that displays hub and node statistics from the [MeshCore](https://meshcore.co.uk) mesh radio network integration.

![MeshCore Card screenshot](screenshot.png)

---

## Requirements

- **Home Assistant** 2023.x or later
- **[MeshCore Integration](https://github.com/fgravato/meshcore-hass)** — must be installed and configured. The card reads hub and node data directly from the devices and entities registered by this integration.

---

## Installation

### HACS (recommended)

1. Open **HACS** → **Frontend**
2. Click the ⋮ menu → **Custom repositories**
3. Add `https://github.com/jpettitt/meshcore-card` with category **Dashboard**
4. Search for **MeshCore Card** and install it
5. Reload your browser

### Manual

1. Download `meshcore-card.js` from this repository
2. Copy it to `config/www/meshcore-card.js`
3. In Home Assistant go to **Settings → Dashboards → Resources** and add `/local/meshcore-card.js` as a JavaScript module
4. Reload your browser

---

## Usage

Add the card to a dashboard via the UI card picker (search for **MeshCore**), or add it manually in YAML:

```yaml
type: custom:meshcore-card
```

The card automatically discovers all MeshCore hubs and remote nodes — no manual entity configuration needed.

---

## Features

- **Hub status** — online/offline indicator, node count, hardware model, firmware version
- **RF parameters** — frequency, bandwidth, spreading factor, TX power
- **MQTT broker status** — per-broker connection pills (green = connected, red = disconnected)
- **Hub location** — coordinates chip with a direct link to the [MeshCore Analyzer map](https://analyzer.letsmesh.net)
- **Remote nodes** — automatically discovered from the HA device registry
  - Online/offline status based on `request_successes`
  - RSSI and SNR badges
  - Battery percentage bar with voltage
  - Routing path
  - **Repeater nodes**: TX/RX airtime bars, noise floor, uptime, TX/RX rate, sent/received/relayed traffic counts
  - **Sensor nodes**: temperature, humidity, illuminance, pressure
  - Location map links for nodes with GPS coordinates
- **Throttled rendering** — card updates at most once every 10 seconds to avoid excessive redraws

---

## Configuration

The card editor lets you toggle individual hubs and nodes on or off. All options are also available in YAML:

```yaml
type: custom:meshcore-card
hubs:
  55733c: true   # show this hub (default)
  aabbcc: false  # hide this hub
nodes:
  JPP: true
  YubaMonitor: false
```

---

## License

MIT
