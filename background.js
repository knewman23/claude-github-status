const POLL_MINUTES = 2;

// Both status pages are Atlassian Statuspage, so one parser covers them.
const SERVICES = [
  {
    key: "claude",
    label: "Claude",
    api: "https://status.claude.com/api/v2/summary.json",
    page: "https://status.claude.com/",
  },
  {
    key: "github",
    label: "GitHub",
    api: "https://www.githubstatus.com/api/v2/summary.json",
    page: "https://www.githubstatus.com/",
    // GitHub reports ~10 components; these are the ones that block work.
    // Anything outside the list still shows up if it goes non-operational.
    components: ["Git Operations", "API Requests", "Actions", "Packages", "Webhooks"],
  },
];

// Statuspage indicator -> how we present it. `rank` picks the winner when the
// two services disagree.
const INDICATORS = {
  none:        { rank: 0, color: "#EB7247", label: "All Systems Operational" },
  maintenance: { rank: 1, color: "#5B8FD9", label: "Under Maintenance" },
  unknown:     { rank: 2, color: "#8A8A8A", label: "Status Unavailable" },
  minor:       { rank: 3, color: "#E8A33D", label: "Minor Issue" },
  major:       { rank: 4, color: "#DC5A3C", label: "Major Outage" },
  critical:    { rank: 5, color: "#B4231C", label: "Critical Outage" },
};

const style = (indicator) => INDICATORS[indicator] || INDICATORS.unknown;

/* ---------------------------------------------------------------- icon ---- */

// The artwork's coral spokes, measured off icons/mark.png. Pixels matching this
// hue get retinted to the current status colour; the octocat is left alone.
const CORAL = { h: 0.0437, s: 0.6979, v: 0.9216 };
const CORAL_HUE_RANGE = [0.02, 0.12];
const CORAL_MIN_SAT = 0.35;

let markBitmap = null;
const iconCache = new Map(); // `${size}:${color}` -> ImageData

async function mark() {
  if (!markBitmap) {
    const res = await fetch(chrome.runtime.getURL("icons/mark.png"));
    markBitmap = await createImageBitmap(await res.blob());
  }
  return markBitmap;
}

function hexToHsv(hex) {
  const n = parseInt(hex.slice(1), 16);
  return rgbToHsv((n >> 16) & 255, (n >> 8) & 255, n & 255);
}

function rgbToHsv(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  let h = 0;
  if (d) {
    if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
    else if (max === g) h = ((b - r) / d + 2) / 6;
    else h = ((r - g) / d + 4) / 6;
  }
  return { h, s: max ? d / max : 0, v: max };
}

function hsvToRgb(h, s, v) {
  const i = Math.floor(h * 6), f = h * 6 - i;
  const p = v * (1 - s), q = v * (1 - f * s), t = v * (1 - (1 - f) * s);
  const [r, g, b] = [
    [v, t, p], [q, v, p], [p, v, t], [p, q, v], [t, p, v], [v, p, q],
  ][i % 6];
  return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
}

// Swap the spokes' hue/saturation for the target colour, keeping each pixel's
// own brightness so the sticker outline and shading survive.
function retint(data, hex) {
  const target = hexToHsv(hex);
  const vScale = target.v / CORAL.v;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] === 0) continue;
    const { h, s, v } = rgbToHsv(data[i], data[i + 1], data[i + 2]);
    if (s < CORAL_MIN_SAT || h < CORAL_HUE_RANGE[0] || h > CORAL_HUE_RANGE[1]) continue;
    const [r, g, b] = hsvToRgb(target.h, target.s, Math.min(1, v * vScale));
    data[i] = r; data[i + 1] = g; data[i + 2] = b;
  }
}

async function drawMark(size, color) {
  const cacheKey = `${size}:${color}`;
  if (iconCache.has(cacheKey)) return iconCache.get(cacheKey);

  const canvas = new OffscreenCanvas(size, size);
  const ctx = canvas.getContext("2d");
  ctx.drawImage(await mark(), 0, 0, size, size);
  const img = ctx.getImageData(0, 0, size, size);
  // Operational is already the artwork's own colour — no pixel work needed.
  if (color !== INDICATORS.none.color) retint(img.data, color);

  iconCache.set(cacheKey, img);
  return img;
}

/* --------------------------------------------------------------- paint ---- */

// Worst status across every service drives the icon; the badge says which one.
function summarise(services) {
  let worst = "none";
  const unhappy = [];
  for (const svc of SERVICES) {
    const indicator = services[svc.key]?.indicator || "unknown";
    if (style(indicator).rank > style(worst).rank) worst = indicator;
    if (indicator !== "none") unhappy.push(svc);
  }
  const badge =
    unhappy.length === 0 ? "" :
    unhappy.length === 1 ? unhappy[0].label[0] :
    "!!";
  const title = SERVICES
    .map((s) => `${s.label}: ${services[s.key]?.description || "unknown"}`)
    .join("\n");
  return { worst, badge, title };
}

async function paint(services) {
  const { worst, badge, title } = summarise(services);
  const color = style(worst).color;

  await chrome.action.setIcon({
    imageData: {
      16: await drawMark(16, color),
      32: await drawMark(32, color),
      48: await drawMark(48, color),
    },
  });
  await chrome.action.setBadgeText({ text: badge });
  await chrome.action.setBadgeBackgroundColor({ color });
  await chrome.action.setTitle({ title });
}

/* --------------------------------------------------------------- fetch ---- */

// Statuspage rolls up components, not incidents: a service can report an
// unresolved critical incident while its indicator still says "none" because the
// incident isn't attached to a component. Escalate so the icon reflects it.
const RESOLVED = new Set(["resolved", "postmortem"]);

function escalate(indicator, incidents) {
  // Only fill the blind spot. If the page already reports a problem, trust its
  // own rollup rather than second-guessing it from raw incident impact.
  if (indicator !== "none") return indicator;
  let worst = indicator;
  for (const i of incidents) {
    if (RESOLVED.has(i.status)) continue;
    const impact = INDICATORS[i.impact] ? i.impact : "minor";
    if (style(impact).rank > style(worst).rank) worst = impact;
  }
  return worst;
}

function parse(svc, data) {
  const allowed = svc.components;
  const incidents = (data.incidents || []).map((i) => ({
    name: i.name,
    status: i.status,
    impact: i.impact,
    shortlink: i.shortlink,
    updated_at: i.updated_at,
    latest: i.incident_updates?.[0]?.body || "",
  }));

  const reported = data.status?.indicator || "unknown";
  const indicator = escalate(reported, incidents);
  return {
    indicator,
    reported,
    // Prefer the status page's own wording. When we escalated past it the
    // components are all green, so "Critical Outage" would read as a
    // contradiction — say what's actually true instead.
    description: indicator === reported
      ? data.status?.description || style(indicator).label
      : "Open Incident",
    components: (data.components || [])
      .filter((c) => !c.group)
      .filter((c) => !allowed || allowed.includes(c.name) || c.status !== "operational")
      .map((c) => ({ name: c.name, status: c.status })),
    incidents,
    scheduled: (data.scheduled_maintenances || []).map((m) => ({
      name: m.name,
      scheduled_for: m.scheduled_for,
    })),
  };
}

async function fetchService(svc) {
  try {
    const res = await fetch(svc.api, { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return parse(svc, await res.json());
  } catch (err) {
    return {
      indicator: "unknown",
      description: `Couldn't reach status page (${err.message})`,
      components: [],
      incidents: [],
      scheduled: [],
    };
  }
}

async function refresh() {
  const results = await Promise.all(SERVICES.map(fetchService));
  const services = {};
  SERVICES.forEach((svc, i) => {
    services[svc.key] = { label: svc.label, page: svc.page, ...results[i] };
  });

  await chrome.storage.local.set({
    snapshot: { services, order: SERVICES.map((s) => s.key), fetchedAt: Date.now() },
  });
  await paint(services);
}

chrome.runtime.onInstalled.addListener(() => {
  chrome.alarms.create("poll", { periodInMinutes: POLL_MINUTES, delayInMinutes: 0 });
  refresh();
});
chrome.runtime.onStartup.addListener(refresh);
chrome.alarms.onAlarm.addListener((a) => a.name === "poll" && refresh());
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type === "refresh") {
    refresh().then(() => sendResponse({ ok: true }));
    return true;
  }
});
