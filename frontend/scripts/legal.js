// Shared by the legal pages (imprint, legal notice, privacy policy, disclaimer).
document.addEventListener('DOMContentLoaded', () => {
    const year = document.getElementById('current-year');
    if (year) year.textContent = new Date().getFullYear();
    const btn = document.getElementById('mobile-menu-btn');
    const menu = document.getElementById('mobile-menu');
    if (btn && menu) {
        btn.addEventListener('click', () => {
            menu.classList.toggle('hidden');
            const icon = btn.querySelector('i');
            const open = !menu.classList.contains('hidden');
            icon.classList.toggle('fa-xmark', open);
            icon.classList.toggle('fa-bars', !open);
        });
    }
    // Back-to-top button: appears after scrolling down, same behaviour as on the home page
    const scrollToTop = document.getElementById('scroll-to-top');
    if (scrollToTop) {
        const updateScrollToTop = () => {
            const isVisible = window.scrollY > 400;
            scrollToTop.classList.toggle('opacity-0', !isVisible);
            scrollToTop.classList.toggle('translate-y-4', !isVisible);
            scrollToTop.classList.toggle('pointer-events-none', !isVisible);
            scrollToTop.classList.toggle('opacity-100', isVisible);
            scrollToTop.classList.toggle('translate-y-0', isVisible);
            scrollToTop.setAttribute('aria-hidden', String(!isVisible));
            scrollToTop.tabIndex = isVisible ? 0 : -1;
        };
        window.addEventListener('scroll', updateScrollToTop, { passive: true });
        requestAnimationFrame(updateScrollToTop);
        scrollToTop.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));
    }
});
