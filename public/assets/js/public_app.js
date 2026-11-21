import { PublicApi, cleanText, resolveMediaUrl, formatDisplayDate, debounce } from './public_api.js';
import { LayoutEngine } from './layout_engine.js';

const STATE = {
    allNews: [],
    activeNewsCategory: 'ALL',
    newsSearchQuery: '',
    newsPage: 1,
    newsPageSize: 6,
    galleryAssets: [],
    activeGalleryCategory: 'ALL'
};

document.addEventListener('DOMContentLoaded', async () => {
    LayoutEngine.mount(null);
    initHeroSlider();
    initAudioPlayers();

    await Promise.allSettled([
        PublicApi.get('/portal-status')
            .then(status => LayoutEngine.applyPortalStatus(status))
            .catch(e => console.warn('Portal status unavailable:', e.message)),
        hydrateDirectorate(),
        hydrateFacilities(),
        hydratePrefectureTree(),
        hydrateNewsAndEvents(),
        hydrateGallery(),
        hydrateHomepageAlumniSpotlights(),
        hydrateFaqs(),
        hydrateTestimonials(),
        hydratePta()
    ]);
});

// =====================================================================
// 1. HERO SLIDER & AUDIO PLAYERS
// =====================================================================
function initHeroSlider() {
    const slides = document.querySelectorAll('.hero-slide');
    if (slides.length <= 1) return;
    let idx = 0;
    setInterval(() => {
        slides[idx].classList.remove('active');
        idx = (idx + 1) % slides.length;
        slides[idx].classList.add('active');
    }, 5000);
}

function initAudioPlayers() {
    let isAnthemPlaying = false;
    window.toggleAnthemAudio = function () {
        const audio = document.getElementById('anthemAudio');
        const icon = document.getElementById('iconPlayAnthem');
        const text = document.getElementById('textPlayAnthem');
        if (!audio) return;

        if (isAnthemPlaying) {
            audio.pause();
            if (icon) icon.className = 'fa-solid fa-play';
            if (text) text.textContent = text.textContent === 'Pause' ? 'Listen' : 'Play Audio';
            isAnthemPlaying = false;
        } else {
            audio.play().then(() => {
                if (icon) icon.className = 'fa-solid fa-pause';
                if (text) text.textContent = 'Pause';
                isAnthemPlaying = true;
            }).catch(() => {
                if (window.Swal) Swal.fire('Audio Unavailable', 'Anthem media asset could not be streamed.', 'info');
            });
        }
        audio.onended = () => {
            if (icon) icon.className = 'fa-solid fa-play';
            if (text) text.textContent = 'Listen';
            isAnthemPlaying = false;
        };
    };

    window.toggleReadMore = function (textId, btnElement) {
        const el = document.getElementById(textId);
        if (!el) return;
        if (el.classList.contains('line-clamp-3')) {
            el.classList.remove('line-clamp-3');
            btnElement.innerHTML = 'Read Less <i class="fa-solid fa-chevron-up ml-1"></i>';
        } else {
            el.classList.add('line-clamp-3');
            btnElement.innerHTML = 'Read More <i class="fa-solid fa-chevron-down ml-1"></i>';
        }
    };
}

// =====================================================================
// 2. DIRECTORATE HYDRATION (Director, DD Admin, DD Academics, Bursar, History)
// =====================================================================
async function hydrateDirectorate() {
    const targets = document.querySelectorAll('[data-directorate-office]');
    if (targets.length === 0) return;

    try {
        const directorate = await PublicApi.get('/governance/directorate');
        targets.forEach(card => {
            const key = card.getAttribute('data-directorate-office');
            const data = directorate?.[key];
            if (!data) return;

            const nameEl = card.querySelector('[data-dir-name]');
            const imgEl = card.querySelector('[data-dir-img]');
            const roleEl = card.querySelector('[data-dir-role]');

            if (nameEl && data.name) nameEl.textContent = data.name;
            if (roleEl && data.isActing === 'true') roleEl.textContent = `Acting ${roleEl.textContent}`;
            if (imgEl && data.photoUrl) {
                imgEl.innerHTML = `<img src="${cleanText(resolveMediaUrl(data.photoUrl))}" alt="${cleanText(data.name)}" class="w-full h-full object-cover">`;
                imgEl.classList.remove('image-placeholder', 'bg-slate-800', 'text-slate-500');
            }
        });
    } catch (e) {
        console.warn('Directorate hydration failed:', e.message);
    }
}

// =====================================================================
// 3. FACILITIES HYDRATION (Laboratories, Main Library, Offices)
// =====================================================================
async function hydrateFacilities() {
    const hasFacilitySlots = document.querySelector('[id^="fac-"][id$="-name"]');
    if (!hasFacilitySlots) return;

    const buildKeyCandidates = (rawKey) => {
        const k = String(rawKey || '').toLowerCase().trim();
        const noDots = k.replace(/\./g, '');
        const ampToAnd = noDots.replace(/&/g, 'and');
        const base = ampToAnd
            .replace(/_laboratory$/, '')
            .replace(/_lab$/, '')
            .replace(/_office$/, '')
            .replace(/_studio$/, '')
            .replace(/_workshop$/, '');

        const results = new Set([k, noDots, ampToAnd, base, `${base}_lab`, `${base}_laboratory`, `${base}_office`, `${base}_studio`, `${base}_workshop`]);

        if (base.includes('agric')) results.add('agric_lab');
        if (base.includes('math')) results.add('maths_lab');
        if (base.includes('husbandry')) results.add('husbandry_lab');
        if (base.includes('guidance')) results.add('guidance_office');
        if (base.includes('admission')) results.add('admissions_office');
        if (noDots.includes('td')) results.add('td_studio');
        if (noDots.includes('eim')) results.add('eim_workshop');

        return [...results];
    };

    try {
        const facilities = await PublicApi.get('/governance/facilities');
        (facilities || []).forEach(fac => {
            const candidates = buildKeyCandidates(fac.facilityKey);
            for (const key of candidates) {
                const nameEl = document.getElementById(`fac-${key}-name`);
                const roleEl = document.getElementById(`fac-${key}-role`);
                const imgEl = document.getElementById(`fac-${key}-img`);
                if (!nameEl && !roleEl && !imgEl) continue;

                if (nameEl && fac.managerName) nameEl.textContent = fac.managerName;
                if (roleEl && fac.roleTitle) roleEl.textContent = fac.roleTitle;
                if (imgEl && fac.photoUrl) {
                    imgEl.innerHTML = `<img src="${cleanText(resolveMediaUrl(fac.photoUrl))}" alt="${cleanText(fac.managerName)}" class="w-full h-full object-cover">`;
                    imgEl.classList.remove('image-placeholder', 'text-[8px]', 'bg-slate-200', 'bg-blue-100', 'text-blue-600', 'bg-slate-800', 'text-slate-500');
                }
            }
        });
    } catch (e) {
        console.warn('Facilities hydration failed:', e.message);
    }
}

// =====================================================================
// 4. PREFECTURES TREE HYDRATION (leaderships.html)
// =====================================================================
async function hydratePrefectureTree() {
    const container = document.getElementById('dynamicPrefectsTree');
    if (!container) return;

    try {
        const prefects = await PublicApi.get('/governance/prefects');
        const tiersMap = {
            'The Supreme Head': [],
            'Deputy Heads': [],
            'Special Duties': [],
            'Executive Portfolios': [],
            'House Captains': []
        };

        const categorize = (roleName) => {
            const lower = (roleName || '').toLowerCase();
            if (lower.includes('head student') || lower.includes('president')) return { tier: 'The Supreme Head', color: 'border-gussGold text-gussGold' };
            if (lower.includes('deputy') || lower.includes('vice')) return { tier: 'Deputy Heads', color: 'border-slate-400 text-slate-500' };
            if (lower.includes('special')) return { tier: 'Special Duties', color: 'border-red-500 text-red-600' };
            if (lower.includes('captain')) return { tier: 'House Captains', color: 'border-gussNavy text-gussNavy' };
            if (lower.includes('ameer') || lower.includes('imam')) return { tier: 'Executive Portfolios', color: 'border-emerald-500 text-emerald-600' };
            if (lower.includes('labor') || lower.includes('sanitation')) return { tier: 'Executive Portfolios', color: 'border-amber-600 text-amber-700' };
            if (lower.includes('health')) return { tier: 'Executive Portfolios', color: 'border-cyan-500 text-cyan-600' };
            if (lower.includes('games')) return { tier: 'Executive Portfolios', color: 'border-blue-600 text-blue-700' };
            if (lower.includes('quarter')) return { tier: 'Executive Portfolios', color: 'border-purple-600 text-purple-700' };
            return { tier: 'Executive Portfolios', color: 'border-slate-500 text-slate-600' };
        };

        (prefects || []).forEach(p => {
            const { tier, color } = categorize(p.role);
            tiersMap[tier].push({ ...p, color });
        });

        const orderedTiers = Object.entries(tiersMap)
            .map(([tier, members]) => ({ tier, members }))
            .filter(t => t.members.length > 0);

        if (orderedTiers.length === 0) {
            container.innerHTML = `<div class="py-12 text-center text-slate-400 font-bold text-sm">No prefectural portfolios configured yet.</div>`;
            return;
        }

        container.innerHTML = orderedTiers.map((tierBlock, index) => {
            const cardsHtml = tierBlock.members.map(member => {
                const hostelBadge = member.hostel
                    ? `<div class="mt-3"><span class="inline-block bg-gussNavy text-white px-2 py-1 rounded text-[8px] font-bold uppercase tracking-widest w-full truncate border border-slate-700 shadow-sm"><i class="fa-solid fa-house-chimney mr-1"></i> ${cleanText(member.hostel)}</span></div>`
                    : '';
                const stateBadge = member.state
                    ? `<span class="inline-block bg-slate-100 text-slate-500 px-2 py-0.5 mt-2 rounded text-[8px] font-bold uppercase tracking-widest border border-slate-200"><i class="fa-solid fa-map-pin mr-1"></i> ${cleanText(member.state)}</span>`
                    : '';

                if (member.name) {
                    const photo = resolveMediaUrl(member.photoUrl, 'https://ui-avatars.com/api/?name=P&background=005A36&color=fff');
                    return `
                    <div class="bg-white border-t-4 ${cleanText(member.color)} rounded-2xl shadow-lg p-6 text-center w-64 flex-shrink-0 relative hover:-translate-y-1 transition-transform">
                        <div class="w-20 h-20 mx-auto rounded-full border-2 border-slate-200 mb-3 overflow-hidden shadow-inner">
                            <img src="${cleanText(photo)}" alt="${cleanText(member.name)}" class="w-full h-full object-cover bg-white">
                        </div>
                        <h4 class="text-sm font-black text-gussNavy uppercase tracking-wide truncate w-full" title="${cleanText(member.name)}">${cleanText(member.name)}</h4>
                        <p class="text-[10px] ${cleanText(member.color)} font-bold uppercase tracking-widest my-1 truncate w-full">${cleanText(member.role)}</p>
                        ${stateBadge}${hostelBadge}
                    </div>`;
                }
                return `
                <div class="bg-slate-50 border border-dashed border-slate-300 rounded-2xl p-6 text-center w-64 flex-shrink-0 relative opacity-70">
                    <div class="w-20 h-20 mx-auto rounded-full border-2 border-dashed border-slate-300 mb-3 flex items-center justify-center text-slate-300 text-2xl bg-white shadow-inner"><i class="fa-solid fa-user-lock"></i></div>
                    <h4 class="text-xs font-black text-slate-400 uppercase tracking-wide">Awaiting Assignment</h4>
                    <p class="text-[10px] text-slate-500 font-bold uppercase tracking-widest my-1 truncate w-full">${cleanText(member.role)}</p>
                    ${hostelBadge}
                </div>`;
            }).join('');

            const connector = index < orderedTiers.length - 1
                ? `<div class="h-10 w-px bg-slate-300 mx-auto my-4 relative"><div class="absolute -bottom-1 left-1/2 -translate-x-1/2 w-2 h-2 rounded-full bg-slate-300"></div></div>`
                : '';

            return `
            <div class="flex flex-col items-center w-full">
                <span class="text-[9px] font-black uppercase tracking-widest text-slate-500 mb-4 bg-slate-200 px-3 py-1 rounded-full shadow-inner border border-slate-300">${cleanText(tierBlock.tier)}</span>
                <div class="flex flex-wrap justify-center gap-6 w-full max-w-6xl">${cardsHtml}</div>
                ${connector}
            </div>`;
        }).join('');
    } catch (e) {
        container.innerHTML = `<div class="py-12 text-center text-red-500 font-bold text-xs">Failed to synchronize student hierarchy.</div>`;
    }
}

// =====================================================================
// 5. CMS NEWS & EVENTS HYDRATION (index.html, news_room.html, events.html)
// =====================================================================
async function hydrateNewsAndEvents() {
    const newsGrid = document.getElementById('dynamicNewsGrid');
    const featuredBox = document.getElementById('dynamicFeaturedNews');
    const eventsGrid = document.getElementById('dynamicEventsGrid');
    if (!newsGrid && !featuredBox && !eventsGrid) return;

    try {
        const [articles, taxonomy] = await Promise.all([
            PublicApi.get('/cms/articles?platform=SCHOOL_WEBSITE&limit=100'),
            document.getElementById('newsFilterBar') ? PublicApi.get('/cms/taxonomy').catch(() => null) : Promise.resolve(null)
        ]);

        const all = articles || [];

        if (newsGrid || featuredBox) {
            STATE.allNews = all.filter(a => a.typeKey !== 'EVENT_CEREMONY');
            renderNewsFilterButtons(taxonomy?.cmsCategories || []);
            bindNewsSearchInput();
            renderNewsPage();
        }

        if (eventsGrid) {
            const events = all.filter(a => a.typeKey === 'EVENT_CEREMONY' || a.categoryKey === 'SCHOOL_EVENT');
            if (events.length === 0) {
                eventsGrid.innerHTML = `<div class="col-span-full py-12 text-center text-slate-400 font-bold"><i class="fa-solid fa-calendar text-3xl mb-3 opacity-30 block"></i> No campus events scheduled at this time.</div>`;
            } else {
                eventsGrid.innerHTML = events.map(item => {
                    const img = resolveMediaUrl(item.coverImageUrl, 'https://images.unsplash.com/photo-1511629091441-ee46146481b6?auto=format&fit=crop&q=80&w=1000');
                    return `
                    <article data-article-slug="${cleanText(item.slug)}" class="cursor-pointer bg-amber-50 border border-amber-200 rounded-[2rem] overflow-hidden shadow-sm hover:shadow-lg transition-shadow group flex flex-col">
                        <div class="relative h-64 overflow-hidden">
                            <img src="${cleanText(img)}" alt="${cleanText(item.title)}" class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700">
                            <div class="absolute top-4 right-4 bg-amber-600 text-white text-[10px] font-black uppercase tracking-widest px-3 py-1.5 rounded-lg shadow-md">${formatDisplayDate(item.publishedAt)}</div>
                        </div>
                        <div class="p-8 sm:p-10 flex-1 flex flex-col">
                            <h3 class="text-2xl font-black text-amber-900 uppercase tracking-wide mb-4 group-hover:text-gussGreen transition-colors">${cleanText(item.title)}</h3>
                            <p class="text-sm text-amber-800 leading-relaxed text-justify mb-6">${cleanText(item.excerpt)}</p>
                            <div class="mt-auto border-t border-amber-200 pt-4 flex items-center justify-between text-xs font-bold uppercase tracking-widest text-amber-600">
                                <span><i class="fa-solid fa-tag mr-1"></i> ${cleanText(item.category)}</span>
                                <span class="text-[10px] underline">Read Full Details</span>
                            </div>
                        </div>
                    </article>`;
                }).join('');
                bindArticleCardClicks(eventsGrid);
            }
        }
    } catch (e) {
        if (newsGrid) newsGrid.innerHTML = `<div class="col-span-full py-12 text-center text-red-500 font-bold text-xs">Failed to load institutional news.</div>`;
    }
}

function renderNewsFilterButtons(categories) {
    const bar = document.getElementById('newsFilterBar');
    if (!bar) return;

    const newsCategories = categories.filter(c => c.key !== 'ALUMNI_EVENT');
    const btns = [{ key: 'ALL', name: 'All News' }, ...newsCategories];

    bar.innerHTML = btns.map(c => {
        const active = STATE.activeNewsCategory === c.key;
        const cls = active
            ? 'bg-gussGreen text-white'
            : 'bg-white border border-slate-200 text-slate-600 hover:text-gussGreen';
        return `<button type="button" data-news-cat="${cleanText(c.key)}" class="news-filter-btn ${cls} px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest whitespace-nowrap transition-colors shadow-sm">${cleanText(c.name)}</button>`;
    }).join('');

    bar.querySelectorAll('[data-news-cat]').forEach(btn => {
        btn.addEventListener('click', () => {
            STATE.activeNewsCategory = btn.getAttribute('data-news-cat');
            STATE.newsPage = 1;
            renderNewsFilterButtons(categories);
            renderNewsPage();
        });
    });
}

function bindNewsSearchInput() {
    const input = document.getElementById('newsSearchInput');
    if (!input) return;
    input.addEventListener('input', debounce(() => {
        STATE.newsSearchQuery = input.value.trim().toLowerCase();
        STATE.newsPage = 1;
        renderNewsPage();
    }, 250));
}

function renderNewsPage() {
    const grid = document.getElementById('dynamicNewsGrid');
    const featured = document.getElementById('dynamicFeaturedNews');
    const pagContainer = document.getElementById('newsPagination');
    const isHomepage = !featured && !pagContainer;

    const filtered = STATE.allNews.filter(a => {
        const catOk = STATE.activeNewsCategory === 'ALL' || a.categoryKey === STATE.activeNewsCategory;
        const searchOk = !STATE.newsSearchQuery ||
            a.title.toLowerCase().includes(STATE.newsSearchQuery) ||
            a.excerpt.toLowerCase().includes(STATE.newsSearchQuery) ||
            a.category.toLowerCase().includes(STATE.newsSearchQuery);
        return catOk && searchOk;
    });

    if (featured) {
        if (STATE.allNews.length === 0) {
            featured.innerHTML = `<div class="bg-slate-50 border border-slate-200 rounded-[2rem] p-12 text-center shadow-sm"><i class="fa-solid fa-bullhorn text-4xl text-slate-300 mb-4"></i><p class="text-sm font-bold text-slate-500">No spotlight news has been published yet.</p></div>`;
        } else {
            const top = STATE.allNews[0];
            const img = resolveMediaUrl(top.coverImageUrl, 'https://images.unsplash.com/photo-1504711434969-e33886168f5c?auto=format&fit=crop&q=80&w=1000');
            featured.innerHTML = `
            <article data-article-slug="${cleanText(top.slug)}" class="bg-slate-50 border border-slate-200 rounded-[2rem] overflow-hidden shadow-lg flex flex-col lg:flex-row group hover:shadow-2xl transition-shadow cursor-pointer">
                <div class="lg:w-1/2 relative overflow-hidden h-72 lg:h-auto">
                    <img src="${cleanText(img)}" alt="${cleanText(top.title)}" class="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-700">
                </div>
                <div class="lg:w-1/2 p-8 sm:p-12 flex flex-col justify-center">
                    <div class="flex items-center gap-4 mb-4 text-[10px] font-black uppercase tracking-widest">
                        <span class="bg-slate-200 text-slate-700 px-3 py-1.5 rounded-lg">${cleanText(top.category)}</span>
                        <span class="text-slate-400"><i class="fa-regular fa-clock mr-1"></i> ${formatDisplayDate(top.publishedAt)}</span>
                    </div>
                    <h3 class="text-2xl sm:text-3xl font-black text-gussNavy uppercase tracking-wide mb-4 group-hover:text-blue-600 transition-colors">${cleanText(top.title)}</h3>
                    <p class="text-sm text-slate-600 leading-relaxed mb-4">${cleanText(top.excerpt)}</p>
                    <span class="text-[10px] font-black uppercase tracking-widest text-gussGreen">Read Full Story <i class="fa-solid fa-arrow-right ml-1"></i></span>
                </div>
            </article>`;
            bindArticleCardClicks(featured);
        }
    }

    if (!grid) return;

    const listForGrid = isHomepage ? filtered.slice(0, 3) : (featured ? filtered.slice(1) : filtered);
    const totalPages = Math.max(1, Math.ceil(listForGrid.length / STATE.newsPageSize));
    if (STATE.newsPage > totalPages) STATE.newsPage = totalPages;

    const pageItems = isHomepage
        ? listForGrid
        : listForGrid.slice((STATE.newsPage - 1) * STATE.newsPageSize, STATE.newsPage * STATE.newsPageSize);

    if (pageItems.length === 0) {
        grid.innerHTML = `<div class="col-span-full py-12 text-center text-slate-400 font-bold"><i class="fa-solid fa-newspaper text-3xl mb-3 opacity-30 block"></i> No articles match your filter.</div>`;
    } else {
        grid.innerHTML = pageItems.map(item => {
            const img = resolveMediaUrl(item.coverImageUrl, 'https://images.unsplash.com/photo-1523240795612-9a054b0db644?auto=format&fit=crop&q=80&w=800');
            return `
            <article data-article-slug="${cleanText(item.slug)}" class="news-item group cursor-pointer bg-white p-4 rounded-3xl border border-slate-200 shadow-sm hover:shadow-lg transition-all flex flex-col">
                <div class="h-48 rounded-2xl mb-4 w-full overflow-hidden">
                    <img src="${cleanText(img)}" alt="${cleanText(item.title)}" class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500">
                </div>
                <span class="text-[10px] font-black uppercase tracking-widest text-gussGreen mb-2 block">${cleanText(item.category)} • ${formatDisplayDate(item.publishedAt)}</span>
                <h3 class="text-base font-black text-slate-800 leading-tight mb-2 group-hover:text-gussGreen transition-colors">${cleanText(item.title)}</h3>
                <p class="text-xs text-slate-500 line-clamp-3 flex-1">${cleanText(item.excerpt)}</p>
            </article>`;
        }).join('');
        bindArticleCardClicks(grid);
    }

    if (pagContainer) {
        if (totalPages <= 1) {
            pagContainer.innerHTML = '';
        } else {
            let pagHtml = `<button type="button" data-news-page="${Math.max(1, STATE.newsPage - 1)}" class="w-10 h-10 rounded-xl border border-slate-300 flex items-center justify-center text-slate-500 hover:bg-slate-50"><i class="fa-solid fa-chevron-left"></i></button>`;
            for (let p = 1; p <= totalPages; p++) {
                const cls = p === STATE.newsPage
                    ? 'bg-gussGreen text-white font-black shadow-md'
                    : 'border border-slate-300 text-slate-600 font-bold hover:bg-slate-50';
                pagHtml += `<button type="button" data-news-page="${p}" class="w-10 h-10 rounded-xl ${cls} flex items-center justify-center">${p}</button>`;
            }
            pagHtml += `<button type="button" data-news-page="${Math.min(totalPages, STATE.newsPage + 1)}" class="w-10 h-10 rounded-xl border border-slate-300 flex items-center justify-center text-slate-500 hover:bg-slate-50"><i class="fa-solid fa-chevron-right"></i></button>`;
            pagContainer.innerHTML = pagHtml;
            pagContainer.querySelectorAll('[data-news-page]').forEach(b => {
                b.addEventListener('click', () => {
                    STATE.newsPage = parseInt(b.getAttribute('data-news-page'), 10);
                    renderNewsPage();
                    grid.scrollIntoView({ behavior: 'smooth', block: 'start' });
                });
            });
        }
    }
}

function bindArticleCardClicks(scope) {
    scope.querySelectorAll('[data-article-slug]').forEach(card => {
        card.addEventListener('click', () => LayoutEngine.openArticleBySlug(card.getAttribute('data-article-slug')));
    });
}

// =====================================================================
// 6. GALLERY HYDRATION (gallery.html)
// =====================================================================
async function hydrateGallery() {
    const grid = document.getElementById('dynamicGalleryGrid');
    if (!grid) return;

    try {
        const [assets, taxonomy] = await Promise.all([
            PublicApi.get('/gallery/assets'),
            PublicApi.get('/cms/taxonomy').catch(() => null)
        ]);

        STATE.galleryAssets = assets || [];
        renderGalleryFilters(taxonomy?.galleryCategories || []);
        renderGalleryItems();
    } catch (e) {
        grid.innerHTML = `<div class="col-span-full py-12 text-center text-red-500 font-bold text-xs">Failed to load gallery archives.</div>`;
    }
}

function renderGalleryFilters(categories) {
    const bar = document.getElementById('galleryFilterBar');
    if (!bar) return;

    const btns = [{ key: 'ALL', name: 'All Photos' }, ...categories];
    bar.innerHTML = btns.map(c => {
        const active = STATE.activeGalleryCategory === c.key;
        const cls = active
            ? 'bg-gussGreen text-white'
            : 'bg-white border border-slate-200 text-slate-600 hover:border-gussGreen hover:text-gussGreen';
        return `<button type="button" data-gal-cat="${cleanText(c.key)}" class="gallery-filter-btn ${cls} px-5 py-2 rounded-full text-xs font-bold uppercase tracking-widest transition-colors shadow-sm">${cleanText(c.name)}</button>`;
    }).join('');

    bar.querySelectorAll('[data-gal-cat]').forEach(btn => {
        btn.addEventListener('click', () => {
            STATE.activeGalleryCategory = btn.getAttribute('data-gal-cat');
            renderGalleryFilters(categories);
            renderGalleryItems();
        });
    });
}

function renderGalleryItems() {
    const grid = document.getElementById('dynamicGalleryGrid');
    if (!grid) return;

    const items = STATE.galleryAssets.filter(img =>
        STATE.activeGalleryCategory === 'ALL' || img.categoryKey === STATE.activeGalleryCategory
    );

    if (items.length === 0) {
        grid.innerHTML = `<div class="col-span-full py-12 text-center text-slate-400 font-bold border-2 border-dashed border-slate-200 rounded-3xl"><i class="fa-solid fa-images text-4xl mb-3 text-slate-300 block"></i>No photos found in this category.</div>`;
        return;
    }

    grid.innerHTML = items.map(img => {
        const src = resolveMediaUrl(img.imageUrl);
        return `
        <div class="break-inside-avoid mb-4 group relative overflow-hidden rounded-2xl cursor-pointer shadow-sm hover:shadow-lg transition-all gallery-item" data-lightbox-src="${cleanText(src)}" data-lightbox-title="${cleanText(img.title)}">
            <img src="${cleanText(src)}" alt="${cleanText(img.title)}" class="w-full h-auto object-cover group-hover:scale-105 transition-transform duration-500">
            <div class="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex flex-col justify-end p-6">
                <span class="text-[9px] font-black text-gussGold uppercase tracking-widest mb-1">${cleanText(img.categoryName)}</span>
                <h4 class="text-white font-bold text-sm leading-tight">${cleanText(img.title)}</h4>
            </div>
        </div>`;
    }).join('');

    grid.querySelectorAll('[data-lightbox-src]').forEach(card => {
        card.addEventListener('click', () => {
            if (window.Swal) {
                Swal.fire({
                    title: card.getAttribute('data-lightbox-title'),
                    imageUrl: card.getAttribute('data-lightbox-src'),
                    imageAlt: card.getAttribute('data-lightbox-title'),
                    showConfirmButton: false,
                    showCloseButton: true,
                    width: '800px'
                });
            }
        });
    });
}

// =====================================================================
// 7. HOMEPAGE NOTABLE ALUMNI SPOTLIGHTS (index.html)
// =====================================================================
async function hydrateHomepageAlumniSpotlights() {
    const grid = document.getElementById('dynamicAlumniGrid');
    if (!grid) return;

    try {
        const list = await PublicApi.get('/alumni/spotlights?limit=4');
        if (!list || list.length === 0) {
            grid.innerHTML = `<div class="col-span-full py-12 text-center text-slate-400 font-bold border border-slate-700 rounded-3xl bg-slate-800/50">Verified alumni profiles will appear here once registered.</div>`;
            return;
        }
        grid.innerHTML = list.map(person => {
            const photo = resolveMediaUrl(person.photoUrl, 'https://ui-avatars.com/api/?name=A&background=1E3A8A&color=fff');
            return `
            <div class="bg-white border border-slate-200 rounded-3xl p-6 text-center shadow-sm hover:shadow-md hover:-translate-y-2 transition-all">
                <div class="w-24 h-24 mx-auto bg-slate-100 rounded-full border-4 border-slate-50 mb-4 overflow-hidden shadow-inner">
                    <img src="${cleanText(photo)}" alt="${cleanText(person.name)}" class="w-full h-full object-cover">
                </div>
                <h4 class="text-base font-black text-gussNavy uppercase truncate">${cleanText(person.name)}</h4>
                <span class="text-[10px] text-gussGold font-black uppercase tracking-widest block my-1">${cleanText(person.set)}</span>
                <p class="text-[10px] text-slate-500 mt-2 font-bold uppercase tracking-widest truncate">${cleanText(person.role || 'Alumnus')}</p>
            </div>`;
        }).join('');
    } catch (e) {
        grid.innerHTML = `<div class="col-span-full py-12 text-center text-slate-400 font-bold">Alumni showcase temporarily unavailable.</div>`;
    }
}

// =====================================================================
// 8. FAQS, TESTIMONIALS & PTA (100% DB-DRIVEN)
// =====================================================================
async function hydrateFaqs() {
    const container = document.getElementById('dynamicFaqsContainer');
    if (!container) return;

    try {
        const faqs = await PublicApi.get('/faqs');
        if (!faqs || faqs.length === 0) {
            container.innerHTML = `<p class="text-center text-slate-400 font-bold py-10">No FAQs published yet.</p>`;
            return;
        }

        container.innerHTML = faqs.map((faq, idx) => `
            <div class="faq-item bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm transition-all" data-question="${cleanText((faq.question + ' ' + faq.answer + ' ' + faq.category).toLowerCase())}">
                <button type="button" data-faq-toggle="faq-${idx}" class="w-full flex justify-between items-center p-6 text-left focus:outline-none hover:bg-slate-50 transition-colors">
                    <div>
                        <span class="text-[9px] font-black text-gussGold uppercase tracking-widest block mb-1">${cleanText(faq.category)}</span>
                        <h4 class="text-base font-black text-gussNavy">${cleanText(faq.question)}</h4>
                    </div>
                    <div class="w-8 h-8 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0 ml-4 transition-transform duration-300" id="faq-icon-${idx}"><i class="fa-solid fa-plus"></i></div>
                </button>
                <div id="faq-${idx}" class="hidden px-6 pb-6"><div class="pt-4 border-t border-slate-100"><p class="text-sm text-slate-600 leading-relaxed">${cleanText(faq.answer)}</p></div></div>
            </div>`).join('');

        container.querySelectorAll('[data-faq-toggle]').forEach(btn => {
            btn.addEventListener('click', () => {
                const id = btn.getAttribute('data-faq-toggle');
                const content = document.getElementById(id);
                const icon = document.getElementById(id.replace('faq-', 'faq-icon-'));
                content?.classList.toggle('hidden');
                icon?.classList.toggle('rotate-45');
            });
        });

        const searchInput = document.getElementById('faqSearchInput');
        if (searchInput) {
            searchInput.addEventListener('input', () => {
                const q = searchInput.value.trim().toLowerCase();
                container.querySelectorAll('.faq-item').forEach(item => {
                    const hay = item.getAttribute('data-question') || '';
                    item.style.display = !q || hay.includes(q) ? 'block' : 'none';
                });
            });
        }
    } catch (e) {
        container.innerHTML = `<p class="text-center text-red-500 font-bold text-xs py-8">Failed to load FAQs from server.</p>`;
    }
}

async function hydrateTestimonials() {
    const grid = document.getElementById('dynamicTestimonialsGrid');
    if (!grid) return;

    try {
        const list = await PublicApi.get('/testimonials');
        if (!list || list.length === 0) {
            grid.innerHTML = `<p class="col-span-full text-center text-slate-400 font-bold py-10">No testimonials published yet.</p>`;
            return;
        }
        grid.innerHTML = list.map(item => {
            const avatar = resolveMediaUrl(item.photoUrl, `https://ui-avatars.com/api/?name=${encodeURIComponent(item.name || 'G')}&background=005A36&color=fff`);
            return `
            <div class="break-inside-avoid mb-8">
                <div class="bg-slate-50 border border-slate-200 p-8 rounded-[2rem] shadow-sm hover:shadow-lg transition-all relative">
                    <i class="fa-solid fa-quote-left absolute top-6 left-6 text-4xl text-emerald-500/10"></i>
                    <p class="text-sm text-slate-600 leading-relaxed italic relative z-10 mb-6 font-serif">"${cleanText(item.quote)}"</p>
                    <div class="flex items-center gap-4 border-t border-slate-200 pt-4">
                        <img src="${cleanText(avatar)}" alt="${cleanText(item.name)}" class="w-12 h-12 rounded-full object-cover border-2 border-gussGold bg-white">
                        <div>
                            <h4 class="text-sm font-black text-gussNavy uppercase tracking-wide">${cleanText(item.name)}</h4>
                            <span class="text-[9px] font-bold text-slate-400 uppercase tracking-widest block mt-0.5">${cleanText(item.role)}</span>
                        </div>
                    </div>
                </div>
            </div>`;
        }).join('');
    } catch (e) {
        grid.innerHTML = `<p class="col-span-full text-center text-red-500 font-bold text-xs py-8">Failed to load testimonials.</p>`;
    }
}

async function hydratePta() {
    const grid = document.getElementById('dynamicPtaGrid');
    if (grid) {
        try {
            const execs = await PublicApi.get('/pta/executives');
            if (!execs || execs.length === 0) {
                grid.innerHTML = `<div class="col-span-full bg-slate-50 border border-dashed border-slate-300 rounded-2xl p-8 text-center text-xs font-bold text-slate-400">PTA Executive Committee roster is being updated by the Administration.</div>`;
            } else {
                grid.innerHTML = execs.map(ex => {
                    const photo = resolveMediaUrl(ex.photoUrl, `https://ui-avatars.com/api/?name=${encodeURIComponent(ex.name || 'P')}&background=0F172A&color=fff`);
                    return `
                    <div class="bg-slate-50 border border-slate-200 rounded-3xl p-6 text-center shadow-sm hover:shadow-md transition-shadow">
                        <img src="${cleanText(photo)}" alt="${cleanText(ex.name)}" class="w-24 h-24 mx-auto rounded-full object-cover border-4 border-gussGold mb-4 bg-white">
                        <h4 class="text-base font-black text-gussNavy uppercase">${cleanText(ex.name)}</h4>
                        <span class="text-[10px] font-black uppercase tracking-widest text-gussGreen block mt-1">${cleanText(ex.title)}</span>
                        ${ex.chapter ? `<p class="text-[10px] text-slate-500 font-bold mt-2">${cleanText(ex.chapter)}</p>` : ''}
                    </div>`;
                }).join('');
            }
        } catch (e) {
            grid.innerHTML = `<div class="col-span-full text-center text-red-500 font-bold text-xs py-6">Failed to load PTA executives.</div>`;
        }
    }

    const ptaForm = document.getElementById('ptaSuggestionForm');
    if (ptaForm) {
        ptaForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const btn = document.getElementById('ptaSubmitBtn');
            const orig = btn.innerHTML;
            btn.disabled = true;
            btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin mr-2"></i> Transmitting...';

            try {
                const res = await PublicApi.post('/pta/suggestions', {
                    senderName: document.getElementById('ptaSenderName').value.trim(),
                    contactInfo: document.getElementById('ptaContactInfo').value.trim(),
                    suggestion: document.getElementById('ptaSuggestionText').value.trim()
                });
                ptaForm.reset();
                if (window.Swal) Swal.fire('Transmitted', res.message || 'Your suggestion has been logged.', 'success');
            } catch (err) {
                if (window.Swal) Swal.fire('Submission Failed', err.message, 'error');
            } finally {
                btn.disabled = false;
                btn.innerHTML = orig;
            }
        });
    }
}