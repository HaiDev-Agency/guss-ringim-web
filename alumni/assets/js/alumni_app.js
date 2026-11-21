// =========================================================================
// RINOBA PUBLIC PORTAL ENGINE (alumni/assets/js/alumni_app.js)
// =========================================================================

const ALUMNI_ENV = {
    isDev: window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1',
    get API_BASE_URL() {
        return this.isDev ? 'http://127.0.0.1:8080' : 'https://bailey-participated-buses-nonprofit.trycloudflare.com';
    }
};

function cleanText(value) {
    const str = value === null || value === undefined ? '' : String(value);
    if (window.DOMPurify) {
        return window.DOMPurify.sanitize(str, { ALLOWED_TAGS: [], ALLOWED_ATTR: [] });
    }
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

function cleanRichHtml(value) {
    const str = value === null || value === undefined ? '' : String(value);
    if (window.DOMPurify) return window.DOMPurify.sanitize(str);
    return cleanText(str);
}

function resolveMediaUrl(url, fallback = '') {
    if (!url || String(url).trim() === '') return fallback;
    const raw = String(url).trim();
    if (raw.startsWith('http://') || raw.startsWith('https://') || raw.startsWith('data:')) return raw;
    if (raw.startsWith('/uploads')) return `${ALUMNI_ENV.API_BASE_URL}${raw}`;
    if (raw.startsWith('assets/')) return raw;
    return `${ALUMNI_ENV.API_BASE_URL}/uploads/${raw}`;
}

function formatDate(iso) {
    if (!iso) return 'Upcoming';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return cleanText(iso);
    return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

function debounce(fn, waitMs = 350) {
    let t = null;
    return (...args) => {
        clearTimeout(t);
        t = setTimeout(() => fn(...args), waitMs);
    };
}

async function fetchPublic(endpoint) {
    const res = await fetch(`${ALUMNI_ENV.API_BASE_URL}/api/public${endpoint}`, {
        method: 'GET',
        headers: { 'Accept': 'application/json' }
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) throw new Error(data?.message || data?.error || `HTTP ${res.status}`);
    return data;
}

// =========================================================================
// 1. UNIFIED RINOBA LAYOUT INJECTOR (Zero DRY Drift Across alumni/*.html)
// =========================================================================
function injectGradientStyle() {
    if (document.getElementById('rinobaSharedStyle')) return;
    const style = document.createElement('style');
    style.id = 'rinobaSharedStyle';
    style.textContent = `
        .gradient-text {
            background: linear-gradient(to right, #D4AF37, #FDE047, #D4AF37);
            background-clip: text;
            -webkit-background-clip: text;
            color: transparent;
        }
    `;
    document.head.appendChild(style);
}

function mountRinobaLayout() {
    injectGradientStyle();

    const seg = window.location.pathname.split('/').pop();
    const currentFile = (!seg || seg === '') ? 'index.html' : seg.toLowerCase();

    const navLinks = [
        { label: 'Home', url: 'index.html' },
        { label: 'About Us', url: 'about.html' },
        { label: 'Directory', url: 'directory.html' },
        { label: 'Executives', url: 'leadership.html' },
        { label: 'Events', url: 'events.html' }
    ];

    const desktopLinksHtml = navLinks.map(l => {
        const isActive = l.url === currentFile;
        const cls = isActive
            ? 'text-rinobaBlue border-b-2 border-rinobaBlue pb-1'
            : 'hover:text-rinobaBlue transition-colors';
        return `<a href="${l.url}" class="${cls}">${l.label}</a>`;
    }).join('');

    const mobileLinksHtml = navLinks.map(l => {
        const isActive = l.url === currentFile;
        return `<a href="${l.url}" class="block py-3 px-4 rounded-xl text-xs font-black uppercase tracking-wider ${isActive ? 'bg-blue-50 text-rinobaBlue' : 'text-slate-600 hover:bg-slate-50'}">${l.label}</a>`;
    }).join('');

    const navHtml = `
    <nav class="glass-nav fixed w-full top-0 z-50 border-b border-slate-200 shadow-sm transition-all duration-300">
        <div class="max-w-[1400px] mx-auto px-4 py-3 flex justify-between items-center">
            <a href="index.html" class="flex items-center gap-3">
                <img src="assets/images/RINOBA-Regtangle-Logo.png" alt="RINOBA Logo" class="h-10 sm:h-12 w-auto">
            </a>
            <div class="hidden lg:flex items-center gap-8 font-bold text-xs uppercase tracking-wider text-slate-600">
                ${desktopLinksHtml}
            </div>
            <div class="flex items-center gap-3">
                <a href="../public/index.html" class="hidden md:inline-block text-[9px] font-black uppercase tracking-widest text-slate-400 hover:text-rinobaBlue transition-colors"><i class="fa-solid fa-arrow-left mr-1"></i> Main School Site</a>
                <a href="../portals/alumni_login.html" class="bg-rinobaBlue hover:bg-blue-900 text-white px-4 sm:px-5 py-2.5 rounded-xl text-[10px] sm:text-xs font-black uppercase tracking-widest shadow-md transition-all">Portal Login <i class="fa-solid fa-right-to-bracket ml-1"></i></a>
                <button type="button" id="rinobaMobileToggle" class="lg:hidden text-xl text-rinobaBlue p-2" aria-label="Toggle Menu"><i class="fa-solid fa-bars"></i></button>
            </div>
        </div>
        <div id="rinobaMobileDrawer" class="hidden lg:hidden bg-white border-t border-slate-200 p-4 space-y-1 shadow-lg">
            ${mobileLinksHtml}
            <a href="../public/index.html" class="block py-3 px-4 rounded-xl text-xs font-black uppercase tracking-wider text-slate-400 border-t border-slate-100 mt-2"><i class="fa-solid fa-arrow-left mr-1"></i> Main School Site</a>
        </div>
    </nav>`;

    const footerHtml = `
    <footer class="bg-slate-950 pt-20 relative">
        <div class="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 grid lg:grid-cols-12 gap-12 lg:gap-16 mb-12">
            <div class="lg:col-span-5 bg-slate-50 rounded-[2rem] p-10 shadow-2xl relative z-10 border-t-8 border-rinobaGold transform lg:-translate-y-12">
                <img src="assets/images/RINOBA-Rounded-Transparent-bg.png" alt="RINOBA Footer Logo" class="h-32 w-auto mb-6">
                <p class="text-sm leading-relaxed text-slate-600 font-medium text-justify">
                    The Ringim Old Boys Association (RINOBA) is the official unified body of all graduates from Government Unity Secondary School, Ringim. We are dedicated to bridging the generational gap, upholding the rich legacy of the Northern States Exchange Programme, and actively driving the infrastructural and academic advancement of our beloved Alma Mater.
                </p>
                <div class="flex gap-4 pt-4">
                    <a href="#" aria-label="Facebook" class="w-10 h-10 rounded-full bg-slate-800 flex items-center justify-center text-white hover:bg-blue-600 transition-colors"><i class="fa-brands fa-facebook-f"></i></a>
                    <a href="#" aria-label="Instagram" class="w-10 h-10 rounded-full bg-slate-800 flex items-center justify-center text-white hover:bg-pink-600 transition-colors"><i class="fa-brands fa-instagram"></i></a>
                    <a href="#" aria-label="X" class="w-10 h-10 rounded-full bg-slate-800 flex items-center justify-center text-white hover:bg-black transition-colors">
                        <svg class="w-4 h-4 fill-current" viewBox="0 0 24 24"><path d="M18.901 1.153h3.68l-8.04 9.19L24 22.846h-7.406l-5.8-7.584-6.638 7.584H.474l8.6-9.83L0 1.154h7.594l5.243 6.932ZM17.61 20.644h2.039L6.486 3.24H4.298Z"></path></svg>
                    </a>
                </div>
            </div>

            <div class="lg:col-span-7 grid sm:grid-cols-2 gap-10 pt-4">
                <div>
                    <h4 class="text-white font-black uppercase tracking-widest text-sm mb-6 flex items-center gap-2"><i class="fa-solid fa-link text-rinobaGold"></i> Quick Links</h4>
                    <ul class="space-y-4 text-xs font-bold uppercase tracking-wider text-slate-400">
                        <li><a href="about.html" class="hover:text-white transition-colors flex items-center gap-2"><i class="fa-solid fa-chevron-right text-[8px] text-rinobaBlue"></i> About RINOBA</a></li>
                        <li><a href="directory.html" class="hover:text-white transition-colors flex items-center gap-2"><i class="fa-solid fa-chevron-right text-[8px] text-rinobaBlue"></i> Directory Search</a></li>
                        <li><a href="leadership.html" class="hover:text-white transition-colors flex items-center gap-2"><i class="fa-solid fa-chevron-right text-[8px] text-rinobaBlue"></i> Central Executives</a></li>
                        <li><a href="events.html" class="hover:text-white transition-colors flex items-center gap-2"><i class="fa-solid fa-chevron-right text-[8px] text-rinobaBlue"></i> Reunions &amp; AGMs</a></li>
                        <li><a href="../portals/alumni_login.html" class="hover:text-white transition-colors flex items-center gap-2"><i class="fa-solid fa-chevron-right text-[8px] text-rinobaBlue"></i> Portal Login / Voting</a></li>
                    </ul>
                </div>
                <div>
                    <h4 class="text-white font-black uppercase tracking-widest text-sm mb-6 flex items-center gap-2"><i class="fa-solid fa-headset text-blue-500"></i> Secretariat</h4>
                    <ul class="space-y-4 text-xs font-medium text-slate-400 leading-relaxed">
                        <li class="flex items-start gap-3"><i class="fa-solid fa-location-dot mt-1 text-rinobaGold text-sm shrink-0"></i> <span>RINOBA Secretariat,<br>G.U.S.S. Ringim Campus.</span></li>
                        <li class="flex items-center gap-3"><i class="fa-solid fa-envelope text-blue-400 text-sm shrink-0"></i> <a href="mailto:alumni@gussringim.sch.ng" class="hover:text-white transition-colors">alumni@gussringim.sch.ng</a></li>
                        <li class="flex items-center gap-3"><i class="fa-solid fa-phone text-emerald-400 text-sm shrink-0"></i> <span>+234 (0) 800 RINOBA 1</span></li>
                    </ul>
                </div>
            </div>
        </div>

        <div class="bg-black py-6 border-t border-slate-800">
            <div class="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 flex flex-col md:flex-row justify-between items-center gap-4 text-[10px] uppercase tracking-widest font-bold text-slate-500">
                <p>&copy; 2026 Ringim Old Boys Association. All Rights Reserved.</p>
                <p class="flex items-center gap-2">
                    Engineered By
                    <a href="https://haidev-agency.github.io" target="_blank" rel="noopener noreferrer" class="gradient-text font-black text-xs hover:opacity-80 transition-opacity hover:scale-105 transform inline-block">HAIDEV AGENCY</a>
                </p>
            </div>
        </div>
    </footer>`;

    const existingNav = document.querySelector('body > nav');
    if (existingNav) existingNav.outerHTML = navHtml;
    else {
        const mount = document.getElementById('rinoba-header');
        if (mount) mount.innerHTML = navHtml;
    }

    const existingFooter = document.querySelector('body > footer');
    if (existingFooter) existingFooter.outerHTML = footerHtml;
    else {
        const mount = document.getElementById('rinoba-footer');
        if (mount) mount.innerHTML = footerHtml;
    }

    document.getElementById('rinobaMobileToggle')?.addEventListener('click', () => {
        document.getElementById('rinobaMobileDrawer')?.classList.toggle('hidden');
    });
}

// =========================================================================
// 2. HERO SLIDER (alumni/index.html)
// =========================================================================
function initAlumniHeroSlider() {
    const slides = document.querySelectorAll('.alumni-slide');
    if (slides.length <= 1) return;
    let idx = 0;
    setInterval(() => {
        slides[idx].classList.remove('opacity-100');
        slides[idx].classList.add('opacity-0');
        idx = (idx + 1) % slides.length;
        slides[idx].classList.remove('opacity-0');
        slides[idx].classList.add('opacity-100');
    }, 5000);
}

// =========================================================================
// 3. FEATURED SPOTLIGHTS (alumni/index.html)
// =========================================================================
async function hydrateFeaturedAlumni() {
    const grid = document.getElementById('featuredAlumniGrid');
    if (!grid) return;

    grid.innerHTML = `<div class="col-span-full py-10 text-center text-slate-400 text-xs font-bold"><i class="fa-solid fa-spinner fa-spin mr-2"></i> Loading Alumni Spotlights...</div>`;
    try {
        const spotlights = await fetchPublic('/alumni/spotlights?limit=4');
        if (!spotlights || spotlights.length === 0) {
            grid.innerHTML = `<div class="col-span-full py-12 text-center text-slate-400 font-bold border-2 border-dashed border-slate-200 rounded-3xl">Registered RINOBA spotlights will appear here.</div>`;
            return;
        }
        grid.innerHTML = spotlights.map(a => {
            const img = resolveMediaUrl(a.photoUrl, `https://ui-avatars.com/api/?name=${encodeURIComponent(a.name || 'R')}&background=1E3A8A&color=fff`);
            return `
            <div class="bg-slate-50 border border-slate-200 rounded-3xl p-6 text-center shadow-sm hover:shadow-lg hover:-translate-y-1 transition-all flex flex-col">
                <img src="${cleanText(img)}" alt="${cleanText(a.name)}" class="w-24 h-24 rounded-full object-cover mx-auto border-4 border-white shadow-md mb-4 bg-white">
                <h4 class="text-base font-black text-rinobaBlue uppercase truncate">${cleanText(a.name)}</h4>
                <span class="text-[10px] font-black uppercase tracking-widest text-rinobaGold block my-1">${cleanText(a.set)}</span>
                <p class="text-[11px] font-bold text-slate-500 uppercase tracking-wider truncate mb-4">${cleanText(a.role)}</p>
                <p class="text-xs text-slate-600 italic line-clamp-3 mt-auto">"${cleanText(a.quote)}"</p>
            </div>`;
        }).join('');
    } catch (err) {
        grid.innerHTML = `<div class="col-span-full py-10 text-center text-red-500 text-xs font-bold">Failed to load alumni spotlights.</div>`;
    }
}

// =========================================================================
// 4. PUBLIC DIRECTORY & PRIVACY MODALS (alumni/directory.html)
// =========================================================================
let directoryCache = [];
let directoryPage = 0;

async function loadPublicDirectory(search = '', page = 0) {
    const grid = document.getElementById('fullDirectoryGrid');
    if (!grid) return;

    directoryPage = page;
    grid.innerHTML = `<div class="col-span-full py-12 text-center text-slate-400 text-xs font-bold"><i class="fa-solid fa-spinner fa-spin mr-2"></i> Querying Global Directory...</div>`;
    try {
        const params = new URLSearchParams({ page: String(page), size: '24' });
        if (search) params.set('search', search);

        const data = await fetchPublic(`/alumni/directory?${params.toString()}`);
        directoryCache = Array.isArray(data) ? data : (data?.content || []);
        renderDirectoryCards(directoryCache);
        renderDirectoryPagination(grid, data, search);
    } catch (err) {
        grid.innerHTML = `<div class="col-span-full py-12 text-center text-red-500 text-xs font-bold">${cleanText(err.message)}</div>`;
    }
}

function renderDirectoryCards(list) {
    const grid = document.getElementById('fullDirectoryGrid');
    if (!grid) return;

    if (!list || list.length === 0) {
        grid.innerHTML = `<div class="col-span-full py-16 text-center text-slate-400 font-bold border-2 border-dashed border-slate-200 rounded-3xl">No matching verified alumni found.</div>`;
        return;
    }

    grid.innerHTML = list.map((a, idx) => {
        const img = resolveMediaUrl(a.photoUrl, `https://ui-avatars.com/api/?name=${encodeURIComponent(a.name || 'A')}&background=1E3A8A&color=fff`);
        return `
        <div class="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm hover:shadow-xl transition-all flex flex-col text-center">
            <img src="${cleanText(img)}" alt="${cleanText(a.name)}" class="w-24 h-24 rounded-full object-cover mx-auto border-4 border-slate-100 shadow mb-4 bg-white">
            <h3 class="text-base font-black text-slate-900 uppercase truncate">${cleanText(a.name)}</h3>
            <span class="bg-blue-50 text-rinobaBlue border border-blue-100 px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest mx-auto my-2">${cleanText(a.set)}</span>
            <p class="text-xs font-bold text-slate-600 truncate">${cleanText(a.role || a.profession)}</p>
            <p class="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1 mb-5"><i class="fa-solid fa-location-dot text-rinobaGold mr-1"></i> ${cleanText(a.state)}</p>
            <button type="button" data-dir-idx="${idx}" class="mt-auto w-full bg-slate-900 hover:bg-rinobaBlue text-white py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-colors">View Profile</button>
        </div>`;
    }).join('');

    grid.querySelectorAll('[data-dir-idx]').forEach(btn => {
        btn.addEventListener('click', () => {
            const member = directoryCache[parseInt(btn.getAttribute('data-dir-idx'), 10)];
            if (member) openDirectoryProfileModal(member);
        });
    });
}

function openDirectoryProfileModal(member) {
    const img = resolveMediaUrl(member.photoUrl, `https://ui-avatars.com/api/?name=${encodeURIComponent(member.name || 'A')}&background=1E3A8A&color=fff`);
    document.getElementById('modImg').src = img;
    document.getElementById('modName').textContent = member.name || 'Alumnus';
    document.getElementById('modNick').textContent = member.nickname || 'N/A';
    document.getElementById('modSet').textContent = member.set || '';
    document.getElementById('modJob').textContent = `${member.role || 'Member'} (${member.profession || 'N/A'})`;
    document.getElementById('modQual').textContent = member.qualification || 'N/A';
    document.getElementById('modLocation').textContent = member.state || 'N/A';
    document.getElementById('modClass').textContent = `${member.gradClass || 'N/A'}${member.prefecture ? ' • ' + member.prefecture : ''}`;
    document.getElementById('modHostel').textContent = member.hostel || 'N/A';
    document.getElementById('modQuote').textContent = `"${member.quote || 'Proud alumnus of G.U.S.S. Ringim.'}"`;

    const reqBtn = document.getElementById('btnSendRequest');
    if (reqBtn) {
        reqBtn.onclick = () => {
            window.closeProfileModal();
            openContactLockModal(member.name);
        };
    }

    document.getElementById('profileDetailModal')?.classList.remove('hidden');
}

function openContactLockModal(targetName) {
    const nameEl = document.getElementById('targetAlumniName');
    if (nameEl) nameEl.textContent = targetName || 'this member';
    const modal = document.getElementById('contactLockModal');
    const content = document.getElementById('contactModalContent');
    if (!modal || !content) return;
    modal.classList.remove('hidden');
    requestAnimationFrame(() => content.classList.remove('scale-95', 'opacity-0'));
}

window.closeProfileModal = function () {
    document.getElementById('profileDetailModal')?.classList.add('hidden');
};

window.closeContactModal = function () {
    const modal = document.getElementById('contactLockModal');
    const content = document.getElementById('contactModalContent');
    if (!modal || !content) return;
    content.classList.add('scale-95', 'opacity-0');
    setTimeout(() => modal.classList.add('hidden'), 250);
};

function renderDirectoryPagination(grid, data, search) {
    let pager = document.getElementById('publicDirectoryPagination');
    if (!pager) {
        pager = document.createElement('div');
        pager.id = 'publicDirectoryPagination';
        pager.className = 'mt-10 flex justify-center items-center gap-4';
        grid.insertAdjacentElement('afterend', pager);
    }
    if (!data || !data.totalPages || data.totalPages <= 1) {
        pager.innerHTML = '';
        return;
    }
    const cur = data.currentPage || 0;
    const total = data.totalPages;
    pager.innerHTML = `
        <button type="button" id="dirPrevBtn" ${cur === 0 ? 'disabled' : ''} class="px-5 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest border border-slate-200 ${cur === 0 ? 'bg-slate-100 text-slate-400 cursor-not-allowed' : 'bg-white text-rinobaBlue hover:bg-slate-50 shadow-sm'}">Prev</button>
        <span class="text-xs font-black text-slate-600 uppercase tracking-widest">Page ${cur + 1} of ${total} (${data.totalElements})</span>
        <button type="button" id="dirNextBtn" ${cur + 1 >= total ? 'disabled' : ''} class="px-5 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest border border-slate-200 ${cur + 1 >= total ? 'bg-slate-100 text-slate-400 cursor-not-allowed' : 'bg-white text-rinobaBlue hover:bg-slate-50 shadow-sm'}">Next</button>
    `;
    document.getElementById('dirPrevBtn')?.addEventListener('click', () => loadPublicDirectory(search, cur - 1));
    document.getElementById('dirNextBtn')?.addEventListener('click', () => loadPublicDirectory(search, cur + 1));
}

function initDirectorySearch() {
    const input = document.getElementById('directorySearch');
    if (!input) return;
    const handler = debounce(() => loadPublicDirectory(input.value.trim(), 0), 400);
    input.addEventListener('input', handler);
    window.filterDirectory = handler;
}

// =========================================================================
// 5. RINOBA EXECUTIVES (alumni/leadership.html)
// =========================================================================
async function hydrateAlumniLeadership() {
    const grid = document.getElementById('leadershipGrid');
    if (!grid) return;

    grid.innerHTML = `<div class="col-span-full py-12 text-center text-slate-400 text-xs font-bold"><i class="fa-solid fa-spinner fa-spin mr-2"></i> Loading Executive Council...</div>`;
    try {
        const execs = await fetchPublic('/alumni/executives');
        if (!execs || execs.length === 0) {
            grid.innerHTML = `<div class="col-span-full py-12 text-center text-slate-400 font-bold border-2 border-dashed border-slate-200 rounded-3xl">No Central Executives currently appointed.</div>`;
            return;
        }
        grid.innerHTML = execs.map(e => {
            const img = resolveMediaUrl(e.photoUrl, `https://ui-avatars.com/api/?name=${encodeURIComponent(e.name || 'E')}&background=1E3A8A&color=fff`);
            return `
            <div class="bg-white border border-slate-200 rounded-[2rem] p-8 text-center shadow-sm hover:shadow-xl transition-all border-t-4 border-t-rinobaGold">
                <img src="${cleanText(img)}" alt="${cleanText(e.name)}" class="w-28 h-28 rounded-full object-cover mx-auto border-4 border-slate-100 shadow-md mb-5 bg-white">
                <h3 class="text-lg font-black text-rinobaBlue uppercase tracking-wide">${cleanText(e.name)}</h3>
                <span class="text-[10px] font-black uppercase tracking-widest text-rinobaGold block my-1.5">${cleanText(e.role)}</span>
                <p class="text-xs font-bold text-slate-500 mt-2">${cleanText(e.set)}</p>
                <p class="text-[11px] text-slate-400 mt-1">${cleanText(e.profession)}</p>
            </div>`;
        }).join('');
    } catch (err) {
        grid.innerHTML = `<div class="col-span-full py-12 text-center text-red-500 text-xs font-bold">${cleanText(err.message)}</div>`;
    }
}

// =========================================================================
// 6. RINOBA EVENTS & REUNIONS (alumni/events.html)
// =========================================================================
async function hydrateAlumniEvents() {
    const grid = document.getElementById('eventsGrid');
    if (!grid) return;

    grid.innerHTML = `<div class="py-12 text-center text-slate-400 text-xs font-bold"><i class="fa-solid fa-spinner fa-spin mr-2"></i> Loading Reunions &amp; Events...</div>`;
    try {
        const events = await fetchPublic('/cms/articles?platform=ALUMNI_PORTAL&limit=50');
        if (!events || events.length === 0) {
            grid.innerHTML = `<div class="bg-white border border-slate-200 rounded-[2rem] p-12 text-center text-slate-400 font-bold">No RINOBA reunions or AGMs have been published yet.</div>`;
            return;
        }
        grid.innerHTML = events.map(ev => {
            const img = resolveMediaUrl(ev.coverImageUrl, 'https://images.unsplash.com/photo-1511629091441-ee46146481b6?auto=format&fit=crop&q=80&w=1000');
            return `
            <article class="bg-white border border-slate-200 rounded-[2rem] overflow-hidden shadow-sm hover:shadow-xl transition-shadow flex flex-col md:flex-row">
                <div class="md:w-1/3 h-64 md:h-auto overflow-hidden">
                    <img src="${cleanText(img)}" alt="${cleanText(ev.title)}" class="w-full h-full object-cover">
                </div>
                <div class="md:w-2/3 p-8 sm:p-10 flex flex-col justify-center">
                    <div class="flex flex-wrap items-center gap-3 mb-3 text-[10px] font-black uppercase tracking-widest">
                        <span class="bg-blue-50 text-rinobaBlue px-3 py-1 rounded-full border border-blue-100">${cleanText(ev.category)}</span>
                        <span class="text-slate-400"><i class="fa-regular fa-calendar mr-1"></i> ${formatDate(ev.publishedAt)}</span>
                    </div>
                    <h3 class="text-2xl font-black text-slate-900 uppercase tracking-tight mb-3">${cleanText(ev.title)}</h3>
                    <p class="text-sm text-slate-600 leading-relaxed mb-6">${cleanText(ev.excerpt)}</p>
                    <button type="button" data-alumni-slug="${cleanText(ev.slug)}" class="self-start text-xs font-black uppercase tracking-widest text-rinobaBlue hover:underline">Read Full Notice <i class="fa-solid fa-arrow-right ml-1"></i></button>
                </div>
            </article>`;
        }).join('');

        grid.querySelectorAll('[data-alumni-slug]').forEach(btn => {
            btn.addEventListener('click', () => openAlumniArticleModal(btn.getAttribute('data-alumni-slug')));
        });
    } catch (err) {
        grid.innerHTML = `<div class="py-12 text-center text-red-500 text-xs font-bold">${cleanText(err.message)}</div>`;
    }
}

async function openAlumniArticleModal(slug) {
    let modal = document.getElementById('rinobaArticleModal');
    if (!modal) {
        document.body.insertAdjacentHTML('beforeend', `
            <div id="rinobaArticleModal" class="hidden fixed inset-0 bg-slate-900/85 backdrop-blur-sm z-[90] flex items-center justify-center p-4">
                <div class="bg-white rounded-3xl w-full max-w-2xl max-h-[85vh] overflow-hidden shadow-2xl flex flex-col">
                    <div class="bg-rinobaBlue p-5 flex justify-between items-center text-white">
                        <span id="rinobaArtMeta" class="text-[10px] font-black uppercase tracking-widest text-rinobaGold">RINOBA NOTICE</span>
                        <button type="button" id="closeRinobaArtModal" class="text-white/70 hover:text-white text-xl"><i class="fa-solid fa-xmark"></i></button>
                    </div>
                    <div id="rinobaArtBody" class="p-6 sm:p-8 overflow-y-auto space-y-5"></div>
                </div>
            </div>`);
        modal = document.getElementById('rinobaArticleModal');
        document.getElementById('closeRinobaArtModal').addEventListener('click', () => modal.classList.add('hidden'));
    }

    const body = document.getElementById('rinobaArtBody');
    const meta = document.getElementById('rinobaArtMeta');
    body.innerHTML = `<div class="py-10 text-center text-xs font-bold text-slate-400"><i class="fa-solid fa-spinner fa-spin mr-2"></i> Loading Notice...</div>`;
    modal.classList.remove('hidden');

    try {
        const art = await fetchPublic(`/cms/articles/${encodeURIComponent(slug)}`);
        meta.textContent = `${cleanText(art.category)} • ${formatDate(art.publishedAt)}`;
        const imgHtml = art.coverImageUrl
            ? `<img src="${cleanText(resolveMediaUrl(art.coverImageUrl))}" class="w-full h-60 object-cover rounded-2xl">`
            : '';
        body.innerHTML = `
            ${imgHtml}
            <h2 class="text-2xl font-black text-rinobaBlue uppercase">${cleanText(art.title)}</h2>
            <div class="text-sm text-slate-700 leading-relaxed whitespace-pre-line">${cleanRichHtml(art.content)}</div>`;
    } catch (err) {
        body.innerHTML = `<p class="text-red-500 text-xs font-bold text-center py-6">${cleanText(err.message)}</p>`;
    }
}

// =========================================================================
// BOOTSTRAP
// =========================================================================
document.addEventListener('DOMContentLoaded', async () => {
    mountRinobaLayout();
    initAlumniHeroSlider();
    initDirectorySearch();

    await Promise.allSettled([
        hydrateFeaturedAlumni(),
        loadPublicDirectory(),
        hydrateAlumniLeadership(),
        hydrateAlumniEvents()
    ]);
});