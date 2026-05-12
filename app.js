const BUS_STOP_ID = "44691";
const BUS_NUMBER = "972";
const API_URL = `https://arrivelah2.busrouter.sg/?id=${BUS_STOP_ID}`;
const REFRESH_MS = 15000;
const BUFFER_MINUTES = 1;
const SOON_WINDOW_MINUTES = 3;

const elements = {
  refreshButton: document.querySelector("#refreshButton"),
  decision: document.querySelector("#decision"),
  nextMinutes: document.querySelector("#nextMinutes"),
  nextMeta: document.querySelector("#nextMeta"),
  secondMinutes: document.querySelector("#secondMinutes"),
  secondMeta: document.querySelector("#secondMeta"),
  thirdMinutes: document.querySelector("#thirdMinutes"),
  thirdMeta: document.querySelector("#thirdMeta"),
  walkMinutes: document.querySelector("#walkMinutes"),
  walkOutput: document.querySelector("#walkOutput"),
  details: document.querySelector("#details"),
};

let latestService = null;
let refreshTimer = null;

function minutesFromDuration(durationMs) {
  if (typeof durationMs !== "number") return null;
  return Math.max(0, Math.ceil(durationMs / 60000));
}

function formatArrival(arrival) {
  const minutes = minutesFromDuration(arrival?.duration_ms);
  if (minutes === null) return { time: "--", meta: "No timing" };
  if (minutes === 0) return { time: "Arr", meta: metaText(arrival) };
  return { time: `${minutes}m`, meta: metaText(arrival) };
}

function metaText(arrival) {
  const parts = [];
  const load = {
    SEA: "Seats",
    SDA: "Standing",
    LSD: "Limited space",
  }[arrival?.load];
  const type = {
    SD: "Single deck",
    DD: "Double deck",
    BD: "Bendy",
  }[arrival?.type];

  if (load) parts.push(load);
  if (type) parts.push(type);
  if (arrival?.feature === "WAB") parts.push("Wheelchair access");

  return parts.length ? parts.join(" | ") : "Live estimate";
}

function setDecision(service) {
  const walkMinutes = Number(elements.walkMinutes.value);
  const nextMinutes = minutesFromDuration(service?.next?.duration_ms);
  elements.walkOutput.textContent = `${walkMinutes} min`;

  if (nextMinutes === null) {
    updateDecision("error", "No live timing", "Bus 972 is listed, but there is no next-bus estimate right now.");
    return;
  }

  const requiredMinutes = walkMinutes + BUFFER_MINUTES;
  if (nextMinutes <= requiredMinutes) {
    updateDecision("rush", "Rush now", `Next bus is ${nextMinutes === 0 ? "arriving" : `${nextMinutes} min away`}.`);
    return;
  }

  if (nextMinutes <= requiredMinutes + SOON_WINDOW_MINUTES) {
    updateDecision("soon", "Leave soon", `You have about ${nextMinutes - walkMinutes} min spare.`);
    return;
  }

  updateDecision("wait", "No need to rush", `Next bus is ${nextMinutes} min away.`);
}

function updateDecision(state, label, text) {
  elements.decision.className = `decision ${state}`;
  elements.decision.querySelector(".decision-label").textContent = label;
  elements.decision.querySelector(".decision-text").textContent = text;
}

function renderService(service) {
  latestService = service;
  const arrivals = [
    [service?.next, elements.nextMinutes, elements.nextMeta],
    [service?.next2 ?? service?.subsequent, elements.secondMinutes, elements.secondMeta],
    [service?.next3, elements.thirdMinutes, elements.thirdMeta],
  ];

  arrivals.forEach(([arrival, timeElement, metaElement]) => {
    const formatted = formatArrival(arrival);
    timeElement.textContent = formatted.time;
    metaElement.textContent = formatted.meta;
  });

  setDecision(service);
}

function setLoading(isLoading) {
  elements.refreshButton.disabled = isLoading;
  elements.refreshButton.setAttribute("aria-busy", String(isLoading));
}

async function fetchArrival() {
  setLoading(true);

  try {
    const response = await fetch(`${API_URL}&_=${Date.now()}`, { cache: "no-store" });
    if (!response.ok) throw new Error(`API returned ${response.status}`);

    const data = await response.json();
    const service = data.services?.find((item) => item.no === BUS_NUMBER);

    if (!service) {
      updateDecision("error", "Bus unavailable", `Bus ${BUS_NUMBER} is not in the live response for stop ${BUS_STOP_ID}.`);
      elements.details.textContent = `Last checked ${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}.`;
      return;
    }

    renderService(service);
    elements.details.textContent = `Last checked ${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}. Auto-refreshes every 15 seconds.`;
  } catch (error) {
    updateDecision("error", "Can't check now", "The live arrival API did not respond.");
    elements.details.textContent = error.message;
  } finally {
    setLoading(false);
  }
}

function scheduleRefresh() {
  window.clearInterval(refreshTimer);
  refreshTimer = window.setInterval(fetchArrival, REFRESH_MS);
}

elements.refreshButton.addEventListener("click", fetchArrival);
elements.walkMinutes.addEventListener("input", () => {
  elements.walkOutput.textContent = `${elements.walkMinutes.value} min`;
  if (latestService) setDecision(latestService);
});

fetchArrival();
scheduleRefresh();
