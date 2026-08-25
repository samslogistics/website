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

    // --- Simulated Tracking Form ---
    const trackingForm = document.getElementById('tracking-form');
    const trackingInput = document.getElementById('tracking-input');
    const trackingResult = document.getElementById('tracking-result');

    if (trackingForm && trackingInput && trackingResult) {
        trackingForm.addEventListener('submit', (e) => {
            e.preventDefault();

            const trackingNumber = trackingInput.value.trim().toUpperCase();

            if (trackingNumber.length < 5) {
                showTrackingMessage('Please enter a valid tracking number.', 'error');
                return;
            }

            trackingResult.classList.remove('hidden');
            trackingResult.className = 'mt-4 p-4 rounded-xl text-center font-semibold bg-gray-100 text-gray-600 animate-pulse';
            trackingResult.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin mr-2"></i> Searching...';

            setTimeout(() => {
                if (trackingNumber.includes('GH')) {
                    showTrackingMessage(`Package ${trackingNumber}: Currently in transit to Accra, Ghana. ETA: 3 Days.`, 'success');
                } else if (trackingNumber.includes('JM')) {
                    showTrackingMessage(`Package ${trackingNumber}: Arrived at Kingston Port, Jamaica. Awaiting customs clearance.`, 'success');
                } else {
                    showTrackingMessage(`Package ${trackingNumber}: Order processed. Awaiting collection from UK facility.`, 'success');
                }
            }, 1500);
        });

        function showTrackingMessage(message, type) {
            trackingResult.classList.remove('hidden', 'bg-gray-100', 'text-gray-600', 'animate-pulse', 'bg-green-100', 'text-green-800', 'bg-red-100', 'text-red-800');

            if (type === 'success') {
                trackingResult.classList.add('bg-green-100', 'text-green-800', 'border', 'border-green-200');
                trackingResult.innerHTML = `<i class="fa-solid fa-circle-check mr-2"></i> ${message}`;
            } else {
                trackingResult.classList.add('bg-red-100', 'text-red-800', 'border', 'border-red-200');
                trackingResult.innerHTML = `<i class="fa-solid fa-circle-exclamation mr-2"></i> ${message}`;
            }
        }
    }
});