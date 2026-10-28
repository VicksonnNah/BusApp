const ARRIVAL_API_URL = "https://arrivelah2.busrouter.sg/";
const STOP_CATALOG_URL = "https://busrouter.sg/data/2/bus-stops.json";
const DEFAULT_STOP_ID = "44691";
const STOP_STORAGE_KEY = "rush-for-972-stop-code";
const REFRESH_MS = 15000;
const BUFFER_MINUTES = 1;
const SOON_WINDOW_MINUTES = 3;

const elements = {
  stopForm: document.querySelector("#stopForm"),
  stopCode: document.querySelector("#stopCode"),
  stopCodeLabel: document.querySelector("#stopCodeLabel"),
  stopName: document.querySelector("#stopName"),
  busSelect: document.querySelector("#busSelect"),
  busNumber: document.querySelector("#busNumber"),
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
let availableServices = [];
let refreshTimer = null;
let stopCode = loadStopCode();
let stopCatalogPromise = null;

function loadStopCode() {
  try {
    return localStorage.getItem(STOP_STORAGE_KEY) || DEFAULT_STOP_ID;
  } catch {
    return DEFAULT_STOP_ID;
  }
}

function stopNameFromRecord(record) {
  const description = record?.Description ?? record?.description ?? record?.name;
  const road = record?.RoadName ?? record?.road_name;
  return [description, road].filter(Boolean).join(", ");
}

async function lookupStopName(code, arrivalData) {
  const apiName = arrivalData?.name ?? arrivalData?.stop_name ?? arrivalData?.stopName;
  if (apiName) return apiName;

  try {
    stopCatalogPromise ??= fetch(STOP_CATALOG_URL).then((response) => {
      if (!response.ok) throw new Error(`Stop catalogue returned ${response.status}`);
      return response.json();
    });
    const catalogue = await stopCatalogPromise;
    const stops = Array.isArray(catalogue) ? catalogue : catalogue?.value ?? catalogue?.busStops ?? [];
    const record = stops.find((stop) => String(stop.BusStopCode ?? stop.bus_stop_code ?? stop.code) === code);
    return record ? stopNameFromRecord(record) : "";
  } catch {
    return "";
  }
}

async function updateStopName(code, arrivalData) {
  const name = await lookupStopName(code, arrivalData);
  if (code !== stopCode) return;
  elements.stopName.textContent = name;
  elements.stopName.hidden = !name;
}

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
    updateDecision("error", "No live timing", `Bus ${service?.no ?? "service"} is listed, but there is no next-bus estimate right now.`);
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
  elements.busNumber.textContent = service.no;
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

function renderServiceOptions(services) {
  const previousBus = elements.busSelect.value;
  availableServices = [...new Map(services.map((service) => [service.no, service])).values()];
  elements.busSelect.replaceChildren();

  if (!availableServices.length) {
    const option = document.createElement("option");
    option.value = "";
    option.textContent = "No buses available";
    elements.busSelect.append(option);
    elements.busSelect.disabled = true;
    elements.busNumber.textContent = "-";
    latestService = null;
    clearArrivals("No services in live response");
    updateDecision("error", "No buses found", `No bus services were returned for stop ${stopCode}.`);
    return;
  }

  availableServices.forEach((service) => {
    const option = document.createElement("option");
    option.value = service.no;
    option.textContent = service.no;
    elements.busSelect.append(option);
  });
  elements.busSelect.disabled = false;
  const selected = availableServices.find((service) => service.no === previousBus) ?? availableServices[0];
  elements.busSelect.value = selected.no;
  renderService(selected);
}

function clearArrivals(meta = "--") {
  elements.nextMinutes.textContent = "--";
  elements.secondMinutes.textContent = "--";
  elements.thirdMinutes.textContent = "--";
  elements.nextMeta.textContent = meta;
  elements.secondMeta.textContent = "--";
  elements.thirdMeta.textContent = "--";
}

function setLoading(isLoading) {
  elements.refreshButton.disabled = isLoading;
  elements.refreshButton.setAttribute("aria-busy", String(isLoading));
}

async function fetchArrival() {
  const requestedStop = stopCode;
  setLoading(true);

  try {
    const response = await fetch(`${ARRIVAL_API_URL}?id=${encodeURIComponent(requestedStop)}&_=${Date.now()}`, { cache: "no-store" });
    if (!response.ok) throw new Error(`API returned ${response.status}`);

    const data = await response.json();
    if (requestedStop !== stopCode) return;
    void updateStopName(requestedStop, data);
    renderServiceOptions(data.services ?? []);
    elements.details.textContent = `Last checked ${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}. Auto-refreshes every 15 seconds.`;
  } catch (error) {
    if (requestedStop !== stopCode) return;
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
elements.stopCode.value = stopCode;
elements.stopCodeLabel.textContent = stopCode;
elements.stopForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const nextStopCode = elements.stopCode.value.trim();
  if (!nextStopCode || nextStopCode === stopCode) return;

  stopCode = nextStopCode;
  latestService = null;
  elements.stopCode.value = stopCode;
  elements.stopCodeLabel.textContent = stopCode;
  elements.stopName.textContent = "";
  elements.stopName.hidden = true;
  availableServices = [];
  elements.busSelect.replaceChildren(new Option("Loading services...", ""));
  elements.busSelect.disabled = true;
  elements.busNumber.textContent = "-";
  clearArrivals("Waiting for API");
  updateDecision("loading", "Checking arrivals", "Fetching live bus data...");
  try {
    localStorage.setItem(STOP_STORAGE_KEY, stopCode);
  } catch {
    // The selected stop still works for this session when storage is unavailable.
  }
  void fetchArrival();
});
elements.busSelect.addEventListener("change", () => {
  const selected = availableServices.find((service) => service.no === elements.busSelect.value);
  if (selected) renderService(selected);
});
elements.walkMinutes.addEventListener("input", () => {
  elements.walkOutput.textContent = `${elements.walkMinutes.value} min`;
  if (latestService) setDecision(latestService);
});

fetchArrival();
scheduleRefresh();
