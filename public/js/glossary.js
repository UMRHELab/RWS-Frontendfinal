// glossary page: all the terms already live as real html in glossary.html.
// this file just shows/hides them based on the pill + search box - it
// never builds or rewrites any html itself.

// re-checks every term against the active pill + the search box, and
// hides any section left with nothing visible in it
function applyGlossaryFilter() {
    const searchBox = document.getElementById('glossary-search');
    const search = searchBox.value.trim().toLowerCase();
    const activePill = document.querySelector('.glossary-pill--active');
    const activeCategory = activePill ? activePill.dataset.filter : 'all';

    const terms = document.querySelectorAll('.glossary-term');
    for (let i = 0; i < terms.length; i++) {
        const term = terms[i];
        const section = term.closest('.glossary-section');
        const inCategory = activeCategory === 'all' || section.dataset.category === activeCategory;
        const matchesSearch = !search || term.textContent.toLowerCase().includes(search);
        term.classList.toggle('hidden', !(inCategory && matchesSearch));
    }

    const sections = document.querySelectorAll('.glossary-section');
    for (let i = 0; i < sections.length; i++) {
        const section = sections[i];
        const hasVisibleTerm = section.querySelector('.glossary-term:not(.hidden)');
        section.classList.toggle('hidden', !hasVisibleTerm);
    }

    const total = document.querySelectorAll('.glossary-term').length;
    const visible = document.querySelectorAll('.glossary-term:not(.hidden)').length;
    const countEl = document.getElementById('glossary-count');
    if (countEl) countEl.textContent = `Showing ${visible} of ${total} terms`;
}

const pills = document.querySelectorAll('.glossary-pill');
for (let i = 0; i < pills.length; i++) {
    pills[i].addEventListener('click', function () {
        const allPills = document.querySelectorAll('.glossary-pill');
        for (let j = 0; j < allPills.length; j++) {
            allPills[j].classList.remove('glossary-pill--active');
            allPills[j].setAttribute('aria-pressed', 'false');
        }
        this.classList.add('glossary-pill--active');
        this.setAttribute('aria-pressed', 'true');
        applyGlossaryFilter();
    });
}

const searchInput = document.getElementById('glossary-search');
if (searchInput) {
    searchInput.addEventListener('input', applyGlossaryFilter);
}

applyGlossaryFilter();
