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
});
