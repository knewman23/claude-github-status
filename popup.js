const INDICATOR_COLORS = {
  none: "#EB7247", minor: "#E8A33D", major: "#DC5A3C",
  critical: "#B4231C", maintenance: "#5B8FD9", unknown: "#8A8A8A",
};
const COMPONENT_COLORS = {
  operational: "#4CA36B",
  degraded_performance: "#E8A33D",
  partial_outage: "#DC5A3C",
  major_outage: "#B4231C",
  under_maintenance: "#5B8FD9",
};

function ago(ts) {
  const mins = Math.round((Date.now() - ts) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  return `${Math.round(mins / 60)}h ago`;
}

function esc(str) {
  return String(str).replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));
}

function incidentHtml(i) {
  const body = i.latest || (i.scheduled_for ? `Scheduled for ${new Date(i.scheduled_for).toLocaleString()}` : "");
  return `<div class="incident"><b>${esc(i.name)}</b><p>${esc(body)}</p></div>`;
}

function componentHtml(c) {
  return `<div class="row">
    <span class="dot" style="background:${COMPONENT_COLORS[c.status] || "#8A8A8A"}"></span>
    <span class="name">${esc(c.name)}</span>
    <span class="state">${esc(c.status.replace(/_/g, " "))}</span>
  </div>`;
}

function serviceHtml(s) {
  const live = [...(s.incidents || []), ...(s.scheduled || [])];
  const color = INDICATOR_COLORS[s.indicator] || INDICATOR_COLORS.unknown;
  return `<section class="service">
    <div class="service-head">
      <span class="dot" style="background:${color}"></span>
      <span class="service-name">${esc(s.label)}</span>
      <a href="${esc(s.page)}" target="_blank" rel="noreferrer">↗</a>
    </div>
    <div class="overall">${esc(s.description)}</div>
    ${live.length ? `<div class="incidents">${live.map(incidentHtml).join("")}</div>` : ""}
    <div class="rows">${(s.components || []).map(componentHtml).join("")}</div>
  </section>`;
}

function render(snapshot) {
  if (!snapshot) return;
  const { services, order = [], fetchedAt } = snapshot;
  document.getElementById("services").innerHTML =
    order.map((key) => services[key]).filter(Boolean).map(serviceHtml).join("");
  document.getElementById("stamp").textContent = `Checked ${ago(fetchedAt)}`;
}

async function load() {
  const { snapshot } = await chrome.storage.local.get("snapshot");
  render(snapshot);
}

document.getElementById("refresh").addEventListener("click", async () => {
  await chrome.runtime.sendMessage({ type: "refresh" });
  load();
});

load();
// Opening the popup is a good excuse to get fresh data.
chrome.runtime.sendMessage({ type: "refresh" }).then(load).catch(() => {});
