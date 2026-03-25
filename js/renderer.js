// ═══════════════════════════════════════════════════════════
// RENDERING
// ═══════════════════════════════════════════════════════════
function renderAll() {
    if (!nwfData) return;
    circuitGroups = buildCircuits();
    calculateWireCurrents();
    calculateGroupDrops();
    const p = getParams();
    renderHarnessInfo();
    renderLoadConfig();
    renderScenario();
    renderSpools();
    renderConnectors();
    renderWires(p);
    renderPaths(p);
    renderGroups(p);
    renderSummary(p);
    updateTabCounts();
    if (dsiData) renderDrawing();
}

function updateTabCounts() {
    if (!nwfData) return;
    document.querySelector('[data-tab="wires"]').textContent = `Wires (${nwfData.wires.length})`;
    document.querySelector('[data-tab="spools"]').textContent = `Spools (${Object.keys(nwfData.spools).length})`;
    document.querySelector('[data-tab="connectors"]').textContent = `Connectors (${Object.keys(nwfData.connectors).length})`;
}

function renderHarnessInfo() {
    const h = nwfData.header;
    document.getElementById('harnessInfo').innerHTML = [
        ['Harness PartNum', 'Part Number'], ['Harness Rev', 'Rev'], ['Harness ID', 'ID'],
        ['Modified By', 'Author'], ['Created Date', 'Created'], ['Modified Date', 'Modified']
    ].map(([k, l]) => h[k] ? `<div><div class="info-label">${l}</div><div>${h[k]}</div></div>` : '').join('');
}

function renderLoadConfig() {
    const body = document.getElementById('loadBody');
    const conns = Object.values(nwfData.connectors).filter(c => !c.name.startsWith('SP-')).sort((a, b) => a.name.localeCompare(b.name));
    body.innerHTML = conns.map(c => {
        const cfg = connConfig[c.name] || { role: 'passthrough', current: 0 };
        const desc = (c.params.DESCRIPTION || '').replace(/"/g, '');
        const pins = c.pins.map(p => p.name).join(', ');
        return `<tr data-conn="${c.name}" onmouseenter="onConnHover('${c.name}')" onmouseleave="onConnHover(null)">
            <td><strong>${c.name}</strong></td>
            <td style="font-size:.75rem;max-width:200px;overflow:hidden;text-overflow:ellipsis">${desc}</td>
            <td><select class="role-${cfg.role}" onchange="setRole('${c.name}',this.value)" onclick="event.stopPropagation()">
                <option value="power" ${cfg.role === 'power' ? 'selected' : ''}>Power Source</option>
                <option value="ground" ${cfg.role === 'ground' ? 'selected' : ''}>Ground Return</option>
                <option value="load" ${cfg.role === 'load' ? 'selected' : ''}>Load</option>
                <option value="signal" ${cfg.role === 'signal' ? 'selected' : ''}>Signal/Trigger</option>
                <option value="passthrough" ${cfg.role === 'passthrough' ? 'selected' : ''}>Pass-through</option>
            </select></td>
            <td>${cfg.role === 'load' || cfg.role === 'signal'
                ? `<input type="number" value="${cfg.current}" min="0" step="0.1" onchange="setCurrent('${c.name}',this.value)" onclick="event.stopPropagation()" />`
                : `<span style="color:var(--text-muted);font-size:.75rem">${cfg.role === 'power' || cfg.role === 'ground' ? 'auto' : '—'}</span>`}</td>
            <td style="font-size:.75rem">${pins}</td>
        </tr>`;
    }).join('');
}

function onConnHover(connName) {
    highlightedConn = connName;
    if (dsiData && nwfData) {
        renderDrawing();
        if (connName) {
            const el = document.getElementById('drawingLayout');
            if (el && !isElementInViewport(el)) el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
    }
}

function isElementInViewport(el) {
    const r = el.getBoundingClientRect();
    return r.top < window.innerHeight && r.bottom > 0;
}

function setRole(conn, role) { connConfig[conn].role = role; connConfig[conn].current = role === 'load' ? 5 : role === 'signal' ? 0.15 : 0; activeGroup = null; renderAll(); }
function setCurrent(conn, val) { connConfig[conn].current = parseFloat(val) || 0; activeGroup = null; renderAll(); }

function renderScenario() {
    const relays = [...new Set(circuitGroups.map(g => g.relayGroup).filter(r => r !== 'none'))];
    const el = document.getElementById('scenarioToggles');
    const card = document.getElementById('scenarioCard');
    if (!relays.length) { card.classList.add('hidden'); return; }
    card.classList.remove('hidden');

    const relayDescs = {};
    for (const r of relays) {
        const relayCircuits = circuitGroups.filter(g => g.relayGroup === r && connConfig[g.connName]?.role === 'load');
        relayDescs[r] = relayCircuits.map(g => g.name).join(', ');
    }

    let html = relays.map(r => {
        const on = activeRelays[r] !== false;
        return `<label class="scenario-toggle ${on ? 'on' : ''}">
            <input type="checkbox" ${on ? 'checked' : ''} onchange="toggleRelay('${r}',this.checked)" />
            <span><strong>${r}</strong></span>
            <span style="font-size:.72rem;color:var(--text-muted)">${relayDescs[r]}</span>
        </label>`;
    }).join('');

    html += `<span style="margin-left:8px;font-size:.72rem;color:var(--text-muted)">Presets:</span>`;
    for (const r of relays) {
        html += `<button class="scenario-preset" onclick="setScenario('${r}')">${r} only</button>`;
    }
    html += `<button class="scenario-preset" onclick="setScenario('all')">All On</button>`;
    el.innerHTML = html;
}

function toggleRelay(relay, on) { activeRelays[relay] = on; recalcFromScenario(); }

function setScenario(which) {
    const relays = [...new Set(circuitGroups.map(g => g.relayGroup).filter(r => r !== 'none'))];
    if (which === 'all') { for (const r of relays) activeRelays[r] = true; }
    else { for (const r of relays) activeRelays[r] = (r === which); }
    recalcFromScenario();
}

function recalcFromScenario() {
    calculateWireCurrents();
    calculateGroupDrops();
    const p = getParams();
    renderScenario();
    renderWires(p);
    renderGroups(p);
    renderSummary(p);
    if (dsiData) renderDrawing();
}

function renderSpools() {
    document.getElementById('spoolBody').innerHTML = Object.values(nwfData.spools).map(s => {
        const p2 = s.params;
        return `<tr><td>${p2.PART_NO || s.name}</td><td>${p2.WIRE_MATERIAL || ''}</td><td>${p2.WIRE_SIZE || ''}</td><td class="num">${p2.WIRE_CSA || ''}</td><td class="num">${p2.THICKNESS || ''}</td><td>${swatchHTML(p2.COLOR)}</td></tr>`;
    }).join('');
}

function renderConnectors() {
    document.getElementById('connBody').innerHTML = Object.values(nwfData.connectors).map(c =>
        `<tr><td><strong>${c.name}</strong></td><td>${(c.params.MODEL_NAME || '').replace(/"/g, '')}</td><td>${(c.params.DESCRIPTION || '').replace(/"/g, '')}</td><td>${c.pins.map(p => p.name).join(', ')}</td></tr>`
    ).join('');
}

function renderWires(p) {
    const sorted = [...nwfData.wires].sort((a, b) => {
        const dropA = calcDrop(a.lengthMM, getCSA(a), wireCurrents[a.name] || 0, p.resistivity);
        const dropB = calcDrop(b.lengthMM, getCSA(b), wireCurrents[b.name] || 0, p.resistivity);
        return dropB - dropA;
    });
    document.getElementById('wireBody').innerHTML = sorted.map(w => {
        const csa = getCSA(w), color = getColor(w), cur = wireCurrents[w.name] || 0;
        const vd = calcDrop(w.lengthMM, csa, cur, p.resistivity);
        const pct = (vd / p.voltage) * 100, st = statusOf(pct, p.maxDropPct);
        return `<tr><td><strong>${w.name}</strong></td><td>${w.from ? w.from.conn + ':' + w.from.pin : ''}</td><td>${w.to ? w.to.conn + ':' + w.to.pin : ''}</td><td class="num">${w.lengthMM}</td><td class="num">${csa}</td><td>${swatchHTML(color)}</td><td class="num">${cur.toFixed(2)}</td><td class="num">${vd.toFixed(4)}</td><td class="num">${pct.toFixed(2)}%</td><td><span class="badge badge-${st}">${st === 'fail' ? 'FAIL' : st === 'warn' ? 'WARN' : 'OK'}</span></td></tr>`;
    }).join('');
}

function renderPaths(p) {
    const adj = buildCircuitGraph();
    const terminals = Object.keys(adj).filter(isTerminal);
    const directPaths = [];
    for (const start of terminals) {
        for (const { node: next, wire } of (adj[start] || [])) {
            if (isTerminal(next) && !wire._internal) {
                const k = [start, next].sort().join('|');
                if (!directPaths.some(p2 => ([p2.from, p2.to].sort().join('|')) === k)) {
                    const vd = calcDrop(wire.lengthMM, getCSA(wire), wireCurrents[wire.name] || 0, p.resistivity);
                    directPaths.push({ from: start, to: next, wire, vd, pct: (vd / p.voltage) * 100 });
                }
            }
        }
    }
    directPaths.sort((a, b) => b.vd - a.vd);
    document.querySelector('[data-tab="paths"]').textContent = `All Paths (${directPaths.length})`;
    document.getElementById('pathsList').innerHTML = directPaths.map(dp => {
        const st = statusOf(dp.pct, p.maxDropPct);
        return `<div style="padding:5px 0;border-bottom:1px solid var(--border);font-size:.8rem">
            <span>${dp.from} &harr; ${dp.to}</span>
            <span class="badge badge-${st}" style="margin-left:6px">${dp.vd.toFixed(4)}V (${dp.pct.toFixed(2)}%)</span>
            <span style="font-size:.72rem;color:var(--text-muted);margin-left:6px">${dp.wire.name} @ ${(wireCurrents[dp.wire.name] || 0).toFixed(1)}A</span>
        </div>`;
    }).join('') || '<div style="color:var(--text-muted);padding:8px;font-size:.82rem">No paths.</div>';
}

function renderGroups(p) {
    const el = document.getElementById('groupsList');
    if (!circuitGroups.length) { el.innerHTML = '<div style="color:var(--text-muted);font-size:.8rem;padding:8px">No load circuits detected.</div>'; return; }

    el.innerHTML = circuitGroups.map((g, idx) => {
        const st = statusOf(g.pct, p.maxDropPct);
        const isActive = activeGroup === idx;
        const relayActive = g.relayGroup === 'none' || activeRelays[g.relayGroup] !== false;
        const dimmed = !relayActive;

        function wireRow(w) {
            const cur = wireCurrents[w.name] || 0;
            const vd = calcDrop(w.lengthMM, getCSA(w), cur, p.resistivity);
            return `<div class="group-wire"><span>${swatchHTML(getColor(w))} ${w.name}</span><span>${cur.toFixed(1)}A &rarr; ${vd.toFixed(4)}V</span></div>`;
        }

        let bodyHTML = '';
        if (g.relayGroup !== 'none') bodyHTML += `<div style="font-size:.68rem;margin-bottom:2px"><span class="badge ${relayActive ? 'badge-ok' : 'badge-warn'}">${g.relayGroup} ${relayActive ? 'ON' : 'OFF'}</span></div>`;
        if (g.supplyWires.length) bodyHTML += `<div class="group-section-label">Supply (${g.supplyDrop.toFixed(4)}V)</div>` + g.supplyWires.map(wireRow).join('');
        if (g.returnWires.length) bodyHTML += `<div class="group-section-label">Return (${g.returnDrop.toFixed(4)}V)</div>` + g.returnWires.map(wireRow).join('');
        bodyHTML += `<div class="group-total"><span>Round Trip @ ${g.current}A</span><span>${g.totalDrop.toFixed(4)}V (${g.pct.toFixed(2)}%)</span></div>`;

        return `<div class="group-item ${isActive ? 'active' : ''}" style="${dimmed ? 'opacity:.4' : ''}" onclick="toggleGroup(${idx})">
            <div class="group-header"><span>${g.name}</span><span class="badge badge-${st}">${g.totalDrop.toFixed(3)}V &bull; ${g.pct.toFixed(1)}%</span></div>
            <div class="group-body"><div style="font-size:.7rem;color:var(--text-muted);margin-bottom:3px">${g.desc}</div>${bodyHTML}</div>
        </div>`;
    }).join('');
}

function toggleGroup(idx) { activeGroup = activeGroup === idx ? null : idx; const p = getParams(); renderGroups(p); if (dsiData) renderDrawing(); }

function renderSummary(p) {
    const el = document.getElementById('summarySection');
    const activeCircuits = circuitGroups.filter(g => g.relayGroup === 'none' || activeRelays[g.relayGroup] !== false);
    const worst = activeCircuits[0];
    if (!worst) { el.innerHTML = ''; return; }
    const st = statusOf(worst.pct, p.maxDropPct);
    const bgMap = { fail: 'var(--danger-light)', warn: 'var(--warn-light)', ok: 'var(--success-light)' };
    const fgMap = { fail: 'var(--danger)', warn: 'var(--warn)', ok: 'var(--success)' };
    const passCt = activeCircuits.filter(g => g.pct <= p.maxDropPct).length;
    const failCt = activeCircuits.filter(g => g.pct > p.maxDropPct).length;
    let maxCurWire = '', maxCur = 0;
    for (const [wn, c] of Object.entries(wireCurrents)) { if (c > maxCur) { maxCur = c; maxCurWire = wn; } }
    const activeRelayCount = Object.values(activeRelays).filter(v => v).length;
    const totalRelays = [...new Set(circuitGroups.map(g => g.relayGroup).filter(r => r !== 'none'))].length;

    el.innerHTML = `
        <div class="summary-item" style="background:${bgMap[st]};color:${fgMap[st]}"><div class="label">Worst Circuit Drop</div><div class="value">${worst.totalDrop.toFixed(3)}V</div><div class="sub">${worst.pct.toFixed(2)}% &bull; ${worst.name}</div></div>
        <div class="summary-item" style="background:var(--accent-light);color:var(--accent)"><div class="label">Active Circuits</div><div class="value">${activeCircuits.length}</div><div class="sub">${passCt} pass, ${failCt} fail</div></div>
        <div class="summary-item" style="background:var(--card);border:1px solid var(--border)"><div class="label">Max Wire Current</div><div class="value">${maxCur.toFixed(1)}A</div><div class="sub">${maxCurWire}</div></div>
        <div class="summary-item" style="background:var(--card);border:1px solid var(--border)"><div class="label">Scenario</div><div class="value">${activeRelayCount}/${totalRelays}</div><div class="sub">relays active</div></div>
    `;
}
