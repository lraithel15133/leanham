// ═══════════════════════════════════════════════════════════
// NWF PARSER
// ═══════════════════════════════════════════════════════════
function parseNWF(text) {
    const lines = text.split(/\r?\n/), header = {}, spools = {}, connectors = {}, wires = [];
    for (const line of lines) {
        const t = line.trim();
        if (!t.startsWith('!')) continue;
        const m = t.match(/^!\s+(Filename|Harness PartNum|Harness Rev|Harness ID|Modified By|Created Date|Modified Date)\s*:\s*(.*)$/i);
        if (m) header[m[1].trim()] = m[2].trim();
    }
    let i = 0;
    while (i < lines.length) {
        const line = lines[i].trim();
        if (line.match(/^NEW\s+WIRE_SPOOL\s+/)) {
            const name = line.replace(/^NEW\s+WIRE_SPOOL\s+/, '').trim();
            const sp = { name, params: {} };
            i++;
            while (i < lines.length) {
                const l = lines[i].trim();
                if (l.startsWith('PARAMETER ')) {
                    const m = l.match(/^PARAMETER\s+(\S+)\s+(.*)/);
                    if (m) sp.params[m[1]] = m[2].trim();
                } else if (l.startsWith('NEW ') || l.startsWith('!====')) break;
                i++;
            }
            spools[name] = sp;
            continue;
        }
        if (line.match(/^NEW\s+CONNECTOR\s+/)) {
            const name = line.replace(/^NEW\s+CONNECTOR\s+/, '').trim();
            const conn = { name, params: {}, pins: [] };
            i++;
            let curPin = null;
            while (i < lines.length) {
                const l = lines[i].trim();
                if (l.startsWith('NEW ') || l.startsWith('!====')) break;
                if (l.startsWith('PIN ')) {
                    curPin = { name: l.replace(/^PIN\s+/, '').trim(), params: {} };
                    conn.pins.push(curPin);
                } else if (l.startsWith('PARAMETER ')) {
                    const m = l.match(/^PARAMETER\s+(\S+)\s+(.*)/);
                    if (m) {
                        const v = m[2].replace(/\s*!.*$/, '').trim();
                        if (curPin) curPin.params[m[1]] = v;
                        else conn.params[m[1]] = v;
                    }
                }
                i++;
            }
            connectors[name] = conn;
            continue;
        }
        if (line.match(/^NEW\s+WIRE\s+/)) {
            const wm = line.match(/^NEW\s+WIRE\s+(\S+)\s+(\S+)/);
            if (wm) {
                const w = { name: wm[1], spool: wm[2], from: null, to: null, lengthMM: 0 };
                i++;
                while (i < lines.length) {
                    const l = lines[i].trim();
                    if (l.startsWith('NEW ') || l.startsWith('!====')) break;
                    if (l.startsWith('ATTACH')) {
                        const a = l.match(/^ATTACH\s+(\S+)\s+(\S+)\s+(\S+)\s+(\S+)/);
                        if (a) { w.from = { conn: a[1], pin: a[2] }; w.to = { conn: a[3], pin: a[4] }; }
                    }
                    if (l.match(/WIRE_LENGTH_MM/)) {
                        const m = l.match(/WIRE_LENGTH_MM\s+(\d+\.?\d*)/);
                        if (m) w.lengthMM = parseFloat(m[1]);
                    }
                    i++;
                }
                wires.push(w);
                continue;
            }
        }
        i++;
    }
    return { header, spools, connectors, wires };
}

// ═══════════════════════════════════════════════════════════
// DSI PARSER
// ═══════════════════════════════════════════════════════════
function parseDSI(text) {
    const lines = text.split(/\r?\n/), branches = [], virtualLinks = [], wireSpecs = [], nodeComponents = [];
    let section = '';
    for (const line of lines) {
        const t = line.trim();
        if (t.startsWith('%')) { section = t.replace(/^%\s*/, '').trim().toLowerCase(); continue; }
        if (!t || t.startsWith('!') || t.startsWith('*')) continue;
        if (section.includes('branch configuration')) {
            const parts = t.split(':');
            if (parts.length < 7) continue;
            const fromNode = parts[0], toNode = parts[3], fromPos = parsePos(parts[2]), toPos = parsePos(parts[5]);
            if (!fromPos || !toPos) continue;
            const len = parseFloat(parts[6]) || 0, isVirtual = t.includes('VIRTUAL_LINK_BUNDLE');
            let bundle = '', waypoints = [];
            for (let j = 18; j < parts.length; j++) {
                const p = parts[j].trim();
                if (p.match(/^BUNDLE/i)) bundle = p;
                else { const wp = parsePos(p); if (wp) waypoints.push(wp); }
            }
            if (isVirtual) virtualLinks.push({ fromNode, toNode, fromPos, toPos });
            else branches.push({ fromNode, toNode, fromPos, toPos, length: len, bundle, waypoints });
        }
        if (section.includes('wire specification')) {
            const parts = t.split(':');
            if (parts.length < 25) continue;
            wireSpecs.push({ name: parts[0], color: parts[3], csa: parseFloat(parts[4]) || 0, material: parts[5], fromConn: parts[8], fromPin: parts[10], toConn: parts[12], toPin: parts[14], minLen: parseFloat(parts[24]) || 0, maxLen: parseFloat(parts[25]) || 0, spool: parts[28] || '' });
        }
        if (section.includes('node components')) {
            const parts = t.split(':');
            if (parts.length < 5) continue;
            nodeComponents.push({ refDes: parts[0], type: parts[4], desc: parts[6] || '', partNum: parts[8] || '' });
        }
    }
    const nodePos = {};
    for (const b of [...branches, ...virtualLinks]) {
        if (b.fromPos) nodePos[b.fromNode] = b.fromPos;
        if (b.toPos) nodePos[b.toNode] = b.toPos;
    }
    const connectorNodes = {};
    for (const vl of virtualLinks) {
        if (vl.toNode.match(/^(X-|SP-)/)) connectorNodes[vl.toNode] = { node: vl.fromNode, pos: vl.toPos };
        if (vl.fromNode.match(/^(X-|SP-)/)) connectorNodes[vl.fromNode] = { node: vl.toNode, pos: vl.fromPos };
    }
    return { branches, virtualLinks, wireSpecs, nodeComponents, nodePos, connectorNodes };
}

function parsePos(s) {
    if (!s) return null;
    const m = s.trim().match(/x(-?\d+\.?\d*)y(-?\d+\.?\d*)/i);
    return m ? { x: parseFloat(m[1]), y: parseFloat(m[2]) } : null;
}
