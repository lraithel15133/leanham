// ═══════════════════════════════════════════════════════════
// STATE
// ═══════════════════════════════════════════════════════════
let nwfData = null, dsiData = null;
let activeGroup = null;
let svgTransform = { x: 0, y: 0, scale: 1 };
let circuitGroups = [];
let connConfig = {};
let wireCurrents = {};
let activeRelays = {};
let highlightedConn = null;

// ═══════════════════════════════════════════════════════════
// DARK MODE & TABS
// ═══════════════════════════════════════════════════════════
const darkToggle = document.getElementById('darkToggle');
const saved = localStorage.getItem('theme');
if (saved) { document.body.dataset.theme = saved; darkToggle.checked = saved === 'dark'; }
darkToggle.addEventListener('change', e => {
    const t = e.target.checked ? 'dark' : 'light';
    document.body.dataset.theme = t;
    localStorage.setItem('theme', t);
    if (nwfData && dsiData) renderDrawing();
});

function switchTab(n) {
    document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.tab === n));
    document.querySelectorAll('.tab-content').forEach(t => t.classList.toggle('hidden', t.id !== 'tab-' + n));
}

// ═══════════════════════════════════════════════════════════
// FILE UPLOAD
// ═══════════════════════════════════════════════════════════
function setupDrop(zoneId, inputId, handler) {
    const zone = document.getElementById(zoneId), inp = document.getElementById(inputId);
    zone.addEventListener('click', () => { if (!zone.classList.contains('loaded')) inp.click(); });
    zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('drag-over'); });
    zone.addEventListener('dragleave', () => zone.classList.remove('drag-over'));
    zone.addEventListener('drop', e => { e.preventDefault(); zone.classList.remove('drag-over'); if (e.dataTransfer.files.length) handler(e.dataTransfer.files[0], zone); });
    inp.addEventListener('change', e => { if (e.target.files.length) handler(e.target.files[0], zone); });
}

function markLoaded(zone, name, clearFnName) {
    zone.classList.add('loaded');
    zone.innerHTML = `<span class="file-name">${name}</span><button class="clear-btn" onclick="event.stopPropagation();${clearFnName}()">Clear</button>`;
}

function loadNWF(file, zone) {
    const r = new FileReader();
    r.onload = e => { nwfData = parseNWF(e.target.result); markLoaded(zone, file.name, 'clearNWF'); autoDetectRoles(); onDataChange(); };
    r.readAsText(file);
}

function loadDSI(file, zone) {
    const r = new FileReader();
    r.onload = e => { dsiData = parseDSI(e.target.result); markLoaded(zone, file.name, 'clearDSI'); onDataChange(); };
    r.readAsText(file);
}

function clearNWF() {
    nwfData = null; connConfig = {}; activeRelays = {};
    const z = document.getElementById('nwfZone');
    z.classList.remove('loaded');
    z.innerHTML = '<div class="upload-icon">&#128268;</div><div>Drop <strong>.nwf</strong> file</div><input type="file" id="nwfInput" accept=".nwf,.txt" />';
    setupDrop('nwfZone', 'nwfInput', loadNWF);
    onDataChange();
}

function clearDSI() {
    dsiData = null;
    const z = document.getElementById('dsiZone');
    z.classList.remove('loaded');
    z.innerHTML = '<div class="upload-icon">&#128209;</div><div>Drop <strong>DSI .csv</strong> <em>(optional, for drawing)</em></div><input type="file" id="dsiInput" accept=".csv,.txt,.dsi" />';
    setupDrop('dsiZone', 'dsiInput', loadDSI);
    onDataChange();
}

function onDataChange() {
    const hasNWF = !!nwfData;
    document.getElementById('resultsSection').classList.toggle('hidden', !hasNWF);
    document.getElementById('drawingLayout').classList.toggle('hidden', !hasNWF);
    if (hasNWF) {
        const svgContainer = document.getElementById('svgContainer');
        const placeholder = document.getElementById('svgPlaceholder');
        svgContainer.classList.toggle('no-dsi', !dsiData);
        placeholder.style.display = dsiData ? 'none' : '';
        renderAll();
    }
}

setupDrop('nwfZone', 'nwfInput', loadNWF);
setupDrop('dsiZone', 'dsiInput', loadDSI);

// ═══════════════════════════════════════════════════════════
// PARAMETER CHANGE LISTENERS
// ═══════════════════════════════════════════════════════════
document.querySelectorAll('#voltage,#material,#maxDrop').forEach(el => {
    el.addEventListener('input', () => { if (nwfData) { activeGroup = null; renderAll(); } });
    el.addEventListener('change', () => { if (nwfData) { activeGroup = null; renderAll(); } });
});
