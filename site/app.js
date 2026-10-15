const $ = selector => document.querySelector(selector);
const state = { club: null, course: null, hole: 0, position: null, watchId: null };
let installPrompt = null;

const screens = ["clubScreen", "courseScreen", "distanceScreen"];
const targetLabels = {
  green: ["Entrada", "Centro", "Fondo"],
  tees: ["Tee 1", "Tee 2", "Tee 3", "Tee 4"]
};

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

function changeHole(next) {
  state.hole = Math.max(0, Math.min(next, state.course.holes.length - 1));
  $("#holeSelect").value = state.hole;
  localStorage.setItem(`hole-${state.course.id}`, state.hole);
  renderDistances();
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
    const accuracy = Math.round(position.coords.accuracy);
    setGpsState("ready", "GPS activo");
    $("#accuracy").textContent = `Precisión aproximada: ±${accuracy} m · actualización ${new Date(position.timestamp).toLocaleTimeString("es-ES", {hour:"2-digit",minute:"2-digit",second:"2-digit"})}`;
    renderDistances();
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
$("#mapBtn").onclick = openMap;
$("#backBtn").onclick = goBack;

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
renderClubs();
