// single place to point every page at the Flask API - change this one line
// when the API moves off localhost to a deployed host
const API_BASE = "http://127.0.0.1:5001/api";

// grabs a color value straight from the CSS file
function cssVar(name) {
    const style = getComputedStyle(document.documentElement);
    const value = style.getPropertyValue(name);
    return value.trim();
}

// loads footer.html into the page
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
