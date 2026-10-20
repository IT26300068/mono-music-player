const demoTracks = [
  { id: "demo-1", title: "No Signal", artist: "The Northern Lines", album: "Static Bloom", duration: 222, cover: 1, added: "Demo", tone: [110, 164.81, 220] },
  { id: "demo-2", title: "Soft Focus", artist: "Rina Vale", album: "Silver Hours", duration: 248, cover: 2, added: "Demo", tone: [130.81, 196, 261.63] },
  { id: "demo-3", title: "Half Light", artist: "Orchid Motel", album: "Room 34", duration: 199, cover: 3, added: "Demo", tone: [98, 146.83, 196] },
  { id: "demo-4", title: "Black Coffee", artist: "León Grey", album: "Night Shift", duration: 257, cover: 4, added: "Demo", tone: [123.47, 185, 246.94] },
  { id: "demo-5", title: "Parallel", artist: "Quiet Shapes", album: "Unfold", duration: 214, cover: 2, added: "Demo", tone: [116.54, 174.61, 233.08] },
  { id: "demo-6", title: "Rain on Glass", artist: "June Archive", album: "Weather Patterns", duration: 231, cover: 1, added: "Demo", tone: [103.83, 155.56, 207.65] }
];

const mixes = [
  { title: "Midnight Drive", subtitle: "Darkwave · Synth · Focus", cover: 1, start: 0 },
  { title: "Sunday Static", subtitle: "Lo-fi · Instrumental", cover: 2, start: 1 },
  { title: "Monochrome", subtitle: "Indie · Alternative", cover: 3, start: 2 },
  { title: "Slow Motion", subtitle: "Soul · Downtempo", cover: 4, start: 3 }
];

let queue = [...demoTracks];
let localTracks = [];
let currentIndex = 0;
let isPlaying = false;
let elapsed = 0;
let timer = null;
let audioContext = null;
let activeNodes = [];
let masterGain = null;
let shuffle = false;
let repeat = false;

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];
const audio = $("#audioEngine");
const formatTime = (seconds) => `${Math.floor((Number(seconds) || 0) / 60)}:${String(Math.floor((Number(seconds) || 0) % 60)).padStart(2, "0")}`;

function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("mono-local-library", 1);
    request.onupgradeneeded = () => request.result.createObjectStore("tracks", { keyPath: "id" });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function readStoredTracks() {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const request = db.transaction("tracks", "readonly").objectStore("tracks").getAll();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function storeTrack(track) {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const request = db.transaction("tracks", "readwrite").objectStore("tracks").put(track);
    request.onsuccess = resolve;
    request.onerror = () => reject(request.error);
  });
}

function makePlayable(track) {
  return track.blob ? { ...track, url: URL.createObjectURL(track.blob), local: true } : track;
}

function parseFileName(fileName) {
  const clean = fileName.replace(/\.[^.]+$/, "").replace(/[_]+/g, " ").trim();
  const parts = clean.split(/\s+-\s+/);
  return parts.length > 1 ? { artist: parts.shift(), title: parts.join(" - ") } : { artist: "Local artist", title: clean };
}

function readDuration(file) {
  return new Promise((resolve) => {
    const probe = document.createElement("audio");
    const url = URL.createObjectURL(file);
    probe.preload = "metadata";
    probe.onloadedmetadata = () => { const value = Number.isFinite(probe.duration) ? Math.round(probe.duration) : 0; URL.revokeObjectURL(url); resolve(value); };
    probe.onerror = () => { URL.revokeObjectURL(url); resolve(0); };
    probe.src = url;
  });
}

function renderMixes() {
  $("#quickGrid").innerHTML = mixes.map((mix) => `<article class="mix-card" data-start="${mix.start}" tabindex="0"><div class="mix-cover cover-${mix.cover}"><button class="card-play" aria-label="Play ${mix.title}">▶</button></div><div class="mix-card-info"><strong>${mix.title}</strong><small>${mix.subtitle}</small></div></article>`).join("");
  renderSidebar();
}

function renderSidebar() {
  const localButton = localTracks.length ? `<button data-library="local">Local library · ${localTracks.length}</button>` : "";
  $("#playlistNav").innerHTML = localButton + mixes.map((mix) => `<button data-start="${mix.start}">${mix.title}</button>`).join("");
  $("#sourceLabel").textContent = localTracks.length ? `${localTracks.length} local ${localTracks.length === 1 ? "track" : "tracks"}` : "Demo library";
}

function filterTracks(term) {
  const q = term.trim().toLowerCase();
  return q ? queue.filter(track => [track.title, track.artist, track.album].some(value => value.toLowerCase().includes(q))) : queue;
}

function renderTracks(items = queue) {
  $("#trackList").innerHTML = items.map((track) => {
    const actualIndex = queue.indexOf(track);
    return `<div class="track-row ${actualIndex === currentIndex && isPlaying ? "playing" : ""}" role="row" data-index="${actualIndex}"><span class="track-number">${String(actualIndex + 1).padStart(2, "0")}</span><span class="track-info"><span class="track-art cover-${track.cover || 1}"></span><span class="track-name"><strong>${track.title}</strong><small>${track.artist}</small></span></span><span>${track.album}</span><span>${track.added}</span><span>${formatTime(track.duration)}</span><button class="track-more" aria-label="More options">•••</button></div>`;
  }).join("");
}

function renderQueue() {
  const order = [...queue.slice(currentIndex), ...queue.slice(0, currentIndex)];
  $("#queueCount").textContent = `${queue.length} ${queue.length === 1 ? "song" : "songs"}`;
  $("#fullscreenQueueCount").textContent = queue.length;
  $("#queueList").innerHTML = order.map((track, position) => {
    const actualIndex = queue.indexOf(track);
    const label = position === 0 ? "NOW" : position === 1 ? "NEXT" : `+${position}`;
    return `<button class="queue-item ${actualIndex === currentIndex ? "current" : ""}" data-index="${actualIndex}"><span class="queue-item-art cover-${track.cover || 1}"></span><span class="queue-item-meta"><strong>${track.title}</strong><small>${track.artist} · ${formatTime(track.duration)}</small></span><span class="queue-position">${label}</span></button>`;
  }).join("");
  $("#queueDrawer").dataset.current = String(currentIndex);
}

function setRangeFill(input) { input.style.setProperty("--value", `${(input.value - input.min) / (input.max - input.min) * 100}%`); }

function updatePlayer() {
  const track = queue[currentIndex];
  if (!track) return;
  $("#playerTitle").textContent = track.title;
  $("#playerArtist").textContent = track.artist;
  $("#playerArt").className = `mini-art cover-${track.cover || 1}`;
  $("#duration").textContent = formatTime(track.duration || audio.duration || 0);
  $("#elapsed").textContent = formatTime(elapsed);
  $("#seek").value = Math.min(100, elapsed / (track.duration || audio.duration || 1) * 100);
  setRangeFill($("#seek"));
  $("#playButton span").textContent = isPlaying ? "Ⅱ" : "▶";
  $("#playButton").setAttribute("aria-label", isPlaying ? "Pause" : "Play");
  $("#fullscreenTitle").textContent = track.title;
  $("#fullscreenArtist").textContent = track.artist;
  $("#fullscreenArt").className = `fullscreen-art cover-${track.cover || 1}`;
  $("#fullscreenElapsed").textContent = formatTime(elapsed);
  $("#fullscreenDuration").textContent = formatTime(track.duration || audio.duration || 0);
  $("#fullscreenSeek").value = $("#seek").value;
  setRangeFill($("#fullscreenSeek"));
  $("#fullscreenPlay span").textContent = isPlaying ? "Ⅱ" : "▶";
  $("#fullscreenPlay").setAttribute("aria-label", isPlaying ? "Pause" : "Play");
  $("#nowPlayingView").classList.toggle("playing", isPlaying);
  $("#fullscreenShuffle").classList.toggle("active", shuffle);
  $("#fullscreenRepeat").classList.toggle("active", repeat);
  $("#fullscreenQueueCount").textContent = queue.length;
  if ($("#queueDrawer").classList.contains("open") && $("#queueDrawer").dataset.current !== String(currentIndex)) renderQueue();
  renderTracks(filterTracks($("#searchInput").value));
}

function stopSynth() { activeNodes.forEach(node => { try { node.stop(); } catch {} }); activeNodes = []; }
function stopAllAudio() { clearInterval(timer); stopSynth(); audio.pause(); }

function startSynth(track) {
  stopAllAudio();
  audioContext ||= new (window.AudioContext || window.webkitAudioContext)();
  audioContext.resume();
  masterGain = audioContext.createGain();
  masterGain.gain.value = Number($("#volume").value) / 100 * 0.075;
  masterGain.connect(audioContext.destination);
  track.tone.forEach((frequency, i) => {
    const oscillator = audioContext.createOscillator(); const gain = audioContext.createGain();
    oscillator.type = i === 0 ? "sine" : "triangle"; oscillator.frequency.value = frequency; gain.gain.value = i === 0 ? .72 : .2 / (i + 1);
    oscillator.connect(gain).connect(masterGain); oscillator.start(); activeNodes.push(oscillator);
  });
  timer = setInterval(() => { elapsed += 1; if (elapsed >= track.duration) next(true); updatePlayer(); }, 1000);
}

async function play(index = currentIndex) {
  currentIndex = Math.max(0, Math.min(index, queue.length - 1));
  const track = queue[currentIndex];
  isPlaying = true;
  if (track.local) {
    clearInterval(timer); stopSynth();
    if (audio.src !== track.url) { audio.src = track.url; audio.currentTime = Math.min(elapsed, track.duration || 0); }
    audio.volume = Number($("#volume").value) / 100;
    try { await audio.play(); } catch { isPlaying = false; showToast("This audio format could not be played"); }
  } else startSynth(track);
  updatePlayer();
}

function pause() { isPlaying = false; clearInterval(timer); stopSynth(); audio.pause(); updatePlayer(); }
function togglePlay() { isPlaying ? pause() : play(); }
function next(automatic = false) { elapsed = 0; play(automatic && repeat ? currentIndex : shuffle ? Math.floor(Math.random() * queue.length) : (currentIndex + 1) % queue.length); }
function previous() { if (elapsed > 4) { elapsed = 0; if (queue[currentIndex]?.local) audio.currentTime = 0; updatePlayer(); return; } elapsed = 0; play((currentIndex - 1 + queue.length) % queue.length); }
function showToast(message) { const toast = $("#toast"); toast.textContent = message; toast.classList.add("show"); clearTimeout(toast.timeout); toast.timeout = setTimeout(() => toast.classList.remove("show"), 2600); }
function openImporter() { $("#importSummary").hidden = true; $("#importDialog").showModal(); }

function openQueue() {
  renderQueue();
  $("#queueBackdrop").hidden = false;
  $("#queueDrawer").classList.add("open");
  $("#queueDrawer").setAttribute("aria-hidden", "false");
}

function closeQueue() {
  $("#queueDrawer").classList.remove("open");
  $("#queueDrawer").setAttribute("aria-hidden", "true");
  setTimeout(() => { if (!$("#queueDrawer").classList.contains("open")) $("#queueBackdrop").hidden = true; }, 300);
}

function openFullscreenPlayer() {
  $("#nowPlayingView").classList.add("open");
  $("#nowPlayingView").setAttribute("aria-hidden", "false");
  document.body.classList.add("player-expanded");
  updatePlayer();
}

function closeFullscreenPlayer() {
  closeQueue();
  $("#nowPlayingView").classList.remove("open");
  $("#nowPlayingView").setAttribute("aria-hidden", "true");
  document.body.classList.remove("player-expanded");
}

function toggleShuffle() {
  shuffle = !shuffle;
  $("#shuffleButton").classList.toggle("active", shuffle);
  $("#fullscreenShuffle").classList.toggle("active", shuffle);
  showToast(shuffle ? "Shuffle on" : "Shuffle off");
}

function toggleRepeat() {
  repeat = !repeat;
  $("#repeatButton").classList.toggle("active", repeat);
  $("#fullscreenRepeat").classList.toggle("active", repeat);
  showToast(repeat ? "Repeat on" : "Repeat off");
}

async function importFiles(fileList) {
  const files = [...fileList].filter(file => file.type.startsWith("audio/") || /\.(mp3|m4a|wav|ogg|flac|aac)$/i.test(file.name));
  if (!files.length) { showToast("Choose supported audio files"); return; }
  const summary = $("#importSummary"); summary.hidden = false; summary.innerHTML = `Reading ${files.length} ${files.length === 1 ? "song" : "songs"}…`;
  let added = 0;
  for (const file of files) {
    const id = `${file.name}-${file.size}-${file.lastModified}`;
    if (localTracks.some(track => track.id === id)) continue;
    const names = parseFileName(file.name);
    const stored = { id, ...names, album: "Local files", duration: await readDuration(file), cover: Math.abs([...file.name].reduce((sum, char) => sum + char.charCodeAt(0), 0)) % 4 + 1, added: "Just now", blob: file };
    await storeTrack(stored);
    localTracks.push(makePlayable(stored)); added += 1;
  }
  if (localTracks.length) { pause(); queue = [...localTracks]; currentIndex = 0; elapsed = 0; $("#trackTitle").textContent = "Local library"; renderSidebar(); updatePlayer(); }
  summary.innerHTML = `<strong>${added ? `${added} ${added === 1 ? "song" : "songs"} added` : "Already in your library"}</strong><br>Your local library is ready to play.`;
  $("#musicFiles").value = "";
  showToast(added ? `${added} ${added === 1 ? "song" : "songs"} added` : "No new songs added");
  if (added) setTimeout(() => $("#importDialog").close(), 900);
}

async function loadLocalLibrary() {
  try {
    localTracks = (await readStoredTracks()).map(makePlayable);
    if (localTracks.length) { queue = [...localTracks]; $("#trackTitle").textContent = "Local library"; }
    renderSidebar(); updatePlayer();
  } catch { showToast("Local storage is unavailable in this browser"); }
}

renderMixes(); renderTracks(); updatePlayer(); setRangeFill($("#volume")); loadLocalLibrary();

$("#playButton").addEventListener("click", togglePlay); $("#playMix").addEventListener("click", () => { queue = [...demoTracks]; currentIndex = 0; elapsed = 0; $("#trackTitle").textContent = "After dark"; play(0); });
$("#nextButton").addEventListener("click", () => next(false)); $("#prevButton").addEventListener("click", previous);
$("#seek").addEventListener("input", event => { elapsed = (queue[currentIndex].duration || audio.duration || 1) * event.target.value / 100; if (queue[currentIndex].local) audio.currentTime = elapsed; updatePlayer(); });
$("#volume").addEventListener("input", event => { setRangeFill(event.target); audio.volume = event.target.value / 100; if (masterGain) masterGain.gain.value = event.target.value / 100 * .075; });
$("#volumeIcon").addEventListener("click", () => { const volume = $("#volume"); volume.value = Number(volume.value) ? 0 : 72; volume.dispatchEvent(new Event("input")); });
$("#shuffleButton").addEventListener("click", toggleShuffle);
$("#shuffleAll").addEventListener("click", () => { shuffle = true; $("#shuffleButton").classList.add("active"); play(Math.floor(Math.random() * queue.length)); });
$("#repeatButton").addEventListener("click", toggleRepeat);
$("#likeButton").addEventListener("click", event => { event.currentTarget.classList.toggle("liked"); event.currentTarget.textContent = event.currentTarget.classList.contains("liked") ? "♥" : "♡"; });
$("#searchInput").addEventListener("input", event => { renderTracks(filterTracks(event.target.value)); $("#hero").style.display = event.target.value ? "none" : "grid"; });
$("#trackList").addEventListener("click", event => { const row = event.target.closest(".track-row"); if (row) { elapsed = 0; play(Number(row.dataset.index)); } });
$("#quickGrid").addEventListener("click", event => { const card = event.target.closest(".mix-card"); if (card) { queue = [...demoTracks]; elapsed = 0; $("#trackTitle").textContent = "After dark"; play(Number(card.dataset.start)); } });
$("#playlistNav").addEventListener("click", event => { const button = event.target.closest("button"); if (!button) return; if (button.dataset.library === "local") { pause(); queue = [...localTracks]; currentIndex = 0; elapsed = 0; $("#trackTitle").textContent = "Local library"; updatePlayer(); } else if (button.dataset.start) { queue = [...demoTracks]; play(Number(button.dataset.start)); } });
[$("#openAddTop"), $("#openAddSidebar"), $("#addToLibrary"), $("#addPlaylist")].forEach(button => button.addEventListener("click", openImporter));
$("#closeDialog").addEventListener("click", () => $("#importDialog").close());
$("#chooseFiles").addEventListener("click", event => { event.stopPropagation(); $("#musicFiles").click(); });
$("#dropZone").addEventListener("click", event => { if (!event.target.closest("button")) $("#musicFiles").click(); });
$("#dropZone").addEventListener("keydown", event => { if (["Enter", " "].includes(event.key)) { event.preventDefault(); $("#musicFiles").click(); } });
$("#musicFiles").addEventListener("change", event => importFiles(event.target.files));
["dragenter", "dragover"].forEach(name => $("#dropZone").addEventListener(name, event => { event.preventDefault(); $("#dropZone").classList.add("dragging"); }));
["dragleave", "drop"].forEach(name => $("#dropZone").addEventListener(name, event => { event.preventDefault(); $("#dropZone").classList.remove("dragging"); }));
$("#dropZone").addEventListener("drop", event => importFiles(event.dataTransfer.files));
$("#showAll").addEventListener("click", () => document.querySelector(".track-section").scrollIntoView({ behavior: "smooth" }));
$("#queueButton").addEventListener("click", openQueue);
$("#fullscreenQueueButton").addEventListener("click", openQueue);
$("#closeQueue").addEventListener("click", closeQueue);
$("#queueBackdrop").addEventListener("click", closeQueue);
$("#queueList").addEventListener("click", event => { const item = event.target.closest(".queue-item"); if (item) { elapsed = 0; play(Number(item.dataset.index)); closeQueue(); } });
$("#fullscreenButton").addEventListener("click", openFullscreenPlayer);
$("#playerArt").addEventListener("click", openFullscreenPlayer);
$("#playerArt").addEventListener("keydown", event => { if (["Enter", " "].includes(event.key)) { event.preventDefault(); openFullscreenPlayer(); } });
$("#closeFullscreen").addEventListener("click", closeFullscreenPlayer);
$("#fullscreenPlay").addEventListener("click", togglePlay);
$("#fullscreenNext").addEventListener("click", () => next(false));
$("#fullscreenPrev").addEventListener("click", previous);
$("#fullscreenShuffle").addEventListener("click", toggleShuffle);
$("#fullscreenRepeat").addEventListener("click", toggleRepeat);
$("#fullscreenSeek").addEventListener("input", event => { elapsed = (queue[currentIndex].duration || audio.duration || 1) * event.target.value / 100; if (queue[currentIndex].local) audio.currentTime = elapsed; updatePlayer(); });
audio.addEventListener("timeupdate", () => { if (queue[currentIndex]?.local) { elapsed = audio.currentTime; updatePlayer(); } });
audio.addEventListener("loadedmetadata", () => { if (queue[currentIndex]?.local && Number.isFinite(audio.duration)) { queue[currentIndex].duration = Math.round(audio.duration); updatePlayer(); } });
audio.addEventListener("ended", () => next(true));
$$('.nav-item').forEach(item => item.addEventListener("click", () => { $$('.nav-item').forEach(i => i.classList.remove("active")); item.classList.add("active"); if (item.dataset.view === "search") $("#searchInput").focus(); }));
document.addEventListener("keydown", event => { if (event.key === "Escape") { if ($("#queueDrawer").classList.contains("open")) closeQueue(); else if ($("#nowPlayingView").classList.contains("open")) closeFullscreenPlayer(); } if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") { event.preventDefault(); $("#searchInput").focus(); } if (event.code === "Space" && !["INPUT", "BUTTON"].includes(document.activeElement.tagName) && !$("#importDialog").open) { event.preventDefault(); togglePlay(); } });
window.addEventListener("beforeunload", () => { stopAllAudio(); localTracks.forEach(track => track.url && URL.revokeObjectURL(track.url)); });
