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
        fillSelect($('i-category'), meta.supplyCategories.map((c) => [c, c]));
        loadList();
        refreshBadge();
        refreshOrdersBadge();
        refreshMessagesBadge();
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
        $('event-ok').classList.add('hidden');
        const canEmail = Boolean(s.customer_email);
        $('e-notify').disabled = !canEmail;
        $('e-notify').checked = canEmail;
        $('e-notify-hint').textContent = canEmail ? 'Sent to ' + s.customer_email : 'No email address saved for this customer';

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
            const result = await api('/api/admin/shipment', {
                method: 'POST',
                body: {
                    ref: currentRef, status: $('e-status').value, location: $('e-location').value,
                    note: $('e-note').value, notify: $('e-notify').checked,
                },
            });
            await openShipment(currentRef);
            const ok = $('event-ok');
            if (result.emailed === 'sent') ok.textContent = 'Update saved. The customer has been emailed.';
            else if (result.emailed === 'failed') ok.textContent = 'Update saved, but the email could not be sent.';
            else ok.textContent = 'Update saved.';
            ok.classList.remove('hidden');
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

    // ---- tabs ----
    const TABS = ['shipments', 'requests', 'orders', 'messages', 'supplies'];

    function showTab(name) {
        for (const tab of TABS) {
            const on = tab === name;
            $('tab-' + tab).classList.toggle('hidden', !on);
            $('tab-btn-' + tab).className = 'px-4 py-2 font-semibold border-b-2 -mb-px ' +
                (on ? 'text-sams-blue border-sams-gold' : 'text-gray-500 border-transparent hover:text-sams-blue');
        }
        if (name === 'requests') {
            if (!currentRequest) showRequestPanel('empty'); // never leave a handled request's buttons on screen
            loadRequests().catch(() => {});
        }
        if (name === 'orders') {
            if (!currentOrder) showOrderPanel('empty');
            loadOrders().catch(() => {});
        }
        if (name === 'messages') {
            if (!currentMessage) showMessagePanel('empty');
            loadMessages().catch(() => {});
        }
        if (name === 'supplies') loadItems().catch(() => {});
    }
    for (const tab of TABS) $('tab-btn-' + tab).addEventListener('click', () => showTab(tab));

    // ---- booking requests ----
    let currentRequest = null;

    function setBadge(n) {
        const badge = $('requests-badge');
        badge.textContent = n;
        badge.classList.toggle('hidden', !n);
    }

    async function refreshBadge() {
        try {
            const { newCount } = await api('/api/admin/bookings?status=new');
            setBadge(newCount);
        } catch { /* ignore */ }
    }

    function showRequestPanel(which) {
        $('request-panel-empty').classList.toggle('hidden', which !== 'empty');
        $('request-detail').classList.toggle('hidden', which !== 'detail');
    }

    async function loadRequests() {
        const status = $('request-filter').value;
        const { requests, newCount } = await api('/api/admin/bookings?status=' + encodeURIComponent(status));
        setBadge(newCount);
        $('request-rows').replaceChildren(...requests.map((r) => {
            const tr = el('tr', 'border-t hover:bg-gray-50 cursor-pointer' + (currentRequest && r.id === currentRequest.id ? ' bg-yellow-50' : ''));
            tr.append(
                el('td', 'px-4 py-3 font-semibold text-sams-blue', r.reference),
                el('td', 'px-4 py-3', r.customer_name),
                el('td', 'px-4 py-3', meta.services[r.service] || r.service),
                el('td', 'px-4 py-3', r.destination),
                el('td', 'px-4 py-3', fmt(r.created_at)),
                el('td', 'px-4 py-3', r.status),
            );
            tr.addEventListener('click', () => openRequest(r));
            return tr;
        }));
        $('request-empty').classList.toggle('hidden', requests.length > 0);
    }

    function openRequest(r) {
        currentRequest = r;
        showError($('r-error'), '');
        showError($('r-delete-error'), '');
        $('r-ref').textContent = r.reference;
        $('r-meta').textContent = `${meta.services[r.service] || r.service} to ${r.destination} · ${r.status}`;
        const rows = [
            ['Name', r.customer_name], ['Phone', r.customer_phone], ['Email', r.customer_email],
            ['Pick-up', r.pickup_address], ['Delivery', r.delivery_address],
            ['Date', r.preferred_date ? String(r.preferred_date).slice(0, 10) : null],
            ['Notes', r.description], ['Received', fmt(r.created_at)],
        ].filter(([, v]) => v);
        $('r-info').replaceChildren(...rows.flatMap(([k, v]) => [
            el('dt', 'text-gray-500', k),
            el('dd', 'col-span-2 break-words whitespace-pre-line', v),
        ]));
        const isNew = r.status === 'new';
        $('r-actions').classList.toggle('hidden', !isNew);
        const done = $('r-done');
        done.classList.toggle('hidden', isNew);
        done.textContent = isNew ? '' : (r.status === 'accepted'
            ? `Accepted${r.shipment_ref ? ' - tracking number ' + r.shipment_ref : ''}.`
            : 'Declined.');
        $('r-location').value = '';
        showRequestPanel('detail');
    }

    $('request-filter').addEventListener('change', () => {
        currentRequest = null;
        showRequestPanel('empty');
        loadRequests().catch(() => {});
    });

    $('r-accept').addEventListener('click', async () => {
        if (!currentRequest) return;
        showError($('r-error'), '');
        $('r-accept').disabled = true;
        try {
            const { shipmentRef } = await api('/api/admin/bookings', {
                method: 'POST',
                body: { id: currentRequest.id, action: 'accept', location: $('r-location').value },
            });
            currentRequest = null;
            showRequestPanel('empty');
            showTab('shipments');
            await loadList();
            await openShipment(shipmentRef);
            refreshBadge();
        } catch (err) {
            showError($('r-error'), err.message);
        } finally {
            $('r-accept').disabled = false;
        }
    });

    $('r-decline').addEventListener('click', async () => {
        if (!currentRequest) return;
        const mailNote = currentRequest.customer_email ? ' The customer will be emailed.' : '';
        if (!confirm(`Decline request ${currentRequest.reference}?${mailNote}`)) return;
        showError($('r-error'), '');
        try {
            await api('/api/admin/bookings', { method: 'POST', body: { id: currentRequest.id, action: 'decline' } });
            currentRequest = null;
            showRequestPanel('empty');
            await loadRequests();
        } catch (err) {
            showError($('r-error'), err.message);
        }
    });

    $('r-delete').addEventListener('click', async () => {
        if (!currentRequest) return;
        const keep = currentRequest.shipment_ref ? ` The shipment ${currentRequest.shipment_ref} is kept.` : '';
        if (!confirm(`Delete request ${currentRequest.reference} for good? This cannot be undone.${keep}`)) return;
        showError($('r-delete-error'), '');
        try {
            await api('/api/admin/bookings?id=' + encodeURIComponent(currentRequest.id), { method: 'DELETE' });
            currentRequest = null;
            showRequestPanel('empty');
            await loadRequests();
            refreshBadge();
        } catch (err) {
            showError($('r-delete-error'), err.message);
        }
    });

    // ---- supply orders ----
    let currentOrder = null;

    const gbp = (pence) => '\u00A3' + (pence / 100).toFixed(2);
    const orderTotal = (lines) => (lines.length && lines.every((l) => l.unitPricePence !== null)
        ? lines.reduce((sum, l) => sum + l.unitPricePence * l.quantity, 0)
        : null);

    function setOrdersBadge(n) {
        const badge = $('orders-badge');
        badge.textContent = n;
        badge.classList.toggle('hidden', !n);
    }

    async function refreshOrdersBadge() {
        try {
            const { newCount } = await api('/api/admin/supply-orders?status=new');
            setOrdersBadge(newCount);
        } catch { /* ignore */ }
    }

    function showOrderPanel(which) {
        $('order-panel-empty').classList.toggle('hidden', which !== 'empty');
        $('order-detail').classList.toggle('hidden', which !== 'detail');
    }

    async function loadOrders() {
        const status = $('order-filter').value;
        const { orders, newCount } = await api('/api/admin/supply-orders?status=' + encodeURIComponent(status));
        setOrdersBadge(newCount);
        $('order-rows').replaceChildren(...orders.map((o) => {
            const total = orderTotal(o.lines);
            const tr = el('tr', 'border-t hover:bg-gray-50 cursor-pointer' + (currentOrder && o.id === currentOrder.id ? ' bg-yellow-50' : ''));
            tr.append(
                el('td', 'px-4 py-3 font-semibold text-sams-blue', o.reference),
                el('td', 'px-4 py-3', o.customer_name),
                el('td', 'px-4 py-3', String(o.lines.reduce((n, l) => n + l.quantity, 0))),
                el('td', 'px-4 py-3', total === null ? 'To confirm' : gbp(total)),
                el('td', 'px-4 py-3', fmt(o.created_at)),
                el('td', 'px-4 py-3', o.status),
            );
            tr.addEventListener('click', () => openOrder(o));
            return tr;
        }));
        $('order-empty').classList.toggle('hidden', orders.length > 0);
    }

    function openOrder(o) {
        currentOrder = o;
        showError($('o-error'), '');
        showError($('o-delete-error'), '');
        $('o-ref').textContent = o.reference;
        $('o-meta').textContent = `${o.fulfilment === 'delivery' ? 'Delivery' : 'Collection'} \u00B7 ${o.status}`;
        const rows = [
            ['Name', o.customer_name], ['Phone', o.customer_phone], ['Email', o.customer_email],
            ['Address', o.address], ['Notes', o.note], ['Received', fmt(o.created_at)],
        ].filter(([, v]) => v);
        $('o-info').replaceChildren(...rows.flatMap(([k, v]) => [
            el('dt', 'text-gray-500', k),
            el('dd', 'col-span-2 break-words whitespace-pre-line', v),
        ]));
        $('o-lines').replaceChildren(...o.lines.map((l) => {
            const li = el('li', 'flex justify-between gap-3');
            li.append(
                el('span', '', `${l.quantity} \u00D7 ${l.name}`),
                el('span', 'text-gray-600 whitespace-nowrap', l.unitPricePence === null ? 'Price on request' : gbp(l.unitPricePence * l.quantity)),
            );
            return li;
        }));
        const total = orderTotal(o.lines);
        $('o-total').textContent = total === null ? 'Total: to be confirmed with the customer' : `Total: ${gbp(total)}`;

        const open = o.status === 'new' || o.status === 'confirmed';
        $('o-actions').classList.toggle('hidden', !open);
        $('o-confirm').classList.toggle('hidden', o.status !== 'new');
        $('o-complete').classList.toggle('hidden', o.status !== 'confirmed');
        const done = $('o-done');
        done.classList.toggle('hidden', open);
        done.textContent = open ? '' : (o.status === 'completed' ? 'Completed.' : 'Cancelled.');
        showOrderPanel('detail');
    }

    $('order-filter').addEventListener('change', () => {
        currentOrder = null;
        showOrderPanel('empty');
        loadOrders().catch(() => {});
    });

    async function orderAction(action, confirmText) {
        if (!currentOrder) return;
        if (confirmText && !confirm(confirmText)) return;
        showError($('o-error'), '');
        try {
            await api('/api/admin/supply-orders', { method: 'POST', body: { id: currentOrder.id, action } });
            currentOrder = null;
            showOrderPanel('empty');
            await loadOrders();
        } catch (err) {
            showError($('o-error'), err.message);
        }
    }
    $('o-confirm').addEventListener('click', () => orderAction('confirm'));
    $('o-complete').addEventListener('click', () => orderAction('complete'));
    $('o-cancel').addEventListener('click', () => orderAction('cancel', currentOrder ? `Cancel order ${currentOrder.reference}?` : ''));

    $('o-delete').addEventListener('click', async () => {
        if (!currentOrder) return;
        if (!confirm(`Delete order ${currentOrder.reference} for good? This cannot be undone.`)) return;
        showError($('o-delete-error'), '');
        try {
            await api('/api/admin/supply-orders?id=' + encodeURIComponent(currentOrder.id), { method: 'DELETE' });
            currentOrder = null;
            showOrderPanel('empty');
            await loadOrders();
            refreshBadge();
        } catch (err) {
            showError($('o-delete-error'), err.message);
        }
    });

    // ---- contact messages ----
    let currentMessage = null;

    function setMessagesBadge(n) {
        const badge = $('messages-badge');
        badge.textContent = n;
        badge.classList.toggle('hidden', !n);
    }

    async function refreshMessagesBadge() {
        try {
            const { newCount } = await api('/api/admin/messages?status=new');
            setMessagesBadge(newCount);
        } catch { /* ignore */ }
    }

    function showMessagePanel(which) {
        $('message-panel-empty').classList.toggle('hidden', which !== 'empty');
        $('message-detail').classList.toggle('hidden', which !== 'detail');
    }

    async function loadMessages() {
        const status = $('message-filter').value;
        const { messages, newCount } = await api('/api/admin/messages?status=' + encodeURIComponent(status));
        setMessagesBadge(newCount);
        $('message-rows').replaceChildren(...messages.map((m) => {
            const tr = el('tr', 'border-t hover:bg-gray-50 cursor-pointer' + (currentMessage && m.id === currentMessage.id ? ' bg-yellow-50' : ''));
            tr.append(
                el('td', 'px-4 py-3 font-semibold text-sams-blue', m.reference),
                el('td', 'px-4 py-3', m.customer_name),
                el('td', 'px-4 py-3', m.service),
                el('td', 'px-4 py-3', fmt(m.created_at)),
                el('td', 'px-4 py-3', m.status),
            );
            tr.addEventListener('click', () => openMessage(m));
            return tr;
        }));
        $('message-empty').classList.toggle('hidden', messages.length > 0);
    }

    function openMessage(m) {
        currentMessage = m;
        showError($('m-error'), '');
        $('m-ref').textContent = m.reference;
        $('m-meta').textContent = `${m.service} \u00B7 ${m.status}`;
        const rows = [
            ['Name', m.customer_name], ['Email', m.customer_email], ['Phone', m.customer_phone],
            ['Received', fmt(m.created_at)],
        ].filter(([, v]) => v);
        $('m-info').replaceChildren(...rows.flatMap(([k, v]) => [
            el('dt', 'text-gray-500', k),
            el('dd', 'col-span-2 break-words', v),
        ]));
        $('m-body').textContent = m.message;
        // The address is encoded so it can never add extra mail headers (cc/bcc/subject) to the link.
        $('m-reply').href = 'mailto:' + encodeURIComponent(m.customer_email) +
            '?subject=' + encodeURIComponent(`Re: your message to Sam's Logistics (${m.reference})`);
        const call = $('m-call');
        call.classList.toggle('hidden', !m.customer_phone);
        if (m.customer_phone) call.href = 'tel:' + m.customer_phone.replace(/[^0-9+]/g, '');
        else call.removeAttribute('href');
        $('m-handle').classList.toggle('hidden', m.status !== 'new');
        $('m-reopen').classList.toggle('hidden', m.status !== 'handled');
        showMessagePanel('detail');
    }

    $('message-filter').addEventListener('change', () => {
        currentMessage = null;
        showMessagePanel('empty');
        loadMessages().catch(() => {});
    });

    async function messageAction(action, confirmText) {
        if (!currentMessage) return;
        if (confirmText && !confirm(confirmText)) return;
        showError($('m-error'), '');
        try {
            await api('/api/admin/messages', { method: 'POST', body: { id: currentMessage.id, action } });
            currentMessage = null;
            showMessagePanel('empty');
            await loadMessages();
        } catch (err) {
            showError($('m-error'), err.message);
        }
    }
    $('m-handle').addEventListener('click', () => messageAction('handle'));
    $('m-reopen').addEventListener('click', () => messageAction('reopen'));
    $('m-delete').addEventListener('click', () => messageAction('delete',
        currentMessage ? `Delete message ${currentMessage.reference} for good? This cannot be undone.` : ''));

    // ---- supplies catalogue ----
    let currentItem = null; // null = nothing open, {} = new product

    function showItemPanel(which) {
        $('item-panel-empty').classList.toggle('hidden', which !== 'empty');
        $('item-form').classList.toggle('hidden', which !== 'form');
    }

    async function loadItems() {
        const { items } = await api('/api/admin/supply-items');
        $('item-rows').replaceChildren(...items.map((it) => {
            const tr = el('tr', 'border-t hover:bg-gray-50 cursor-pointer' + (currentItem && String(it.id) === String(currentItem.id) ? ' bg-yellow-50' : ''));
            tr.append(
                el('td', 'px-4 py-3 font-semibold text-sams-blue', it.name),
                el('td', 'px-4 py-3', it.category),
                el('td', 'px-4 py-3', it.price_pence === null ? 'Price on request' : `${gbp(it.price_pence)} / ${it.unit}`),
                el('td', 'px-4 py-3', it.active ? 'Shown' : 'Hidden'),
            );
            tr.addEventListener('click', () => openItem(it));
            return tr;
        }));
        $('item-empty').classList.toggle('hidden', items.length > 0);
    }

    function openItem(it) {
        currentItem = it;
        showError($('item-error'), '');
        const isNew = it.id === undefined;
        $('item-form-title').textContent = isNew ? 'New product' : 'Edit product';
        $('i-name').value = it.name || '';
        $('i-category').value = it.category || meta.supplyCategories[0];
        $('i-desc').value = it.description || '';
        $('i-price').value = it.price_pence === null || it.price_pence === undefined ? '' : (it.price_pence / 100).toFixed(2);
        $('i-unit').value = it.unit || 'each';
        $('i-sort').value = it.sort_order === undefined ? '' : String(it.sort_order);
        $('i-active').checked = it.active !== false;
        $('item-delete').classList.toggle('hidden', isNew);
        showItemPanel('form');
    }

    $('new-item-btn').addEventListener('click', () => openItem({}));
    $('item-cancel').addEventListener('click', () => {
        currentItem = null;
        showItemPanel('empty');
        loadItems().catch(() => {});
    });

    $('item-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        showError($('item-error'), '');
        try {
            await api('/api/admin/supply-items', {
                method: 'POST',
                body: {
                    id: currentItem && currentItem.id !== undefined ? currentItem.id : undefined,
                    name: $('i-name').value,
                    category: $('i-category').value,
                    description: $('i-desc').value,
                    price: $('i-price').value,
                    unit: $('i-unit').value,
                    sortOrder: $('i-sort').value,
                    active: $('i-active').checked,
                },
            });
            currentItem = null;
            showItemPanel('empty');
            await loadItems();
        } catch (err) {
            showError($('item-error'), err.message);
        }
    });

    $('item-delete').addEventListener('click', async () => {
        if (!currentItem || currentItem.id === undefined) return;
        if (!confirm(`Delete "${currentItem.name}"? Past orders keep their copy of it. To only hide it from the website, untick "Show on website" instead.`)) return;
        try {
            await api('/api/admin/supply-items?id=' + encodeURIComponent(currentItem.id), { method: 'DELETE' });
            currentItem = null;
            showItemPanel('empty');
            await loadItems();
        } catch (err) {
            showError($('item-error'), err.message);
        }
    });

    init();
});
