// =========================================================================
// G.U.S.S. RINGIM — WEB ADMIN COMMAND CENTER CONTROLLER
// =========================================================================
import { ENV } from './core_config.js';
import { ApiGateway } from './api_gateway.js';
import { CoreUI } from './core_ui.js';

let globalUsers = [];
let globalDonations = [];
let globalNewsDB = [];
let globalCandidates = [];
let RAM_CONFIGS = {};

let liveStudentRegistry = [];
let liveStaffRegistry = [];
let selectedPrefectEntity = null;
let selectedFacilityEntity = null;
let selectedExecEntity = null;
let currentLedgerData = [];

let globalNetworkThreads = [];
let activeTaxType = null; // 'ELECO' or 'DONATION'
let cachedArchiveCandidates = [];

async function promptZeroTrust(title, htmlMessage, confirmColor = '#0B1120') {
    const authRes = await Swal.fire({
        title: title || 'Zero-Trust Authorization',
        html: `${htmlMessage}<br><br>Enter Admin Password to authorize:`,
        input: 'password',
        inputAttributes: { autocapitalize: 'off', autocorrect: 'off' },
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: confirmColor,
        confirmButtonText: 'Authorize'
    });
    return (authRes.isConfirmed && authRes.value) ? authRes.value : null;
}

window.toggleExpandText = function (elementId, btnEl, maxLen = 180) {
    const el = document.getElementById(elementId);
    if (!el) return;
    const isExpanded = el.getAttribute('data-expanded') === 'true';
    const fullText = decodeURIComponent(el.getAttribute('data-full'));
    if (isExpanded) {
        el.textContent = fullText.substring(0, maxLen) + '...';
        el.setAttribute('data-expanded', 'false');
        btnEl.textContent = 'Read More';
    } else {
        el.textContent = fullText;
        el.setAttribute('data-expanded', 'true');
        btnEl.textContent = 'Show Less';
    }
};

window.resolveMediaUrl = function (url) {
    if (!url) return '';
    if (url.startsWith('http') || url.startsWith('data:')) return url;
    if (url.startsWith('/uploads')) return ENV.API_BASE_URL + url;
    return ENV.API_BASE_URL + '/uploads/' + url;
};

const defaultPrefectRoles = [
    "Head Student", "Deputy Head I", "Deputy Head II", "House Captain",
    "Special Duty Prefect I", "Special Duty Prefect II", "Chief Ameer I",
    "Labor Prefect I", "Health Prefect I", "Games Prefect I", "Gate Prefect I", "Quarter Prefect"
];

const defaultFacilityRoles = [
    "Physics Laboratory", "Chemistry Laboratory", "Biology Laboratory",
    "Agricultural Laboratory", "Mathematics Laboratory", "T.D Studio",
    "Computer Laboratory", "Main Library", "Guidance & Counseling", "Admissions Office"
];

function normalizeStaffType(type) {
    if (!type) return "Unknown";
    const t = type.toUpperCase().trim();
    if (t === 'ACADEMIC' || (t.includes('ACADEMIC') && !t.includes('NON'))) return 'Academic';
    if (t === 'NON_ACADEMIC' || t === 'NON-ACADEMIC' || t.includes('NON')) return 'Non-Academic';
    if (t === 'TEACHING_PRACTICE' || t === 'TP') return 'TP';
    if (t === 'NYSC') return 'NYSC';
    return type;
}

// =========================================================================
// 1. CLOUD-NATIVE STATE SYNCHRONIZATION
// =========================================================================
async function syncPostgresToLocal() {
    try {
        const [staffRes, stdRes, confRes] = await Promise.all([
            ApiGateway.get('/ict/staff/all-lightweight').catch(() => []),
            ApiGateway.get('/bridge/all-lightweight').catch(() => []),
            ApiGateway.get('/config/all').catch(() => ({}))
        ]);

        liveStaffRegistry = (staffRes || []).map(staff => ({
            ...staff,
            id: staff.staffId || staff.trackingRef,
            name: staff.fullName,
            staffType: normalizeStaffType(staff.staffType)
        }));

        liveStudentRegistry = stdRes || [];
        RAM_CONFIGS = confRes || {};
        sessionStorage.setItem('cloud_configs', JSON.stringify(RAM_CONFIGS));
    } catch (error) {
        console.error("Critical Cloud Sync Error:", error);
    }
}

// =========================================================================
// 2. SYSTEM INITIALIZATION
// =========================================================================
document.addEventListener('DOMContentLoaded', async () => {
    CoreUI.init();

    const topAdminName = document.getElementById('topAdminName');
    if (topAdminName) topAdminName.innerText = sessionStorage.getItem('guss_user_name') || "Web Admin";

    const topAdminRole = document.getElementById('topAdminRole');
    if (topAdminRole) {
        let role = sessionStorage.getItem('guss_user_role') || "System Administrator";
        topAdminRole.innerText = role.replace("ROLE_", "").replace(/_/g, " ");
    }

    const avatar = sessionStorage.getItem('guss_photo_url');
    const topAdminAvatar = document.getElementById('topAdminAvatar');
    if (avatar && topAdminAvatar) topAdminAvatar.src = window.resolveMediaUrl(avatar);

    initTabNavigation();
    await syncPostgresToLocal();
    await fetchTaxonomyDictionaries();
    await renderAllDashboards();
    populateInviteClassSetDropdown();
});

async function fetchTaxonomyDictionaries() {
    try {
        const taxonomy = await ApiGateway.get('/web-admin/taxonomy');
        if (!taxonomy) return;

        const populateSelect = (selectId, dataArray, keyField, displayField) => {
            const select = document.getElementById(selectId);
            if (!select || !Array.isArray(dataArray)) return;
            select.innerHTML = '';
            dataArray.forEach(item => {
                const opt = document.createElement('option');
                opt.value = item[keyField];
                opt.textContent = item[displayField];
                select.appendChild(opt);
            });
        };

        populateSelect('cmsPlatform', taxonomy.platforms, 'platformKey', 'displayName');
        populateSelect('cmsType', taxonomy.contentTypes, 'typeKey', 'displayName');
        populateSelect('cmsCategory', taxonomy.categories, 'categoryKey', 'displayName');
        populateSelect('galCategory', taxonomy.galleryCategories, 'categoryKey', 'displayName');
    } catch (e) {
        console.error("Taxonomy Load Failed:", e);
    }
}

async function renderAllDashboards() {
    await Promise.all([
        renderCmsTable(),
        renderGalleryGrid(),
        populateDynamicDropdowns(),
        renderPrefectsTable(),
        renderFacilitiesTable(),
        renderAlumniTable(),
        renderLedgerTable(),
        renderAlumniExecsTable(),
        renderAdminNetworkHub(),
        setupElecoPhaseUI(),
        renderCandidatesTable(),
        renderVoteTally(),
        renderArchivesTable(),
        populateExecRoleDropdown(),
        renderPendingAlumniVetting(),
        renderInviteCodes(),
        renderSiteContentAdmin()
    ]);
}

// =========================================================================
// 3. WEBSITE CMS ENGINE (FULL CRUD)
// =========================================================================
async function renderCmsTable() {
    const tbody = document.getElementById('adminCmsTableBody');
    if (!tbody) return;

    try {
        const articles = await ApiGateway.get('/web-admin/cms/articles');
        globalNewsDB = articles || [];

        const statPosts = document.getElementById('statTotalPosts');
        if (statPosts) statPosts.innerText = globalNewsDB.length.toLocaleString();

        if (globalNewsDB.length === 0) {
            tbody.innerHTML = `<tr><td colspan="3" class="px-6 py-8 text-center text-slate-400 font-bold">No posts published.</td></tr>`;
            return;
        }

        let htmlBuffer = '';
        globalNewsDB.forEach(post => {
            const safeId = DOMPurify.sanitize(post.id);
            htmlBuffer += `
            <tr class="hover:bg-slate-50 transition-colors border-b border-slate-100">
                <td class="px-6 py-4 font-mono text-[10px] font-bold text-slate-400">${new Date(post.publishedAt).toLocaleDateString()}</td>
                <td class="px-6 py-4">
                    <p class="font-bold text-slate-800 truncate w-48" title="${DOMPurify.sanitize(post.title)}">${DOMPurify.sanitize(post.title)}</p>
                    <div class="flex items-center gap-2 mt-1">
                        <span class="bg-slate-100 text-slate-500 px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-widest border border-slate-200">${DOMPurify.sanitize(post.platform)}</span>
                        <span class="text-[9px] text-adminAccent uppercase tracking-widest font-bold">${DOMPurify.sanitize(post.type)} : ${DOMPurify.sanitize(post.category)}</span>
                    </div>
                </td>
                <td class="px-6 py-4 text-center">
                    <button onclick="editCmsPost('${safeId}')" class="text-slate-400 hover:text-adminAccent mx-2 transition-colors" title="Edit Post"><i class="fa-solid fa-pen"></i></button>
                    <button onclick="deleteCmsPost('${safeId}')" class="text-slate-400 hover:text-red-500 mx-2 transition-colors" title="Delete Post"><i class="fa-solid fa-trash"></i></button>
                </td>
            </tr>`;
        });
        tbody.innerHTML = htmlBuffer;
    } catch (e) {
        tbody.innerHTML = `<tr><td colspan="3" class="p-4 text-red-500">Error loading CMS.</td></tr>`;
    }
}

window.resetCmsEditMode = function () {
    const form = document.getElementById('cmsNewsForm');
    if (form) form.reset();
    document.getElementById('cmsEditId').value = "";
    document.getElementById('cmsSubmitBtn').innerHTML = 'Push to Live Site';
    document.getElementById('cmsCancelEditBtn')?.classList.add('hidden');
};

document.getElementById('cmsNewsForm')?.addEventListener('submit', async function (e) {
    e.preventDefault();
    const btn = document.getElementById('cmsSubmitBtn');
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin mr-2"></i> Pushing...';
    btn.disabled = true;

    const formData = new FormData();
    const payload = {
        id: document.getElementById('cmsEditId').value || null,
        platformKey: document.getElementById('cmsPlatform').value,
        typeKey: document.getElementById('cmsType').value,
        categoryKey: document.getElementById('cmsCategory').value,
        title: document.getElementById('cmsTitle').value.trim(),
        content: document.getElementById('cmsContent').value.trim()
    };

    formData.append("data", new Blob([JSON.stringify(payload)], { type: "application/json" }));

    const imageFile = document.getElementById('cmsImage').files[0];
    if (imageFile) formData.append("coverImage", imageFile);

    try {
        await ApiGateway.postFormData('/web-admin/cms/publish', formData);
        await renderCmsTable();
        window.resetCmsEditMode();
        Swal.fire('Success', 'Article synchronized with live site.', 'success');
    } catch (error) {
        Swal.fire('Error', error.message, 'error');
        btn.innerHTML = document.getElementById('cmsEditId').value
            ? '<i class="fa-solid fa-pen-to-square mr-2"></i> Update Published Post'
            : 'Push to Live Site';
    } finally {
        btn.disabled = false;
    }
});

window.deleteCmsPost = async function (id) {
    const adminPassword = await promptZeroTrust('Delete CMS Post', 'This permanently removes the article from public portals.', '#ef4444');
    if (!adminPassword) return;
    try {
        await ApiGateway.post(`/web-admin/cms/articles/${encodeURIComponent(id)}/delete`, { adminPassword });
        await renderCmsTable();
        Swal.fire('Deleted!', 'The post has been purged.', 'success');
    } catch (e) { Swal.fire('Authorization Failed', e.message, 'error'); }
};

window.editCmsPost = function (id) {
    const post = globalNewsDB.find(n => n.id === id);
    if (!post) return;

    document.getElementById('cmsEditId').value = post.id;
    document.getElementById('cmsTitle').value = post.title;
    document.getElementById('cmsContent').value = post.content;
    document.getElementById('cmsPlatform').value = post.platformKey;
    document.getElementById('cmsType').value = post.typeKey;
    document.getElementById('cmsCategory').value = post.categoryKey;

    if (post.coverImageUrl) {
        Swal.fire({
            title: 'Current Cover Image',
            imageUrl: window.resolveMediaUrl(post.coverImageUrl),
            imageAlt: 'Cover Image',
            text: 'Upload a new image to replace this one, or leave the file input empty to preserve it.'
        });
    }

    document.getElementById('cmsSubmitBtn').innerHTML = '<i class="fa-solid fa-pen-to-square mr-2"></i> Update Published Post';
    document.getElementById('cmsCancelEditBtn')?.classList.remove('hidden');
    document.getElementById('cmsNewsForm').scrollIntoView({ behavior: 'smooth' });
};

window.toggleNotableAlumni = async function (rinobaId, isFeatured) {
    const adminPassword = await promptZeroTrust('Notable Alumni Curation', `${isFeatured ? 'Pin' : 'Unpin'} <b>${DOMPurify.sanitize(rinobaId)}</b> on the school homepage?`, '#d97706');
    if (!adminPassword) return;
    try {
        await ApiGateway.post('/web-admin/alumni/feature', { rinobaId, isFeatured, featuredOrder: 0, adminPassword });
        await renderAlumniTable();
        Swal.fire('Updated', 'Homepage Notable Alumni list updated.', 'success');
    } catch (e) { Swal.fire('Failed', e.message, 'error'); }
};

window.toggleSetCoordinator = async function (rinobaId, isSetCoordinator) {
    const adminPassword = await promptZeroTrust('Set Coordinator', `${isSetCoordinator ? 'Appoint' : 'Remove'} <b>${DOMPurify.sanitize(rinobaId)}</b> as a Set Coordinator?`, '#059669');
    if (!adminPassword) return;
    try {
        await ApiGateway.post('/web-admin/alumni/coordinator', { rinobaId, isSetCoordinator, adminPassword });
        await renderAlumniTable();
        Swal.fire('Updated', 'Set Coordinator status updated.', 'success');
    } catch (e) { Swal.fire('Failed', e.message, 'error'); }
};

async function renderPendingAlumniVetting() {
    const container = document.getElementById('pendingAlumniQueueBody');
    const badge = document.getElementById('pendingAlumniBadge');
    if (!container) return;
    try {
        const list = await ApiGateway.get('/web-admin/alumni/pending');
        if (badge) badge.textContent = String((list || []).length);
        if (!list || list.length === 0) {
            container.innerHTML = '<p class="text-xs text-slate-400 text-center py-6 font-bold">No pending alumni registrations.</p>';
            return;
        }
        container.innerHTML = list.map(a => `
            <div class="p-3 border border-slate-200 rounded-xl flex items-center justify-between gap-3 bg-slate-50">
                <div class="flex items-center gap-3 min-w-0">
                    <img src="${DOMPurify.sanitize(window.resolveMediaUrl(a.photoUrl))}" class="w-10 h-10 rounded-full object-cover shrink-0">
                    <div class="min-w-0">
                        <p class="text-xs font-black text-slate-800 uppercase truncate">${DOMPurify.sanitize(a.name)} (${DOMPurify.sanitize(a.set)})</p>
                        <p class="text-[10px] text-slate-500 truncate">${DOMPurify.sanitize(a.gradClass)} • ${DOMPurify.sanitize(a.hostel)} ${a.claimedAdmNo ? '• Adm: ' + DOMPurify.sanitize(a.claimedAdmNo) : ''}</p>
                        ${a.proofDocumentUrl ? `<a href="${DOMPurify.sanitize(window.resolveMediaUrl(a.proofDocumentUrl))}" target="_blank" class="text-[9px] text-blue-600 font-bold underline">View Proof</a>` : ''}
                    </div>
                </div>
                <div class="flex gap-1.5 shrink-0">
                    <button onclick="decideAlumniVetting('${DOMPurify.sanitize(a.rinobaId)}', true)" class="bg-emerald-600 text-white px-2.5 py-1.5 rounded-lg text-[9px] font-black uppercase">Verify</button>
                    <button onclick="decideAlumniVetting('${DOMPurify.sanitize(a.rinobaId)}', false)" class="bg-red-500 text-white px-2.5 py-1.5 rounded-lg text-[9px] font-black uppercase">Reject</button>
                </div>
            </div>`).join('');
    } catch (e) { container.innerHTML = '<p class="text-xs text-red-500">Failed to load vetting queue.</p>'; }
}

window.decideAlumniVetting = async function (rinobaId, approve) {
    let reason = '';
    if (!approve) {
        const r = await Swal.fire({ title: 'Rejection Reason', input: 'text', showCancelButton: true, confirmButtonColor: '#ef4444' });
        if (!r.isConfirmed || !r.value?.trim()) return;
        reason = r.value.trim();
    }
    const adminPassword = await promptZeroTrust(approve ? 'Verify Alumnus' : 'Reject Registration', `Confirm decision for ${DOMPurify.sanitize(rinobaId)}.`, approve ? '#059669' : '#ef4444');
    if (!adminPassword) return;
    try {
        const res = await ApiGateway.post('/web-admin/alumni/verify', { rinobaId, approve, reason, adminPassword });
        await Promise.all([renderPendingAlumniVetting(), renderAlumniTable()]);
        Swal.fire('Done', approve ? `Verified! Issued ID: ${res.rinobaId}` : 'Registration declined.', 'success');
    } catch (e) { Swal.fire('Error', e.message, 'error'); }
};

async function renderInviteCodes() {
    const listEl = document.getElementById('inviteCodesList');
    if (!listEl) return;
    try {
        const codes = await ApiGateway.get('/web-admin/alumni/invites');
        if (!codes || codes.length === 0) { listEl.innerHTML = '<p class="text-slate-400">No active invite codes.</p>'; return; }
        listEl.innerHTML = codes.filter(c => c.isActive).map(c => `
            <div class="p-2.5 bg-slate-50 border border-slate-200 rounded-lg flex justify-between items-center">
                <div><span class="font-mono font-black text-adminNavy">${DOMPurify.sanitize(c.code)}</span> <span class="text-[10px] text-slate-500">(${DOMPurify.sanitize(c.classSet)} • ${c.usesCount}/${c.maxUses})</span></div>
                <button onclick="deactivateInviteCode('${DOMPurify.sanitize(c.id)}')" class="text-red-500 text-[10px] font-black uppercase">Revoke</button>
            </div>`).join('');
    } catch (e) { }
}

function populateInviteClassSetDropdown() {
    const sel = document.getElementById('inviteClassSet');
    if (!sel) return;
    const cur = new Date().getFullYear();
    let html = '<option value="">Select Class Set...</option>';
    for (let y = cur; y >= 1980; y--) {
        html += `<option value="Class of ${y}">Class of ${y}</option>`;
    }
    sel.innerHTML = html;
}

document.getElementById('inviteCodeForm')?.addEventListener('submit', async function (e) {
    e.preventDefault();
    const classSet = document.getElementById('inviteClassSet').value.trim();
    const maxUses = parseInt(document.getElementById('inviteMaxUses').value, 10) || 25;
    const adminPassword = await promptZeroTrust('Generate Set Invite Code', `Create fast-track code for <b>${DOMPurify.sanitize(classSet)}</b> (${maxUses} uses).`);
    if (!adminPassword) return;
    try {
        const created = await ApiGateway.post('/web-admin/alumni/invites', { classSet, maxUses, validDays: 30, adminPassword });
        this.reset();
        await renderInviteCodes();
        Swal.fire('Invite Code Generated', `Share with ${classSet}: ${created.code}`, 'success');
    } catch (err) { Swal.fire('Error', err.message, 'error'); }
});

window.deactivateInviteCode = async function (id) {
    const adminPassword = await promptZeroTrust('Revoke Invite Code', 'Deactivate this set invite code?', '#ef4444');
    if (!adminPassword) return;
    try {
        await ApiGateway.post(`/web-admin/alumni/invites/${encodeURIComponent(id)}/deactivate`, { adminPassword });
        await renderInviteCodes();
    } catch (err) { Swal.fire('Error', err.message, 'error'); }
};

async function renderSiteContentAdmin() {
    const [faqs, tests, ptaExecs, suggestions] = await Promise.all([
        ApiGateway.get('/web-admin/faqs').catch(() => []),
        ApiGateway.get('/web-admin/testimonials').catch(() => []),
        ApiGateway.get('/web-admin/pta/executives').catch(() => []),
        ApiGateway.get('/web-admin/pta/suggestions').catch(() => [])
    ]);
    const faqsEl = document.getElementById('adminFaqsList');
    if (faqsEl) faqsEl.innerHTML = (faqs || []).map(f => `<div class="p-3 border rounded-xl flex justify-between items-start gap-2"><div><p class="text-xs font-black">${DOMPurify.sanitize(f.question)}</p><p class="text-[11px] text-slate-500 mt-0.5">${DOMPurify.sanitize(f.answer)}</p></div><button onclick="deleteSiteItem('faqs','${DOMPurify.sanitize(f.id)}')" class="text-red-500 text-xs"><i class="fa-solid fa-trash"></i></button></div>`).join('') || '<p class="text-xs text-slate-400">No FAQs.</p>';

    const testEl = document.getElementById('adminTestimonialsList');
    if (testEl) testEl.innerHTML = (tests || []).map(t => `<div class="p-3 border rounded-xl flex justify-between items-start gap-2"><div><p class="text-xs font-black">${DOMPurify.sanitize(t.authorName)} (${DOMPurify.sanitize(t.authorRole)})</p><p class="text-[11px] text-slate-500 italic">"${DOMPurify.sanitize(t.quote)}"</p></div><button onclick="deleteSiteItem('testimonials','${DOMPurify.sanitize(t.id)}')" class="text-red-500 text-xs"><i class="fa-solid fa-trash"></i></button></div>`).join('') || '<p class="text-xs text-slate-400">No testimonials.</p>';

    const ptaEl = document.getElementById('adminPtaExecsList');
    if (ptaEl) ptaEl.innerHTML = (ptaExecs || []).map(p => `<div class="p-3 border rounded-xl flex justify-between items-center"><div><p class="text-xs font-black">${DOMPurify.sanitize(p.fullName)}</p><p class="text-[10px] text-slate-500">${DOMPurify.sanitize(p.officeTitle)}</p></div><button onclick="deleteSiteItem('pta/executives','${DOMPurify.sanitize(p.id)}')" class="text-red-500 text-xs"><i class="fa-solid fa-trash"></i></button></div>`).join('') || '<p class="text-xs text-slate-400">No PTA Excos.</p>';

    const sugEl = document.getElementById('adminPtaSuggestionsList');
    if (sugEl) sugEl.innerHTML = (suggestions || []).map(s => `<div class="p-3 border rounded-xl ${s.status === 'UNREAD' ? 'bg-amber-50 border-amber-200' : 'bg-slate-50'}"><div class="flex justify-between"><span class="text-xs font-black">${DOMPurify.sanitize(s.senderName)} (${DOMPurify.sanitize(s.contactInfo)})</span>${s.status === 'UNREAD' ? `<button onclick="markSuggestionRead('${DOMPurify.sanitize(s.id)}')" class="text-[9px] font-black uppercase text-emerald-600">Mark Read</button>` : '<span class="text-[9px] text-slate-400 font-bold">REVIEWED</span>'}</div><p class="text-xs text-slate-600 mt-1">${DOMPurify.sanitize(s.suggestion)}</p></div>`).join('') || '<p class="text-xs text-slate-400">Inbox empty.</p>';
}

window.openAddFaqModal = async function () {
    const { value: v } = await Swal.fire({
        title: 'Add Public FAQ',
        html: `<input id="fCat" class="w-full p-2.5 border rounded-lg text-xs mb-2" placeholder="Category (e.g. Admissions)"><input id="fQ" class="w-full p-2.5 border rounded-lg text-xs mb-2" placeholder="Question"><textarea id="fA" class="w-full p-2.5 border rounded-lg text-xs mb-2" rows="3" placeholder="Answer"></textarea><input id="fPass" type="password" autocomplete="new-password" class="w-full p-2.5 border rounded-lg text-xs" placeholder="Admin Password">`,
        showCancelButton: true,
        preConfirm: () => {
            const category = document.getElementById('fCat').value.trim();
            const question = document.getElementById('fQ').value.trim();
            const answer = document.getElementById('fA').value.trim();
            const adminPassword = document.getElementById('fPass').value;
            if (!category || !question || !answer || !adminPassword) {
                Swal.showValidationMessage('All fields and Admin Password are required.');
                return false;
            }
            return { category, question, answer, displayOrder: 0, adminPassword };
        }
    });
    if (!v) return;
    try {
        await ApiGateway.post('/web-admin/faqs', v);
        await renderSiteContentAdmin();
        Swal.fire('Published', 'FAQ added to the public website.', 'success');
    } catch (err) {
        Swal.fire('Action Failed', err.message || 'Authorization or validation error.', 'error');
    }
};

window.openAddTestimonialModal = async function () {
    const { value: v } = await Swal.fire({
        title: 'Add Public Testimonial',
        html: `<input id="tName" class="w-full p-2.5 border rounded-lg text-xs mb-2" placeholder="Author Name"><input id="tRole" class="w-full p-2.5 border rounded-lg text-xs mb-2" placeholder="Role (e.g. Parent / Commissioner)"><textarea id="tQuote" class="w-full p-2.5 border rounded-lg text-xs mb-2" rows="3" placeholder="Quote"></textarea><input id="tPass" type="password" autocomplete="new-password" class="w-full p-2.5 border rounded-lg text-xs" placeholder="Admin Password">`,
        showCancelButton: true,
        preConfirm: () => {
            const authorName = document.getElementById('tName').value.trim();
            const authorRole = document.getElementById('tRole').value.trim();
            const quote = document.getElementById('tQuote').value.trim();
            const adminPassword = document.getElementById('tPass').value;
            if (!authorName || !authorRole || !quote || !adminPassword) {
                Swal.showValidationMessage('All fields and Admin Password are required.');
                return false;
            }
            return { authorName, authorRole, quote, adminPassword };
        }
    });
    if (!v) return;
    try {
        const fd = new FormData();
        fd.append('data', new Blob([JSON.stringify(v)], { type: 'application/json' }));
        await ApiGateway.postFormData('/web-admin/testimonials', fd);
        await renderSiteContentAdmin();
        Swal.fire('Published', 'Testimonial added to the public website.', 'success');
    } catch (err) {
        Swal.fire('Action Failed', err.message || 'Authorization or validation error.', 'error');
    }
};

window.openAddPtaExecModal = async function () {
    const { value: v } = await Swal.fire({
        title: 'Add PTA Executive',
        html: `<input id="pName" class="w-full p-2.5 border rounded-lg text-xs mb-2" placeholder="Full Name"><input id="pTitle" class="w-full p-2.5 border rounded-lg text-xs mb-2" placeholder="Office Title (e.g. PTA Chairman)"><input id="pChap" class="w-full p-2.5 border rounded-lg text-xs mb-2" placeholder="State / Chapter"><input id="pPass" type="password" autocomplete="new-password" class="w-full p-2.5 border rounded-lg text-xs" placeholder="Admin Password">`,
        showCancelButton: true,
        preConfirm: () => {
            const fullName = document.getElementById('pName').value.trim();
            const officeTitle = document.getElementById('pTitle').value.trim();
            const stateOrChapter = document.getElementById('pChap').value.trim();
            const adminPassword = document.getElementById('pPass').value;
            if (!fullName || !officeTitle || !adminPassword) {
                Swal.showValidationMessage('Name, Title, and Admin Password are required.');
                return false;
            }
            return { fullName, officeTitle, stateOrChapter, displayOrder: 0, adminPassword };
        }
    });
    if (!v) return;
    try {
        const fd = new FormData();
        fd.append('data', new Blob([JSON.stringify(v)], { type: 'application/json' }));
        await ApiGateway.postFormData('/web-admin/pta/executives', fd);
        await renderSiteContentAdmin();
        Swal.fire('Published', 'PTA Executive added.', 'success');
    } catch (err) {
        Swal.fire('Action Failed', err.message || 'Authorization or validation error.', 'error');
    }
};

window.deleteSiteItem = async function (resource, id) {
    const adminPassword = await promptZeroTrust('Delete Content', 'Remove this item from public display?', '#ef4444');
    if (!adminPassword) return;
    try {
        await ApiGateway.post(`/web-admin/${resource}/${encodeURIComponent(id)}/delete`, { adminPassword });
        await renderSiteContentAdmin();
        Swal.fire('Removed', 'Item removed successfully.', 'success');
    } catch (err) {
        Swal.fire('Authorization Failed', err.message || 'Invalid password or server error.', 'error');
    }
};

window.markSuggestionRead = async function (id) {
    try {
        await ApiGateway.post(`/web-admin/pta/suggestions/${encodeURIComponent(id)}/read`, {});
        await renderSiteContentAdmin();
        Swal.fire('Updated', 'Suggestion marked as reviewed.', 'success');
    } catch (err) {
        Swal.fire('Error', err.message || 'Failed to update status.', 'error');
    }
};

// =========================================================================
// 4. DYNAMIC PORTFOLIOS ENGINE
// =========================================================================
async function populateDynamicDropdowns() {
    try {
        const portfolios = await ApiGateway.get('/web-admin/portfolios');

        const roleSelect = document.getElementById('prefRole');
        if (roleSelect) {
            let htmlBuffer = '<option value="">Select a leadership role...</option>';
            const list = (portfolios?.prefects && portfolios.prefects.length > 0)
                ? portfolios.prefects
                : defaultPrefectRoles.map(r => ({ portfolioKey: r.toUpperCase().replace(/\s+/g, '_'), title: r }));
            list.forEach(p => {
                htmlBuffer += `<option value="${DOMPurify.sanitize(p.portfolioKey)}">${DOMPurify.sanitize(p.title)}</option>`;
            });
            roleSelect.innerHTML = htmlBuffer;
        }

        const facSelect = document.getElementById('facTarget');
        if (facSelect) {
            let htmlBuffer = '<option value="">Select a facility...</option>';
            const list = (portfolios?.facilities && portfolios.facilities.length > 0)
                ? portfolios.facilities
                : defaultFacilityRoles.map(f => ({ facilityKey: f.toUpperCase().replace(/\s+/g, '_'), facilityName: f }));
            list.forEach(f => {
                htmlBuffer += `<option value="${DOMPurify.sanitize(f.facilityKey)}">${DOMPurify.sanitize(f.facilityName)}</option>`;
            });
            facSelect.innerHTML = htmlBuffer;
        }

        const hostels = await ApiGateway.get('/dd/admin/hostels').catch(() => []);
        const hostelSelect = document.getElementById('prefHostel');
        if (hostelSelect && Array.isArray(hostels)) {
            let htmlBuffer = '<option value="">Select Required Hostel...</option>';
            hostels.forEach(h => {
                htmlBuffer += `<option value="${DOMPurify.sanitize(h.hostelName)}">${DOMPurify.sanitize(h.hostelName)}</option>`;
            });
            hostelSelect.innerHTML = htmlBuffer;
        }
    } catch (e) {
        console.error("Failed to load portfolios:", e);
    }
}

window.managePortfolios = async function (action, type) {
    const isPrefect = type === 'prefect';
    const selectId = isPrefect ? 'prefRole' : 'facTarget';
    const selectElement = document.getElementById(selectId);
    const targetKey = selectElement.value;

    if (action === 'ADD') {
        const { value: newItem, isConfirmed } = await Swal.fire({
            title: `Add ${type}`,
            input: 'text',
            inputLabel: `Enter the exact name of the new ${type} role/facility:`,
            showCancelButton: true,
            confirmButtonColor: '#005A36'
        });
        if (!isConfirmed || !newItem?.trim()) return;

        const title = newItem.trim();
        const key = title.toUpperCase().replace(/\s+/g, '_');
        const adminPassword = await promptZeroTrust('Portfolio Management', `Authorize adding <b>${DOMPurify.sanitize(title)}</b>.`, '#005A36');
        if (!adminPassword) return;

        try {
            await ApiGateway.post('/web-admin/portfolios/manage', {
                adminPassword, action: 'ADD', type: isPrefect ? 'PREFECT' : 'FACILITY',
                key, title, isHostelBound: isPrefect && title.toLowerCase().includes('captain')
            });
            await populateDynamicDropdowns();
            Swal.fire('Success', `'${title}' commissioned.`, 'success');
        } catch (e) { Swal.fire('Error', e.message, 'error'); }
    } else if (action === 'EDIT') {
        if (!targetKey) return Swal.fire('Error', "Select an item from the dropdown first.", 'error');
        const currentTitle = selectElement.options[selectElement.selectedIndex].text;
        const { value: newTitle, isConfirmed } = await Swal.fire({
            title: `Rename ${isPrefect ? 'Prefecture' : 'Facility'}`,
            input: 'text',
            inputValue: currentTitle,
            inputLabel: `Enter new display name for this portfolio:`,
            showCancelButton: true,
            confirmButtonColor: '#005A36'
        });
        if (!isConfirmed || !newTitle?.trim() || newTitle.trim() === currentTitle) return;

        const adminPassword = await promptZeroTrust('Portfolio Management', `Authorize renaming to <b>${DOMPurify.sanitize(newTitle.trim())}</b>.`, '#005A36');
        if (!adminPassword) return;

        try {
            await ApiGateway.post('/web-admin/portfolios/manage', {
                adminPassword, action: 'EDIT', type: isPrefect ? 'PREFECT' : 'FACILITY',
                key: targetKey, title: newTitle.trim(), isHostelBound: isPrefect && newTitle.toLowerCase().includes('captain')
            });
            await populateDynamicDropdowns();
            Swal.fire('Updated', 'Portfolio name synchronized.', 'success');
        } catch (e) { Swal.fire('Error', e.message, 'error'); }
    } else if (action === 'REMOVE') {
        if (!targetKey) return Swal.fire('Error', "Select an item from the dropdown first to remove it.", 'error');
        const adminPassword = await promptZeroTrust('Delete Portfolio', `Permanently delete this ${type} portfolio?`, '#ef4444');
        if (!adminPassword) return;

        try {
            await ApiGateway.post('/web-admin/portfolios/manage', {
                action: 'REMOVE', type: isPrefect ? 'PREFECT' : 'FACILITY', key: targetKey, adminPassword
            });
            await populateDynamicDropdowns();
            Swal.fire('Deleted', `Portfolio scrapped.`, 'success');
        } catch (e) { Swal.fire('Error', e.message, 'error'); }
    }
};

// =========================================================================
// 5. LEADERSHIP ENGINE (PREFECTS)
// =========================================================================
window.togglePrefectHostel = function () {
    const select = document.getElementById('prefRole');
    const roleText = select.options[select.selectedIndex]?.text.toLowerCase() || '';
    const hostelBox = document.getElementById('prefHostelBox');
    const hostelSelect = document.getElementById('prefHostel');

    if (roleText.includes('captain')) {
        hostelBox.classList.remove('hidden');
        hostelSelect.setAttribute('required', 'true');
    } else {
        hostelBox.classList.add('hidden');
        hostelSelect.removeAttribute('required');
        hostelSelect.value = '';
    }
};

window.handlePrefectSearch = function () {
    const query = document.getElementById('prefSearchInput').value.trim().toLowerCase();
    const resultsBox = document.getElementById('prefSearchResults');

    if (query.length < 2) { resultsBox.classList.add('hidden'); return; }

    const matches = liveStudentRegistry.filter(s =>
        (s.name && s.name.toLowerCase().includes(query)) ||
        (s.nin && s.nin.toLowerCase().includes(query)) ||
        (s.admNo && s.admNo.toLowerCase().includes(query))
    ).slice(0, 5);

    if (matches.length === 0) {
        resultsBox.innerHTML = `<div class="p-3 text-xs text-slate-500 font-bold text-center">No student found.</div>`;
    } else {
        let htmlBuffer = '';
        matches.forEach(m => {
            const dataStr = encodeURIComponent(JSON.stringify(m)).replace(/'/g, "%27");
            const safePhoto = window.resolveMediaUrl(m.photoUrl) || 'https://ui-avatars.com/api/?name=S&background=0D8ABC&color=fff';
            htmlBuffer += `
                <div onclick="selectPrefectEntity('${dataStr}')" class="p-3 hover:bg-slate-50 cursor-pointer flex items-center gap-3 transition-colors">
                    <img src="${DOMPurify.sanitize(safePhoto)}" class="w-8 h-8 rounded-full object-cover shrink-0 border border-slate-200">
                    <div class="truncate">
                        <p class="text-xs font-black text-slate-800 uppercase truncate">${DOMPurify.sanitize(m.name)}</p>
                        <p class="text-[9px] font-mono text-slate-500 mt-0.5">ID: ${DOMPurify.sanitize(m.admNo || m.nin)}</p>
                    </div>
                </div>
            `;
        });
        resultsBox.innerHTML = htmlBuffer;
    }
    resultsBox.classList.remove('hidden');
};

window.selectPrefectEntity = function (dataStr) {
    const student = JSON.parse(decodeURIComponent(dataStr));
    selectedPrefectEntity = student;

    document.getElementById('prefSearchResults').classList.add('hidden');
    document.getElementById('prefSearchInput').value = student.name;
    document.getElementById('prefBindPhoto').src = window.resolveMediaUrl(student.photoUrl) || 'https://ui-avatars.com/api/?name=S&background=0D8ABC&color=fff';
    document.getElementById('prefBindName').textContent = student.name;
    document.getElementById('prefBindNin').textContent = `ID: ${student.admNo || student.nin}`;

    document.getElementById('prefBindBadges').innerHTML = `
        <span class="bg-blue-100 text-blue-700 px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-widest border border-blue-200">${DOMPurify.sanitize(student.state || 'N/A')}</span>
        <span class="bg-slate-100 text-slate-600 px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-widest border border-slate-200">${DOMPurify.sanitize(student.assignedClass || 'Class Pending')}</span>
    `;

    const warningBox = document.getElementById('prefDisciplineWarning');
    if (student.status === 'REVOKED_QUARANTINED' || student.status === 'REJECTED') {
        document.getElementById('prefDisciplineReason').textContent = "This student has an active severe disciplinary flag and is ineligible for leadership.";
        warningBox.classList.remove('hidden');
    } else {
        warningBox.classList.add('hidden');
    }

    document.getElementById('prefSelectedCard').classList.remove('hidden');
};

document.getElementById('prefectForm')?.addEventListener('submit', async function (e) {
    e.preventDefault();
    if (!selectedPrefectEntity) return Swal.fire('Validation Error', "Please search and select a student from the database.", 'error');

    const roleKey = document.getElementById('prefRole').value;
    const hostel = document.getElementById('prefHostel').value;
    const adminPassword = await promptZeroTrust('Appoint Prefect', 'This action requires admin authorization to appoint a prefect.', '#005A36');
    if (!adminPassword) return;

    const res = await Swal.fire({
        title: 'Appoint Prefect?',
        text: `Are you sure you want to appoint ${selectedPrefectEntity.name} to this portfolio?`,
        icon: 'question',
        showCancelButton: true,
        confirmButtonColor: '#005A36',
        confirmButtonText: 'Yes, Appoint'
    });
    if (!res.isConfirmed) return;

    const btn = document.getElementById('btnAppointPrefect');
    const ogText = btn.innerHTML;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Processing...';
    btn.disabled = true;

    try {
        await ApiGateway.post('/web-admin/prefects/appoint', {
            portfolioKey: roleKey,
            studentNin: selectedPrefectEntity.nin,
            hostelName: hostel || null,
            adminPassword: adminPassword
        });

        this.reset();
        document.getElementById('prefHostelBox').classList.add('hidden');
        document.getElementById('prefSelectedCard').classList.add('hidden');
        selectedPrefectEntity = null;

        await renderPrefectsTable();
        Swal.fire('Success', 'Prefect appointed and bound to database.', 'success');
    } catch (error) {
        Swal.fire('Appointment Failed', error.message, 'error');
    } finally {
        btn.innerHTML = ogText;
        btn.disabled = false;
    }
});

async function renderPrefectsTable() {
    const tbody = document.getElementById('adminPrefectsTableBody');
    if (!tbody) return;

    try {
        const prefects = await ApiGateway.get('/web-admin/prefects/active');
        const statPref = document.getElementById('statTotalPrefects');
        if (statPref) statPref.innerText = (prefects || []).length.toLocaleString();

        if (!prefects || prefects.length === 0) {
            tbody.innerHTML = `<tr><td class="px-6 py-8 text-center text-slate-400 font-bold">No prefects appointed.</td></tr>`;
            return;
        }

        let htmlBuffer = '';
        prefects.forEach((p) => {
            const safePhoto = window.resolveMediaUrl(p.studentPhoto) || 'https://ui-avatars.com/api/?name=P&background=0D8ABC&color=fff';
            htmlBuffer += `
            <tr class="hover:bg-slate-50 transition-colors border-b border-slate-100">
                <td class="px-6 py-4 flex justify-between items-center gap-4">
                    <div class="flex items-center gap-3">
                        <img src="${DOMPurify.sanitize(safePhoto)}" class="w-10 h-10 rounded-full object-cover border-2 border-slate-200 shrink-0 bg-white">
                        <div>
                            <span class="font-black text-sm text-adminNavy uppercase">${DOMPurify.sanitize(p.studentName)}</span>
                            <p class="text-[9px] text-adminAccent uppercase tracking-widest font-black mt-0.5">${DOMPurify.sanitize(p.portfolioTitle)} ${p.hostelName ? `| <span class="text-slate-500">${DOMPurify.sanitize(p.hostelName)}</span>` : ''}</p>
                        </div>
                    </div>
                    <button onclick="triggerRevokeModal('PREFECT', '${DOMPurify.sanitize(p.id)}', '${DOMPurify.sanitize(p.studentName.replace(/'/g, "\\'"))}', '${DOMPurify.sanitize(p.portfolioTitle.replace(/'/g, "\\'"))}')" class="text-red-400 hover:text-white hover:bg-red-500 px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest border border-red-200 transition-colors shadow-sm"><i class="fa-solid fa-user-xmark mr-1"></i> Revoke</button>
                </td>
            </tr>`;
        });
        tbody.innerHTML = htmlBuffer;
    } catch (e) {
        tbody.innerHTML = `<tr><td class="px-6 py-8 text-center text-red-500 font-bold">Failed to load prefects.</td></tr>`;
    }
}

// =========================================================================
// 6. FACILITY MANAGERS ENGINE
// =========================================================================
window.handleFacilitySearch = function () {
    const query = document.getElementById('facSearchInput').value.trim().toLowerCase();
    const resultsBox = document.getElementById('facSearchResults');
    if (query.length < 3) { resultsBox.classList.add('hidden'); return; }

    const matches = liveStaffRegistry.filter(s => {
        const name = (s.fullName || '').toLowerCase();
        const ident = (s.staffId || s.trackingRef || '').toLowerCase();
        return name.includes(query) || ident.includes(query);
    }).slice(0, 5);

    if (matches.length === 0) {
        resultsBox.innerHTML = `<div class="p-3 text-xs text-slate-500 font-bold text-center">No staff found matching query.</div>`;
    } else {
        let htmlBuffer = '';
        matches.forEach(m => {
            const dataStr = encodeURIComponent(JSON.stringify(m)).replace(/'/g, "%27");
            const photo = window.resolveMediaUrl(m.photoUrl) || 'https://ui-avatars.com/api/?name=S&background=0D8ABC&color=fff';
            htmlBuffer += `
                <div onclick="selectFacilityEntity('${dataStr}')" class="p-3 hover:bg-slate-50 cursor-pointer flex items-center gap-3 transition-colors">
                    <img src="${DOMPurify.sanitize(photo)}" class="w-8 h-8 rounded-full object-cover shrink-0 border border-slate-200">
                    <div class="truncate">
                        <p class="text-xs font-black text-slate-800 uppercase truncate">${DOMPurify.sanitize(m.fullName)}</p>
                        <p class="text-[9px] font-mono text-slate-500 mt-0.5">ID: ${DOMPurify.sanitize(m.id)}</p>
                    </div>
                </div>
            `;
        });
        resultsBox.innerHTML = htmlBuffer;
    }
    resultsBox.classList.remove('hidden');
};

window.selectFacilityEntity = function (dataStr) {
    const staff = JSON.parse(decodeURIComponent(dataStr));
    selectedFacilityEntity = staff;

    document.getElementById('facSearchResults').classList.add('hidden');
    document.getElementById('facSearchInput').value = staff.fullName;
    document.getElementById('facBindPhoto').src = window.resolveMediaUrl(staff.photoUrl) || 'https://ui-avatars.com/api/?name=S&background=0D8ABC&color=fff';
    document.getElementById('facBindName').textContent = staff.fullName;
    document.getElementById('facBindNin').textContent = `ID: ${staff.id}`;
    document.getElementById('facSelectedCard').classList.remove('hidden');
};

document.getElementById('facilityForm')?.addEventListener('submit', async function (e) {
    e.preventDefault();
    if (!selectedFacilityEntity) return Swal.fire('Validation Error', "Please search and select a staff member.", 'error');

    const facKey = document.getElementById('facTarget').value;
    const roleTitle = document.getElementById('facRoleTitle').value.trim();
    const adminPassword = await promptZeroTrust('Appoint Facility Manager', 'This action requires admin authorization to appoint a facility manager.', '#005A36');
    if (!adminPassword) return;

    const res = await Swal.fire({
        title: 'Appoint Facility Manager?',
        text: `Are you sure you want to appoint ${selectedFacilityEntity.fullName} to this facility?`,
        icon: 'question',
        showCancelButton: true,
        confirmButtonColor: '#005A36',
        confirmButtonText: 'Yes, Appoint'
    });
    if (!res.isConfirmed) return;

    const btn = document.getElementById('btnAppointFacility');
    const ogText = btn.innerHTML;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Processing...';
    btn.disabled = true;

    try {
        await ApiGateway.post('/web-admin/facilities/appoint', {
            facilityKey: facKey,
            staffId: selectedFacilityEntity.id,
            roleTitle: roleTitle,
            adminPassword
        });

        this.reset();
        document.getElementById('facSelectedCard').classList.add('hidden');
        selectedFacilityEntity = null;

        await renderFacilitiesTable();
        Swal.fire('Success', 'Facility Manager appointed.', 'success');
    } catch (error) {
        Swal.fire('Error', error.message, 'error');
    } finally {
        btn.innerHTML = ogText;
        btn.disabled = false;
    }
});

async function renderFacilitiesTable() {
    const tbody = document.getElementById('adminFacilitiesTableBody');
    if (!tbody) return;

    try {
        const facilities = await ApiGateway.get('/web-admin/facilities/active');
        const statFac = document.getElementById('statTotalFacilities');
        if (statFac) statFac.innerText = (facilities || []).length.toLocaleString();

        if (!facilities || facilities.length === 0) {
            tbody.innerHTML = `<tr><td class="px-6 py-8 text-center text-slate-400 font-bold">No managers assigned yet.</td></tr>`;
            return;
        }

        let htmlBuffer = '';
        facilities.forEach(fac => {
            const photo = window.resolveMediaUrl(fac.staffPhoto) || 'https://ui-avatars.com/api/?name=M&background=0D8ABC&color=fff';
            htmlBuffer += `
            <tr class="hover:bg-slate-50 transition-colors border-b border-slate-100">
                <td class="px-6 py-4 flex justify-between items-center gap-4">
                    <div class="flex items-center gap-3">
                        <img src="${DOMPurify.sanitize(photo)}" class="w-10 h-10 rounded-full object-cover border-2 border-slate-200 shrink-0 bg-white">
                        <div>
                            <span class="font-black text-sm text-slate-800 uppercase">${DOMPurify.sanitize(fac.staffName)}</span>
                            <p class="text-[9px] text-cyan-600 uppercase tracking-widest font-bold mt-0.5">${DOMPurify.sanitize(fac.roleTitle)} | <span class="text-slate-400">${DOMPurify.sanitize(fac.facilityName)}</span></p>
                        </div>
                    </div>
                    <button onclick="triggerRevokeModal('FACILITY', '${DOMPurify.sanitize(fac.id)}', '${DOMPurify.sanitize(fac.staffName.replace(/'/g, "\\'"))}', '${DOMPurify.sanitize(fac.roleTitle.replace(/'/g, "\\'"))}')" class="text-red-400 hover:text-white hover:bg-red-500 px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest border border-red-200 transition-colors shadow-sm"><i class="fa-solid fa-trash mr-1"></i> Revoke</button>
                </td>
            </tr>`;
        });
        tbody.innerHTML = htmlBuffer;
    } catch (e) {
        tbody.innerHTML = `<tr><td class="px-6 py-8 text-center text-red-500 font-bold">Failed to load facilities.</td></tr>`;
    }
}

// =========================================================================
// 7. REVOCATION & AUDIT LEDGER
// =========================================================================
window.triggerRevokeModal = function (type, targetId, name, role) {
    document.getElementById('revokeType').value = type;
    document.getElementById('revokeTargetId').value = targetId;
    document.getElementById('revokeTargetDetails').innerText = `${name} - ${role}`;

    const modal = document.getElementById('revokeConfirmModal');
    modal.classList.remove('hidden');
    setTimeout(() => { document.getElementById('revokeConfirmContent').classList.remove('scale-95', 'opacity-0'); }, 10);
};

window.closeRevokeModal = function () {
    document.getElementById('revokeConfirmContent').classList.add('scale-95', 'opacity-0');
    setTimeout(() => { document.getElementById('revokeConfirmModal').classList.add('hidden'); }, 300);
};

document.getElementById('revokeForm')?.addEventListener('submit', async function (e) {
    e.preventDefault();
    const type = document.getElementById('revokeType').value;
    const targetId = document.getElementById('revokeTargetId').value;
    const duration = document.getElementById('revokeDuration').value;
    const reason = document.getElementById('revokeReason').value.trim();
    const adminPassword = await promptZeroTrust('Revoke Leadership', 'This action requires admin authorization to revoke leadership privileges.', '#ef4444');
    if (!adminPassword) return;

    const btn = document.getElementById('btnConfirmRevoke');
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';
    btn.disabled = true;

    try {
        await ApiGateway.post('/web-admin/leadership/revoke', {
            appointmentId: targetId,
            entityType: type,
            durationScope: duration,
            reason: reason,
            adminPassword: adminPassword
        });

        if (type === 'PREFECT') await renderPrefectsTable();
        else if (type === 'FACILITY') await renderFacilitiesTable();

        closeRevokeModal();
        this.reset();
        Swal.fire('Revoked', 'Leadership privileges successfully stripped and logged.', 'success');
    } catch (error) {
        Swal.fire('Revocation Failed', error.message, 'error');
    } finally {
        btn.innerHTML = 'Execute Action';
        btn.disabled = false;
    }
});

window.openHistoricalLedger = async function (type = 'ALL') {
    const tbody = document.getElementById('ledgerTableBody');
    if (!tbody) return;

    tbody.innerHTML = '<tr><td colspan="4" class="p-10 text-center text-slate-400 font-bold"><i class="fa-solid fa-spinner fa-spin text-3xl mb-2 block opacity-50"></i> Loading Immutable Ledger...</td></tr>';

    const modal = document.getElementById('leadershipLedgerModal');
    modal.classList.remove('hidden');
    setTimeout(() => { document.getElementById('ledgerModalContent').classList.remove('scale-95', 'opacity-0'); }, 10);

    try {
        const ledger = await ApiGateway.get(`/web-admin/leadership/ledger?type=${encodeURIComponent(type)}&limit=100`);
        currentLedgerData = ledger || [];
        renderLedgerUI(currentLedgerData);
    } catch (e) {
        tbody.innerHTML = '<tr><td colspan="4" class="p-10 text-center text-red-500 font-bold">Failed to load ledger.</td></tr>';
    }
};

function renderLedgerUI(data) {
    const tbody = document.getElementById('ledgerTableBody');
    if (!data || data.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" class="p-10 text-center text-slate-400 font-bold"><i class="fa-solid fa-ghost text-3xl mb-2 block opacity-50"></i> No historical records found.</td></tr>';
        return;
    }

    let htmlBuffer = '';
    data.forEach(log => {
        const actionBadge = log.actionType === 'APPOINTMENT'
            ? '<span class="bg-emerald-100 text-emerald-700 px-2.5 py-1 rounded text-[9px] font-black uppercase tracking-widest border border-emerald-200"><i class="fa-solid fa-arrow-up text-[8px] mr-1"></i> APPOINTED</span>'
            : '<span class="bg-red-100 text-red-700 px-2.5 py-1 rounded text-[9px] font-black uppercase tracking-widest border border-red-200"><i class="fa-solid fa-arrow-down text-[8px] mr-1"></i> STRIPPED</span>';

        htmlBuffer += `
        <tr class="hover:bg-slate-50 border-b border-slate-100">
            <td class="p-5 text-xs font-black text-slate-800 uppercase">${DOMPurify.sanitize(log.entityName)}</td>
            <td class="p-5 text-[10px] font-bold text-adminAccent uppercase tracking-widest">${DOMPurify.sanitize(log.portfolioName)}</td>
            <td class="p-5">
                ${actionBadge}
                <p class="text-[8px] font-black uppercase tracking-widest text-slate-400 mt-1">${DOMPurify.sanitize(log.durationScope)}</p>
            </td>
            <td class="p-5 text-[10px] text-slate-500 font-medium">
                <p class="mb-1 italic text-slate-700 max-w-sm whitespace-normal">"${DOMPurify.sanitize(log.reason)}"</p>
                <span class="text-[8px] uppercase tracking-widest font-black text-slate-400">Authorized By: ${DOMPurify.sanitize(log.actorName)} | ${new Date(log.timestamp).toLocaleString()}</span>
            </td>
        </tr>`;
    });
    tbody.innerHTML = htmlBuffer;
}

window.filterLedgerUI = function () {
    const query = document.getElementById('ledgerSearchInput').value.toLowerCase();
    const filtered = currentLedgerData.filter(l =>
        (l.entityName && l.entityName.toLowerCase().includes(query)) ||
        (l.portfolioName && l.portfolioName.toLowerCase().includes(query))
    );
    renderLedgerUI(filtered);
};

window.closeHistoricalLedger = function () {
    document.getElementById('ledgerModalContent').classList.add('scale-95', 'opacity-0');
    setTimeout(() => { document.getElementById('leadershipLedgerModal').classList.add('hidden'); }, 300);
};

// =========================================================================
// 8. GALLERY ENGINE
// =========================================================================
async function renderGalleryGrid() {
    const grid = document.getElementById('adminGalleryGrid');
    if (!grid) return;

    try {
        const assets = await ApiGateway.get('/web-admin/gallery/assets');
        const statGal = document.getElementById('statTotalGallery');
        if (statGal) statGal.innerText = (assets || []).length.toLocaleString();

        if (!assets || assets.length === 0) {
            grid.innerHTML = `<div class="col-span-full py-10 text-center text-slate-400 font-bold text-xs">No gallery assets uploaded yet.</div>`;
            return;
        }

        let htmlBuffer = '';
        assets.forEach(img => {
            const safeUrl = window.resolveMediaUrl(img.imageUrl);
            htmlBuffer += `
            <div class="relative group rounded-xl overflow-hidden shadow-sm h-32 border border-slate-200 bg-white">
                <img src="${DOMPurify.sanitize(safeUrl)}" class="w-full h-full object-cover">
                <div class="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                    <button onclick="deleteGalleryImage('${DOMPurify.sanitize(img.id)}')" class="text-white hover:text-red-500 bg-black/50 p-2 rounded-full transition-colors"><i class="fa-solid fa-trash"></i></button>
                </div>
                <span class="absolute bottom-2 left-2 text-[8px] font-black text-white uppercase tracking-widest bg-amber-600 px-2 py-0.5 rounded shadow-sm">${DOMPurify.sanitize(img.category)}</span>
            </div>`;
        });
        grid.innerHTML = htmlBuffer;
    } catch (e) {
        console.error("Failed to load gallery:", e);
    }
}

document.getElementById('galleryForm')?.addEventListener('submit', async function (e) {
    e.preventDefault();
    const imageFile = document.getElementById('galImage').files[0];
    if (!imageFile) return;

    const btn = document.getElementById('btnGalleryUpload');
    const ogText = btn ? btn.innerHTML : 'Add to Gallery';
    if (btn) { btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin mr-2"></i> Uploading...'; btn.disabled = true; }

    const formData = new FormData();
    const payload = {
        categoryKey: document.getElementById('galCategory').value,
        title: document.getElementById('galTitle').value.trim()
    };

    formData.append("data", new Blob([JSON.stringify(payload)], { type: "application/json" }));
    formData.append("image", imageFile);

    try {
        await ApiGateway.postFormData('/web-admin/gallery/upload', formData);
        await renderGalleryGrid();
        this.reset();
        Swal.fire('Success', 'Image published to cloud gallery.', 'success');
    } catch (error) {
        Swal.fire('Upload Error', error.message, 'error');
    } finally {
        if (btn) { btn.innerHTML = ogText; btn.disabled = false; }
    }
});

window.deleteGalleryImage = async function (id) {
    const adminPassword = await promptZeroTrust('Delete Gallery Asset', 'Permanently delete this image from Backblaze B2 and database?', '#ef4444');
    if (!adminPassword) return;
    try {
        await ApiGateway.post(`/web-admin/gallery/assets/${encodeURIComponent(id)}/delete`, { adminPassword });
        await renderGalleryGrid();
        Swal.fire('Deleted', 'Image removed from cloud gallery.', 'success');
    } catch (e) { Swal.fire('Authorization Failed', e.message, 'error'); }
};

// =========================================================================
// 9. RINOBA: ALUMNI EXECUTIVES & MODERATION
// =========================================================================
async function renderAlumniExecsTable() {
    const tbody = document.getElementById('adminExecsTableBody');
    if (!tbody) return;
    try {
        const execs = await ApiGateway.get('/web-admin/alumni/executives');
        if (!execs || execs.length === 0) {
            tbody.innerHTML = `<tr><td colspan="2" class="px-6 py-8 text-center text-slate-400 font-bold">No executives appointed yet.</td></tr>`;
            return;
        }
        let htmlBuffer = '';
        execs.forEach(exec => {
            const safeImg = window.resolveMediaUrl(exec.image) || 'https://ui-avatars.com/api/?name=E&background=0D8ABC&color=fff';
            htmlBuffer += `
            <tr class="hover:bg-slate-50 transition-colors border-b border-slate-100">
                <td class="px-6 py-4 flex items-center gap-3">
                    <img src="${DOMPurify.sanitize(safeImg)}" class="w-8 h-8 rounded-full object-cover border border-slate-200 shrink-0 bg-white">
                    <div>
                        <span class="font-bold text-slate-800 uppercase">${DOMPurify.sanitize(exec.name)}</span>
                        <p class="text-[9px] text-amber-600 uppercase tracking-widest font-bold">${DOMPurify.sanitize(exec.role)} | ${DOMPurify.sanitize(exec.set)}</p>
                    </div>
                </td>
                <td class="px-6 py-4 text-center">
                    <button onclick="removeAlumniExec('${DOMPurify.sanitize(exec.id)}')" class="text-slate-400 hover:text-red-500 transition-colors" title="Remove Executive"><i class="fa-solid fa-trash"></i></button>
                </td>
            </tr>`;
        });
        tbody.innerHTML = htmlBuffer;
    } catch (e) {
        console.error("Exec Load Failed:", e);
    }
}

window.handleExecSearch = function () {
    const query = document.getElementById('execSearchInput').value.trim().toLowerCase();
    const resultsBox = document.getElementById('execSearchResults');
    if (query.length < 2) { resultsBox.classList.add('hidden'); return; }

    const matches = globalUsers.filter(a =>
        !a.isBanned && ((a.name && a.name.toLowerCase().includes(query)) || (a.id && a.id.toLowerCase().includes(query)))
    ).slice(0, 5);

    if (matches.length === 0) {
        resultsBox.innerHTML = `<div class="p-3 text-xs text-slate-500 font-bold text-center">No active alumni found.</div>`;
    } else {
        let htmlBuffer = '';
        matches.forEach(m => {
            const dataStr = encodeURIComponent(JSON.stringify(m)).replace(/'/g, "%27");
            const safeImg = window.resolveMediaUrl(m.image) || 'https://ui-avatars.com/api/?name=A&background=1E3A8A&color=fff';
            htmlBuffer += `<div onclick="selectExecEntity('${dataStr}')" class="p-3 hover:bg-slate-50 cursor-pointer flex items-center gap-3 transition-colors">
                <img src="${DOMPurify.sanitize(safeImg)}" class="w-8 h-8 rounded-full object-cover shrink-0 border border-slate-200">
                <div class="truncate">
                    <p class="text-xs font-black text-slate-800 uppercase truncate">${DOMPurify.sanitize(m.name)}</p>
                    <p class="text-[9px] font-mono text-slate-500 mt-0.5">ID: ${DOMPurify.sanitize(m.id)}</p>
                </div>
            </div>`;
        });
        resultsBox.innerHTML = htmlBuffer;
    }
    resultsBox.classList.remove('hidden');
};

window.selectExecEntity = function (dataStr) {
    const alumnus = JSON.parse(decodeURIComponent(dataStr));
    selectedExecEntity = alumnus;
    document.getElementById('execSearchResults').classList.add('hidden');
    document.getElementById('execSearchInput').value = alumnus.name;
    document.getElementById('execBindPhoto').src = window.resolveMediaUrl(alumnus.image) || 'https://ui-avatars.com/api/?name=A&background=1E3A8A&color=fff';
    document.getElementById('execBindName').textContent = alumnus.name;
    document.getElementById('execBindId').textContent = `ID: ${alumnus.id}`;
    document.getElementById('execSelectedCard').classList.remove('hidden');
};

document.getElementById('execsForm')?.addEventListener('submit', async function (e) {
    e.preventDefault();
    if (!selectedExecEntity) return Swal.fire('Validation Error', 'Please search and select a verified alumnus first.', 'error');
    const roleTitle = document.getElementById('execRole').value;
    if (!roleTitle) return Swal.fire('Validation Error', 'Select an executive title.', 'error');

    const adminPassword = await promptZeroTrust('Appoint Alumni Executive', `Appoint <b>${DOMPurify.sanitize(selectedExecEntity.name)}</b> as <b>${DOMPurify.sanitize(roleTitle)}</b>.`, '#0B1120');
    if (!adminPassword) return;

    const btn = document.getElementById('btnAppointExec');
    const ogText = btn.innerHTML;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin mr-2"></i> Publishing...';
    btn.disabled = true;

    const formData = new FormData();
    formData.append('rinobaId', selectedExecEntity.id);
    formData.append('roleTitle', roleTitle);
    formData.append('adminPassword', adminPassword);
    const imgFile = document.getElementById('execImage').files[0];
    if (imgFile) formData.append('image', imgFile);

    try {
        await ApiGateway.postFormData('/web-admin/alumni/executives/add', formData);
        this.reset();
        document.getElementById('execSelectedCard').classList.add('hidden');
        selectedExecEntity = null;
        await renderAlumniExecsTable();
        Swal.fire('Published', 'Alumni executive appointed to board.', 'success');
    } catch (error) {
        Swal.fire('Appointment Failed', error.message, 'error');
    } finally {
        btn.innerHTML = ogText;
        btn.disabled = false;
    }
});

window.removeAlumniExec = async function (execId) {
    const adminPassword = await promptZeroTrust('Remove Executive', 'Remove this member from the active RINOBA Executive Board?', '#ef4444');
    if (!adminPassword) return;
    try {
        await ApiGateway.post(`/web-admin/alumni/executives/${encodeURIComponent(execId)}/remove`, { adminPassword });
        await renderAlumniExecsTable();
        Swal.fire('Removed', 'Executive removed from active board.', 'success');
    } catch (error) {
        Swal.fire('Authorization Failed', error.message, 'error');
    }
};

async function renderAlumniTable(usersToRender = null) {
    const tableBody = document.getElementById('adminAlumniTableBody');
    if (!tableBody) return;
    try {
        if (!usersToRender) {
            const users = await ApiGateway.get('/web-admin/alumni/directory');
            globalUsers = users || [];
        }
        const toDisplay = usersToRender || globalUsers;
        const statAlumni = document.getElementById('statTotalAlumni');
        if (statAlumni) statAlumni.innerText = globalUsers.length.toLocaleString();

        if (toDisplay.length === 0) {
            tableBody.innerHTML = `<tr><td colspan="5" class="px-6 py-8 text-center text-slate-400 font-bold">No records found.</td></tr>`;
            return;
        }
        let htmlBuffer = '';
        toDisplay.slice(0, 100).forEach(user => {
            const isBanned = user.isBanned === true;
            const dataString = encodeURIComponent(JSON.stringify(user)).replace(/'/g, "%27");
            const safeImg = window.resolveMediaUrl(user.image) || 'https://ui-avatars.com/api/?name=A&background=1E3A8A&color=fff';
            htmlBuffer += `
            <tr class="${isBanned ? 'bg-red-50/50 opacity-75' : 'hover:bg-slate-50'} border-b border-slate-100">
                <td class="px-6 py-4 font-mono text-xs font-bold text-adminNavy">${DOMPurify.sanitize(user.id)}</td>
                <td class="px-6 py-4 flex items-center gap-3">
                    <img src="${DOMPurify.sanitize(safeImg)}" class="w-8 h-8 rounded-full object-cover border border-slate-200 shrink-0 bg-white">
                    <span class="font-bold ${isBanned ? 'text-red-700 line-through' : 'text-slate-800'}">${DOMPurify.sanitize(user.name)}</span>
                </td>
                <td class="px-6 py-4"><span class="bg-blue-50 text-blue-700 px-2 py-1 rounded text-[10px] font-black uppercase tracking-widest border border-blue-100">${DOMPurify.sanitize(user.set)}</span></td>
                <td class="px-6 py-4 font-medium text-slate-500">${DOMPurify.sanitize(user.email)}</td>
                <td class="px-6 py-4 text-center">
                    <button onclick="viewAdminProfile('${dataString}')" class="text-slate-400 hover:text-adminAccent mx-2 transition-colors"><i class="fa-solid fa-eye"></i></button>
                    <button onclick="triggerBanFlow('${DOMPurify.sanitize(user.id)}', '${DOMPurify.sanitize(user.name.replace(/'/g, "\\'"))}', ${isBanned})" class="${isBanned ? 'text-emerald-500' : 'text-slate-400 hover:text-red-500'} mx-2 transition-colors"><i class="fa-solid ${isBanned ? 'fa-rotate-left' : 'fa-ban'}"></i></button>
                    <button onclick="toggleNotableAlumni('${DOMPurify.sanitize(user.id)}', ${!user.isFeatured})" class="${user.isFeatured ? 'text-amber-500' : 'text-slate-300 hover:text-amber-500'} mx-1" title="Feature on Homepage (Notable Alumni)"><i class="fa-solid fa-star"></i></button>
                    <button onclick="toggleSetCoordinator('${DOMPurify.sanitize(user.id)}', ${!user.isSetCoordinator})" class="${user.isSetCoordinator ? 'text-emerald-600' : 'text-slate-300 hover:text-emerald-600'} mx-1" title="Toggle Set Coordinator"><i class="fa-solid fa-user-check"></i></button>
                </td>
            </tr>`;
        });
        tableBody.innerHTML = htmlBuffer;
        populateExportFilters();
    } catch (e) {
        tableBody.innerHTML = `<tr><td colspan="5" class="px-6 py-8 text-center text-red-500 font-bold">Failed to load alumni directory.</td></tr>`;
    }
}

window.filterAdminTable = function () {
    const query = document.getElementById('adminDbSearch').value.toLowerCase();
    const filtered = globalUsers.filter(u =>
        (u.name && u.name.toLowerCase().includes(query)) ||
        (u.id && u.id.toLowerCase().includes(query)) ||
        (u.email && u.email.toLowerCase().includes(query))
    );
    renderAlumniTable(filtered);
};

window.viewAdminProfile = function (dataString) {
    const user = JSON.parse(decodeURIComponent(dataString));
    document.getElementById('adminViewImg').src = window.resolveMediaUrl(user.image) || 'https://ui-avatars.com/api/?name=A&background=1E3A8A&color=fff';
    document.getElementById('adminViewName').innerText = user.name;
    document.getElementById('adminViewId').innerText = user.id;
    document.getElementById('adminViewSet').innerText = user.set;
    document.getElementById('adminViewEmail').innerText = user.email || "N/A";
    document.getElementById('adminViewPhone').innerText = user.phone || "N/A";
    document.getElementById('adminViewJob').innerText = `${user.role || "N/A"} (${user.profession || "N/A"})`;
    document.getElementById('adminViewLocation').innerText = user.state || "N/A";
    document.getElementById('adminViewClass').innerText = `${user.gradClass || "N/A"} | ${user.hostel || "N/A"}`;
    const statusEl = document.getElementById('adminViewStatus');
    statusEl.innerText = user.isBanned ? "SUSPENDED" : "ACTIVE";
    statusEl.className = user.isBanned ? "font-black uppercase text-red-600 tracking-wider" : "font-black uppercase text-emerald-600 tracking-wider";
    const modal = document.getElementById('adminViewProfileModal');
    modal.classList.remove('hidden');
    setTimeout(() => { document.getElementById('adminProfileContent').classList.remove('scale-95', 'opacity-0'); }, 10);
};

window.closeAdminProfileModal = function () {
    document.getElementById('adminProfileContent').classList.add('scale-95', 'opacity-0');
    setTimeout(() => { document.getElementById('adminViewProfileModal').classList.add('hidden'); }, 300);
};

window.triggerBanFlow = async function (userId, userName, isCurrentlyBanned) {
    const action = isCurrentlyBanned ? "reinstate" : "suspend";
    const authRes = await Swal.fire({
        title: 'Zero-Trust Authorization',
        html: `You are about to <b>${action}</b> the account of ${DOMPurify.sanitize(userName)}.<br><br>Enter Admin Password to authorize:`,
        input: 'password',
        inputAttributes: { autocapitalize: 'off', autocorrect: 'off' },
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: isCurrentlyBanned ? '#10b981' : '#ef4444',
        confirmButtonText: 'Authorize Action'
    });

    if (authRes.isConfirmed && authRes.value) {
        try {
            await ApiGateway.post('/web-admin/alumni/ban', {
                rinobaId: userId,
                isBanned: !isCurrentlyBanned,
                adminPassword: authRes.value
            });
            Swal.fire('Success', `User has been ${action}d.`, 'success');
            await renderAlumniTable();
        } catch (e) {
            Swal.fire('Authorization Failed', e.message || 'Invalid Password.', 'error');
        }
    }
};

function populateExportFilters() {
    const setFilter = document.getElementById('exportFilterSet');
    const stateFilter = document.getElementById('exportFilterState');
    if (!setFilter || !stateFilter) return;
    const uniqueSets = [...new Set(globalUsers.map(u => u.set).filter(Boolean))].sort().reverse();
    const uniqueStates = [...new Set(globalUsers.map(u => u.state).filter(Boolean))].sort();
    let setHtml = '<option value="all">All Sets</option>';
    uniqueSets.forEach(set => setHtml += `<option value="${DOMPurify.sanitize(set)}">${DOMPurify.sanitize(set)}</option>`);
    setFilter.innerHTML = setHtml;
    let stateHtml = '<option value="all">All States</option>';
    uniqueStates.forEach(state => stateHtml += `<option value="${DOMPurify.sanitize(state)}">${DOMPurify.sanitize(state)}</option>`);
    stateFilter.innerHTML = stateHtml;
}

window.exportToCSV = function () {
    const targetSet = document.getElementById('exportFilterSet').value;
    const targetState = document.getElementById('exportFilterState').value;
    let exportData = globalUsers.filter(u => (targetSet === 'all' || u.set === targetSet) && (targetState === 'all' || u.state === targetState));
    if (exportData.length === 0) { Swal.fire('Export Error', "No records match filters.", 'error'); return; }
    const headers = ["Portal_ID", "Full_Name", "Nickname", "Class_Set", "Email", "Phone", "Profession", "Job_Title", "State", "Account_Status"];
    const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    let csvContent = headers.join(",") + "\n";
    exportData.forEach(row => {
        const rowData = [
            esc(row.id), esc(row.name), esc(row.nickname), esc(row.set), esc(row.email),
            esc(row.phone), esc(row.profession), esc(row.role), esc(row.state),
            esc(row.isBanned ? 'SUSPENDED' : 'ACTIVE')
        ];
        csvContent += rowData.join(",") + "\n";
    });
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `RINOBA_Alumni_Export_${Date.now()}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
};

async function populateExecRoleDropdown() {
    const select = document.getElementById('execRole');
    if (!select) return;
    try {
        const ranks = await ApiGateway.get('/web-admin/eleco/ranks');
        if (!ranks || ranks.length === 0) {
            select.innerHTML = '<option value="">No ranks defined (Click Edit Ranks)</option>';
            return;
        }
        select.innerHTML = '<option value="">Select Executive Title...</option>' +
            ranks.map(r => `<option value="${DOMPurify.sanitize(r.title)}">${DOMPurify.sanitize(r.title)}</option>`).join('');
    } catch (e) {
        select.innerHTML = '<option value="">Failed to load ranks</option>';
    }
}

// =========================================================================
// 10. FINANCIAL LEDGER
// =========================================================================
async function renderLedgerTable(donationsToRender = null) {
    const tbody = document.getElementById('adminLedgerTableBody');
    if (!tbody) return;
    try {
        if (!donationsToRender) {
            const res = await ApiGateway.get('/web-admin/endowment/ledger');
            globalDonations = res?.transactions || [];
            const totalFunds = Number(res?.totalClearedFunds || 0);
            const statFunds = document.getElementById('statTotalFunds');
            if (statFunds) statFunds.innerText = '₦' + totalFunds.toLocaleString();
        }
        const toDisplay = donationsToRender || globalDonations;

        if (toDisplay.length === 0) {
            tbody.innerHTML = `<tr><td colspan="6" class="px-6 py-8 text-center text-slate-400 font-bold">No transactions found.</td></tr>`;
            return;
        }
        let htmlBuffer = '';
        toDisplay.slice(0, 100).forEach(d => {
            let statusBadge = `<span class="bg-amber-100 text-amber-700 px-2 py-1 rounded text-[9px] font-black uppercase">Pending</span>`;
            if (d.status === 'CLEARED') {
                statusBadge = `<span class="bg-emerald-100 text-emerald-600 px-2 py-1 rounded text-[9px] font-black uppercase"><i class="fa-solid fa-check"></i> Cleared</span>`;
            } else if (d.status === 'FAILED') {
                statusBadge = `<span class="bg-red-100 text-red-600 px-2 py-1 rounded text-[9px] font-black uppercase"><i class="fa-solid fa-xmark"></i> Failed</span>`;
            }
            htmlBuffer += `
            <tr class="hover:bg-slate-50 transition-colors border-b border-slate-100">
                <td class="px-6 py-4 font-mono text-[10px] font-bold text-adminNavy">${DOMPurify.sanitize(d.txId)}</td>
                <td class="px-6 py-4"><p class="font-bold text-slate-800">${DOMPurify.sanitize(d.name)}</p><p class="text-[9px] text-slate-400 uppercase tracking-widest font-bold">${DOMPurify.sanitize(d.id)}</p></td>
                <td class="px-6 py-4 text-slate-600 text-xs font-bold">${DOMPurify.sanitize(d.purpose)}</td>
                <td class="px-6 py-4 text-emerald-600 font-black">₦${Number(d.amount).toLocaleString()}</td>
                <td class="px-6 py-4 text-[10px] uppercase tracking-widest font-bold text-slate-400">${new Date(d.date).toLocaleDateString()}</td>
                <td class="px-6 py-4 text-center">${statusBadge}</td>
            </tr>`;
        });
        tbody.innerHTML = htmlBuffer;
    } catch (e) {
        tbody.innerHTML = `<tr><td colspan="6" class="px-6 py-8 text-center text-red-500 font-bold">Failed to load financial ledger.</td></tr>`;
    }
}

window.filterLedgerTable = function () {
    const query = document.getElementById('adminLedgerSearch').value.toLowerCase();
    const filtered = globalDonations.filter(d =>
        (d.name && d.name.toLowerCase().includes(query)) ||
        (d.id && d.id.toLowerCase().includes(query)) ||
        (d.txId && d.txId.toLowerCase().includes(query)) ||
        (d.purpose && d.purpose.toLowerCase().includes(query))
    );
    renderLedgerTable(filtered);
};

window.exportLedgerCSV = function () {
    if (globalDonations.length === 0) { Swal.fire('Export Error', "No transactions to export.", 'error'); return; }
    const headers = ["Transaction_ID", "Donor_ID", "Donor_Name", "Purpose", "Amount(NGN)", "Channel", "Date", "Status"];
    const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    let csvContent = headers.join(",") + "\n";
    globalDonations.forEach(row => {
        const rowData = [
            esc(row.txId), esc(row.id), esc(row.name), esc(row.purpose),
            esc(row.amount), esc(row.channel), esc(row.date), esc(row.status)
        ];
        csvContent += rowData.join(",") + "\n";
    });
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `RINOBA_Financial_Ledger_${Date.now()}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
};

// =========================================================================
// 11. ELECO ENGINE & ARCHIVES
// =========================================================================
async function setupElecoPhaseUI() {
    try {
        const cycle = await ApiGateway.get('/eleco/status');
        if (cycle) {
            const currentPhase = cycle.currentPhase || 1;
            const elecoRadio = document.querySelector(`input[name="elecoPhase"][value="${currentPhase}"]`);
            if (elecoRadio) elecoRadio.checked = true;
            const statPhase = document.getElementById('statElecoPhase');
            if (statPhase) statPhase.innerText = 'Phase ' + currentPhase;
            if (cycle.deadline && document.getElementById('elecoDeadlineInput')) {
                document.getElementById('elecoDeadlineInput').value = String(cycle.deadline).slice(0, 16);
            }
        }
    } catch (e) {
        console.error("ELECO Status Load Failed:", e);
    }
}

window.broadcastElecoState = async function () {
    const checkedRadio = document.querySelector('input[name="elecoPhase"]:checked');
    const selectedPhase = checkedRadio ? parseInt(checkedRadio.value, 10) : null;
    const deadlineInput = document.getElementById('elecoDeadlineInput').value;
    if (!selectedPhase) return Swal.fire('Error', "Please select an election phase.", 'error');
    if (!deadlineInput) return Swal.fire('Error', "Please set a deadline timer.", 'error');

    const adminPassword = await promptZeroTrust('Broadcast ELECO Phase', `Transition live election to <b>Phase ${selectedPhase}</b> (Deadline: ${deadlineInput}).`, '#0B1120');
    if (!adminPassword) return;

    try {
        await ApiGateway.post('/web-admin/eleco/phase', {
            currentPhase: selectedPhase,
            deadline: deadlineInput,
            adminPassword
        });
        document.getElementById('statElecoPhase').innerText = 'Phase ' + selectedPhase;
        Swal.fire('Success', `Phase ${selectedPhase} broadcasted globally!`, 'success');
    } catch (e) {
        Swal.fire('Authorization Failed', e.message || 'Could not update ELECO phase.', 'error');
    }
};


async function renderCandidatesTable() {
    const tbody = document.getElementById('adminCandidatesTableBody');
    if (!tbody) return;
    try {
        const candidates = await ApiGateway.get('/web-admin/eleco/candidates');
        globalCandidates = candidates || [];

        if (globalCandidates.length === 0) {
            tbody.innerHTML = `<tr><td colspan="4" class="px-6 py-8 text-center text-slate-400 font-bold">No declarations submitted for active cycle.</td></tr>`;
            return;
        }
        let htmlBuffer = '';
        globalCandidates.forEach(c => {
            const safeImg = window.resolveMediaUrl(c.image) || 'https://ui-avatars.com/api/?name=C&background=0D8ABC&color=fff';
            const status = (c.status || 'PENDING').toUpperCase();
            let statusPill = `<span class="bg-amber-100 text-amber-700 px-2 py-0.5 rounded text-[9px] font-black uppercase mr-2">Pending</span>`;
            if (status === 'APPROVED') statusPill = `<span class="bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded text-[9px] font-black uppercase mr-2">Approved</span>`;
            if (status === 'REJECTED') statusPill = `<span class="bg-red-100 text-red-700 px-2 py-0.5 rounded text-[9px] font-black uppercase mr-2">Rejected</span>`;

            htmlBuffer += `
            <tr class="hover:bg-slate-50 transition-colors border-b border-slate-100">
                <td class="px-6 py-4 flex items-center gap-3">
                    <img src="${DOMPurify.sanitize(safeImg)}" class="w-8 h-8 rounded-full object-cover border border-slate-200 shrink-0 bg-white">
                    <div>
                        <span class="font-bold text-slate-800 uppercase block">${DOMPurify.sanitize(c.name)}</span>
                        <span class="text-[9px] font-mono text-slate-400">${DOMPurify.sanitize(c.rinobaId || '')}</span>
                    </div>
                </td>
                <td class="px-6 py-4 text-xs font-bold text-slate-600 uppercase">${DOMPurify.sanitize(c.role)}</td>
                <td class="px-6 py-4"><button onclick="viewManifesto('${DOMPurify.sanitize(c.id)}')" class="text-[10px] font-black uppercase tracking-widest text-adminAccent hover:underline"><i class="fa-solid fa-folder-open mr-1"></i> View Dossier</button></td>
                <td class="px-6 py-4 text-center">
                    ${statusPill}
                    <button onclick="updateCandidateStatus('${DOMPurify.sanitize(c.id)}', 'approved')" class="text-emerald-500 hover:text-emerald-700 mx-1" title="Approve Candidate"><i class="fa-solid fa-check-circle text-lg"></i></button>
                    <button onclick="updateCandidateStatus('${DOMPurify.sanitize(c.id)}', 'rejected')" class="text-red-500 hover:text-red-700 mx-1" title="Reject Candidate"><i class="fa-solid fa-circle-xmark text-lg"></i></button>
                </td>
            </tr>`;
        });
        tbody.innerHTML = htmlBuffer;
    } catch (e) {
        tbody.innerHTML = `<tr><td colspan="4" class="px-6 py-8 text-center text-red-500 font-bold">Failed to load candidate dossiers.</td></tr>`;
    }
}

window.viewManifesto = function (id) {
    const c = globalCandidates.find(x => x.id === id);
    if (!c) return;

    document.getElementById('manImg').src = window.resolveMediaUrl(c.image) || 'https://ui-avatars.com/api/?name=C&background=0D8ABC&color=fff';
    document.getElementById('manName').innerText = c.name;
    document.getElementById('manRole').innerText = c.role;

    const credUrl = c.credentialsUrl ? window.resolveMediaUrl(c.credentialsUrl) : '';
    const credLink = credUrl
        ? `<a href="${DOMPurify.sanitize(credUrl)}" target="_blank" rel="noopener noreferrer" class="inline-flex items-center gap-2 bg-adminNavy text-white px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest hover:bg-slate-800 transition-colors"><i class="fa-solid fa-file-pdf"></i> Inspect Uploaded Credentials</a>`
        : `<span class="text-xs text-slate-400 italic">No credentials attached.</span>`;

    document.getElementById('manText').innerHTML = `
        <div class="mb-4">
            <h4 class="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1">Campaign Slogan</h4>
            <p class="text-sm text-slate-800 font-bold italic">"${DOMPurify.sanitize(c.slogan || 'N/A')}"</p>
        </div>
        <div class="mb-4">
            <h4 class="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1">Academic & Professional Pedigree</h4>
            <p class="text-sm text-slate-700 leading-relaxed whitespace-pre-line">${DOMPurify.sanitize(c.pedigree || 'N/A')}</p>
        </div>
        <div class="mb-4">
            <h4 class="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1">Core Action Plan</h4>
            <p class="text-sm text-slate-700 leading-relaxed whitespace-pre-line">${DOMPurify.sanitize(c.actionPlan || 'N/A')}</p>
        </div>
        <div class="pt-3 border-t border-slate-100">${credLink}</div>
    `;

    const modal = document.getElementById('adminManifestoModal');
    modal.classList.remove('hidden');
    setTimeout(() => { document.getElementById('adminManifestoContent').classList.remove('scale-95', 'opacity-0'); }, 10);
};

window.closeManifestoModal = function () {
    document.getElementById('adminManifestoContent').classList.add('scale-95', 'opacity-0');
    setTimeout(() => { document.getElementById('adminManifestoModal').classList.add('hidden'); }, 300);
};

window.updateCandidateStatus = async function (id, status) {
    const isReject = status === 'rejected';
    const { value: formVals } = await Swal.fire({
        title: isReject ? 'Decline Candidacy' : 'Approve Candidacy',
        html: `
            <p class="text-xs text-slate-500 mb-3">${isReject ? 'Provide a clear committee reason (emailed to the candidate).' : 'Optional vetting note for the approved candidate.'}</p>
            <textarea id="swalVettingReason" class="w-full p-3 border border-slate-300 rounded-xl text-xs mb-3 resize-none" rows="3" placeholder="${isReject ? 'Mandatory rejection reason...' : 'Optional commendation / campaign note...'}"></textarea>
            <input id="swalVettingPass" type="password" class="w-full p-3 border border-slate-300 rounded-xl text-xs" placeholder="Enter Admin Password">
        `,
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: isReject ? '#ef4444' : '#005A36',
        confirmButtonText: isReject ? 'Decline & Notify' : 'Approve & Notify',
        preConfirm: () => {
            const reason = document.getElementById('swalVettingReason').value.trim();
            const adminPassword = document.getElementById('swalVettingPass').value;
            if (isReject && !reason) { Swal.showValidationMessage('Rejection reason is mandatory.'); return false; }
            if (!adminPassword) { Swal.showValidationMessage('Admin Password is required.'); return false; }
            return { reason, adminPassword };
        }
    });
    if (!formVals) return;

    try {
        await ApiGateway.post('/web-admin/eleco/candidates/status', {
            candidateId: id,
            status,
            reason: formVals.reason,
            adminPassword: formVals.adminPassword
        });
        await Promise.all([renderCandidatesTable(), renderVoteTally()]);
        Swal.fire('Updated', `Candidate marked as ${status} and notified.`, 'success');
    } catch (e) {
        Swal.fire('Authorization Failed', e.message, 'error');
    }
};

async function renderVoteTally() {
    const grid = document.getElementById('liveVoteTallyGrid');
    if (!grid) return;
    try {
        const tally = await ApiGateway.get('/web-admin/eleco/tally');
        if (!tally || Object.keys(tally).length === 0) {
            grid.innerHTML = `<div class="col-span-full py-6 text-center text-slate-500 font-bold text-xs border border-slate-700 rounded-xl">No approved candidates or votes in the active cycle yet.</div>`;
            return;
        }
        let htmlBuffer = '';
        Object.keys(tally).forEach(role => {
            htmlBuffer += `<div class="col-span-full mt-4 mb-2 border-b border-slate-700 pb-2"><h4 class="text-[10px] font-black uppercase tracking-widest text-slate-400">${DOMPurify.sanitize(role)}</h4></div>`;
            tally[role].forEach((c, index) => {
                const isLeader = index === 0 && c.votes > 0;
                const safeImg = window.resolveMediaUrl(c.image) || 'https://ui-avatars.com/api/?name=C&background=0D8ABC&color=fff';
                htmlBuffer += `
                <div class="bg-slate-800 border ${isLeader ? 'border-amber-400' : 'border-slate-700'} p-4 rounded-2xl flex items-center justify-between mb-3">
                    <div class="flex items-center gap-3">
                        <img src="${DOMPurify.sanitize(safeImg)}" class="w-10 h-10 rounded-full object-cover border border-slate-600 bg-white shrink-0">
                        <div><h4 class="text-xs font-black ${isLeader ? 'text-amber-400' : 'text-white'} uppercase truncate w-36">${DOMPurify.sanitize(c.name)}</h4><p class="text-[8px] text-emerald-400 uppercase tracking-widest">Candidate</p></div>
                    </div>
                    <div class="text-2xl font-black ${isLeader ? 'text-amber-400' : 'text-white'} bg-slate-900 px-3 py-1 rounded-lg border border-slate-700">${Number(c.votes)}</div>
                </div>`;
            });
        });
        grid.innerHTML = htmlBuffer;
    } catch (e) {
        grid.innerHTML = `<div class="col-span-full py-6 text-center text-red-400 font-bold text-xs">Failed to load live vote tally.</div>`;
    }
}

window.sealElectionCycle = async function () {
    const tenureLabel = document.getElementById('elecoTenureLabel').value.trim();
    if (!tenureLabel) return Swal.fire('Error', "Provide a tenure label.", 'error');

    const adminPassword = await promptZeroTrust('CRITICAL: Seal Election Cycle', `Archive all votes under <b>"${DOMPurify.sanitize(tenureLabel)}"</b> and reset active cycle to Phase 1.`, '#ef4444');
    if (!adminPassword) return;

    try {
        await ApiGateway.post('/web-admin/eleco/seal', { tenureLabel, adminPassword });
        document.getElementById('elecoTenureLabel').value = '';
        await renderAllDashboards();
        Swal.fire('Cycle Sealed', "Election cycle archived successfully. Active board reset to Phase 1.", 'success');
    } catch (e) {
        Swal.fire('Sealing Failed', e.message, 'error');
    }
};

window.printElecoResults = async function () {
    try {
        const blob = await ApiGateway.getBlob('/web-admin/eleco/report/live');
        if (!blob) return;
        const blobUrl = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = blobUrl;
        link.download = `Live_Election_Tally.pdf`;
        document.body.appendChild(link);
        link.click();
        link.remove();
        window.URL.revokeObjectURL(blobUrl);
    } catch (err) {
        Swal.fire('Error', err.message || 'Failed to generate Jasper report.', 'error');
    }
};

async function renderArchivesTable() {
    const tbody = document.getElementById('adminArchivesTableBody');
    if (!tbody) return;
    try {
        const archives = await ApiGateway.get('/web-admin/eleco/archives');
        if (!archives || archives.length === 0) {
            tbody.innerHTML = `<tr><td colspan="4" class="px-6 py-8 text-center text-slate-400 font-bold">No archives found.</td></tr>`;
            return;
        }
        tbody.innerHTML = archives.map(h => {
            const encodedLabel = encodeURIComponent(h.tenureLabel);
            return `<tr class="hover:bg-slate-50 border-b border-slate-100">
                <td class="px-6 py-4 font-black text-adminNavy uppercase">${DOMPurify.sanitize(h.tenureLabel)}</td>
                <td class="px-6 py-4 text-xs font-bold text-slate-500">${new Date(h.sealedAt).toLocaleDateString()}</td>
                <td class="px-6 py-4 text-center font-black text-slate-800">${Number(h.totalBallots)}</td>
                <td class="px-6 py-4 text-center space-x-2">
                    <button onclick="inspectElecoArchive('${DOMPurify.sanitize(h.id)}')" class="text-[10px] font-black uppercase tracking-widest text-blue-600 hover:bg-blue-100 bg-blue-50 px-3 py-1.5 rounded-lg border border-blue-200 transition-colors">
                        <i class="fa-solid fa-eye mr-1"></i> Inspect
                    </button>
                    <button onclick="printArchivedResults('${encodedLabel}')" class="text-[10px] font-black uppercase tracking-widest text-emerald-600 hover:bg-emerald-100 bg-emerald-50 px-3 py-1.5 rounded-lg border border-emerald-200 transition-colors">
                        <i class="fa-solid fa-print mr-1"></i> PDF
                    </button>
                </td>
            </tr>`;
        }).join('');
    } catch (e) {
        tbody.innerHTML = `<tr><td colspan="4" class="px-6 py-8 text-center text-red-500 font-bold">Failed to load archives.</td></tr>`;
    }
}

window.inspectElecoArchive = async function (archiveId) {
    const modal = document.getElementById('elecoArchiveInspectorModal');
    const content = document.getElementById('elecoArchiveInspectorContent');
    const body = document.getElementById('archInspectBody');

    body.innerHTML = `<div class="py-16 text-center text-slate-400 font-bold text-xs"><i class="fa-solid fa-spinner fa-spin text-3xl mb-3 block"></i> Decrypting Archived Election Cycle...</div>`;
    modal.classList.remove('hidden');
    setTimeout(() => content.classList.remove('scale-95', 'opacity-0'), 10);

    try {
        const data = await ApiGateway.get(`/web-admin/eleco/archives/${encodeURIComponent(archiveId)}`);
        cachedArchiveCandidates = data.candidates || [];

        document.getElementById('archInspectTitle').innerText = `TENURE: ${data.tenureLabel}`;
        document.getElementById('archInspectMeta').innerText = `Sealed: ${new Date(data.sealedAt).toLocaleString()} | Total Ballots Verified: ${data.totalBallots}`;
        document.getElementById('archInspectPrintBtn').onclick = () => window.printArchivedResults(encodeURIComponent(data.tenureLabel));

        let resultsHtml = '';
        const portfolios = Object.keys(data.results || {});
        if (portfolios.length === 0) {
            resultsHtml = `<p class="text-xs text-slate-400 italic">No ballots were recorded in this archive.</p>`;
        } else {
            portfolios.forEach(role => {
                resultsHtml += `<div class="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
                    <h4 class="text-xs font-black uppercase tracking-widest text-adminNavy mb-3 border-b border-slate-100 pb-2">${DOMPurify.sanitize(role)}</h4>
                    <div class="grid sm:grid-cols-2 gap-3">`;
                data.results[role].forEach(c => {
                    const isWinner = c.verdict === 'ELECTED';
                    resultsHtml += `<div class="p-3 rounded-xl border ${isWinner ? 'border-emerald-400 bg-emerald-50/50' : 'border-slate-200 bg-slate-50'} flex justify-between items-center">
                        <div>
                            <p class="text-xs font-black text-slate-800 uppercase">${DOMPurify.sanitize(c.name)}</p>
                            <p class="text-[9px] font-mono text-slate-500">${DOMPurify.sanitize(c.rinobaId)}</p>
                        </div>
                        <div class="text-right">
                            <span class="text-lg font-black text-adminNavy block">${Number(c.votes)}</span>
                            <span class="text-[8px] font-black uppercase px-2 py-0.5 rounded ${isWinner ? 'bg-emerald-600 text-white' : 'bg-slate-200 text-slate-600'}">${DOMPurify.sanitize(c.verdict)}</span>
                        </div>
                    </div>`;
                });
                resultsHtml += `</div></div>`;
            });
        }

        const candRows = (data.candidates || []).map(c => `
            <tr class="border-b border-slate-100">
                <td class="p-3 text-xs font-bold text-slate-800 uppercase">${DOMPurify.sanitize(c.name)} <span class="block text-[9px] font-mono text-slate-400">${DOMPurify.sanitize(c.rinobaId)}</span></td>
                <td class="p-3 text-xs font-bold text-slate-600">${DOMPurify.sanitize(c.role)}</td>
                <td class="p-3 text-[10px] font-black uppercase">${DOMPurify.sanitize(c.status)}</td>
                <td class="p-3 text-right"><button onclick="viewArchivedCandidateDossier('${DOMPurify.sanitize(c.id)}')" class="text-[10px] font-black uppercase text-adminAccent hover:underline">Read Dossier</button></td>
            </tr>
        `).join('') || `<tr><td colspan="4" class="p-4 text-center text-xs text-slate-400">No candidate records linked.</td></tr>`;

        const voterRows = (data.voters || []).map(v => `
            <tr class="border-b border-slate-100">
                <td class="p-3 text-xs font-bold text-slate-800 uppercase">${DOMPurify.sanitize(v.name)}</td>
                <td class="p-3 text-xs font-mono text-slate-500">${DOMPurify.sanitize(v.rinobaId)}</td>
                <td class="p-3 text-xs text-slate-500 text-right">${DOMPurify.sanitize(v.votedAt)}</td>
            </tr>
        `).join('') || `<tr><td colspan="3" class="p-4 text-center text-xs text-slate-400">No voter slips recorded.</td></tr>`;

        body.innerHTML = `
            <div><h4 class="text-xs font-black uppercase tracking-widest text-slate-500 mb-3">1. Certified Portfolio Tally</h4><div class="space-y-4">${resultsHtml}</div></div>
            <div class="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
                <div class="p-4 bg-slate-100 border-b border-slate-200 text-xs font-black uppercase tracking-widest text-slate-700">2. Cycle Candidate Dossiers (Read-Only)</div>
                <table class="w-full text-left border-collapse"><tbody>${candRows}</tbody></table>
            </div>
            <div class="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
                <div class="p-4 bg-slate-100 border-b border-slate-200 text-xs font-black uppercase tracking-widest text-slate-700">3. Verified Voter Participation Log (Ballot-Unlinked)</div>
                <div class="max-h-60 overflow-y-auto"><table class="w-full text-left border-collapse"><tbody>${voterRows}</tbody></table></div>
            </div>
        `;
    } catch (e) {
        body.innerHTML = `<div class="py-16 text-center text-red-500 font-bold text-xs">Failed to load archive details: ${DOMPurify.sanitize(e.message)}</div>`;
    }
};

window.viewArchivedCandidateDossier = function (id) {
    const c = cachedArchiveCandidates.find(x => x.id === id);
    if (!c) return;
    globalCandidates = cachedArchiveCandidates;
    window.viewManifesto(id);
};

window.closeArchiveInspector = function () {
    document.getElementById('elecoArchiveInspectorContent').classList.add('scale-95', 'opacity-0');
    setTimeout(() => document.getElementById('elecoArchiveInspectorModal').classList.add('hidden'), 250);
};

window.printArchivedResults = async function (encodedTenureLabel) {
    const tenureLabel = decodeURIComponent(encodedTenureLabel);
    try {
        const blob = await ApiGateway.getBlob(`/web-admin/eleco/report/download?tenureLabel=${encodeURIComponent(tenureLabel)}`);
        if (!blob) return;
        const blobUrl = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = blobUrl;
        link.download = `Election_Results_${tenureLabel.replace(/\s+/g, '_')}.pdf`;
        document.body.appendChild(link);
        link.click();
        link.remove();
        window.URL.revokeObjectURL(blobUrl);
    } catch (err) {
        Swal.fire('Error', err.message || 'Failed to generate archived report.', 'error');
    }
};

// =========================================================================
// 12. DYNAMIC CONFIGURATIONS (ELECO Ranks & Donation Categories)
// =========================================================================
window.manageDynamicConfig = async function (type) {
    activeTaxType = type;
    const isEleco = type === 'ELECO';
    document.getElementById('taxCrudTitle').innerText = isEleco ? 'Manage ELECO Ranks / Portfolios' : 'Manage Donation Categories';
    document.getElementById('taxCrudSubtitle').innerText = isEleco
        ? 'Synchronized automatically with ELECO Declarations & Alumni Executives.'
        : 'Synchronized automatically with the Alumni Endowment Checkout.';
    document.getElementById('taxNewNameInput').placeholder = isEleco ? 'New Rank Title (e.g. Treasurer)...' : 'New Project Name...';
    const descInput = document.getElementById('taxNewDescInput');
    descInput.classList.toggle('hidden', isEleco);
    descInput.value = '';
    document.getElementById('taxNewNameInput').value = '';

    const modal = document.getElementById('taxonomyCrudModal');
    modal.classList.remove('hidden');
    setTimeout(() => document.getElementById('taxonomyCrudContent').classList.remove('scale-95', 'opacity-0'), 10);
    await refreshTaxonomyCrudList();
};

window.closeTaxonomyCrudModal = function () {
    document.getElementById('taxonomyCrudContent').classList.add('scale-95', 'opacity-0');
    setTimeout(() => document.getElementById('taxonomyCrudModal').classList.add('hidden'), 250);
};

async function refreshTaxonomyCrudList() {
    const listEl = document.getElementById('taxCrudList');
    listEl.innerHTML = '<p class="text-xs text-slate-400 text-center py-6"><i class="fa-solid fa-spinner fa-spin mr-1"></i> Loading...</p>';
    const endpoint = activeTaxType === 'ELECO' ? '/web-admin/eleco/ranks' : '/web-admin/donations/categories';

    try {
        const items = await ApiGateway.get(endpoint);
        if (!items || items.length === 0) {
            listEl.innerHTML = '<p class="text-xs text-slate-400 text-center py-6">No active entries found.</p>';
            return;
        }
        listEl.innerHTML = items.map(item => {
            const label = activeTaxType === 'ELECO' ? item.title : item.name;
            const sub = item.description ? `<p class="text-[10px] text-slate-400 mt-0.5">${DOMPurify.sanitize(item.description)}</p>` : '';
            const safeLabelAttr = encodeURIComponent(label);
            const safeDescAttr = encodeURIComponent(item.description || '');
            return `
            <div class="flex justify-between items-center p-3.5 bg-white border border-slate-200 rounded-xl shadow-sm">
                <div>
                    <p class="text-xs font-black text-slate-800 uppercase">${DOMPurify.sanitize(label)}</p>
                    ${sub}
                </div>
                <div class="flex gap-2">
                    <button onclick="editTaxonomyItem('${DOMPurify.sanitize(item.id)}', '${safeLabelAttr}', '${safeDescAttr}')" class="bg-blue-50 text-blue-600 hover:bg-blue-100 px-3 py-1.5 rounded-lg text-[10px] font-black uppercase"><i class="fa-solid fa-pen"></i></button>
                    <button onclick="deleteTaxonomyItem('${DOMPurify.sanitize(item.id)}', '${safeLabelAttr}')" class="bg-red-50 text-red-600 hover:bg-red-100 px-3 py-1.5 rounded-lg text-[10px] font-black uppercase"><i class="fa-solid fa-trash"></i></button>
                </div>
            </div>`;
        }).join('');
    } catch (e) {
        listEl.innerHTML = '<p class="text-xs text-red-500 text-center py-6">Failed to load items.</p>';
    }
}

window.submitCreateTaxonomyItem = async function (e) {
    e.preventDefault();
    const val = document.getElementById('taxNewNameInput').value.trim();
    const desc = document.getElementById('taxNewDescInput').value.trim();
    if (!val) return;

    const adminPassword = await promptZeroTrust('Create Taxonomy Entry', `Add <b>"${DOMPurify.sanitize(val)}"</b>?`, '#005A36');
    if (!adminPassword) return;

    try {
        if (activeTaxType === 'ELECO') {
            await ApiGateway.post('/web-admin/eleco/ranks', { title: val, displayOrder: 0, adminPassword });
            await populateExecRoleDropdown();
        } else {
            await ApiGateway.post('/web-admin/donations/categories', { name: val, description: desc, adminPassword });
        }
        document.getElementById('taxNewNameInput').value = '';
        document.getElementById('taxNewDescInput').value = '';
        await refreshTaxonomyCrudList();
        Swal.fire('Created', 'Entry added to PostgreSQL Vault.', 'success');
    } catch (err) {
        Swal.fire('Error', err.message, 'error');
    }
};

window.editTaxonomyItem = async function (id, encodedLabel, encodedDesc) {
    const currentLabel = decodeURIComponent(encodedLabel);
    const currentDesc = decodeURIComponent(encodedDesc);
    const isEleco = activeTaxType === 'ELECO';

    const { value: formVals } = await Swal.fire({
        title: isEleco ? 'Rename ELECO Rank' : 'Update Donation Category',
        html: `
            <input id="swalTaxName" class="w-full p-3 border border-slate-300 rounded-xl text-xs font-bold mb-3" value="${DOMPurify.sanitize(currentLabel)}">
            ${!isEleco ? `<input id="swalTaxDesc" class="w-full p-3 border border-slate-300 rounded-xl text-xs mb-3" placeholder="Description" value="${DOMPurify.sanitize(currentDesc)}">` : ''}
            <input id="swalTaxPass" type="password" class="w-full p-3 border border-slate-300 rounded-xl text-xs" placeholder="Enter Admin Password">
        `,
        showCancelButton: true,
        confirmButtonColor: '#0B1120',
        preConfirm: () => {
            const name = document.getElementById('swalTaxName').value.trim();
            const pass = document.getElementById('swalTaxPass').value;
            const desc = !isEleco ? document.getElementById('swalTaxDesc').value.trim() : '';
            if (!name || !pass) { Swal.showValidationMessage('Name and Admin Password are required.'); return false; }
            return { name, desc, pass };
        }
    });
    if (!formVals) return;

    try {
        if (isEleco) {
            await ApiGateway.put(`/web-admin/eleco/ranks/${encodeURIComponent(id)}`, { title: formVals.name, displayOrder: 0, adminPassword: formVals.pass });
            await populateExecRoleDropdown();
        } else {
            await ApiGateway.put(`/web-admin/donations/categories/${encodeURIComponent(id)}`, { name: formVals.name, description: formVals.desc, adminPassword: formVals.pass });
        }
        await refreshTaxonomyCrudList();
        Swal.fire('Updated', 'Entry updated in PostgreSQL Vault.', 'success');
    } catch (err) {
        Swal.fire('Error', err.message, 'error');
    }
};

window.deleteTaxonomyItem = async function (id, encodedLabel) {
    const label = decodeURIComponent(encodedLabel);
    const adminPassword = await promptZeroTrust('Delete Entry', `Deactivate <b>"${DOMPurify.sanitize(label)}"</b>?`, '#ef4444');
    if (!adminPassword) return;

    const endpoint = activeTaxType === 'ELECO'
        ? `/web-admin/eleco/ranks/${encodeURIComponent(id)}/delete`
        : `/web-admin/donations/categories/${encodeURIComponent(id)}/delete`;

    try {
        await ApiGateway.post(endpoint, { adminPassword });
        if (activeTaxType === 'ELECO') await populateExecRoleDropdown();
        await refreshTaxonomyCrudList();
        Swal.fire('Removed', 'Entry deactivated cleanly.', 'success');
    } catch (err) {
        Swal.fire('Error', err.message, 'error');
    }
};

// =========================================================================
// 13. NETWORK HUB MODERATION
// =========================================================================
async function renderAdminNetworkHub() {
    const container = document.getElementById('adminNetworkThreadsContainer');
    if (!container) return;
    try {
        const threads = await ApiGateway.get('/network/threads');
        globalNetworkThreads = threads || [];
        const statTraffic = document.getElementById('statWebTraffic');
        if (statTraffic) statTraffic.innerText = globalNetworkThreads.length.toLocaleString();
        window.filterAdminNetworkThreads();
    } catch (e) {
        container.innerHTML = '<p class="text-red-500 text-xs font-bold">Failed to load threads.</p>';
    }
}

window.resetNetworkFilters = function () {
    if (document.getElementById('netModSearch')) document.getElementById('netModSearch').value = '';
    if (document.getElementById('netModDateFrom')) document.getElementById('netModDateFrom').value = '';
    if (document.getElementById('netModDateTo')) document.getElementById('netModDateTo').value = '';
    window.filterAdminNetworkThreads();
};

window.filterAdminNetworkThreads = function () {
    const container = document.getElementById('adminNetworkThreadsContainer');
    const countEl = document.getElementById('netModResultCount');
    if (!container) return;

    const q = (document.getElementById('netModSearch')?.value || '').toLowerCase().trim();
    const fromStr = document.getElementById('netModDateFrom')?.value || '';
    const toStr = document.getElementById('netModDateTo')?.value || '';

    const fromDate = fromStr ? new Date(fromStr + 'T00:00:00') : null;
    const toDate = toStr ? new Date(toStr + 'T23:59:59') : null;

    const filtered = globalNetworkThreads.filter(t => {
        const matchesQuery = !q ||
            (t.title && t.title.toLowerCase().includes(q)) ||
            (t.body && t.body.toLowerCase().includes(q)) ||
            (t.author && t.author.toLowerCase().includes(q)) ||
            (t.tag && t.tag.toLowerCase().includes(q));

        const created = t.createdAtIso ? new Date(t.createdAtIso) : null;
        const matchesFrom = !fromDate || (created && created >= fromDate);
        const matchesTo = !toDate || (created && created <= toDate);
        return matchesQuery && matchesFrom && matchesTo;
    });

    if (countEl) countEl.textContent = `${filtered.length} Thread(s)`;
    if (filtered.length === 0) {
        container.innerHTML = `<p class="text-xs text-slate-400 font-bold text-center py-8">No matching network threads found.</p>`;
        return;
    }

    container.innerHTML = filtered.map(t => {
        const fullBody = t.body || '';
        const isLong = fullBody.length > 180;
        const previewBody = isLong ? fullBody.substring(0, 180) + '...' : fullBody;
        const textId = `netThreadBody_${t.id}`;
        const encodedFull = encodeURIComponent(fullBody);

        return `
        <div class="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm flex flex-col sm:flex-row justify-between items-start gap-4">
            <div class="flex-1 min-w-0">
                <span class="bg-blue-50 text-blue-700 px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-widest">${DOMPurify.sanitize(t.tag)}</span>
                <h4 class="text-base font-black text-slate-800 mt-1">${DOMPurify.sanitize(t.title)}</h4>
                <p class="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-1">By ${DOMPurify.sanitize(t.author)} • ${DOMPurify.sanitize(t.time)} • ${Number(t.repliesCount || 0)} Replies</p>
                <p id="${textId}" data-expanded="false" data-full="${encodedFull}" class="text-sm text-slate-600 mt-2 whitespace-pre-line break-words">${DOMPurify.sanitize(previewBody)}</p>
                ${isLong ? `<button onclick="toggleExpandText('${textId}', this, 180)" class="text-[10px] font-black uppercase tracking-widest text-adminAccent hover:underline mt-1">Read More</button>` : ''}
            </div>
            <div class="flex gap-2 shrink-0">
                <button onclick="inspectThreadReplies('${DOMPurify.sanitize(t.id)}', '${DOMPurify.sanitize(t.title.replace(/'/g, "\\'"))}')" class="bg-slate-100 text-slate-700 hover:bg-slate-200 px-3 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-colors border border-slate-200"><i class="fa-solid fa-comments mr-1"></i> Replies</button>
                <button onclick="deleteNetworkThread('${DOMPurify.sanitize(t.id)}')" class="bg-red-50 text-red-600 hover:bg-red-100 px-3 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-colors border border-red-200"><i class="fa-solid fa-trash mr-1"></i> Delete</button>
            </div>
        </div>`;
    }).join('');
};

window.inspectThreadReplies = async function (threadId, threadTitle) {
    try {
        const replies = await ApiGateway.get(`/network/threads/${encodeURIComponent(threadId)}/replies`);
        if (!replies || replies.length === 0) {
            return Swal.fire(threadTitle, 'No replies posted on this thread yet.', 'info');
        }
        const listHtml = replies.map(r => {
            const fullText = r.text || '';
            const isLong = fullText.length > 180;
            const preview = isLong ? fullText.substring(0, 180) + '...' : fullText;
            const rId = `netReplyBody_${r.id}`;
            return `
            <div class="p-3 border border-slate-200 rounded-xl bg-slate-50 text-left mb-2 flex justify-between items-start gap-3">
                <div class="flex-1 min-w-0">
                    <p class="text-[10px] font-black text-adminNavy uppercase">${DOMPurify.sanitize(r.author)} <span class="text-slate-400 font-normal">(${DOMPurify.sanitize(r.time)})</span></p>
                    <p id="${rId}" data-expanded="false" data-full="${encodeURIComponent(fullText)}" class="text-xs text-slate-700 mt-1 whitespace-pre-line break-words">${DOMPurify.sanitize(preview)}</p>
                    ${isLong ? `<button onclick="toggleExpandText('${rId}', this, 180)" class="text-[9px] font-black uppercase text-adminAccent hover:underline mt-1">Read More</button>` : ''}
                </div>
                <button onclick="deleteNetworkReply('${DOMPurify.sanitize(r.id)}')" class="text-red-500 hover:text-red-700 text-xs shrink-0" title="Delete Reply"><i class="fa-solid fa-trash"></i></button>
            </div>`;
        }).join('');

        Swal.fire({
            title: `Replies: ${DOMPurify.sanitize(threadTitle)}`,
            html: `<div class="max-h-80 overflow-y-auto">${listHtml}</div>`,
            width: '650px',
            confirmButtonColor: '#0B1120'
        });
    } catch (e) {
        Swal.fire('Error', e.message || 'Could not load replies.', 'error');
    }
};

window.deleteNetworkReply = async function (replyId) {
    const { value: formVals } = await Swal.fire({
        title: 'Moderate & Delete Reply',
        html: `
            <p class="text-xs text-slate-500 mb-3">A formal notice with this reason will be emailed to the author.</p>
            <textarea id="swalModReason" class="w-full p-3 border border-slate-300 rounded-xl text-xs mb-3 resize-none" rows="3" placeholder="Mandatory moderation reason..."></textarea>
            <input id="swalModPass" type="password" class="w-full p-3 border border-slate-300 rounded-xl text-xs" placeholder="Enter Admin Password">
        `,
        showCancelButton: true,
        confirmButtonColor: '#ef4444',
        confirmButtonText: 'Delete & Notify Author',
        preConfirm: () => {
            const reason = document.getElementById('swalModReason').value.trim();
            const adminPassword = document.getElementById('swalModPass').value;
            if (!reason || !adminPassword) { Swal.showValidationMessage('Reason and Admin Password are required.'); return false; }
            return { reason, adminPassword };
        }
    });
    if (!formVals) return;

    try {
        await ApiGateway.post(`/web-admin/network/replies/${encodeURIComponent(replyId)}/delete`, formVals);
        await renderAdminNetworkHub();
        Swal.fire('Deleted', 'Reply removed and moderation notice emailed to author.', 'success');
    } catch (e) { Swal.fire('Authorization Failed', e.message, 'error'); }
};

window.deleteNetworkThread = async function (id) {
    const { value: formVals } = await Swal.fire({
        title: 'Moderate & Delete Thread',
        html: `
            <p class="text-xs text-slate-500 mb-3">This removes the thread, all replies, and emails your reason to the author.</p>
            <textarea id="swalThreadDelReason" class="w-full p-3 border border-slate-300 rounded-xl text-xs mb-3 resize-none" rows="3" placeholder="Mandatory reason for thread deletion..."></textarea>
            <input id="swalThreadDelPass" type="password" class="w-full p-3 border border-slate-300 rounded-xl text-xs" placeholder="Enter Admin Password">
        `,
        showCancelButton: true,
        confirmButtonColor: '#ef4444',
        confirmButtonText: 'Delete & Notify Author',
        preConfirm: () => {
            const reason = document.getElementById('swalThreadDelReason').value.trim();
            const adminPassword = document.getElementById('swalThreadDelPass').value;
            if (!reason || !adminPassword) { Swal.showValidationMessage('Reason and Admin Password are required.'); return false; }
            return { reason, adminPassword };
        }
    });
    if (!formVals) return;

    try {
        await ApiGateway.post(`/web-admin/network/threads/${encodeURIComponent(id)}/delete`, formVals);
        await renderAdminNetworkHub();
        Swal.fire('Deleted', 'Thread purged and moderation notice emailed to author.', 'success');
    } catch (e) { Swal.fire('Authorization Failed', e.message, 'error'); }
};

// =========================================================================
// 14. TAB NAVIGATION CONTROLLER & SIDEBAR TOGGLE
// =========================================================================
function initTabNavigation() {
    document.querySelectorAll('.nav-btn').forEach(btn => {
        btn.addEventListener('click', function (e) {
            e.preventDefault();
            document.querySelectorAll('aside nav button').forEach(b => {
                b.classList.remove('bg-adminAccent/10', 'text-adminAccent');
                b.classList.add('hover:bg-slate-800', 'hover:text-white', 'text-slate-300');
            });
            this.classList.remove('hover:bg-slate-800', 'hover:text-white', 'text-slate-300');
            this.classList.add('bg-adminAccent/10', 'text-adminAccent');
            const targetId = this.getAttribute('data-target');
            document.querySelectorAll('.tab-content').forEach(tab => tab.classList.remove('active'));
            const targetContent = document.getElementById(targetId);
            if (targetContent) targetContent.classList.add('active');
            const sidebar = document.getElementById('adminSidebar');
            const overlay = document.getElementById('adminSidebarOverlay');
            if (sidebar && !sidebar.classList.contains('hidden') && window.innerWidth < 1024) {
                sidebar.classList.add('-translate-x-full');
                overlay.classList.add('hidden');
                setTimeout(() => { sidebar.classList.add('hidden'); sidebar.classList.remove('flex'); }, 300);
            }
        });
    });
}

document.getElementById('openAdminSidebar')?.addEventListener('click', () => {
    const sidebar = document.getElementById('adminSidebar');
    const overlay = document.getElementById('adminSidebarOverlay');
    sidebar.classList.remove('hidden', '-translate-x-full');
    sidebar.classList.add('flex');
    overlay.classList.remove('hidden');
});

const closeMobileSidebar = () => {
    const sidebar = document.getElementById('adminSidebar');
    const overlay = document.getElementById('adminSidebarOverlay');
    sidebar.classList.add('-translate-x-full');
    overlay.classList.add('hidden');
    setTimeout(() => { sidebar.classList.add('hidden'); sidebar.classList.remove('flex'); }, 300);
};

document.getElementById('closeAdminSidebar')?.addEventListener('click', closeMobileSidebar);
document.getElementById('adminSidebarOverlay')?.addEventListener('click', closeMobileSidebar);