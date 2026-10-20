const $ = selector => document.querySelector(selector);
const state = { club: null, course: null, hole: 0, position: null, positionTimestamp: null, accuracy: null, watchId: null, shotStart: null, shotDistance: null, shotFinished: false, watchMode: localStorage.getItem("watch-mode") === "true", lastWatchPosition: null, lastWatchSentAt: 0, watchSyncPending: false, wakeLock: null };
let installPrompt = null;
const MAX_MARK_ACCURACY = 15;
const WATCH_MIN_INTERVAL = 15000;
const WATCH_MIN_MOVEMENT = 10;

const screens = ["clubScreen", "courseScreen", "distanceScreen"];
const targetLabels = {
  green: ["Entrada", "Centro", "Fondo"],
  tees: ["Tee 1", "Tee 2", "Tee 3", "Tee 4"]
};

const systemTheme = matchMedia("(prefers-color-scheme: dark)");

function applyTheme(theme, persist = false) {
  document.documentElement.dataset.theme = theme;
  $("#themeColor").content = theme === "dark" ? "#0d1815" : "#f3f1e9";
  $("#themeBtn").textContent = theme === "dark" ? "☀" : "☾";
  $("#themeBtn").setAttribute("aria-label", theme === "dark" ? "Activar modo claro" : "Activar modo oscuro");
  $("#themeBtn").setAttribute("aria-pressed", String(theme === "dark"));
  if (persist) localStorage.setItem("theme", theme);
}

function toggleTheme() {
  applyTheme(document.documentElement.dataset.theme === "dark" ? "light" : "dark", true);
}

function showScreen(id) {
  screens.forEach(name => $("#" + name).classList.toggle("active", name === id));
  $("#backBtn").hidden = id === "clubScreen";
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function renderClubs() {
  $("#clubList").innerHTML = window.GOLF_DATA.map((club, index) => `
    <button class="choice-card" data-club="${club.id}" type="button">
      <span class="badge">${index + 1}</span>
      <span><strong>${club.name}</strong><small>${club.subtitle}</small></span>
      <span class="arrow">›</span>
    </button>`).join("");
  $("#clubList").querySelectorAll("[data-club]").forEach(button => {
    button.onclick = () => selectClub(button.dataset.club);
  });
}

function selectClub(id) {
  state.club = window.GOLF_DATA.find(club => club.id === id);
  if (state.club.courses.length === 1) {
    selectCourse(state.club.courses[0].id);
    return;
  }
  $("#courseTitle").textContent = state.club.name;
  $("#courseList").innerHTML = state.club.courses.map(course => `
    <button class="choice-card" data-course="${course.id}" type="button">
      <span class="badge" style="background:${course.color}20;color:${course.color}">●</span>
      <span><strong>${course.name}</strong><small>${course.holes.length} hoyos</small></span>
      <span class="arrow">›</span>
    </button>`).join("");
  $("#courseList").querySelectorAll("[data-course]").forEach(button => {
    button.onclick = () => selectCourse(button.dataset.course);
  });
  showScreen("courseScreen");
}

function selectCourse(id) {
  state.course = state.club.courses.find(course => course.id === id);
  state.hole = Math.min(Number(localStorage.getItem(`hole-${state.course.id}`)) || 0, state.course.holes.length - 1);
  $("#selectedClub").textContent = state.club.name;
  $("#selectedCourse").textContent = state.course.name;
  $("#holeSelect").innerHTML = state.course.holes.map((_, index) => `<option value="${index}">${index + 1}</option>`).join("");
  $("#holeSelect").value = state.hole;
  localStorage.setItem("last-selection", JSON.stringify({ club: state.club.id, course: state.course.id }));
  renderDistances();
  showScreen("distanceScreen");
  if (state.watchMode && state.watchId === null) startGps();
}

function haversine(from, to) {
  const radius = 6371000;
  const radians = degrees => degrees * Math.PI / 180;
  const dLat = radians(to[0] - from.latitude);
  const dLon = radians(to[1] - from.longitude);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(radians(from.latitude)) * Math.cos(radians(to[0])) * Math.sin(dLon / 2) ** 2;
  return radius * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function renderDistances() {
  if (!state.course) return;
  const labels = targetLabels[state.course.targetType];
  const points = state.course.holes[state.hole];
  $("#distanceList").className = `distance-grid ${state.course.targetType}`;
  $("#distanceList").innerHTML = points.map((point, index) => {
    const distance = state.position ? Math.round(haversine(state.position, point)) : "—";
    return `<div class="distance-item"><small>${labels[index]}</small><strong>${distance}</strong><em>metros</em></div>`;
  }).join("");
  $("#previousHole").disabled = state.hole === 0;
  $("#nextHole").disabled = state.hole === state.course.holes.length - 1;
}

function renderShot() {
  const measuring = Boolean(state.shotStart) && !state.shotFinished;
  const hasResult = state.shotFinished && state.shotDistance !== null;
  const distance = measuring && state.position
    ? Math.round(haversine(state.position, [state.shotStart.latitude, state.shotStart.longitude]))
    : state.shotDistance;

  $("#shotDistance").textContent = distance === null ? "—" : distance;
  $("#shotState").textContent = measuring ? "Midiendo" : hasResult ? "Finalizado" : "Sin iniciar";
  $("#shotState").className = `shot-state ${measuring ? "measuring" : hasResult ? "finished" : ""}`;
  $("#shotHelp").textContent = measuring
    ? "Camina hasta la bola y marca el punto final."
    : hasResult
      ? "Medición terminada. Puedes iniciar otro golpe."
      : "Marca el punto desde el que golpeas la bola.";
  $("#shotStartBtn").textContent = state.shotStart ? "Medir otro golpe" : "Marcar inicio";
  $("#shotEndBtn").disabled = !measuring;
}

function canMarkShot() {
  if (!state.position || state.accuracy === null) {
    showToast("Activa el GPS y espera a obtener tu posición");
    startGps();
    return false;
  }
  if (Date.now() - state.positionTimestamp > 10000) {
    showToast("Espera una posición GPS actualizada");
    return false;
  }
  if (state.accuracy > MAX_MARK_ACCURACY) {
    showToast(`Espera una precisión de ±${MAX_MARK_ACCURACY} m o mejor`);
    return false;
  }
  return true;
}

function startShot() {
  if (!canMarkShot()) return;
  state.shotStart = { ...state.position };
  state.shotDistance = 0;
  state.shotFinished = false;
  renderShot();
  showToast("Inicio del golpe marcado");
}

function finishShot() {
  if (!state.shotStart || !canMarkShot()) return;
  state.shotDistance = Math.round(haversine(state.position, [state.shotStart.latitude, state.shotStart.longitude]));
  state.shotFinished = true;
  renderShot();
  showToast(`Golpe medido: ${state.shotDistance} m`);
  if (state.watchMode && "Notification" in window && Notification.permission === "granted") {
    showWatchNotification("Golpe finalizado", `${state.shotDistance} metros`, false, false);
  }
}

async function showWatchNotification(title, body, requestPermission = true, silent = true) {
  if (!("Notification" in window) || !("serviceWorker" in navigator)) {
    showToast("Este navegador no admite notificaciones");
    return false;
  }

  let permission = Notification.permission;
  if (permission === "default" && requestPermission) permission = await Notification.requestPermission();
  if (permission !== "granted") {
    showToast(permission === "denied" ? "Activa las notificaciones en los ajustes" : "No se han activado las notificaciones");
    return false;
  }

  try {
    const registration = await navigator.serviceWorker.ready;
    await registration.showNotification(title, {
      body,
      icon: "./icons/icon.svg",
      tag: "distancias-golf-reloj",
      renotify: !silent,
      silent,
      data: { url: "./" }
    });
    return true;
  } catch {
    showToast("No se ha podido enviar la notificación");
    return false;
  }
}

async function syncWatchDistances(force = false, silent = true) {
  if (!state.watchMode || state.watchSyncPending || !state.course || !state.position) return false;
  const now = Date.now();
  const elapsed = now - state.lastWatchSentAt;
  const movement = state.lastWatchPosition
    ? haversine(state.position, [state.lastWatchPosition.latitude, state.lastWatchPosition.longitude])
    : Infinity;
  if (!force && (elapsed < WATCH_MIN_INTERVAL || movement < WATCH_MIN_MOVEMENT)) return false;

  state.watchSyncPending = true;
  try {
    const points = state.course.holes[state.hole];
    const distances = points.map(point => Math.round(haversine(state.position, point)));
    const title = `H${state.hole + 1} · ${distances.join(" | ")} m`;
    const body = `Entrada · Centro · Fondo · GPS ±${state.accuracy} m`;
    const sent = await showWatchNotification(title, body, false, silent);
    if (sent) {
      state.lastWatchPosition = { ...state.position };
      state.lastWatchSentAt = now;
    }
    return sent;
  } finally {
    state.watchSyncPending = false;
  }
}

async function setWakeLock(enabled) {
  if (!enabled) {
    if (state.wakeLock) await state.wakeLock.release().catch(() => {});
    state.wakeLock = null;
    return;
  }
  if (!("wakeLock" in navigator) || document.visibilityState !== "visible" || state.wakeLock) return;
  try {
    state.wakeLock = await navigator.wakeLock.request("screen");
    state.wakeLock.addEventListener("release", () => { state.wakeLock = null; });
  } catch {}
}

function renderWatchMode() {
  const button = $("#watchBtn");
  button.textContent = state.watchMode ? "Modo reloj activo" : "Activar modo reloj";
  button.classList.toggle("watch-active", state.watchMode);
  button.setAttribute("aria-pressed", String(state.watchMode));
}

async function toggleWatchMode() {
  if (state.watchMode) {
    state.watchMode = false;
    localStorage.setItem("watch-mode", "false");
    await setWakeLock(false);
    renderWatchMode();
    showToast("Modo reloj desactivado");
    return;
  }

  if (!("Notification" in window) || !("serviceWorker" in navigator)) {
    showToast("Este navegador no admite notificaciones");
    return;
  }
  let permission = Notification.permission;
  if (permission === "default") permission = await Notification.requestPermission();
  if (permission !== "granted") {
    showToast("Activa las notificaciones en los ajustes");
    return;
  }

  state.watchMode = true;
  localStorage.setItem("watch-mode", "true");
  state.lastWatchPosition = null;
  state.lastWatchSentAt = 0;
  renderWatchMode();
  await setWakeLock(true);
  if (!state.course || !state.position) {
    showToast("Modo reloj activo · esperando GPS");
    startGps();
    return;
  }
  const sent = await syncWatchDistances(true, false);
  if (sent) showToast("Modo reloj activo");
}

function changeHole(next) {
  state.hole = Math.max(0, Math.min(next, state.course.holes.length - 1));
  $("#holeSelect").value = state.hole;
  localStorage.setItem(`hole-${state.course.id}`, state.hole);
  renderDistances();
  if (state.watchMode) syncWatchDistances(true, false);
}

function setGpsState(type, label) {
  $("#gpsState").className = `gps-state ${type}`;
  $("#gpsState").innerHTML = `<i></i> ${label}`;
}

function startGps() {
  if (!navigator.geolocation) {
    setGpsState("error", "GPS no disponible");
    $("#accuracy").textContent = "Este dispositivo no ofrece ubicación al navegador.";
    return;
  }
  if (state.watchId !== null) navigator.geolocation.clearWatch(state.watchId);
  setGpsState("waiting", "Buscando GPS");
  $("#accuracy").textContent = "Esperando una posición precisa…";
  state.watchId = navigator.geolocation.watchPosition(position => {
    state.position = { latitude: position.coords.latitude, longitude: position.coords.longitude };
    state.positionTimestamp = position.timestamp;
    const accuracy = Math.round(position.coords.accuracy);
    state.accuracy = accuracy;
    setGpsState("ready", "GPS activo");
    $("#accuracy").textContent = `Precisión aproximada: ±${accuracy} m · actualización ${new Date(position.timestamp).toLocaleTimeString("es-ES", {hour:"2-digit",minute:"2-digit",second:"2-digit"})}`;
    renderDistances();
    renderShot();
    if (state.watchMode) syncWatchDistances(false, state.lastWatchSentAt !== 0);
  }, error => {
    const messages = { 1: "Permite el acceso a la ubicación para calcular distancias.", 2: "No se ha podido obtener tu posición.", 3: "El GPS está tardando demasiado. Inténtalo de nuevo." };
    setGpsState("error", "Sin ubicación");
    $("#accuracy").textContent = messages[error.code] || "No se ha podido activar el GPS.";
  }, { enableHighAccuracy: true, maximumAge: 3000, timeout: 20000 });
}

function openMap() {
  const points = state.course.holes[state.hole];
  const point = points[Math.floor(points.length / 2)];
  window.open(`https://www.google.com/maps/search/?api=1&query=${point[0]},${point[1]}`, "_blank", "noopener");
}

function goBack() {
  if ($("#distanceScreen").classList.contains("active")) {
    if (state.club.courses.length > 1) showScreen("courseScreen");
    else showScreen("clubScreen");
  } else showScreen("clubScreen");
}

function showToast(message) {
  const toast = $("#toast");
  toast.textContent = message;
  toast.hidden = false;
  setTimeout(() => toast.hidden = true, 2600);
}

$("#previousHole").onclick = () => changeHole(state.hole - 1);
$("#nextHole").onclick = () => changeHole(state.hole + 1);
$("#holeSelect").onchange = event => changeHole(Number(event.target.value));
$("#locationBtn").onclick = startGps;
$("#shotStartBtn").onclick = startShot;
$("#shotEndBtn").onclick = finishShot;
$("#watchBtn").onclick = toggleWatchMode;
$("#mapBtn").onclick = openMap;
$("#backBtn").onclick = goBack;
$("#themeBtn").onclick = toggleTheme;
applyTheme(document.documentElement.dataset.theme || (systemTheme.matches ? "dark" : "light"));
systemTheme.addEventListener("change", event => {
  if (!localStorage.getItem("theme")) applyTheme(event.matches ? "dark" : "light");
});

window.addEventListener("beforeinstallprompt", event => {
  event.preventDefault();
  installPrompt = event;
  $("#installBtn").hidden = false;
});
$("#installBtn").onclick = async () => {
  if (!installPrompt) return;
  installPrompt.prompt();
  const result = await installPrompt.userChoice;
  if (result.outcome === "accepted") showToast("Aplicación instalada");
  installPrompt = null;
  $("#installBtn").hidden = true;
};
window.addEventListener("appinstalled", () => showToast("Aplicación instalada"));

if ("serviceWorker" in navigator) navigator.serviceWorker.register("./sw.js");
document.addEventListener("visibilitychange", () => {
  if (state.watchMode && document.visibilityState === "visible") setWakeLock(true);
});
renderClubs();
renderShot();
renderWatchMode();
