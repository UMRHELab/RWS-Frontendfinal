// stuff every page needs: footer, etc

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
