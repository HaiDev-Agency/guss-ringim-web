import { PublicApi, cleanText, cleanRichHtml, resolveMediaUrl, formatDisplayDate, debounce } from './public_api.js';

const NAV_SCHEMA = [
    {
        title: 'About',
        links: [
            { name: 'Our History', url: 'history.html' },
            { name: 'School Anthems', url: 'anthems.html' },
            { name: 'Testimonials', url: 'testimonials.html' },
            { name: 'FAQs', url: 'faqs.html' },
            { name: 'Gallery', url: 'gallery.html' },
            {
                name: 'Committees',
                children: [
                    { name: 'PTA', url: 'pta.html' },
                    { name: 'Disciplinary Committee', url: 'discipline.html' }
                ]
            }
        ]
    },
    {
        title: 'Administration',
        links: [
            { name: 'Office of the Director', url: 'web_director.html' },
            { name: 'Office of the DD (Admin)', url: 'web_dd_admin.html' },
            { name: 'Office of the DD (Academic)', url: 'web_dd_academics.html' },
            { name: 'Office of the Bursar', url: 'web_bursary.html' }
        ]
    },
    {
        title: 'Academics',
        links: [
            { name: 'Nursery & Primary Section', url: 'primary.html' },
            { name: 'Junior & Senior Section', url: 'secondary.html' },
            { name: 'Islamiyyah Section', url: 'islamiyyah.html' }
        ]
    },
    {
        title: 'Facilities',
        links: [
            { name: 'Campus Geography', url: 'campus.html' },
            { name: 'Library', url: 'library.html' },
            { name: 'Laboratories', url: 'laboratories.html' },
            { name: 'Offices', url: 'offices.html' }
        ]
    },
    {
        title: 'News & Events',
        links: [
            { name: 'All News', url: 'news_room.html' },
            { name: 'Events & Ceremonies', url: 'events.html' }
        ]
    },
    {
        title: 'Campus Life',
        alignRight: true,
        links: [
            { name: 'Leaderships / Prefectures', url: 'leaderships.html' },
            { name: 'Unions', url: 'unions.html' },
            { name: 'Clubs', url: 'clubs.html' },
            { name: 'Sports', url: 'sports.html' },
            { name: 'Accommodations', url: 'accommodations.html' },
            { name: 'Religious Activities', url: 'religion.html' },
            { name: 'Wellbeing & Medical Care', url: 'clinic.html' },
            { name: 'Visiting Hours', url: 'visiting.html' },
            { name: 'Security', url: 'security.html' }
        ]
    }
];

function getCurrentFilename() {
    const seg = window.location.pathname.split('/').pop();
    return (!seg || seg === '') ? 'index.html' : seg.toLowerCase();
}

function isGroupActive(group, currentFile) {
    return group.links.some(link => {
        if (link.url && link.url.toLowerCase() === currentFile) return true;
        if (link.children) return link.children.some(c => c.url.toLowerCase() === currentFile);
        return false;
    });
}

function renderDesktopNav(currentFile) {
    return NAV_SCHEMA.map(group => {
        const activeGroup = isGroupActive(group, currentFile);
        const btnCls = activeGroup
            ? 'text-gussGreen border-b-2 border-gussGreen transition-colors flex items-center gap-1 pb-1'
            : 'hover:text-gussGreen transition-colors flex items-center gap-1 pb-1';
        const posCls = group.alignRight ? 'right-0' : 'left-0';
        const widthCls = (group.title === 'Administration' || group.title === 'Campus Life') ? 'w-64' : (group.title === 'About' || group.title === 'Academics') ? 'w-56' : 'w-48';

        const itemsHtml = group.links.map(link => {
            if (link.children) {
                const subItems = link.children.map(sub => {
                    const activeSub = sub.url.toLowerCase() === currentFile ? 'text-gussGreen bg-slate-50 font-black' : '';
                    return `<a href="${sub.url}" class="block px-5 py-2 hover:bg-slate-50 hover:text-gussGreen ${activeSub}">${cleanText(sub.name)}</a>`;
                }).join('');
                return `
                <div class="relative group/committee">
                    <button type="button" class="w-full text-left px-5 py-2 hover:bg-slate-50 hover:text-gussGreen flex justify-between items-center uppercase tracking-wider font-bold">
                        ${cleanText(link.name)} <i class="fa-solid fa-chevron-right text-[8px]"></i>
                    </button>
                    <div class="absolute left-full top-0 pl-1 w-48 z-50 invisible opacity-0 translate-x-2 group-hover/committee:visible group-hover/committee:opacity-100 group-hover/committee:translate-x-0 transition-all duration-300">
                        <div class="bg-white rounded-r-xl rounded-bl-xl shadow-xl border border-slate-200 py-2">${subItems}</div>
                    </div>
                </div>`;
            }
            const activeItem = link.url.toLowerCase() === currentFile ? 'text-gussGreen bg-slate-50 font-black' : '';
            const padCls = group.title === 'Academics' ? 'pl-8' : '';
            return `<a href="${link.url}" class="block px-5 py-2 hover:bg-slate-50 hover:text-gussGreen ${padCls} ${activeItem}">${cleanText(link.name)}</a>`;
        }).join('');

        const sectionHeader = group.title === 'Academics'
            ? `<div class="px-5 py-2 text-[9px] font-black text-slate-400 border-b border-slate-100 mb-1">Schools</div>`
            : '';

        return `
        <div class="relative group py-4">
            <button type="button" class="${btnCls}">${cleanText(group.title)} <i class="fa-solid fa-chevron-down text-[10px]"></i></button>
            <div class="absolute ${posCls} top-full pt-2 ${widthCls} z-50 invisible opacity-0 translate-y-2 group-hover:visible group-hover:opacity-100 group-hover:translate-y-0 transition-all duration-300">
                <div class="bg-white rounded-b-xl shadow-xl border border-slate-200 py-2 text-[10px]">
                    ${sectionHeader}${itemsHtml}
                </div>
            </div>
        </div>`;
    }).join('');
}

function renderMobileNav(currentFile) {
    return NAV_SCHEMA.map((group, idx) => {
        const itemsHtml = group.links.map(link => {
            if (link.children) {
                const subHtml = link.children.map(c =>
                    `<a href="${c.url}" class="block py-2.5 pl-8 text-xs font-bold ${c.url.toLowerCase() === currentFile ? 'text-gussGreen' : 'text-slate-600'} border-b border-slate-50 hover:bg-slate-50">${cleanText(c.name)}</a>`
                ).join('');
                return `<div class="py-2 pl-4 text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-50">— ${cleanText(link.name)} —</div>${subHtml}`;
            }
            const activeCls = link.url.toLowerCase() === currentFile ? 'text-gussGreen bg-emerald-50/40' : 'text-slate-600';
            return `<a href="${link.url}" class="block py-3 pl-4 text-xs font-bold ${activeCls} border-b border-slate-50 hover:bg-slate-50 transition-colors">${cleanText(link.name)}</a>`;
        }).join('');

        return `
        <div class="border-b border-slate-200 last:border-0">
            <button type="button" data-acc-target="mob-acc-${idx}" class="w-full flex justify-between items-center py-4 text-slate-800 font-black focus:outline-none">
                <span>${cleanText(group.title)}</span>
                <i class="fa-solid fa-chevron-down text-xs text-slate-400 transition-transform" id="icon-mob-acc-${idx}"></i>
            </button>
            <div id="mob-acc-${idx}" class="hidden flex-col bg-white">${itemsHtml}</div>
        </div>`;
    }).join('');
}

function buildHeaderHtml(currentFile) {
    return `
    <div class="bg-gussGreen text-white text-[10px] sm:text-xs py-2 px-4 flex flex-col md:flex-row justify-between items-center z-[60] relative border-b border-emerald-700/40 gap-2">
        <div class="flex items-center gap-4 font-medium tracking-wide">
            <span class="hidden sm:inline"><i class="fa-solid fa-location-dot text-gussGold mr-1"></i> Ringim, Jigawa State</span>
            <span class="hidden md:inline text-emerald-400">|</span>
            <span class="text-emerald-100 italic"><i class="fa-solid fa-graduation-cap text-gussGold mr-1"></i> "Hard work is key to success"</span>
        </div>

        <div class="flex flex-wrap items-center justify-center gap-3 md:gap-6 font-bold uppercase tracking-widest">
            <div class="relative group">
                <button type="button" class="bg-gussGold text-gussNavy px-3 py-1 rounded hover:bg-yellow-500 transition-colors flex items-center gap-1.5 pb-1 relative">
                    <i class="fa-solid fa-file-signature"></i> Admissions <i class="fa-solid fa-chevron-down text-[8px]"></i>
                    <span id="admissionsMenuPing" class="hidden absolute -top-1 -right-1 flex h-2.5 w-2.5">
                        <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                        <span class="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-600 border border-white"></span>
                    </span>
                </button>
                <div class="absolute left-0 sm:left-auto sm:right-0 top-full pt-2 w-56 z-50 invisible opacity-0 translate-y-2 group-hover:visible group-hover:opacity-100 group-hover:translate-y-0 transition-all duration-300">
                    <div class="bg-white rounded-lg shadow-xl border border-slate-200 py-2 text-slate-700 text-[10px]">
                        <a href="../portals/application.html" class="block px-4 py-2 hover:bg-slate-50 hover:text-gussGreen">Apply Now</a>
                        <button type="button" id="navAdmissionListLink" data-open-modal="admissionListModal" class="w-full text-left px-4 py-2 hover:bg-slate-50 hover:text-gussGreen flex justify-between items-center transition-colors font-bold uppercase tracking-widest">
                            Check Admission List
                        </button>
                        <a href="../portals/verify.html" class="w-full text-left px-4 py-2 hover:bg-slate-50 hover:text-gussGreen flex items-center gap-2 transition-colors font-bold uppercase tracking-widest border-t border-slate-100 mt-1 pt-2">
                            <i class="fa-solid fa-shield-halved text-gussGreen"></i> Verify Credentials
                        </a>
                    </div>
                </div>
            </div>

            <div class="relative group">
                <button type="button" class="text-white hover:text-gussGold transition-colors flex items-center gap-1.5 pb-1">
                    <i class="fa-solid fa-lock"></i> Campus Portals <i class="fa-solid fa-chevron-down text-[8px]"></i>
                </button>
                <div class="absolute right-0 top-full pt-2 w-48 z-50 invisible opacity-0 translate-y-2 group-hover:visible group-hover:opacity-100 group-hover:translate-y-0 transition-all duration-300">
                    <div class="bg-white rounded-lg shadow-xl border border-slate-200 py-2 text-slate-700 text-[10px]">
                        <a href="../portals/student_portal.html" class="block px-4 py-2 hover:bg-slate-50 hover:text-gussGreen"><i class="fa-solid fa-user-graduate mr-2 text-slate-400"></i> Student Portal</a>
                        <a href="../portals/staff_login.html" class="block px-4 py-2 hover:bg-slate-50 hover:text-gussGreen"><i class="fa-solid fa-chalkboard-user mr-2 text-slate-400"></i> Staff Portal</a>
                    </div>
                </div>
            </div>

            <div class="relative group">
                <button type="button" class="text-white hover:text-gussGold transition-colors flex items-center gap-1.5 pb-1">
                    <i class="fa-solid fa-landmark"></i> Stakeholders <i class="fa-solid fa-chevron-down text-[8px]"></i>
                </button>
                <div class="absolute right-0 top-full pt-2 w-48 z-50 invisible opacity-0 translate-y-2 group-hover:visible group-hover:opacity-100 group-hover:translate-y-0 transition-all duration-300">
                    <div class="bg-white rounded-lg shadow-xl border border-slate-200 py-2 text-slate-700 text-[10px]">
                        <a href="https://www.mohest.jg.gov.ng/" target="_blank" rel="noopener noreferrer" class="block px-4 py-2 hover:bg-slate-50 hover:text-gussGreen">Jigawa MOHEST</a>
                        <a href="https://ubec.gov.ng/" target="_blank" rel="noopener noreferrer" class="block px-4 py-2 hover:bg-slate-50 hover:text-gussGreen">UBEC</a>
                        <a href="https://bece.neco.gov.ng/" target="_blank" rel="noopener noreferrer" class="block px-4 py-2 hover:bg-slate-50 hover:text-gussGreen">BECE</a>
                        <a href="https://neco.gov.ng/" target="_blank" rel="noopener noreferrer" class="block px-4 py-2 hover:bg-slate-50 hover:text-gussGreen">NECO</a>
                        <a href="https://www.waec.org/" target="_blank" rel="noopener noreferrer" class="block px-4 py-2 hover:bg-slate-50 hover:text-gussGreen">WAEC</a>
                    </div>
                </div>
            </div>

            <a href="../alumni/index.html" class="text-white hover:text-gussGold transition-colors flex items-center gap-1.5 pb-1"><i class="fa-solid fa-user-tie"></i> Alumni</a>
        </div>
    </div>

    <div id="publicBroadcastBanner" class="hidden bg-amber-400 text-amber-950 font-black text-[10px] sm:text-xs py-2.5 px-4 text-center uppercase tracking-widest border-b border-amber-500 shadow-md relative z-50">
        <div class="max-w-[1400px] mx-auto flex items-center justify-center gap-3">
            <span class="relative flex h-3 w-3">
                <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-500 opacity-75"></span>
                <span class="relative inline-flex rounded-full h-3 w-3 bg-red-600"></span>
            </span>
            <span id="publicBroadcastText"></span>
        </div>
    </div>

    <nav class="glass-nav sticky top-0 z-50 border-b border-slate-200 shadow-sm transition-all duration-300">
        <div class="max-w-[1400px] mx-auto px-4 py-3 flex justify-between items-center">
            <a href="index.html" class="flex items-center gap-3">
                <img src="assets/images/logo_img.png" alt="GUSS Logo" class="h-12 sm:h-14 w-auto">
                <div class="hidden sm:block">
                    <h1 class="font-black text-lg sm:text-xl tracking-tight text-gussNavy leading-none">G.U.S.S. RINGIM</h1>
                    <p class="text-[9px] text-gussGreen tracking-widest uppercase font-bold mt-0.5">Govt. Unity Secondary School</p>
                </div>
            </a>

            <div class="hidden lg:flex items-center gap-6 font-bold text-sm uppercase tracking-wider text-slate-600">
                ${renderDesktopNav(currentFile)}
            </div>

            <button type="button" id="mobileMenuToggleBtn" class="lg:hidden text-2xl text-gussNavy focus:outline-none" aria-label="Toggle Menu">
                <i class="fa-solid fa-bars"></i>
            </button>
        </div>

        <div id="mobileMenu" class="hidden lg:hidden bg-white border-t border-slate-200 p-4 absolute w-full shadow-lg h-[80vh] overflow-y-auto">
            <div id="mobileNavContainer" class="flex flex-col gap-2 font-bold text-sm uppercase tracking-wide text-slate-700">
                ${renderMobileNav(currentFile)}
            </div>
        </div>
    </nav>`;
}

function buildFooterHtml() {
    return `
    <footer class="bg-slate-950 text-slate-400 py-16 border-t border-slate-900">
        <div class="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-12 mb-10">
            <div class="space-y-6">
                <div class="flex items-center gap-3">
                    <img src="assets/images/Adobe_Express_file.png" alt="GUSS Logo" class="h-14 w-auto">
                    <div>
                        <h3 class="font-black text-white text-sm tracking-wide leading-none uppercase">G.U.S.S. Ringim</h3>
                    </div>
                </div>
                <p class="text-xs leading-relaxed text-slate-400">Government Unity Secondary School (G.U.S.S.) Ringim is a flagship model institution fostering integration, academic standards, and cross-regional leadership across 19 Northern states.</p>
                <div class="flex gap-4 pt-2">
                    <a href="#" aria-label="Facebook" class="w-10 h-10 rounded-full bg-slate-800 flex items-center justify-center text-white hover:bg-blue-600 transition-colors"><i class="fa-brands fa-facebook-f"></i></a>
                    <a href="#" aria-label="Instagram" class="w-10 h-10 rounded-full bg-slate-800 flex items-center justify-center text-white hover:bg-pink-600 transition-colors"><i class="fa-brands fa-instagram"></i></a>
                    <a href="#" aria-label="X" class="w-10 h-10 rounded-full bg-slate-800 flex items-center justify-center text-white hover:bg-black transition-colors">
                        <svg class="w-4 h-4 fill-current" viewBox="0 0 24 24"><path d="M18.901 1.153h3.68l-8.04 9.19L24 22.846h-7.406l-5.8-7.584-6.638 7.584H.474l8.6-9.83L0 1.154h7.594l5.243 6.932ZM17.61 20.644h2.039L6.486 3.24H4.298Z" /></svg>
                    </a>
                </div>
            </div>
            <div>
                <h4 class="text-white font-black uppercase tracking-widest text-sm mb-6 flex items-center gap-2"><i class="fa-solid fa-landmark text-gussGold"></i> Stakeholders</h4>
                <ul class="space-y-3 text-xs font-bold uppercase tracking-wider text-slate-400">
                    <li><a href="https://www.mohest.jg.gov.ng/" target="_blank" rel="noopener noreferrer" class="hover:text-gussGold transition-colors flex items-center gap-2"><i class="fa-solid fa-chevron-right text-[8px] text-gussGreen"></i> Jigawa MOHEST</a></li>
                    <li><a href="https://ubec.gov.ng/" target="_blank" rel="noopener noreferrer" class="hover:text-gussGold transition-colors flex items-center gap-2"><i class="fa-solid fa-chevron-right text-[8px] text-gussGreen"></i> UBEC</a></li>
                    <li><a href="https://bece.neco.gov.ng/" target="_blank" rel="noopener noreferrer" class="hover:text-gussGold transition-colors flex items-center gap-2"><i class="fa-solid fa-chevron-right text-[8px] text-gussGreen"></i> BECE</a></li>
                    <li><a href="https://neco.gov.ng/" target="_blank" rel="noopener noreferrer" class="hover:text-gussGold transition-colors flex items-center gap-2"><i class="fa-solid fa-chevron-right text-[8px] text-gussGreen"></i> NECO</a></li>
                    <li><a href="https://www.waec.org/" target="_blank" rel="noopener noreferrer" class="hover:text-gussGold transition-colors flex items-center gap-2"><i class="fa-solid fa-chevron-right text-[8px] text-gussGreen"></i> WAEC</a></li>
                </ul>
            </div>
            <div>
                <h4 class="text-white font-black uppercase tracking-widest text-sm mb-6 flex items-center gap-2"><i class="fa-solid fa-link text-gussGreen"></i> Quick Links</h4>
                <ul class="space-y-3 text-xs font-bold uppercase tracking-wider text-slate-400">
                    <li><a href="../portals/application.html" class="hover:text-white transition-colors flex items-center gap-2"><i class="fa-solid fa-chevron-right text-[8px]"></i> Apply for Admission</a></li>
                    <li><a href="../portals/student_portal.html" class="hover:text-white transition-colors flex items-center gap-2"><i class="fa-solid fa-chevron-right text-[8px]"></i> Student Portal</a></li>
                    <li><a href="../portals/staff_login.html" class="hover:text-white transition-colors flex items-center gap-2"><i class="fa-solid fa-chevron-right text-[8px]"></i> Staff Portal</a></li>
                    <li><a href="news_room.html" class="hover:text-white transition-colors flex items-center gap-2"><i class="fa-solid fa-chevron-right text-[8px]"></i> News & Events</a></li>
                    <li><button type="button" data-open-modal="documentVerifyModal" class="hover:text-gussGold transition-colors flex items-center gap-2 uppercase tracking-wider font-bold"><i class="fa-solid fa-shield-halved text-[10px] text-gussGold"></i> Verify Documents</button></li>
                    <li><a href="../alumni/index.html" class="hover:text-white transition-colors flex items-center gap-2"><i class="fa-solid fa-chevron-right text-[8px]"></i> RINOBA Alumni</a></li>
                </ul>
            </div>
            <div>
                <h4 class="text-white font-black uppercase tracking-widest text-sm mb-6 flex items-center gap-2"><i class="fa-solid fa-address-book text-blue-500"></i> Contact Info</h4>
                <ul class="space-y-4 text-xs font-medium text-slate-400 leading-relaxed">
                    <li class="flex items-start gap-3"><i class="fa-solid fa-location-dot mt-1 text-gussGold text-sm shrink-0"></i> <span>P.O Box 075, Ringim, <br>Jigawa State, Nigeria.</span></li>
                    <li class="flex items-center gap-3"><i class="fa-solid fa-phone text-gussGreen text-sm shrink-0"></i> <span>Tel: +234 (080) 8000 0000</span></li>
                    <li class="flex items-center gap-3"><i class="fa-solid fa-envelope text-blue-400 text-sm shrink-0"></i> <a href="mailto:info@gussringim.sch.ng" class="hover:text-white transition-colors">info@gussringim.sch.ng</a></li>
                    <li class="pt-2"><a href="https://www.google.com/maps/search/?api=1&query=Government+Unity+Secondary+School+Ringim+Jigawa+State" target="_blank" rel="noopener noreferrer" class="inline-flex items-center gap-2 bg-slate-800 hover:bg-slate-700 text-white px-4 py-2 rounded-lg transition-colors border border-slate-700 font-bold uppercase tracking-widest text-[10px]"><i class="fa-solid fa-map-location-dot"></i> GUSS on Map</a></li>
                </ul>
            </div>
        </div>
        <div class="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 pt-8 border-t border-slate-800 flex flex-col md:flex-row justify-between items-center gap-4 text-[10px] uppercase tracking-widest font-bold">
            <p>&copy; 2026 Government Unity Secondary School, Ringim. All Rights Reserved.</p>
            <p>Designed &amp; Engineered by <a href="https://haidev-agency.github.io" target="_blank" rel="noopener noreferrer" class="text-gussGold hover:underline transition-colors">HaiDev Agency</a></p>
        </div>
    </footer>`;
}

function buildModalsHtml() {
    return `
    <!-- Admission List Modal -->
    <div id="admissionListModal" class="hidden fixed inset-0 bg-slate-900/95 backdrop-blur-sm z-[100] flex items-center justify-center p-4 opacity-0 transition-opacity duration-300">
        <div class="bg-white rounded-3xl w-full max-w-3xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh] scale-95 transition-transform duration-300" id="admissionListContent">
            <div class="bg-gussNavy p-6 flex justify-between items-center text-white shrink-0 border-b-4 border-gussGold">
                <div>
                    <h3 class="font-black text-lg uppercase tracking-wide flex items-center gap-2"><i class="fa-solid fa-list-check text-gussGold"></i> Official Admissions List</h3>
                    <p class="text-[10px] text-emerald-400 uppercase tracking-widest mt-1 font-bold" id="publicSessionDisplay">SYNCHRONIZING...</p>
                </div>
                <button type="button" data-close-modal="admissionListModal" class="text-slate-400 hover:text-white transition-colors w-8 h-8 flex items-center justify-center rounded-full hover:bg-white/10"><i class="fa-solid fa-xmark text-xl"></i></button>
            </div>
            <div class="p-6 bg-slate-50 border-b border-slate-200 shrink-0 space-y-4">
                <div class="bg-blue-50 border border-blue-200 p-4 rounded-xl flex gap-3 items-start shadow-inner">
                    <i class="fa-solid fa-circle-info text-blue-500 mt-0.5 text-lg shrink-0"></i>
                    <div>
                        <p class="text-xs font-black text-blue-900 uppercase tracking-widest mb-1">Search Guidelines</p>
                        <p class="text-[11px] text-blue-700 leading-relaxed font-medium">Enter at least 3 characters of the applicant's <strong>Full Name</strong> or <strong>NIN</strong>. Identification numbers are partially masked for privacy.</p>
                    </div>
                </div>
                <div class="relative">
                    <i class="fa-solid fa-magnifying-glass absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"></i>
                    <input type="text" id="admListSearch" placeholder="Enter Full Name or NIN to begin search..." class="w-full bg-white border-2 border-slate-200 rounded-xl pl-11 pr-4 py-3.5 text-sm font-bold text-slate-700 focus:outline-none focus:border-gussGreen shadow-sm transition-colors">
                </div>
            </div>
            <div class="p-0 overflow-y-auto flex-1 bg-white">
                <table class="w-full text-left border-collapse whitespace-nowrap">
                    <thead class="bg-slate-100 text-[10px] uppercase tracking-widest text-slate-500 font-black border-b border-slate-200 sticky top-0 z-10 shadow-sm">
                        <tr>
                            <th class="py-3 px-6">Applicant Identity</th>
                            <th class="py-3 px-6 text-center">Status</th>
                        </tr>
                    </thead>
                    <tbody id="admListBody" class="divide-y divide-slate-100 text-sm"></tbody>
                </table>
            </div>
            <div class="bg-slate-50 p-5 border-t border-slate-200 shrink-0 flex flex-col sm:flex-row items-center justify-between gap-4">
                <div class="flex items-center gap-3">
                    <div class="w-10 h-10 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center text-lg shrink-0 border border-emerald-200"><i class="fa-solid fa-forward-step"></i></div>
                    <div>
                        <p class="text-[10px] font-black uppercase tracking-widest text-slate-800">Next Steps For Admitted Candidates</p>
                        <p class="text-[10px] text-slate-500 mt-0.5 font-medium leading-relaxed max-w-sm">Sign in to the Application Portal to retrieve your Admission Number and print your Admission Letter.</p>
                    </div>
                </div>
                <a href="../portals/application.html" class="w-full sm:w-auto text-center bg-gussNavy hover:bg-slate-800 text-white px-5 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-colors shadow-md whitespace-nowrap border border-slate-700">Application Portal <i class="fa-solid fa-arrow-right ml-1"></i></a>
            </div>
        </div>
    </div>

    <!-- Institutional Credential Verification Modal -->
    <div id="documentVerifyModal" class="hidden fixed inset-0 bg-slate-900/95 backdrop-blur-sm z-[105] flex items-center justify-center p-4 opacity-0 transition-opacity duration-300">
        <div class="bg-white rounded-3xl w-full max-w-xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh] scale-95 transition-transform duration-300" id="documentVerifyContent">
            <div class="bg-gussNavy p-6 flex justify-between items-center text-white border-b-4 border-gussGold">
                <div>
                    <h3 class="font-black text-base uppercase tracking-wide flex items-center gap-2"><i class="fa-solid fa-shield-halved text-gussGold"></i> Credential Verification</h3>
                    <p class="text-[10px] text-slate-300 uppercase tracking-widest mt-1">Verify Certificates, ID Cards &amp; Admission Letters</p>
                </div>
                <button type="button" data-close-modal="documentVerifyModal" class="text-slate-400 hover:text-white w-8 h-8 flex items-center justify-center rounded-full hover:bg-white/10"><i class="fa-solid fa-xmark text-xl"></i></button>
            </div>
            <div class="p-6 space-y-5 overflow-y-auto">
                <form id="verifyDocumentForm" class="flex flex-col sm:flex-row gap-3">
                    <input type="text" id="verifyQueryInput" required placeholder="e.g. GUSSR/26/J/1001, GUSS/STF/012, GUSSR/SVC/..." class="flex-1 bg-slate-50 border-2 border-slate-200 rounded-xl px-4 py-3 text-sm font-bold text-slate-800 focus:outline-none focus:border-gussGreen uppercase">
                    <button type="submit" id="verifySubmitBtn" class="bg-gussGreen hover:bg-emerald-800 text-white px-6 py-3 rounded-xl text-xs font-black uppercase tracking-widest transition-colors shadow-md shrink-0">Verify</button>
                </form>
                <div id="verifyResultBox" class="hidden"></div>
            </div>
        </div>
    </div>

    <!-- Full Article Reader Modal -->
    <div id="articleReaderModal" class="hidden fixed inset-0 bg-slate-900/95 backdrop-blur-sm z-[105] flex items-center justify-center p-4 opacity-0 transition-opacity duration-300">
        <div class="bg-white rounded-3xl w-full max-w-3xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh] scale-95 transition-transform duration-300" id="articleReaderContent">
            <div class="bg-gussNavy p-5 flex justify-between items-center text-white border-b-4 border-gussGold shrink-0">
                <span id="articleModalCategory" class="text-[10px] font-black uppercase tracking-widest bg-white/10 px-3 py-1 rounded-full text-gussGold">ARTICLE</span>
                <button type="button" data-close-modal="articleReaderModal" class="text-slate-400 hover:text-white w-8 h-8 flex items-center justify-center rounded-full hover:bg-white/10"><i class="fa-solid fa-xmark text-xl"></i></button>
            </div>
            <div id="articleModalBody" class="p-6 sm:p-8 overflow-y-auto space-y-6"></div>
        </div>
    </div>`;
}

export const LayoutEngine = {
    mount(portalStatus = null) {
        const currentFile = getCurrentFilename();

        // Remove any legacy duplicate static chrome if still present in transitional pages
        document.querySelectorAll('body > footer, body > nav, body > #publicBroadcastBanner, body > #admissionListModal, body > #documentVerifyModal, body > #articleReaderModal').forEach(el => el.remove());

        const firstUtilityBar = Array.from(document.body.children).find(el =>
            el.tagName === 'DIV' && el.classList.contains('bg-gussGreen') && el.querySelector('.fa-location-dot')
        );
        if (firstUtilityBar) firstUtilityBar.remove();

        const headerMount = document.getElementById('guss-header');
        if (headerMount) {
            headerMount.innerHTML = buildHeaderHtml(currentFile);
        } else {
            document.body.insertAdjacentHTML('afterbegin', buildHeaderHtml(currentFile));
        }

        const footerMount = document.getElementById('guss-footer');
        if (footerMount) {
            footerMount.innerHTML = buildFooterHtml();
        } else {
            document.body.insertAdjacentHTML('beforeend', buildFooterHtml());
        }

        document.body.insertAdjacentHTML('beforeend', buildModalsHtml());

        this.bindChromeEvents(portalStatus);
        if (portalStatus) this.applyPortalStatus(portalStatus);
    },

    applyPortalStatus(status) {
        this.portalStatus = status;
        const banner = document.getElementById('publicBroadcastBanner');
        const bannerText = document.getElementById('publicBroadcastText');
        const msg = (status?.publicSiteBanner || '').trim();

        if (msg && banner && bannerText) {
            bannerText.textContent = msg;
            banner.classList.remove('hidden');
        } else if (banner) {
            banner.classList.add('hidden');
        }

        if (status?.admissionListReleased) {
            const navAdmLink = document.getElementById('navAdmissionListLink');
            const menuPing = document.getElementById('admissionsMenuPing');
            if (navAdmLink) {
                navAdmLink.innerHTML = `Check Admission List <span class="bg-red-500 text-white text-[8px] font-black px-1.5 py-0.5 rounded shadow-sm animate-pulse">NEW</span>`;
            }
            if (menuPing) menuPing.classList.remove('hidden');
        }

        const sessionDisplay = document.getElementById('publicSessionDisplay');
        if (sessionDisplay) {
            const sessionLabel = status?.activeIntakeSession || status?.activeEpoch || 'CURRENT SESSION';
            sessionDisplay.textContent = `${cleanText(sessionLabel)} — INTAKE LIST`;
        }
    },

    bindChromeEvents(portalStatus) {
        const mobileBtn = document.getElementById('mobileMenuToggleBtn');
        const mobileMenu = document.getElementById('mobileMenu');
        if (mobileBtn && mobileMenu) {
            mobileBtn.addEventListener('click', () => mobileMenu.classList.toggle('hidden'));
        }

        document.querySelectorAll('[data-acc-target]').forEach(btn => {
            btn.addEventListener('click', () => {
                const target = document.getElementById(btn.getAttribute('data-acc-target'));
                const icon = document.getElementById(`icon-${btn.getAttribute('data-acc-target')}`);
                if (target) {
                    target.classList.toggle('hidden');
                    target.classList.toggle('flex');
                }
                if (icon) icon.classList.toggle('rotate-180');
            });
        });

        document.querySelectorAll('[data-open-modal]').forEach(trigger => {
            trigger.addEventListener('click', () => {
                const modalId = trigger.getAttribute('data-open-modal');
                if (modalId === 'admissionListModal') this.openAdmissionModal(portalStatus);
                else this.openModal(modalId);
            });
        });

        document.querySelectorAll('[data-close-modal]').forEach(btn => {
            btn.addEventListener('click', () => this.closeModal(btn.getAttribute('data-close-modal')));
        });

        const admInput = document.getElementById('admListSearch');
        if (admInput) {
            admInput.addEventListener('input', debounce(() => this.searchAdmissions(admInput.value), 450));
        }

        const verifyForm = document.getElementById('verifyDocumentForm');
        if (verifyForm) {
            verifyForm.addEventListener('submit', (e) => {
                e.preventDefault();
                this.runDocumentVerification();
            });
        }

        window.viewAdmissionList = () => this.openAdmissionModal(this.portalStatus);
        window.closeAdmissionList = () => this.closeModal('admissionListModal');
        window.toggleMainMenu = () => mobileMenu?.classList.toggle('hidden');
    },

    openModal(modalId) {
        const modal = document.getElementById(modalId);
        if (!modal) return;
        modal.classList.remove('hidden');
        requestAnimationFrame(() => {
            modal.classList.remove('opacity-0');
            const inner = modal.firstElementChild;
            if (inner) inner.classList.remove('scale-95');
        });
    },

    closeModal(modalId) {
        const modal = document.getElementById(modalId);
        if (!modal) return;
        const inner = modal.firstElementChild;
        if (inner) inner.classList.add('scale-95');
        modal.classList.add('opacity-0');
        setTimeout(() => modal.classList.add('hidden'), 250);
    },

    openAdmissionModal(portalStatus) {
        const searchInput = document.getElementById('admListSearch');
        const tbody = document.getElementById('admListBody');
        if (searchInput) searchInput.value = '';
        if (tbody) {
            tbody.innerHTML = `
                <tr><td colspan="2" class="py-16 px-6 text-center">
                    <div class="w-16 h-16 bg-slate-50 border border-slate-100 text-slate-300 rounded-full flex items-center justify-center text-2xl mx-auto mb-4 shadow-inner">
                        <i class="fa-solid fa-magnifying-glass"></i>
                    </div>
                    <p class="text-slate-600 font-black text-sm uppercase tracking-wide">Ready to Search</p>
                    <p class="text-slate-400 text-xs mt-1 font-medium">Type at least 3 characters of the applicant's name or NIN.</p>
                </td></tr>`;
        }
        if (portalStatus) this.applyPortalStatus(portalStatus);
        this.openModal('admissionListModal');
    },

    async searchAdmissions(rawQuery) {
        const query = (rawQuery || '').trim();
        const tbody = document.getElementById('admListBody');
        if (!tbody) return;

        if (query.length < 3) {
            tbody.innerHTML = `<tr><td colspan="2" class="p-6 text-center text-slate-400 text-xs">Please type at least 3 characters...</td></tr>`;
            return;
        }

        tbody.innerHTML = `<tr><td colspan="2" class="p-6 text-center text-gussGreen text-xs font-bold"><i class="fa-solid fa-spinner fa-spin mr-2"></i> Querying PostgreSQL Registry...</td></tr>`;
        try {
            const results = await PublicApi.get(`/admission-list?query=${encodeURIComponent(query)}`);
            if (!results || results.length === 0) {
                tbody.innerHTML = `<tr><td colspan="2" class="p-6 text-center text-red-500 font-bold text-xs"><i class="fa-solid fa-circle-xmark mr-1"></i> No admitted records found matching "${cleanText(query)}".</td></tr>`;
                return;
            }
            tbody.innerHTML = results.map(s => `
                <tr class="hover:bg-slate-50 transition-colors">
                    <td class="py-4 px-6">
                        <p class="font-black text-gussNavy uppercase text-xs">${cleanText(s.name)}</p>
                        <p class="text-[9px] text-slate-400 font-mono mt-0.5">NIN: ${cleanText(s.identity)} • Class: ${cleanText(s.assignedClass)}</p>
                    </td>
                    <td class="py-4 px-6 text-center">
                        <span class="bg-emerald-100 text-emerald-700 px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest border border-emerald-200 shadow-sm"><i class="fa-solid fa-check-circle mr-1"></i> Admitted</span>
                    </td>
                </tr>`).join('');
        } catch (err) {
            tbody.innerHTML = `<tr><td colspan="2" class="p-6 text-center text-red-500 text-xs font-bold">${cleanText(err.message)}</td></tr>`;
        }
    },

    async runDocumentVerification() {
        const input = document.getElementById('verifyQueryInput');
        const btn = document.getElementById('verifySubmitBtn');
        const box = document.getElementById('verifyResultBox');
        const query = input?.value.trim();
        if (!query || !box) return;

        btn.disabled = true;
        btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';
        box.classList.remove('hidden');
        box.innerHTML = `<div class="p-6 text-center text-xs font-bold text-slate-500"><i class="fa-solid fa-spinner fa-spin mr-2"></i> Verifying Cryptographic Record...</div>`;

        try {
            const res = await PublicApi.get(`/verify?query=${encodeURIComponent(query)}`);
            const avatar = resolveMediaUrl(res.photoUrl, 'https://ui-avatars.com/api/?name=GUSS&background=005A36&color=fff');
            const isRevoked = String(res.status || '').includes('REVOKED') || String(res.status || '').includes('REJECTED') || String(res.status || '').includes('EXPELLED');
            const badgeCls = isRevoked ? 'bg-red-100 text-red-700 border-red-200' : 'bg-emerald-100 text-emerald-700 border-emerald-200';

            box.innerHTML = `
                <div class="bg-slate-50 border border-slate-200 rounded-2xl p-6 flex items-center gap-5">
                    <img src="${cleanText(avatar)}" alt="Holder" class="w-20 h-20 rounded-2xl object-cover border-2 border-gussGold bg-white shrink-0">
                    <div class="space-y-1.5 min-w-0">
                        <span class="text-[9px] font-black uppercase tracking-widest text-slate-400">${cleanText(res.docType)}</span>
                        <h4 class="text-base font-black text-gussNavy uppercase truncate">${cleanText(res.name)}</h4>
                        <p class="text-xs font-mono text-slate-600">${cleanText(res.identity)} • ${cleanText(res.role)}</p>
                        <span class="inline-block px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest border ${badgeCls}">${cleanText(res.status)}</span>
                    </div>
                </div>`;
        } catch (err) {
            box.innerHTML = `<div class="bg-red-50 border border-red-200 rounded-2xl p-5 text-xs font-bold text-red-700"><i class="fa-solid fa-triangle-exclamation mr-2"></i> ${cleanText(err.message)}</div>`;
        } finally {
            btn.disabled = false;
            btn.textContent = 'Verify';
        }
    },

    async openArticleBySlug(slug) {
        const catEl = document.getElementById('articleModalCategory');
        const bodyEl = document.getElementById('articleModalBody');
        if (!bodyEl) return;

        catEl.textContent = 'LOADING...';
        bodyEl.innerHTML = `<div class="py-12 text-center text-xs font-bold text-slate-400"><i class="fa-solid fa-spinner fa-spin text-2xl mb-2 block"></i> Loading Article...</div>`;
        this.openModal('articleReaderModal');

        try {
            const art = await PublicApi.get(`/cms/articles/${encodeURIComponent(slug)}`);
            catEl.textContent = `${cleanText(art.category)} • ${formatDisplayDate(art.publishedAt)}`;
            const imgHtml = art.coverImageUrl
                ? `<img src="${cleanText(resolveMediaUrl(art.coverImageUrl))}" alt="${cleanText(art.title)}" class="w-full h-64 sm:h-80 object-cover rounded-2xl border border-slate-200">`
                : '';
            bodyEl.innerHTML = `
                ${imgHtml}
                <h2 class="text-2xl sm:text-3xl font-black text-gussNavy uppercase tracking-tight">${cleanText(art.title)}</h2>
                <div class="text-sm text-slate-700 leading-relaxed whitespace-pre-line">${cleanRichHtml(art.content)}</div>`;
        } catch (err) {
            bodyEl.innerHTML = `<p class="text-center text-xs font-bold text-red-500 py-8">${cleanText(err.message)}</p>`;
        }
    }
};