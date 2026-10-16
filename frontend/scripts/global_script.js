document.addEventListener('DOMContentLoaded', () => {

    // --- Footer Current Year ---
    const currentYearEl = document.getElementById('current-year');
    if (currentYearEl) {
        currentYearEl.textContent = new Date().getFullYear();
    }

    // --- Scroll to Top Control ---
    const scrollToTop = document.getElementById('scroll-to-top');
    if (scrollToTop) {
        const scrollRevealDistance = 400;

        const updateScrollToTop = () => {
            const isVisible = window.scrollY > scrollRevealDistance;
            scrollToTop.classList.toggle('opacity-0', !isVisible);
            scrollToTop.classList.toggle('translate-y-4', !isVisible);
            scrollToTop.classList.toggle('pointer-events-none', !isVisible);
            scrollToTop.classList.toggle('opacity-100', isVisible);
            scrollToTop.classList.toggle('translate-y-0', isVisible);
            scrollToTop.setAttribute('aria-hidden', String(!isVisible));
            scrollToTop.tabIndex = isVisible ? 0 : -1;
        };

        window.addEventListener('scroll', updateScrollToTop, { passive: true });
        updateScrollToTop();

        scrollToTop.addEventListener('click', () => {
            window.scrollTo({ top: 0, behavior: 'smooth' });
        });
    }

    // --- Contact form (our own backend: POST /api/contact) ---
    const contactForm = document.getElementById('contact-form');
    const contactFormStatus = document.getElementById('contact-form-status');
    const contactSubmit = document.getElementById('contact-submit');

    if (contactForm && contactFormStatus && contactSubmit) {
        const setContactStatus = (message, type) => {
            const colours = { error: 'text-red-600', success: 'text-green-700', info: 'text-gray-600' };
            contactFormStatus.className = 'mt-3 text-center text-sm font-semibold ' + colours[type];
            contactFormStatus.textContent = message;
        };

        // "Clear form" button: the browser empties the fields, we also clear the message under the form.
        contactForm.addEventListener('reset', () => {
            contactFormStatus.className = 'mt-3 hidden text-center text-sm font-semibold';
            contactFormStatus.textContent = '';
        });

        contactForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            if (!contactForm.reportValidity()) return;

            const value = (id) => document.getElementById(id).value;
            const payload = {
                name: `${value('contact-first-name').trim()} ${value('contact-last-name').trim()}`.trim(),
                email: value('contact-email'),
                phone: value('contact-phone'),
                service: value('contact-service'),
                message: value('contact-message'),
                website: value('contact-website'),
                consent: document.getElementById('contact-consent').checked,
            };

            contactSubmit.disabled = true;
            setContactStatus('Sending message...', 'info');

            try {
                const res = await fetch('/api/contact', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload),
                });
                const data = await res.json().catch(() => ({}));
                if (!res.ok) {
                    setContactStatus(data.error || 'Something went wrong. Please try again or call us.', 'error');
                    return;
                }
                contactForm.reset();
                setContactStatus(`Thank you! Your message has been sent (reference ${data.reference}). We will get back to you as soon as possible.`, 'success');
            } catch (error) {
                setContactStatus('Network error. Please check your connection and try again.', 'error');
            } finally {
                contactSubmit.disabled = false;
            }
        });
    }

    // --- Cookie Consent Logic ---
    const cookieBanner = document.getElementById('cookie-banner');
    const cookieAccept = document.getElementById('cookie-accept');
    const cookieReject = document.getElementById('cookie-reject');

    if (cookieBanner && cookieAccept && cookieReject) {
        const consentChoice = localStorage.getItem('sams_cookie_consent');

        if (!consentChoice) {
            cookieBanner.classList.remove('hidden');
            setTimeout(() => {
                cookieBanner.classList.remove('translate-y-full', 'opacity-0');
            }, 150);
        }

        const handleConsent = (choice) => {
            localStorage.setItem('sams_cookie_consent', choice);
            
            cookieBanner.classList.add('translate-y-full', 'opacity-0');
            setTimeout(() => {
                cookieBanner.classList.add('hidden');
            }, 300);
        };

        cookieAccept.addEventListener('click', () => handleConsent('accepted'));
        cookieReject.addEventListener('click', () => handleConsent('essential_only'));
    }

    // --- Mobile Menu Toggle ---
    const btn = document.getElementById('mobile-menu-btn');
    const menu = document.getElementById('mobile-menu');

    if (btn && menu) {
        btn.addEventListener('click', () => {
            menu.classList.toggle('hidden');
            const icon = btn.querySelector('i');
            if (icon) {
                icon.classList.toggle('fa-bars', menu.classList.contains('hidden'));
                icon.classList.toggle('fa-xmark', !menu.classList.contains('hidden'));
            }
        });

        const mobileLinks = menu.querySelectorAll('a');
        mobileLinks.forEach(link => {
            link.addEventListener('click', () => {
                menu.classList.add('hidden');
                const icon = btn.querySelector('i');
                if (icon) {
                    icon.classList.remove('fa-xmark');
                    icon.classList.add('fa-bars');
                }
            });
        });
    }

    // --- Shipment Tracking (live lookup via /api/track) ---
    const trackingForm = document.getElementById('tracking-form');
    const trackingInput = document.getElementById('tracking-input');
    const trackingResult = document.getElementById('tracking-result');

    if (trackingForm && trackingInput && trackingResult) {
        const baseClass = 'mt-4 p-4 rounded-xl text-sm border ';

        const showMessage = (message, type) => {
            const styles = {
                error: 'bg-red-100 text-red-800 border-red-200',
                loading: 'bg-gray-100 text-gray-600 border-gray-200 animate-pulse',
            };
            trackingResult.className = baseClass + 'text-center font-semibold ' + styles[type];
            trackingResult.replaceChildren();
            const icon = document.createElement('i');
            icon.className = type === 'loading'
                ? 'fa-solid fa-circle-notch fa-spin mr-2'
                : 'fa-solid fa-circle-exclamation mr-2';
            trackingResult.append(icon, document.createTextNode(message));
        };

        const formatDate = (iso) =>
            new Date(iso).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' });

        // Built with textContent only - never inject server/user text as HTML.
        const showShipment = (data) => {
            trackingResult.className = baseClass + 'text-left bg-green-50 text-gray-800 border-green-200';
            trackingResult.replaceChildren();

            const head = document.createElement('p');
            head.className = 'font-bold text-green-800';
            const icon = document.createElement('i');
            icon.className = 'fa-solid fa-circle-check mr-2';
            head.append(icon, document.createTextNode(data.status));

            const meta = document.createElement('p');
            meta.className = 'text-xs text-gray-600 mt-1';
            meta.textContent = `${data.ref} · ${data.service} to ${data.destination} · updated ${formatDate(data.updatedAt)}`;

            const list = document.createElement('ol');
            list.className = 'mt-3 space-y-2';
            data.events.forEach((ev) => {
                const li = document.createElement('li');
                li.className = 'border-l-2 border-sams-gold pl-3';
                const title = document.createElement('p');
                title.className = 'font-semibold';
                title.textContent = ev.location ? `${ev.status} - ${ev.location}` : ev.status;
                li.append(title);
                if (ev.note) {
                    const note = document.createElement('p');
                    note.className = 'text-gray-600';
                    note.textContent = ev.note;
                    li.append(note);
                }
                const when = document.createElement('p');
                when.className = 'text-xs text-gray-400';
                when.textContent = formatDate(ev.created_at);
                li.append(when);
                list.append(li);
            });

            trackingResult.append(head, meta, list);
        };

        trackingForm.addEventListener('submit', async (e) => {
            e.preventDefault();

            const ref = trackingInput.value.trim().toUpperCase();
            if (ref.length < 5) {
                showMessage('Please enter a valid tracking number.', 'error');
                return;
            }

            showMessage('Searching...', 'loading');

            try {
                const res = await fetch('/api/track?ref=' + encodeURIComponent(ref));
                const data = await res.json().catch(() => ({}));
                if (!res.ok) {
                    showMessage(data.error || 'Tracking is temporarily unavailable. Please try again shortly.', 'error');
                    return;
                }
                showShipment(data);
            } catch (error) {
                showMessage('Network error. Please check your connection and try again.', 'error');
            }
        });
    }

    // --- Booking Request Form (POST /api/booking) ---
    const bookingForm = document.getElementById('booking-form');
    const bookingStatus = document.getElementById('booking-status');
    const bookingSubmit = document.getElementById('booking-submit');

    if (bookingForm && bookingStatus && bookingSubmit) {
        const dateInput = document.getElementById('booking-date');
        if (dateInput) {
            const now = new Date();
            const pad = (n) => String(n).padStart(2, '0');
            dateInput.min = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
        }

        const setBookingStatus = (message, type) => {
            const colours = { error: 'text-red-600', success: 'text-green-700', info: 'text-gray-600' };
            bookingStatus.className = 'mt-3 text-center text-sm font-semibold ' + colours[type];
            bookingStatus.textContent = message;
        };

        // "Clear form" button: the browser empties the fields, we also clear the message under the form.
        bookingForm.addEventListener('reset', () => {
            bookingStatus.className = 'mt-3 hidden text-center text-sm font-semibold';
            bookingStatus.textContent = '';
        });

        bookingForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            if (!bookingForm.reportValidity()) return;

            const value = (id) => document.getElementById(id).value;
            const payload = {
                service: value('booking-service'),
                destination: value('booking-destination'),
                name: value('booking-name'),
                phone: value('booking-phone'),
                email: value('booking-email'),
                pickupAddress: value('booking-pickup'),
                deliveryAddress: value('booking-delivery'),
                preferredDate: value('booking-date'),
                description: value('booking-description'),
                website: value('booking-website'),
                consent: document.getElementById('booking-consent').checked,
            };

            bookingSubmit.disabled = true;
            setBookingStatus('Sending your request...', 'info');

            try {
                const res = await fetch('/api/booking', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload),
                });
                const data = await res.json().catch(() => ({}));
                if (!res.ok) {
                    setBookingStatus(data.error || 'Something went wrong. Please try again or call us.', 'error');
                    return;
                }
                bookingForm.reset();
                setBookingStatus(`Thank you! Your request reference is ${data.reference}. We will contact you shortly to confirm.`, 'success');
            } catch (error) {
                setBookingStatus('Network error. Please check your connection and try again.', 'error');
            } finally {
                bookingSubmit.disabled = false;
            }
        });
    }
    // --- Supplies shop (GET /api/supplies for the catalogue, POST /api/supplies to order) ---
    const supplyForm = document.getElementById('supply-form');

    if (supplyForm) {
        const itemsBox = document.getElementById('supply-items');
        const details = document.getElementById('supply-details');
        const totalBox = document.getElementById('supply-total');
        const supplyStatus = document.getElementById('supply-status');
        const supplySubmit = document.getElementById('supply-submit');
        const addressWrap = document.getElementById('supply-address-wrap');
        const addressInput = document.getElementById('supply-address');
        let catalogue = [];

        const gbp = (pence) => '\u00A3' + (pence / 100).toFixed(2);

        const make = (tag, className, text) => {
            const node = document.createElement(tag);
            if (className) node.className = className;
            if (text !== undefined) node.textContent = text;
            return node;
        };

        const setSupplyStatus = (message, type) => {
            const colours = { error: 'text-red-600', success: 'text-green-700', info: 'text-gray-600' };
            supplyStatus.className = 'text-center text-sm font-semibold ' + colours[type];
            supplyStatus.textContent = message;
        };

        const quantityOf = (item) => {
            const input = document.getElementById('supply-qty-' + item.id);
            return input ? Math.floor(Number(input.value) || 0) : 0;
        };
        const chosen = () => catalogue.map((item) => ({ item, qty: quantityOf(item) })).filter((pick) => pick.qty > 0);

        const updateTotal = () => {
            const picks = chosen();
            if (!picks.length) {
                totalBox.classList.add('hidden');
                return;
            }
            const count = picks.reduce((n, pick) => n + pick.qty, 0);
            const allPriced = picks.every((pick) => pick.item.pricePence !== null);
            totalBox.textContent = allPriced
                ? `${count} item${count === 1 ? '' : 's'} selected. Estimated total: ${gbp(picks.reduce((sum, pick) => sum + pick.item.pricePence * pick.qty, 0))}. We confirm the final total before you pay.`
                : `${count} item${count === 1 ? '' : 's'} selected. We will confirm the total price when we contact you.`;
            totalBox.classList.remove('hidden');
        };

        const renderCatalogue = () => {
            itemsBox.replaceChildren();
            if (!catalogue.length) {
                itemsBox.append(make('p', 'text-center text-gray-600 text-sm', 'Our online catalogue is being updated. Please call us to order supplies.'));
                return;
            }
            const groups = new Map();
            for (const item of catalogue) {
                if (!groups.has(item.category)) groups.set(item.category, []);
                groups.get(item.category).push(item);
            }
            for (const [category, list] of groups) {
                const group = make('div', 'mb-6 last:mb-0');
                group.append(make('h3', 'font-heading font-bold text-sams-blue text-lg mb-2', category));
                const box = make('div', 'divide-y divide-gray-200 rounded-2xl border border-gray-200 bg-gray-50');
                for (const item of list) {
                    const row = make('div', 'flex items-center justify-between gap-4 px-4 py-3');
                    const text = make('div', 'min-w-0');
                    text.append(make('p', 'font-semibold text-gray-900', item.name));
                    if (item.description) text.append(make('p', 'text-xs text-gray-500', item.description));
                    text.append(make('p', 'text-sm font-semibold text-sams-light-blue mt-0.5',
                        item.pricePence === null ? 'Price on request' : `${gbp(item.pricePence)} per ${item.unit}`));

                    const label = make('label', 'shrink-0');
                    label.append(make('span', 'sr-only', 'Quantity of ' + item.name));
                    const input = make('input', 'w-20 min-h-[44px] rounded-xl border-2 border-gray-200 bg-white px-3 text-center text-gray-900 focus:border-sams-blue focus:outline-none focus:ring-2 focus:ring-sams-blue/20');
                    input.type = 'number';
                    input.id = 'supply-qty-' + item.id;
                    input.min = '0';
                    input.max = '500';
                    input.step = '1';
                    input.inputMode = 'numeric';
                    input.setAttribute('value', '0'); // so form.reset() returns to 0
                    input.value = '0';
                    input.addEventListener('input', updateTotal);
                    label.append(input);

                    row.append(text, label);
                    box.append(row);
                }
                group.append(box);
                itemsBox.append(group);
            }
        };

        const loadCatalogue = async () => {
            try {
                const res = await fetch('/api/supplies');
                const data = await res.json().catch(() => ({}));
                if (!res.ok) throw new Error(data.error || 'Request failed');
                catalogue = Array.isArray(data.items) ? data.items : [];
                renderCatalogue();
                details.classList.toggle('hidden', catalogue.length === 0);
            } catch (error) {
                itemsBox.replaceChildren(make('p', 'text-center text-gray-600 text-sm', 'Products are temporarily unavailable. Please call us to order supplies.'));
            }
        };

        // Only fetch the catalogue when the visitor gets near the section.
        if ('IntersectionObserver' in window) {
            const observer = new IntersectionObserver((entries) => {
                if (entries.some((entry) => entry.isIntersecting)) {
                    observer.disconnect();
                    loadCatalogue();
                }
            }, { rootMargin: '400px' });
            observer.observe(supplyForm);
        } else {
            loadCatalogue();
        }

        const fulfilment = () => {
            const checked = supplyForm.querySelector('input[name="supply-fulfilment"]:checked');
            return checked ? checked.value : 'delivery';
        };
        const syncAddress = () => {
            const delivery = fulfilment() === 'delivery';
            addressWrap.classList.toggle('hidden', !delivery);
            addressInput.required = delivery;
        };
        supplyForm.querySelectorAll('input[name="supply-fulfilment"]').forEach((radio) => radio.addEventListener('change', syncAddress));

        // "Clear form" button: empty the message now, and once the browser has put the fields back,
        // bring the total and the delivery-address box in line with them.
        supplyForm.addEventListener('reset', () => {
            supplyStatus.className = 'hidden text-center text-sm font-semibold';
            supplyStatus.textContent = '';
            setTimeout(() => { syncAddress(); updateTotal(); }, 0);
        });

        supplyForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const picks = chosen();
            if (!picks.length) {
                setSupplyStatus('Please choose at least one item.', 'error');
                return;
            }
            if (!supplyForm.reportValidity()) return;

            const value = (id) => document.getElementById(id).value;
            const payload = {
                name: value('supply-name'),
                phone: value('supply-phone'),
                email: value('supply-email'),
                fulfilment: fulfilment(),
                address: value('supply-address'),
                note: value('supply-note'),
                items: picks.map((pick) => ({ id: pick.item.id, quantity: pick.qty })),
                website: value('supply-website'),
                consent: document.getElementById('supply-consent').checked,
            };

            supplySubmit.disabled = true;
            setSupplyStatus('Sending your order...', 'info');

            try {
                const res = await fetch('/api/supplies', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload),
                });
                const data = await res.json().catch(() => ({}));
                if (!res.ok) {
                    setSupplyStatus(data.error || 'Something went wrong. Please try again or call us.', 'error');
                    return;
                }
                supplyForm.reset();
                syncAddress();
                updateTotal();
                setSupplyStatus(`Thank you! Your order reference is ${data.reference}. We will contact you shortly to confirm your order and the total.`, 'success');
            } catch (error) {
                setSupplyStatus('Network error. Please check your connection and try again.', 'error');
            } finally {
                supplySubmit.disabled = false;
            }
        });
    }
});
