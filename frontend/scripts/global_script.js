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

    // --- Web3Forms Contact Handler ---
    const contactForm = document.getElementById('contact-form');
    const contactFormStatus = document.getElementById('contact-form-status');

    if (contactForm && contactFormStatus) {
        contactForm.addEventListener('submit', async (e) => {
            e.preventDefault();

            if (!contactForm.reportValidity()) return;

            contactFormStatus.classList.remove('hidden', 'text-red-600', 'text-green-600');
            contactFormStatus.classList.add('text-gray-600');
            contactFormStatus.innerText = 'Sending message...';

            const formData = new FormData(contactForm);
            const json = JSON.stringify(Object.fromEntries(formData));

            try {
                const response = await fetch('https://api.web3forms.com/submit', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Accept': 'application/json'
                    },
                    body: json
                });

                const result = await response.json();

                if (result.success) {
                    contactFormStatus.classList.remove('text-gray-600');
                    contactFormStatus.classList.add('text-green-600');
                    contactFormStatus.innerText = 'Thank you! Your message has been sent successfully.';
                    contactForm.reset();
                } else {
                    contactFormStatus.classList.remove('text-gray-600');
                    contactFormStatus.classList.add('text-red-600');
                    contactFormStatus.innerText = result.message || 'Something went wrong. Please try again.';
                }
            } catch (error) {
                contactFormStatus.classList.remove('text-gray-600');
                contactFormStatus.classList.add('text-red-600');
                contactFormStatus.innerText = 'Network error. Please check your connection and try again.';
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
});
