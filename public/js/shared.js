// stuff every page needs: footer, mobile menu, etc

// grab a color straight from the css so we don't hardcode hex codes
function cssVar(name) {
    const style = getComputedStyle(document.documentElement);
    const value = style.getPropertyValue(name);
    return value.trim();
}

// drops footer.html into the empty placeholder div so we only write it once
async function loadFooter() {
    const el = document.getElementById('footer-placeholder');
    if (!el) return;
    try {
        const response = await fetch('footer.html');
        if (!response.ok) {
            throw new Error('footer.html failed to load');
        }
        const html = await response.text();
        el.innerHTML = html;
    } catch (error) {
        console.error('Unable to load footer:', error);
    }
}
loadFooter();

// hooks up the mobile hamburger menu
function setupMobileNav() {
    const sidebar = document.querySelector('.sidebar, .app-sidebar');
    const btn = document.querySelector('.mobile-nav-toggle');
    const backdrop = document.querySelector('.mobile-nav-backdrop');
    if (!sidebar || !btn || !backdrop) return;

    btn.addEventListener('click', function () {
        document.body.classList.toggle('nav-open');
    });

    // tap a link or tap outside, either way close it
    function closeMenu() {
        document.body.classList.remove('nav-open');
    }
    backdrop.addEventListener('click', closeMenu);

    const links = sidebar.querySelectorAll('a');
    for (let i = 0; i < links.length; i++) {
        links[i].addEventListener('click', closeMenu);
    }
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', setupMobileNav);
} else {
    setupMobileNav();
}
