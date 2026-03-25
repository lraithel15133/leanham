// ═══════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════
const CMAP = { BLACK: '#222', RED: '#d32f2f', BLUE: '#1565c0', GREEN: '#2e7d32', YELLOW: '#f9a825', WHITE: '#eee', ORANGE: '#ef6c00', BROWN: '#5d4037', PURPLE: '#7b1fa2', PINK: '#e91e63', GRAY: '#757575', GREY: '#757575' };

function colorCSS(n) { if (!n) return '#999'; return CMAP[n.split('/')[0].toUpperCase()] || '#999'; }
function swatchHTML(c) { return `<span class="color-swatch" style="background:${colorCSS(c)}"></span>${c || ''}`; }
function statusOf(pct, max) { return pct > max ? 'fail' : pct > max * .7 ? 'warn' : 'ok'; }
function getCSA(w) { if (!nwfData) return 1; const s = nwfData.spools[w.spool]; return s ? (parseFloat(s.params.WIRE_CSA) || 1) : 1; }
function getColor(w) { if (!nwfData) return ''; const s = nwfData.spools[w.spool]; return s ? (s.params.COLOR || '') : ''; }
function calcDrop(lenMM, csa, amps, rho) { return (amps * rho * (lenMM / 1000)) / csa; }
function getParams() { return { voltage: parseFloat(document.getElementById('voltage').value) || 13.5, resistivity: parseFloat(document.getElementById('material').value) || 0.01724, maxDropPct: parseFloat(document.getElementById('maxDrop').value) || 3 }; }

// ═══════════════════════════════════════════════════════════
// AUTO-DETECT CONNECTOR ROLES
// ═══════════════════════════════════════════════════════════
function autoDetectRoles() {
    if (!nwfData) return;
    connConfig = {};
    for (const c of Object.values(nwfData.connectors)) {
        if (c.name.startsWith('SP-')) continue;
        const desc = ((c.params.DESCRIPTION || '') + (c.params.MODEL_NAME || '')).replace(/"/g, '').toUpperCase();
        let role = 'load', current = 5;
        if (desc.includes('RING')) {
            const connWires = nwfData.wires.filter(w => (w.from && w.from.conn === c.name) || (w.to && w.to.conn === c.name));
            const colors = connWires.map(w => getColor(w).toUpperCase());
            if (colors.some(c2 => c2 === 'BLACK')) { role = 'ground'; current = 0; }
            else { role = 'power'; current = 0; }
        } else if (desc.includes('FUSE')) { role = 'passthrough'; current = 0; }
        else if (desc.includes('RELAY')) { role = 'passthrough'; current = 0; }
        else if (desc.includes('RECP')) { role = 'signal'; current = 0.15; }
        else { role = 'load'; current = 5; }
        connConfig[c.name] = { role, current };
    }
}

// ═══════════════════════════════════════════════════════════
// CIRCUIT GRAPH
// ═══════════════════════════════════════════════════════════
function getConnDesc(name) { return ((nwfData.connectors[name]?.params?.DESCRIPTION || '') + (nwfData.connectors[name]?.params?.MODEL_NAME || '')).toUpperCase(); }

function buildCircuitGraph() {
    const adj = {};
    function addEdge(a, b, wire, internal = false) {
        if (!adj[a]) adj[a] = [];
        if (!adj[b]) adj[b] = [];
        adj[a].push({ node: b, wire, internal });
        adj[b].push({ node: a, wire, internal });
    }
    for (const w of nwfData.wires) {
        if (!w.from || !w.to) continue;
        addEdge(`${w.from.conn}:${w.from.pin}`, `${w.to.conn}:${w.to.pin}`, w);
    }
    for (const c of Object.values(nwfData.connectors)) {
        const desc = getConnDesc(c.name);
        if (desc.includes('FUSE')) {
            for (let i = 0; i < c.pins.length; i++)
                for (let j = i + 1; j < c.pins.length; j++)
                    addEdge(`${c.name}:${c.pins[i].name}`, `${c.name}:${c.pins[j].name}`, { name: `[${c.name} fuse]`, spool: '', lengthMM: 0, from: { conn: c.name, pin: c.pins[i].name }, to: { conn: c.name, pin: c.pins[j].name }, _internal: true }, true);
        }
        if (desc.includes('RELAY')) {
            const pn = c.pins.map(p => p.name);
            if (pn.includes('30') && pn.includes('87'))
                addEdge(`${c.name}:30`, `${c.name}:87`, { name: `[${c.name} contact]`, spool: '', lengthMM: 0, from: { conn: c.name, pin: '30' }, to: { conn: c.name, pin: '87' }, _internal: true, _relay: c.name }, true);
            if (pn.includes('85') && pn.includes('86'))
                addEdge(`${c.name}:85`, `${c.name}:86`, { name: `[${c.name} coil]`, spool: '', lengthMM: 0, from: { conn: c.name, pin: '85' }, to: { conn: c.name, pin: '86' }, _internal: true, _relay: c.name }, true);
        }
    }
    return adj;
}

function isTerminal(nodeKey) { return !nodeKey.startsWith('SP-'); }

function findPathBetween(adj, startKey, endRole) {
    const visited = new Set([startKey]);
    const queue = [{ node: startKey, path: [startKey], wires: [] }];
    while (queue.length) {
        const { node, path, wires } = queue.shift();
        const [conn] = node.split(':');
        if (node !== startKey && connConfig[conn] && connConfig[conn].role === endRole)
            return { to: node, path, wires };
        for (const { node: next, wire } of (adj[node] || [])) {
            if (!visited.has(next)) { visited.add(next); queue.push({ node: next, path: [...path, next], wires: [...wires, wire] }); }
        }
    }
    return null;
}

// ═══════════════════════════════════════════════════════════
// DETECT CIRCUITS WITH RELAY GROUP AWARENESS
// ═══════════════════════════════════════════════════════════
function buildCircuits() {
    if (!nwfData) return [];
    const adj = buildCircuitGraph();
    const groups = [];

    for (const [connName, cfg] of Object.entries(connConfig)) {
        if (cfg.role !== 'load' && cfg.role !== 'signal') continue;
        if (cfg.current <= 0) continue;
        const connObj = nwfData.connectors[connName];
        if (!connObj) continue;

        for (const pin of connObj.pins) {
            const pinKey = `${connName}:${pin.name}`;
            const hasWire = nwfData.wires.some(w =>
                (w.from && w.from.conn === connName && w.from.pin === pin.name) ||
                (w.to && w.to.conn === connName && w.to.pin === pin.name));
            if (!hasWire) continue;

            const pinWire = nwfData.wires.find(w =>
                (w.from && w.from.conn === connName && w.from.pin === pin.name) ||
                (w.to && w.to.conn === connName && w.to.pin === pin.name));
            const wireColor = pinWire ? getColor(pinWire).toUpperCase() : '';
            const isGndPin = wireColor === 'BLACK';
            if (isGndPin) continue;

            const supplyPath = findPathBetween(adj, pinKey, 'power');
            let returnPath = null;
            for (const gndPin of connObj.pins) {
                if (gndPin.name === pin.name) continue;
                const gw = nwfData.wires.find(w =>
                    (w.from && w.from.conn === connName && w.from.pin === gndPin.name) ||
                    (w.to && w.to.conn === connName && w.to.pin === gndPin.name));
                if (!gw || getColor(gw).toUpperCase() !== 'BLACK') continue;
                returnPath = findPathBetween(adj, `${connName}:${gndPin.name}`, 'ground');
                if (returnPath) break;
            }
            if (!returnPath && cfg.role === 'signal') {
                returnPath = findPathBetween(adj, pinKey, 'ground');
            }
            if (!supplyPath && !returnPath) continue;

            const allPathWires = [...(supplyPath ? supplyPath.wires : []), ...(returnPath ? returnPath.wires : [])];
            let relayGroup = 'none';
            for (const w of allPathWires) {
                if (w._relay) { relayGroup = w._relay; break; }
            }

            const supplyWires = supplyPath ? supplyPath.wires.filter(w => !w._internal) : [];
            const returnWires = returnPath ? returnPath.wires.filter(w => !w._internal) : [];
            const circuitName = pinWire ? pinWire.name : `${connName}:${pin.name}`;
            const connDesc = (nwfData.connectors[connName].params.DESCRIPTION || '').replace(/"/g, '');

            groups.push({
                name: circuitName, connName, pinName: pin.name,
                desc: `${connName} pin ${pin.name} — ${connDesc}`,
                current: cfg.current,
                relayGroup,
                supplyWires, returnWires,
                allWireNames: [...supplyWires, ...returnWires].map(w => w.name)
            });
        }
    }

    const relays = [...new Set(groups.map(g => g.relayGroup).filter(r => r !== 'none'))];
    const isFirstLoad = !relays.some(r => r in activeRelays);
    for (const r of relays) {
        if (!(r in activeRelays)) activeRelays[r] = isFirstLoad ? (r === relays[0]) : false;
    }

    return groups;
}

// ═══════════════════════════════════════════════════════════
// CURRENT CALCULATION — RELAY-AWARE
// ═══════════════════════════════════════════════════════════
function calculateWireCurrents() {
    wireCurrents = {};
    for (const w of nwfData.wires) wireCurrents[w.name] = 0;
    for (const g of circuitGroups) {
        const isActive = g.relayGroup === 'none' || activeRelays[g.relayGroup];
        if (!isActive) continue;
        for (const w of [...g.supplyWires, ...g.returnWires]) {
            wireCurrents[w.name] = (wireCurrents[w.name] || 0) + g.current;
        }
    }
}

function calculateGroupDrops() {
    const p = getParams();
    for (const g of circuitGroups) {
        g.supplyDrop = g.supplyWires.reduce((s, w) => s + calcDrop(w.lengthMM, getCSA(w), wireCurrents[w.name] || 0, p.resistivity), 0);
        g.returnDrop = g.returnWires.reduce((s, w) => s + calcDrop(w.lengthMM, getCSA(w), wireCurrents[w.name] || 0, p.resistivity), 0);
        g.totalDrop = g.supplyDrop + g.returnDrop;
        g.pct = (g.totalDrop / p.voltage) * 100;
    }
    circuitGroups.sort((a, b) => b.totalDrop - a.totalDrop);
}
