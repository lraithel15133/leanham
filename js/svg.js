// ═══════════════════════════════════════════════════════════
// SVG DRAWING
// ═══════════════════════════════════════════════════════════
function renderDrawing() {
    if (!dsiData || !nwfData) return;
    const svg = document.getElementById('harnessSvg');
    const p = getParams();
    const isDark = document.body.dataset.theme === 'dark';

    const allPos = Object.values(dsiData.nodePos);
    if (!allPos.length) return;
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const pos of allPos) { minX = Math.min(minX, pos.x); maxX = Math.max(maxX, pos.x); minY = Math.min(minY, pos.y); maxY = Math.max(maxY, pos.y); }
    const pad = 40; minX -= pad; minY -= pad; maxX += pad; maxY += pad;
    svg.setAttribute('viewBox', `${minX} ${minY} ${maxX - minX} ${maxY - minY}`);

    const wireRoutes = {};
    const branchAdj = {};
    function addBA(a, b, branch) { if (!branchAdj[a]) branchAdj[a] = []; if (!branchAdj[b]) branchAdj[b] = []; branchAdj[a].push({ node: b, branch }); branchAdj[b].push({ node: a, branch }); }
    for (const br of dsiData.branches) addBA(br.fromNode, br.toNode, br);
    for (const w of nwfData.wires) {
        if (!w.from || !w.to) continue;
        const fi = dsiData.connectorNodes[w.from.conn], ti = dsiData.connectorNodes[w.to.conn];
        if (!fi || !ti) continue;
        if (fi.node === ti.node) { wireRoutes[w.name] = []; continue; }
        const visited = new Set([fi.node]), queue = [{ node: fi.node, path: [] }]; let found = null;
        while (queue.length && !found) {
            const { node, path } = queue.shift();
            for (const { node: next, branch } of (branchAdj[node] || [])) {
                if (visited.has(next)) continue;
                visited.add(next);
                const np = [...path, branch];
                if (next === ti.node) { found = np; break; }
                queue.push({ node: next, path: np });
            }
        }
        wireRoutes[w.name] = found || [];
    }

    const hlBranches = new Set(), hlConns = new Set();
    if (activeGroup !== null && circuitGroups[activeGroup]) {
        const wns = circuitGroups[activeGroup].allWireNames;
        for (const wn of wns) {
            if (wireRoutes[wn]) for (const br of wireRoutes[wn]) hlBranches.add(br);
            const w = nwfData.wires.find(w2 => w2.name === wn);
            if (w) { if (w.from) hlConns.add(w.from.conn); if (w.to) hlConns.add(w.to.conn); }
        }
    }
    if (highlightedConn) {
        hlConns.add(highlightedConn);
        for (const w of nwfData.wires) {
            if ((w.from && w.from.conn === highlightedConn) || (w.to && w.to.conn === highlightedConn)) {
                if (wireRoutes[w.name]) for (const br of wireRoutes[w.name]) hlBranches.add(br);
                if (w.from) hlConns.add(w.from.conn);
                if (w.to) hlConns.add(w.to.conn);
            }
        }
    }
    const hasHighlight = activeGroup !== null || highlightedConn;

    const branchWorstPct = new Map();
    for (const w of nwfData.wires) {
        const route = wireRoutes[w.name] || [];
        const cur = wireCurrents[w.name] || 0;
        const vd = calcDrop(w.lengthMM, getCSA(w), cur, p.resistivity);
        const pct = (vd / p.voltage) * 100;
        for (const br of route) { const c = branchWorstPct.get(br) || 0; if (pct > c) branchWorstPct.set(br, pct); }
    }

    let html = `<g id="svgRoot" transform="translate(${svgTransform.x},${svgTransform.y}) scale(${svgTransform.scale})">`;
    const bc = isDark ? '#444' : '#ccc';

    for (const br of dsiData.branches) {
        const pts = [br.fromPos, ...br.waypoints, br.toPos];
        const ptStr = pts.map(p2 => `${p2.x},${p2.y}`).join(' ');
        const isHL = hlBranches.has(br);
        const worstPct = branchWorstPct.get(br) || 0;
        let color = bc, width = 3, opacity = .5;
        if (hasHighlight) {
            if (isHL) { color = worstPct > p.maxDropPct ? '#ef4444' : worstPct > p.maxDropPct * .7 ? '#f59e0b' : '#22c55e'; width = 5; opacity = 1; }
            else { opacity = .15; }
        } else {
            if (worstPct > 0) { const t = Math.min(worstPct / p.maxDropPct, 1.5); color = t > 1 ? '#ef4444' : t > .7 ? '#f59e0b' : isDark ? '#555' : '#bbb'; opacity = .4 + t * .4; width = 2 + t * 2; }
        }
        html += `<polyline points="${ptStr}" fill="none" stroke="${color}" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round" opacity="${opacity}" />`;
        if (isHL && br.bundle) {
            const mid = pts[Math.floor(pts.length / 2)];
            const branchWires = nwfData.wires.filter(w => (wireRoutes[w.name] || []).includes(br));
            const totalCur = branchWires.reduce((s, w) => Math.max(s, wireCurrents[w.name] || 0), 0);
            if (totalCur > 0) html += `<text x="${mid.x}" y="${mid.y - 4}" text-anchor="middle" font-size="3.2" fill="${color}" font-weight="600">${totalCur.toFixed(1)}A</text>`;
        }
    }

    for (const [name, pos] of Object.entries(dsiData.nodePos)) {
        if (name.match(/^(X-|SP-)/)) continue;
        html += `<circle cx="${pos.x}" cy="${pos.y}" r="1.2" fill="${isDark ? '#555' : '#aaa'}" opacity="${hasHighlight ? .15 : .5}" />`;
    }

    for (const [name, info] of Object.entries(dsiData.connectorNodes)) {
        const pos = info.pos, isSplice = name.startsWith('SP-'), isHL = hlConns.has(name);
        const baseOp = hasHighlight && !isHL ? .2 : 1;
        const cfg = connConfig[name];
        const roleColor = cfg ? { power: '#dc2626', ground: '#16a34a', load: '#2563eb', signal: '#d97706', passthrough: isDark ? '#666' : '#999' }[cfg.role] : (isDark ? '#666' : '#999');

        if (isSplice) {
            html += `<circle cx="${pos.x}" cy="${pos.y}" r="2.5" fill="${isHL ? '#f59e0b' : isDark ? '#444' : '#bbb'}" stroke="${isDark ? '#777' : '#888'}" stroke-width=".5" opacity="${baseOp}" />`;
            html += `<text x="${pos.x}" y="${pos.y + 5.5}" text-anchor="middle" font-size="2.8" fill="${isDark ? '#999' : '#777'}" opacity="${baseOp}">${name}</text>`;
        } else {
            const isHover = highlightedConn === name;
            const w2 = isHover ? 20 : 16, h2 = isHover ? 11 : 9;
            const stroke = isHover ? '#f59e0b' : isHL ? '#3b82f6' : roleColor;
            const sw = isHover ? 2 : isHL ? 1.2 : .7;
            const fill = isHover ? (isDark ? '#4a3000' : '#fff3cd') : isHL ? (isDark ? '#1e3a5f' : '#dbeafe') : (isDark ? '#252525' : '#fff');
            const connOp = isHover ? 1 : baseOp;
            if (isHover) html += `<rect x="${pos.x - w2 / 2 - 2}" y="${pos.y - h2 / 2 - 2}" width="${w2 + 4}" height="${h2 + 4}" rx="4" fill="none" stroke="#f59e0b" stroke-width="1" opacity=".5" stroke-dasharray="2,2"><animate attributeName="stroke-dashoffset" from="0" to="8" dur="1s" repeatCount="indefinite"/></rect>`;
            html += `<rect x="${pos.x - w2 / 2}" y="${pos.y - h2 / 2}" width="${w2}" height="${h2}" rx="2" fill="${fill}" stroke="${stroke}" stroke-width="${sw}" opacity="${connOp}" />`;
            html += `<text x="${pos.x}" y="${pos.y + .5}" text-anchor="middle" font-size="${isHover ? 3.5 : 3}" fill="${isHover ? '#f59e0b' : isDark ? '#ddd' : '#333'}" font-weight="600" opacity="${connOp}" dominant-baseline="middle">${name}</text>`;
            const roleLabel = { power: 'PWR', ground: 'GND', load: 'LOAD', signal: 'SIG', passthrough: '' }[cfg?.role || ''] || '';
            if (roleLabel) html += `<text x="${pos.x}" y="${pos.y + h2 / 2 + 3.5}" text-anchor="middle" font-size="2.3" fill="${roleColor}" opacity="${baseOp}" font-weight="600">${roleLabel}${cfg && cfg.current > 0 ? ' ' + cfg.current + 'A' : ''}</text>`;
        }
    }

    html += '</g>';
    svg.innerHTML = html;
    const legend = document.getElementById('svgLegend');
    if (highlightedConn) legend.innerHTML = `Highlighting: <strong>${highlightedConn}</strong>`;
    else if (activeGroup !== null) legend.innerHTML = `Showing: <strong>${circuitGroups[activeGroup]?.name || ''}</strong> | Click to deselect`;
    else legend.innerHTML = 'Heat map: wire voltage drop | Click a circuit group to isolate';
}

// ═══════════════════════════════════════════════════════════
// PAN / ZOOM
// ═══════════════════════════════════════════════════════════
let isPanning = false, panStart = { x: 0, y: 0 };

document.getElementById('svgContainer').addEventListener('mousedown', e => {
    if (e.button === 0) { isPanning = true; panStart = { x: e.clientX - svgTransform.x, y: e.clientY - svgTransform.y }; }
});
window.addEventListener('mousemove', e => {
    if (isPanning) { svgTransform.x = e.clientX - panStart.x; svgTransform.y = e.clientY - panStart.y; updateSvgT(); }
});
window.addEventListener('mouseup', () => { isPanning = false; });
document.getElementById('svgContainer').addEventListener('wheel', e => {
    e.preventDefault(); svgTransform.scale *= e.deltaY > 0 ? .9 : 1.1; updateSvgT();
}, { passive: false });

function svgZoom(f) { svgTransform.scale *= f; updateSvgT(); }
function svgReset() { svgTransform = { x: 0, y: 0, scale: 1 }; updateSvgT(); }
function updateSvgT() { const r = document.getElementById('svgRoot'); if (r) r.setAttribute('transform', `translate(${svgTransform.x},${svgTransform.y}) scale(${svgTransform.scale})`); }
