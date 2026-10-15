document.addEventListener('DOMContentLoaded', () => {
    const $ = (id) => document.getElementById(id);
    const views = { login: $('login-view'), app: $('app-view') };
    let meta = null;
    let currentRef = null;

    // ---- helpers ----
    async function api(path, options = {}) {
        const res = await fetch(path, {
            credentials: 'same-origin',
            headers: options.body ? { 'Content-Type': 'application/json' } : undefined,
            ...options,
            body: options.body ? JSON.stringify(options.body) : undefined,
        });
        const data = await res.json().catch(() => ({}));
        if (res.status === 401 && path !== '/api/admin/session') showLogin();
        if (!res.ok) throw new Error(data.error || 'Request failed');
        return data;
    }

    const fmt = (iso) => new Date(iso).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' });

    function el(tag, className, text) {
        const e = document.createElement(tag);
        if (className) e.className = className;
        if (text !== undefined && text !== null) e.textContent = text;
        return e;
    }

    function showError(node, message) {
        node.textContent = message;
        node.classList.toggle('hidden', !message);
    }

    function fillSelect(select, options) {
        select.replaceChildren(...options.map(([value, label]) => {
            const o = el('option', '', label);
            o.value = value;
            return o;
        }));
    }

    function showLogin() {
        views.app.classList.add('hidden');
        views.login.classList.remove('hidden');
        $('logout-btn').classList.add('hidden');
    }

    function showApp() {
        views.login.classList.add('hidden');
        views.app.classList.remove('hidden');
        $('logout-btn').classList.remove('hidden');
        fillSelect($('n-service'), Object.entries(meta.services));
        fillSelect($('n-destination'), meta.destinations.map((d) => [d, d]));
        fillSelect($('e-status'), meta.statuses.map((s) => [s, s]));
        loadList();
    }

    function showPanel(which) {
        $('panel-empty').classList.toggle('hidden', which !== 'empty');
        $('new-form').classList.toggle('hidden', which !== 'new');
        $('detail').classList.toggle('hidden', which !== 'detail');
    }

    // ---- session ----
    async function init() {
        try {
            const s = await api('/api/admin/session');
            if (s.signedIn) { meta = s.meta; showApp(); } else { showLogin(); }
        } catch {
            showLogin();
        }
    }

    $('login-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        showError($('login-error'), '');
        try {
            const s = await api('/api/admin/session', { method: 'POST', body: { password: $('login-password').value } });
            $('login-password').value = '';
            meta = s.meta;
            showApp();
        } catch (err) {
            showError($('login-error'), err.message);
        }
    });

    $('logout-btn').addEventListener('click', async () => {
        await api('/api/admin/session', { method: 'DELETE' }).catch(() => {});
        showLogin();
    });

    // ---- list ----
    async function loadList() {
        const q = $('search-input').value.trim();
        const { shipments } = await api('/api/admin/shipments' + (q ? '?q=' + encodeURIComponent(q) : ''));
        const body = $('shipment-rows');
        body.replaceChildren(...shipments.map((s) => {
            const tr = el('tr', 'border-t hover:bg-gray-50 cursor-pointer' + (s.tracking_ref === currentRef ? ' bg-yellow-50' : ''));
            tr.append(
                el('td', 'px-4 py-3 font-semibold text-sams-blue', s.tracking_ref),
                el('td', 'px-4 py-3', s.customer_name),
                el('td', 'px-4 py-3', meta.services[s.service] || s.service),
                el('td', 'px-4 py-3', s.destination),
                el('td', 'px-4 py-3', s.status),
            );
            tr.addEventListener('click', () => openShipment(s.tracking_ref));
            return tr;
        }));
        $('list-empty').classList.toggle('hidden', shipments.length > 0);
    }

    let searchTimer;
    $('search-input').addEventListener('input', () => {
        clearTimeout(searchTimer);
        searchTimer = setTimeout(() => loadList().catch(() => {}), 300);
    });

    // ---- new shipment ----
    $('new-btn').addEventListener('click', () => {
        currentRef = null;
        $('new-form').reset();
        showError($('new-error'), '');
        showPanel('new');
    });
    $('new-cancel').addEventListener('click', () => showPanel('empty'));

    $('new-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        showError($('new-error'), '');
        try {
            const { ref } = await api('/api/admin/shipments', {
                method: 'POST',
                body: {
                    service: $('n-service').value,
                    destination: $('n-destination').value,
                    customerName: $('n-name').value,
                    customerEmail: $('n-email').value,
                    customerPhone: $('n-phone').value,
                    receiverName: $('n-receiver').value,
                    description: $('n-desc').value,
                },
            });
            await loadList();
            await openShipment(ref);
        } catch (err) {
            showError($('new-error'), err.message);
        }
    });

    // ---- detail ----
    async function openShipment(ref) {
        currentRef = ref;
        showError($('event-error'), '');
        const { shipment: s, events } = await api('/api/admin/shipment?ref=' + encodeURIComponent(ref));
        $('d-ref').textContent = s.tracking_ref;
        $('d-meta').textContent = `${meta.services[s.service] || s.service} to ${s.destination} · ${s.status}`;

        const rows = [
            ['Customer', s.customer_name], ['Email', s.customer_email], ['Phone', s.customer_phone],
            ['Receiver', s.receiver_name], ['Notes', s.description], ['Created', fmt(s.created_at)],
        ].filter(([, v]) => v);
        $('d-info').replaceChildren(...rows.flatMap(([k, v]) => [el('dt', 'text-gray-500', k), el('dd', 'col-span-2 break-words', v)]));

        $('e-status').value = s.status;
        $('e-location').value = '';
        $('e-note').value = '';

        $('d-events').replaceChildren(...events.map((ev) => {
            const li = el('li', 'border-l-2 border-sams-gold pl-3');
            li.append(el('p', 'font-semibold', ev.status));
            if (ev.location) li.append(el('p', 'text-gray-600', ev.location));
            if (ev.note) li.append(el('p', 'text-gray-600', ev.note));
            li.append(el('p', 'text-xs text-gray-400', fmt(ev.created_at)));
            return li;
        }));
        showPanel('detail');
        loadList().catch(() => {});
    }

    $('event-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        showError($('event-error'), '');
        try {
            await api('/api/admin/shipment', {
                method: 'POST',
                body: { ref: currentRef, status: $('e-status').value, location: $('e-location').value, note: $('e-note').value },
            });
            await openShipment(currentRef);
        } catch (err) {
            showError($('event-error'), err.message);
        }
    });

    $('delete-btn').addEventListener('click', async () => {
        if (!currentRef || !confirm(`Delete shipment ${currentRef}? This cannot be undone.`)) return;
        try {
            await api('/api/admin/shipment?ref=' + encodeURIComponent(currentRef), { method: 'DELETE' });
            currentRef = null;
            showPanel('empty');
            loadList();
        } catch (err) {
            showError($('event-error'), err.message);
        }
    });

    init();
});
