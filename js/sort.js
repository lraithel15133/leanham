// ═══════════════════════════════════════════════════════════
// SORTABLE TABLES
// ═══════════════════════════════════════════════════════════
(function () {
    // Track sort state per table so re-renders preserve direction
    const sortStates = new WeakMap();

    function getSortVal(cell) {
        // Strip badge text, swatch spans, whitespace
        const raw = cell.textContent.trim().replace(/[%VAWARN OKFAIL]/g, '').trim();
        const num = parseFloat(raw.replace(/[^0-9.\-]/g, ''));
        return { raw: cell.textContent.trim(), num: isNaN(num) ? null : num };
    }

    function sortTableByCol(table, colIdx) {
        const tbody = table.querySelector('tbody');
        if (!tbody) return;
        const rows = Array.from(tbody.querySelectorAll('tr'));
        if (!rows.length) return;

        let state = sortStates.get(table) || { col: -1, dir: 'none' };

        // Toggle direction
        let newDir;
        if (state.col === colIdx) {
            newDir = state.dir === 'asc' ? 'desc' : state.dir === 'desc' ? 'none' : 'asc';
        } else {
            newDir = 'asc';
        }

        // Clear all header indicators
        table.querySelectorAll('th').forEach(h => h.classList.remove('sort-asc', 'sort-desc'));

        if (newDir === 'none') {
            // Restore original order
            sortStates.set(table, { col: -1, dir: 'none' });
            const origOrder = sortStates.get(table)._origOrder;
            if (origOrder) origOrder.forEach(r => tbody.appendChild(r));
            return;
        }

        // Store original order on first sort
        if (!state._origOrder) {
            state._origOrder = [...rows];
        }

        const th = table.querySelectorAll('th')[colIdx];
        if (th) th.classList.add('sort-' + newDir);

        rows.sort((a, b) => {
            const aCell = a.cells[colIdx];
            const bCell = b.cells[colIdx];
            if (!aCell || !bCell) return 0;

            const aV = getSortVal(aCell);
            const bV = getSortVal(bCell);

            let cmp;
            if (aV.num !== null && bV.num !== null) {
                cmp = aV.num - bV.num;
            } else {
                cmp = aV.raw.localeCompare(bV.raw, undefined, { numeric: true, sensitivity: 'base' });
            }

            return newDir === 'asc' ? cmp : -cmp;
        });

        rows.forEach(r => tbody.appendChild(r));
        sortStates.set(table, { col: colIdx, dir: newDir, _origOrder: state._origOrder });
    }

    // Use event delegation on document so it works even after re-renders
    document.addEventListener('click', function (e) {
        const th = e.target.closest('th.sortable');
        if (!th) return;
        const table = th.closest('table');
        if (!table) return;
        const colIdx = Array.from(th.parentElement.children).indexOf(th);
        sortTableByCol(table, colIdx);
    });

    // After each render, re-apply the active sort if any
    window.reapplySorts = function () {
        document.querySelectorAll('th.sortable.sort-asc, th.sortable.sort-desc').forEach(th => {
            const table = th.closest('table');
            if (!table) return;
            const colIdx = Array.from(th.parentElement.children).indexOf(th);
            const isAsc = th.classList.contains('sort-asc');

            const tbody = table.querySelector('tbody');
            if (!tbody) return;
            const rows = Array.from(tbody.querySelectorAll('tr'));
            if (!rows.length) return;

            rows.sort((a, b) => {
                const aCell = a.cells[colIdx];
                const bCell = b.cells[colIdx];
                if (!aCell || !bCell) return 0;
                const aV = getSortVal(aCell);
                const bV = getSortVal(bCell);
                let cmp;
                if (aV.num !== null && bV.num !== null) cmp = aV.num - bV.num;
                else cmp = aV.raw.localeCompare(bV.raw, undefined, { numeric: true, sensitivity: 'base' });
                return isAsc ? cmp : -cmp;
            });

            rows.forEach(r => tbody.appendChild(r));
        });
    };
})();
