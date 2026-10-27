/*
 * Victron Shunt Card – Lovelace-Karte für Home Assistant
 * Zeigt Ladezustand (SOC), Strom, Spannung, Spannung der Starterbatterie
 * und den heutigen Verbrauch eines Victron SmartShunt / BMV an.
 */

const CARD_VERSION = "__VERSION__";

const DEFAULTS = {
  name: "Victron SmartShunt",
  show_diagram: true,
  soc_warning: 30,
  soc_critical: 15,
  starter_warning: 12.2,
  starter_critical: 11.8,
  max_current: 100,
};

// Fallback-Nachkommastellen, falls die Entität keine display_precision hat
const PRECISION = {
  soc: 0,
  voltage: 2,
  current: 1,
  power: 0,
  starter_voltage: 2,
  consumption_today: 2,
  time_remaining: 0,
};

const LABELS = {
  de: {
    soc: "Ladezustand",
    voltage: "Spannung",
    current: "Strom",
    starter_voltage: "Spannung",
    consumption_today: "Heute",
    battery: "Batterie",
    starter: "Starterbatterie",
    starter_short: "Starter",
    consumer: "Verbraucher",
    consumption: "Verbrauch",
    shunt: "SmartShunt",
    charging: "lädt",
    discharging: "entlädt",
    idle: "Ruhe",
    unavailable: "nicht verfügbar",
    remaining: "Restlaufzeit",
    warning: "niedrig",
    critical: "kritisch",
    starter_warning: "schwach",
    starter_critical: "kritisch",
  },
  en: {
    soc: "State of charge",
    voltage: "Voltage",
    current: "Current",
    starter_voltage: "Voltage",
    consumption_today: "Today",
    battery: "Battery",
    starter: "Starter battery",
    starter_short: "Starter",
    consumer: "Loads",
    consumption: "Consumption",
    shunt: "SmartShunt",
    charging: "charging",
    discharging: "discharging",
    idle: "idle",
    unavailable: "unavailable",
    remaining: "Time remaining",
    warning: "low",
    critical: "critical",
    starter_warning: "weak",
    starter_critical: "critical",
  },
};

// Batterie-Füllstand im Diagramm (Innenraum des Gehäuses)
const LEVEL = { y: 61, h: 73 };

// Flache Darstellung: Batterie → SmartShunt → Verbraucher, Aux → Starterbatterie
const DIAGRAM = `
  <svg class="diagram" viewBox="0 0 400 192" role="img" aria-hidden="true">
    <!-- Kabel (liegen hinter den Geräten) -->
    <g class="wire battery">
      <path class="base" d="M68 48 V40 H140"/>
      <path class="dash" d="M68 48 V40 H140"/>
    </g>
    <g class="wire consumer">
      <path class="base" d="M260 40 H350 V54"/>
      <path class="dash" d="M260 40 H350 V54"/>
    </g>
    <g class="wire starter">
      <path class="base" d="M235 142 V176 H300 V116 H336 V126"/>
    </g>

    <!-- Batterie -->
    <g class="batt" data-key="soc">
      <rect class="cap" x="27" y="48" width="10" height="7" rx="1"/>
      <rect class="cap" x="63" y="48" width="10" height="7" rx="1"/>
      <rect class="case" x="18" y="55" width="64" height="85" rx="6"/>
      <rect class="level" x="24" y="${LEVEL.y + LEVEL.h}" width="52" height="0" rx="2"/>
      <text x="50" y="104" class="soc-text">—</text>
      <text x="50" y="26" class="caption">{battery}</text>
    </g>

    <!-- SmartShunt -->
    <g class="shunt" data-key="current">
      <rect class="flange" x="112" y="70" width="176" height="36" rx="6"/>
      <circle class="hole" cx="119" cy="88" r="3"/>
      <circle class="hole" cx="281" cy="88" r="3"/>
      <rect class="brass" x="140" y="30" width="36" height="30" rx="2"/>
      <rect class="brass" x="224" y="30" width="36" height="30" rx="2"/>
      <rect class="washer" x="145" y="27" width="26" height="4" rx="1"/>
      <rect class="washer" x="229" y="27" width="26" height="4" rx="1"/>
      <rect class="bolt" x="149" y="17" width="18" height="11" rx="2"/>
      <rect class="bolt" x="233" y="17" width="18" height="11" rx="2"/>
      <rect class="body" x="124" y="54" width="152" height="92" rx="10"/>
      <rect class="label" x="132" y="62" width="136" height="58" rx="5"/>
      <text x="142" y="86" class="brand">SmartShunt</text>
      <text x="142" y="100" class="sub-brand">Battery Monitor</text>
      <circle class="led led-error" cx="236" cy="110" r="4"/>
      <circle class="led led-bt" cx="250" cy="110" r="4"/>
      <rect class="port" x="136" y="128" width="22" height="10" rx="1"/>
      <rect class="terminal" x="226" y="124" width="34" height="18" rx="2"/>
      <rect class="tab" x="230" y="128" width="10" height="5" rx="1"/>
      <rect class="tab" x="246" y="128" width="10" height="5" rx="1"/>
      <text x="200" y="10" class="caption device">{shunt}</text>
    </g>

    <!-- Verbraucher -->
    <g class="load" data-key="consumption_today">
      <rect class="box" x="322" y="54" width="56" height="46" rx="8"/>
      <circle class="bulb" cx="350" cy="73" r="10"/>
      <path class="bulb-base" d="M345 86 H355 M346 90 H354"/>
      <text x="350" y="26" class="caption">{consumer}</text>
    </g>

    <!-- Starterbatterie -->
    <g class="aux" data-key="starter_voltage">
      <rect class="cap" x="331" y="126" width="10" height="6" rx="1"/>
      <rect class="cap" x="359" y="126" width="10" height="6" rx="1"/>
      <rect class="case" x="322" y="132" width="56" height="40" rx="5"/>
      <text x="350" y="157" class="starter-text">—</text>
      <text x="350" y="188" class="caption">{starter_short}</text>
    </g>
  </svg>`;

class VictronShuntCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._config = undefined;
    this._hass = undefined;
  }

  static getConfigElement() {
    return document.createElement("victron-shunt-card-editor");
  }

  static getStubConfig(hass) {
    const sensors = Object.keys(hass?.states || {}).filter((id) => id.startsWith("sensor."));
    const find = (...words) =>
      sensors.find((id) => words.every((w) => id.includes(w))) || "";
    return {
      name: DEFAULTS.name,
      soc: find("shunt", "state_of_charge") || find("state_of_charge") || find("shunt", "soc"),
      voltage: find("shunt", "voltage") || find("battery", "voltage"),
      current: find("shunt", "current") || find("battery", "current"),
      starter_voltage: find("starter", "voltage") || find("aux", "voltage"),
      consumption_today: find("verbrauch", "heute") || find("consumption", "today") || find("consumed", "today"),
    };
  }

  setConfig(config) {
    if (!config) throw new Error("Ungültige Konfiguration");
    this._config = { ...DEFAULTS, ...config };
    this._build();
    if (this._hass) this._update();
  }

  set hass(hass) {
    const langChanged = this._lang && this._lang !== this._langOf(hass);
    this._hass = hass;
    if (!this._config) return;
    if (langChanged || !this._lang) this._build();
    this._update();
  }

  getCardSize() {
    return this._config?.show_diagram === false ? 4 : 7;
  }

  getGridOptions() {
    return { columns: 12, min_columns: 6, rows: "auto" };
  }

  // ---------------------------------------------------------------- helpers

  _langOf(hass) {
    return (hass?.locale?.language || hass?.language || "de").slice(0, 2);
  }

  _t(key) {
    return (LABELS[this._langOf(this._hass)] || LABELS.en)[key] ?? LABELS.en[key] ?? key;
  }

  _read(key) {
    const entityId = this._config[key];
    if (!entityId) return null;
    const stateObj = this._hass?.states?.[entityId];
    if (!stateObj) return { entityId, missing: true };
    const value = parseFloat(stateObj.state);
    const precision =
      this._hass?.entities?.[entityId]?.display_precision ?? PRECISION[key] ?? 1;
    return {
      entityId,
      stateObj,
      value: Number.isFinite(value) ? value : null,
      unit: stateObj.attributes.unit_of_measurement || "",
      precision,
    };
  }

  _format(value, precision) {
    if (value === null || value === undefined) return "—";
    const locale = this._hass?.locale?.language || this._hass?.language || "de";
    return value.toLocaleString(locale, {
      minimumFractionDigits: precision,
      maximumFractionDigits: precision,
    });
  }

  // Restlaufzeit in Minuten, Stunden oder Sekunden → "5 h 20 min"
  _formatDuration(data) {
    if (!data || data.value === null || data.value === undefined) return "";
    const factor = { s: 1 / 60, min: 1, h: 60, d: 1440 }[data.unit] ?? 1;
    const total = Math.round(data.value * factor);
    if (total <= 0) return "";
    const d = Math.floor(total / 1440);
    const h = Math.floor((total % 1440) / 60);
    const m = total % 60;
    if (d) return `${d} d ${h} h`;
    return h ? `${h} h ${m} min` : `${m} min`;
  }

  _moreInfo(entityId) {
    if (!entityId) return;
    const ev = new Event("hass-more-info", { bubbles: true, composed: true });
    ev.detail = { entityId };
    this.dispatchEvent(ev);
  }

  // ---------------------------------------------------------------- render

  _build() {
    const c = this._config;
    this._lang = this._langOf(this._hass);
    const val = (key, primary = false) => `
      <div class="val ${primary ? "primary" : ""}" data-key="${key}" tabindex="0" role="button">
        <div class="label">${this._t(key)}</div>
        <div class="value"><span class="num">—</span><span class="unit"></span></div>
        ${key === "soc" ? `<div class="bar"><div class="fill"></div></div>` : ""}
        <div class="sub"></div>
      </div>`;
    const diagram = DIAGRAM.replace(/\{(\w+)\}/g, (_, k) => escapeHtml(this._t(k)));

    this.shadowRoot.innerHTML = `
      <style>${STYLES}</style>
      <ha-card>
        ${c.name ? `<div class="header">${escapeHtml(c.name)}</div>` : ""}
        ${c.show_diagram !== false ? diagram : ""}
        <div class="groups">
          <section class="group battery">
            <div class="group-head"><ha-icon class="bat-icon" icon="mdi:battery"></ha-icon>${this._t("battery")}</div>
            ${val("soc", true)}
            <div class="pair">${val("voltage")}${val("current")}</div>
          </section>
          <section class="group starter">
            <div class="group-head"><ha-icon class="starter-icon" icon="mdi:car-battery"></ha-icon>${this._t("starter")}</div>
            ${val("starter_voltage", true)}
          </section>
          <section class="group consumer">
            <div class="group-head"><ha-icon icon="mdi:lightbulb-on-outline"></ha-icon>${this._t("consumption")}</div>
            ${val("consumption_today", true)}
          </section>
        </div>
      </ha-card>`;

    this.shadowRoot.querySelectorAll("[data-key]").forEach((el) => {
      const open = () => this._moreInfo(this._config[el.dataset.key]);
      el.addEventListener("click", open);
      el.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") open();
      });
    });
  }

  _setVal(key, data, { sub = "" } = {}) {
    const el = this.shadowRoot.querySelector(`.val[data-key="${key}"]`);
    if (!el) return;
    el.classList.toggle("hidden", data === null);
    if (data === null) return;
    const unavailable = data.missing || data.value === null;
    el.classList.toggle("unavailable", unavailable);
    el.querySelector(".num").textContent = unavailable ? "—" : this._format(data.value, data.precision);
    el.querySelector(".unit").textContent = unavailable ? "" : data.unit;
    el.querySelector(".sub").textContent = unavailable ? this._t("unavailable") : sub;
  }

  _update() {
    const root = this.shadowRoot;
    if (!root.querySelector("ha-card")) return;
    const c = this._config;
    const soc = this._read("soc");
    const volt = this._read("voltage");
    const curr = this._read("current");
    const power = this._read("power");
    const starter = this._read("starter_voltage");
    const today = this._read("consumption_today");
    const remaining = this._read("time_remaining");

    // Strom: positiv = Laden, negativ = Entladen (Victron-Konvention)
    const i = curr?.value ?? null;
    const charging = i !== null && i > 0.05;
    const discharging = i !== null && i < -0.05;
    const state = i === null ? "" : charging ? this._t("charging") : discharging ? this._t("discharging") : this._t("idle");

    // Leistung: Sensor oder U × I
    let watts = power?.value ?? null;
    if (watts === null && !power && volt?.value != null && i !== null) watts = volt.value * i;
    const wattsText = watts === null ? "" : `${this._format(Math.abs(watts), 0)} W · `;
    this._setVal("current", curr, { sub: i === null ? "" : wattsText + state });
    this._setVal("voltage", volt);

    // SOC mit Schwellwerten
    const s = soc?.value ?? null;
    let socLevel = "ok";
    if (s !== null) {
      if (s <= Number(c.soc_critical)) socLevel = "critical";
      else if (s <= Number(c.soc_warning)) socLevel = "warning";
    }
    const duration = discharging ? this._formatDuration(remaining) : "";
    const socSub = [socLevel === "ok" ? "" : this._t(socLevel), duration && `${this._t("remaining")} ${duration}`]
      .filter(Boolean)
      .join(" · ");
    this._setVal("soc", soc, { sub: socSub });
    const pct = s === null ? 0 : Math.min(Math.max(s, 0), 100);
    const fill = root.querySelector(".val[data-key='soc'] .fill");
    if (fill) fill.style.width = `${pct}%`;
    root.querySelector(".group.battery").dataset.level = socLevel;

    // Starterbatterie mit Schwellwerten
    const sv = starter?.value ?? null;
    let starterLevel = "ok";
    if (sv !== null) {
      if (sv <= Number(c.starter_critical)) starterLevel = "critical";
      else if (sv <= Number(c.starter_warning)) starterLevel = "warning";
    }
    this._setVal("starter_voltage", starter, {
      sub: starterLevel === "ok" ? "" : this._t(`starter_${starterLevel}`),
    });
    root.querySelector(".group.starter").dataset.level = starterLevel;
    root.querySelector(".starter-icon").setAttribute("icon", starterLevel === "ok" ? "mdi:car-battery" : "mdi:car-battery-alert");

    this._setVal("consumption_today", today);

    // Gruppen ohne konfigurierte Werte ausblenden
    root.querySelectorAll(".group").forEach((g) => {
      g.classList.toggle("hidden", !g.querySelector(".val:not(.hidden)"));
    });

    const step = Math.min(Math.round(pct / 10) * 10, 100);
    let batIcon = s === null ? "mdi:battery-unknown" : step === 100 ? "mdi:battery" : step === 0 ? "mdi:battery-outline" : `mdi:battery-${step}`;
    if (charging && s !== null) batIcon = step === 0 ? "mdi:battery-charging-outline" : `mdi:battery-charging-${step}`;
    root.querySelector(".bat-icon").setAttribute("icon", batIcon);

    // Grafik: Füllstand, Energiefluss, LEDs
    const svg = root.querySelector(".diagram");
    if (!svg) return;
    const level = svg.querySelector(".level");
    const h = (LEVEL.h * pct) / 100;
    level.setAttribute("y", (LEVEL.y + LEVEL.h - h).toFixed(1));
    level.setAttribute("height", h.toFixed(1));
    svg.querySelector(".batt").dataset.level = socLevel;
    svg.querySelector(".soc-text").textContent = s === null ? "—" : `${this._format(s, 0)} %`;

    const active = charging || discharging;
    const ratio = Math.min(Math.abs(i || 0) / (Number(c.max_current) || 100), 1);
    const speed = `${(3 - ratio * 2.4).toFixed(2)}s`;
    svg.querySelectorAll(".wire.battery, .wire.consumer").forEach((w) => {
      w.classList.toggle("active", active);
      w.classList.toggle("reverse", charging);
      w.style.setProperty("--speed", speed);
    });
    svg.querySelector(".load").classList.toggle("on", discharging);

    svg.querySelector(".wire.starter").classList.toggle("active", sv !== null);
    svg.querySelector(".aux").dataset.level = starterLevel;
    svg.querySelector(".starter-text").textContent = sv === null ? "—" : `${this._format(sv, 1)} V`;

    svg.querySelector(".led-bt").classList.toggle("on", s !== null || i !== null);
    svg.querySelector(".led-error").classList.toggle("on", socLevel === "critical" || starterLevel === "critical");
  }
}

// -------------------------------------------------------------------- editor

const EDITOR_SCHEMA = [
  { name: "name", selector: { text: {} } },
  { name: "soc", selector: { entity: { domain: "sensor" } } },
  { name: "voltage", selector: { entity: { domain: "sensor" } } },
  { name: "current", selector: { entity: { domain: "sensor" } } },
  { name: "starter_voltage", selector: { entity: { domain: "sensor" } } },
  { name: "consumption_today", selector: { entity: { domain: "sensor" } } },
  { name: "power", selector: { entity: { domain: "sensor" } } },
  { name: "time_remaining", selector: { entity: { domain: "sensor" } } },
  {
    type: "grid",
    name: "",
    schema: [
      { name: "soc_warning", selector: { number: { min: 0, max: 100, unit_of_measurement: "%", mode: "box" } } },
      { name: "soc_critical", selector: { number: { min: 0, max: 100, unit_of_measurement: "%", mode: "box" } } },
      { name: "starter_warning", selector: { number: { min: 0, max: 60, step: 0.1, unit_of_measurement: "V", mode: "box" } } },
      { name: "starter_critical", selector: { number: { min: 0, max: 60, step: 0.1, unit_of_measurement: "V", mode: "box" } } },
      { name: "max_current", selector: { number: { min: 1, max: 1000, unit_of_measurement: "A", mode: "box" } } },
    ],
  },
  { name: "show_diagram", selector: { boolean: {} } },
];

const EDITOR_LABELS = {
  name: "Titel",
  soc: "Ladezustand (SOC)",
  voltage: "Spannung Batterie",
  current: "Strom Batterie",
  starter_voltage: "Spannung Starterbatterie (Aux)",
  consumption_today: "Verbrauch heute",
  power: "Leistung (optional, sonst U × I)",
  time_remaining: "Restlaufzeit (optional)",
  soc_warning: "SOC Warnung ab",
  soc_critical: "SOC kritisch ab",
  starter_warning: "Starter Warnung ab",
  starter_critical: "Starter kritisch ab",
  max_current: "Max. Strom (Animation)",
  show_diagram: "Grafik anzeigen",
};

class VictronShuntCardEditor extends HTMLElement {
  setConfig(config) {
    this._config = { ...DEFAULTS, ...config };
    this._render();
  }

  set hass(hass) {
    this._hass = hass;
    if (this._form) this._form.hass = hass;
  }

  _render() {
    if (!this._form) {
      this._form = document.createElement("ha-form");
      this._form.computeLabel = (s) => EDITOR_LABELS[s.name] ?? s.name;
      this._form.addEventListener("value-changed", (ev) => {
        const config = { ...ev.detail.value };
        // leere Felder nicht in die YAML schreiben
        Object.keys(config).forEach((k) => {
          if (config[k] === "" || config[k] === undefined) delete config[k];
        });
        this.dispatchEvent(
          new CustomEvent("config-changed", { detail: { config }, bubbles: true, composed: true })
        );
      });
      this.appendChild(this._form);
    }
    this._form.hass = this._hass;
    this._form.schema = EDITOR_SCHEMA;
    this._form.data = this._config;
  }
}

// -------------------------------------------------------------------- styles

const STYLES = `
  :host {
    /* per card-mod überschreibbar */
    --shunt-battery: #2f8fdd;
    --shunt-starter: #26a69a;
    --shunt-consumer: #ab47bc;
    --shunt-device: #1f9ae0;
    --shunt-warn: var(--warning-color, #ff8a00);
    --shunt-crit: var(--error-color, #db4437);
    --shunt-muted: var(--divider-color, rgba(127,127,127,0.3));
  }
  ha-card { display: block; overflow: hidden; padding-bottom: 16px; container-type: inline-size; }
  .header {
    padding: 16px 16px 0; font-size: 1.25em; font-weight: 500;
    color: var(--primary-text-color);
  }

  /* ---- Grafik ---- */
  .diagram { display: block; width: 100%; max-width: 440px; margin: 8px auto 0; padding: 0 12px; box-sizing: border-box; }
  .diagram [data-key] { cursor: pointer; }
  .caption { font-size: 12px; font-weight: 600; text-anchor: middle; }
  .caption.device { fill: var(--secondary-text-color); font-weight: 500; }

  .batt { --c: var(--shunt-battery); }
  .batt[data-level="warning"] { --c: var(--shunt-warn); }
  .batt[data-level="critical"] { --c: var(--shunt-crit); }
  .aux { --c: var(--shunt-starter); }
  .aux[data-level="warning"] { --c: var(--shunt-warn); }
  .aux[data-level="critical"] { --c: var(--shunt-crit); }
  .batt .caption, .aux .caption { fill: var(--c); }
  .batt .case, .aux .case { fill: color-mix(in srgb, var(--c) 14%, transparent); stroke: var(--c); stroke-width: 2.5; }
  .batt .cap, .aux .cap { fill: var(--c); }
  .level { fill: color-mix(in srgb, var(--c) 55%, transparent); transition: y .6s, height .6s; }
  .soc-text { fill: var(--primary-text-color); font-size: 15px; font-weight: 700; text-anchor: middle; }
  .starter-text { fill: var(--primary-text-color); font-size: 12px; font-weight: 700; text-anchor: middle; }

  .flange { fill: #3c4043; }
  .hole { fill: var(--card-background-color, #fff); }
  .brass { fill: #c9a24a; }
  .washer { fill: #b8bcc0; }
  .bolt { fill: #d8b65e; stroke: #a8852f; stroke-width: 1; }
  .body { fill: #1b1d1f; }
  .label { fill: var(--shunt-device); }
  .brand { fill: #fff; font-size: 15px; font-weight: 700; }
  .sub-brand { fill: rgba(255,255,255,.85); font-size: 9px; font-weight: 600; }
  .led { fill: rgba(255,255,255,.55); transition: fill .3s; }
  .led-bt.on { fill: #0b3d91; }
  .led-error.on { fill: var(--shunt-crit); animation: blink 1s steps(2) infinite; }
  .port { fill: #d9d9d9; }
  .terminal { fill: #2bb24c; }
  .tab { fill: #f39c12; }

  .load .caption { fill: var(--shunt-consumer); }
  .load .box { fill: color-mix(in srgb, var(--shunt-consumer) 14%, transparent); stroke: var(--shunt-consumer); stroke-width: 2.5; }
  .bulb { fill: none; stroke: var(--shunt-consumer); stroke-width: 2.5; transition: fill .3s; }
  .load.on .bulb { fill: color-mix(in srgb, var(--shunt-consumer) 60%, transparent); }
  .bulb-base { stroke: var(--shunt-consumer); stroke-width: 2.5; stroke-linecap: round; }

  .wire path { fill: none; stroke-width: 3.5; stroke-linejoin: round; stroke-linecap: round; }
  .wire .base { stroke: var(--shunt-muted); }
  .wire.active.battery .base { stroke: color-mix(in srgb, var(--shunt-battery) 35%, transparent); }
  .wire.active.consumer .base { stroke: color-mix(in srgb, var(--shunt-consumer) 35%, transparent); }
  .wire.active.starter .base { stroke: color-mix(in srgb, var(--shunt-starter) 55%, transparent); stroke-width: 2.5; }
  .wire .dash { opacity: 0; stroke-dasharray: 3 11; }
  .wire.active .dash { opacity: 1; animation: flow var(--speed, 2s) linear infinite; }
  .wire.battery .dash { stroke: var(--shunt-battery); }
  .wire.consumer .dash { stroke: var(--shunt-consumer); }
  .wire.reverse .dash { animation-direction: reverse; }
  @keyframes flow { to { stroke-dashoffset: -14; } }
  @keyframes blink { 50% { fill: transparent; } }
  @media (prefers-reduced-motion: reduce) {
    .wire.active .dash { animation: none; stroke-dasharray: none; }
  }

  /* ---- Werte ---- */
  .groups {
    display: grid; grid-template-columns: 1.4fr 1fr 1fr;
    gap: 8px; padding: 12px 16px 0;
  }
  @container (max-width: 520px) {
    .groups { grid-template-columns: 1fr 1fr; }
    .group.battery { grid-column: 1 / -1; }
  }
  .group {
    --c: var(--shunt-battery);
    display: flex; flex-direction: column; gap: 6px; min-width: 0;
    padding: 10px 12px 12px;
    border-radius: var(--ha-card-border-radius, 12px);
    background: color-mix(in srgb, var(--c) 10%, var(--card-background-color, transparent));
    border-top: 4px solid var(--c);
  }
  .group.hidden { display: none; }
  .group.starter { --c: var(--shunt-starter); }
  .group.consumer { --c: var(--shunt-consumer); }
  .group[data-level="warning"] { --c: var(--shunt-warn); }
  .group[data-level="critical"] { --c: var(--shunt-crit); }
  .group-head {
    display: flex; align-items: center; gap: 6px;
    font-size: 0.85em; font-weight: 600; color: var(--c);
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  }
  .group-head ha-icon { --mdc-icon-size: 20px; flex: none; }
  .pair { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; }
  .val { cursor: pointer; min-width: 0; border-radius: 6px; }
  .val:focus-visible { outline: 2px solid var(--primary-color); outline-offset: 2px; }
  .val.hidden { display: none; }
  .label { font-size: 0.75em; color: var(--secondary-text-color); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .value { color: var(--primary-text-color); white-space: nowrap; }
  .num { font-size: 1.15em; font-weight: 600; font-variant-numeric: tabular-nums; }
  .primary .num { font-size: 1.75em; line-height: 1.15; }
  .unit { margin-left: 3px; font-size: 0.85em; color: var(--secondary-text-color); }
  .val.unavailable .num { color: var(--disabled-text-color, #999); }
  .bar { height: 6px; margin: 4px 0 2px; border-radius: 3px; background: color-mix(in srgb, var(--c) 20%, transparent); overflow: hidden; }
  .fill { height: 100%; width: 0; border-radius: 3px; background: var(--c); transition: width .6s; }
  .val.unavailable .bar { display: none; }
  .sub { font-size: 0.75em; color: var(--secondary-text-color); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .sub:empty { display: none; }
  .group:not([data-level="ok"]) .primary .sub { color: var(--c); font-weight: 600; }
`;

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));
}

// -------------------------------------------------------------------- register

if (!customElements.get("victron-shunt-card")) {
  customElements.define("victron-shunt-card", VictronShuntCard);
}
if (!customElements.get("victron-shunt-card-editor")) {
  customElements.define("victron-shunt-card-editor", VictronShuntCardEditor);
}

window.customCards = window.customCards || [];
if (!window.customCards.some((c) => c.type === "victron-shunt-card")) {
  window.customCards.push({
    type: "victron-shunt-card",
    name: "Victron Shunt Card",
    description: "Leistungsdaten eines Victron SmartShunt (SOC, Strom, Spannung, Starterbatterie, Verbrauch heute).",
    preview: true,
    documentationURL: "https://github.com/abcklaus/victron-shunt-card",
  });
}

console.info(
  `%c VICTRON-SHUNT-CARD %c v${CARD_VERSION} `,
  "color:#fff;background:#1f9ae0;font-weight:700;",
  "color:#1f9ae0;background:#fff;font-weight:700;"
);
