// =====================================================================
// G.U.S.S. RINGIM — ICT & CENTRAL REGISTRY CONTROLLER
// ENTERPRISE HARDENED SPECIFICATION
// =====================================================================
import { ApiGateway } from './api_gateway.js';
import { ENV, getAuthHeaders } from './core_config.js';
import { SessionManager } from './session_manager.js';
import { CoreUI } from './core_ui.js';

//  ENTERPRISE HELPER: Secure Blob Fetcher for PDF Generation
async function secureBlobFetch(endpoint, payload = null, method = 'POST') {
    const token = sessionStorage.getItem('guss_access_token');
    const options = {
        method: method,
        headers: {
            'Accept': 'application/pdf',
            'Authorization': `Bearer ${token}`
        }
    };
    if (method !== 'GET' && payload) {
        options.headers['Content-Type'] = 'application/json';
        options.body = JSON.stringify(payload);
    }
    const response = await fetch(`${ENV.API_BASE_URL}/api${endpoint}`, options);
    if (response.status === 401 || response.status === 403) {
        ApiGateway.triggerSecurityLockout("Session expired during document generation.");
        return null;
    }
    if (!response.ok) throw new Error(`HTTP Error ${response.status}`);
    return response.blob();
}

window.resolveMediaUrl = function (url) {
    if (!url) return '';
    if (url.startsWith('http') || url.startsWith('data:')) return url;
    let cleanUrl = url.replace(/^\/+/, '');
    if (!cleanUrl.startsWith('uploads/')) cleanUrl = 'uploads/' + cleanUrl;
    return `${ENV.API_BASE_URL}/${cleanUrl}`;
};

window.base64ToBlob = function (base64Data, contentType = 'image/jpeg') {
    if (!base64Data || base64Data.startsWith('http') || base64Data.startsWith('/uploads')) return null;
    const sliceSize = 512;
    const parts = base64Data.split(',');
    if (parts.length < 2) return null;
    const byteCharacters = atob(parts[1]);
    const byteArrays = [];
    for (let offset = 0; offset < byteCharacters.length; offset += sliceSize) {
        const slice = byteCharacters.slice(offset, offset + sliceSize);
        const byteNumbers = new Array(slice.length);
        for (let i = 0; i < slice.length; i++) {
            byteNumbers[i] = slice.charCodeAt(i);
        }
        byteArrays.push(new Uint8Array(byteNumbers));
    }
    return new Blob(byteArrays, { type: contentType });
};

let activePrintEntity = null;
let activeIdFilter = 'STUDENT';
let activeArchiveType = 'STUDENT';

let currentIctAdminStaffId = sessionStorage.getItem('guss_staff_id');
let currentIctAdminName = "ICT Administrator";

let currentStaffPage = 0;
let staffSearchTimeout;
let printSpooler = new Set();
let cachedUnifiedEntities = null;
let tempAdminSigBase64 = null;

let RAM_VAULT = {};
let RAM_STUDENT_REGISTRY = [];
let RAM_STAFF_REGISTRY = [];

window.parseVault = function (key) {
    const cloudConfigs = Object.keys(RAM_VAULT).length > 0 ? RAM_VAULT : (JSON.parse(sessionStorage.getItem('cloud_configs')) || {});
    let actualKey = key;
    if (key === 'cloud_statutory_board') actualKey = 'guss_statutory_board';

    let data = cloudConfigs[actualKey] || RAM_VAULT[actualKey] || sessionStorage.getItem(actualKey);
    if (!data) return null;
    if (typeof data === 'object') return data;
    try {
        let parsed = JSON.parse(data);
        if (typeof parsed === 'string') parsed = JSON.parse(parsed);
        return parsed;
    } catch (e) { return null; }
};

window.getStudentRegistrySafe = function () {
    if (Array.isArray(RAM_STUDENT_REGISTRY) && RAM_STUDENT_REGISTRY.length > 0) return RAM_STUDENT_REGISTRY;
    try {
        const stored = JSON.parse(sessionStorage.getItem('cloud_student_registry'));
        if (Array.isArray(stored)) return stored;
    } catch (e) { }
    return [];
};

window.getStaffRegistrySafe = function () {
    if (Array.isArray(RAM_STAFF_REGISTRY) && RAM_STAFF_REGISTRY.length > 0) return RAM_STAFF_REGISTRY;
    try {
        const stored = JSON.parse(sessionStorage.getItem('cloud_staff_registry'));
        if (Array.isArray(stored)) return stored;
    } catch (e) { }
    return [];
};

window.normalizeStaffType = function (type) {
    if (!type) return "Unknown";
    const t = type.toUpperCase().trim();
    if (t === 'ACADEMIC' || (t.includes('ACADEMIC') && !t.includes('NON'))) return 'Academic';
    if (t === 'NON_ACADEMIC' || t === 'NON-ACADEMIC' || t.includes('NON')) return 'Non-Academic';
    if (t === 'TEACHING_PRACTICE' || t === 'TP') return 'TP';
    if (t === 'NYSC') return 'NYSC';
    return type;
};

// ================= BOOTSTRAP SEQUENCE =================
window.onload = async function () {
    // 1. Boot Global UI Components, Role Switcher & Network Monitor
    CoreUI.init();

    // 2. Boot Time Machine Epoch Context
    await SessionManager.initHeaderDropdown();

    // 3. Hydrate Terminal Data
    await window.syncPostgresToLocal();
    window.resolveIctAdminIdentity();

    if (typeof window.syncAcademicSession === 'function') window.syncAcademicSession();
    window.switchTab('staff');
    window.fetchStaffRegistry(0);
    window.applyArchiveReadonlyState();
};

//  TIME TRAVEL LISTENER
window.addEventListener('gussTimeMachineChanged', () => {
    window.applyArchiveReadonlyState();
});

// =====================================================================
// TOTAL ARCHIVE IMMUTABILITY ENGINE
// =====================================================================
window.applyArchiveReadonlyState = function () {
    const isHistorical = SessionManager.isHistoricalArchiveMode();
    const mainContent = document.querySelector('main');
    if (!mainContent) return;

    const oldBanner = document.getElementById('ictHistoricalBanner');
    if (oldBanner) oldBanner.remove();

    if (isHistorical) {
        const banner = document.createElement('div');
        banner.id = 'ictHistoricalBanner';
        banner.className = 'bg-red-50 border-l-4 border-red-500 p-4 mb-2 rounded-r-xl shadow-sm w-full animate-fade-in';
        banner.innerHTML = `
            <h3 class="text-red-800 font-black uppercase tracking-widest text-xs"><i class="fa-solid fa-lock mr-2"></i> HISTORICAL ARCHIVE MODE</h3>
            <p class="text-red-700 text-[10px] mt-1 font-bold">You are viewing a past academic term. Staff onboarding, account lockouts, password resets, statutory handovers, and database diagnostics are strictly disabled. Historical inspection and document printing remain active.</p>
        `;
        mainContent.prepend(banner);

        // Disable input forms while leaving search and archive controls active
        mainContent.querySelectorAll('input, select, textarea').forEach(el => {
            if (el.id.includes('Search') || el.closest('#tabContentArchive')) {
                el.disabled = false;
                el.classList.remove('opacity-50', 'cursor-not-allowed');
                return;
            }
            el.setAttribute('data-archived-disabled', 'true');
            el.disabled = true;
            el.classList.add('opacity-50', 'cursor-not-allowed');
        });

        // Hide mutating buttons, preserving navigation, search, print, view, and close buttons
        mainContent.querySelectorAll('button').forEach(btn => {
            const id = btn.id || '';
            const onclick = btn.getAttribute('onclick') || '';

            if (id.startsWith('tabBtn') ||
                id.startsWith('archiveFilter') ||
                id.startsWith('idFilter') ||
                id === 'btnBulkSelect' ||
                id === 'btnCancelBatch' ||
                onclick.includes('closeBatchPreview') ||
                onclick.includes('close') || onclick.includes('Close') ||
                onclick.includes('switchTab') ||
                onclick.includes('switchArchiveFilter') ||
                onclick.includes('loadIdRoster') ||
                onclick.includes('print') || onclick.includes('Print') ||
                onclick.includes('dossier') || onclick.includes('Dossier') ||
                onclick.includes('changePage') ||
                btn.closest('#tabContentArchive')) {
                btn.classList.remove('hidden');
                btn.disabled = false;
                return;
            }

            btn.setAttribute('data-archived-hidden', 'true');
            btn.classList.add('hidden');
        });

        const vaultKeyBtn = document.getElementById('btnGenerateVaultKey');
        if (vaultKeyBtn) {
            vaultKeyBtn.disabled = true;
            vaultKeyBtn.className = "w-full bg-slate-200 text-slate-400 px-4 py-3.5 rounded-xl text-[10px] font-black uppercase tracking-widest cursor-not-allowed";
            vaultKeyBtn.innerHTML = `<i class="fa-solid fa-lock mr-2"></i> Vault Key Generation Locked in Archive Mode`;
        }
    } else {
        const disabledElements = mainContent.querySelectorAll('[data-archived-disabled="true"]');
        disabledElements.forEach(el => {
            el.disabled = false;
            el.classList.remove('opacity-50', 'cursor-not-allowed');
            el.removeAttribute('data-archived-disabled');
        });

        const hiddenButtons = mainContent.querySelectorAll('[data-archived-hidden="true"]');
        hiddenButtons.forEach(btn => {
            btn.classList.remove('hidden');
            btn.removeAttribute('data-archived-hidden');
        });

        const vaultKeyBtn = document.getElementById('btnGenerateVaultKey');
        if (vaultKeyBtn) {
            vaultKeyBtn.disabled = false;
            vaultKeyBtn.className = "w-full bg-red-600 hover:bg-red-700 text-white px-4 py-3.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all shadow-md shadow-red-500/20 flex items-center justify-center gap-2";
            vaultKeyBtn.innerHTML = `<i class="fa-solid fa-key"></i> Generate Master Vault Key`;
        }
    }
};

window.isHistoricalArchiveMode = function () {
    return SessionManager.isHistoricalArchiveMode();
};

window.resolveIctAdminIdentity = function () {
    const staffList = window.getStaffRegistrySafe();
    const me = staffList.find(s => s.id === currentIctAdminStaffId) || window.ROOT_ADMIN_PROFILE || { name: "ICT Administrator" };
    if (me) currentIctAdminName = me.fullName || me.name || "ICT Administrator";
    const nameDisplay = document.getElementById('activeAdminNameDisplay');
    if (nameDisplay) nameDisplay.textContent = DOMPurify.sanitize(currentIctAdminName);
};

window.switchTab = function (tabId) {
    ['staff', 'credentials', 'idcard', 'archive', 'system', 'postings'].forEach(id => {
        const btn = document.getElementById(`tabBtn${id.charAt(0).toUpperCase() + id.slice(1)}`);
        const content = document.getElementById(`tabContent${id.charAt(0).toUpperCase() + id.slice(1)}`);
        if (!btn || !content) return;

        if (id === tabId) {
            btn.className = "flex-1 whitespace-nowrap px-6 py-3 rounded-xl text-xs font-black uppercase tracking-widest transition-all bg-white shadow text-gussNavy border border-slate-200";
            content.classList.remove('hidden');

            if (id === 'staff' || id === 'credentials' || id === 'idcard' || id === 'postings') {
                content.classList.add('grid');
                content.classList.remove('flex', 'flex-col');
            } else {
                content.classList.add('flex', 'flex-col');
                content.classList.remove('grid');
            }
        } else {
            btn.className = "flex-1 whitespace-nowrap px-6 py-3 rounded-xl text-xs font-black uppercase tracking-widest transition-all text-slate-500 hover:text-gussNavy";
            content.classList.add('hidden');
            content.classList.remove('grid', 'flex', 'flex-col');
        }
    });

    if (tabId === 'staff') window.fetchStaffRegistry(currentStaffPage);
    if (tabId === 'credentials') window.renderCredentialsTable();
    if (tabId === 'idcard') window.loadIdRoster(activeIdFilter);
    if (tabId === 'archive') window.executeArchiveSearch();
    if (tabId === 'postings') window.initializeStatutoryPostings();

    window.applyArchiveReadonlyState();
};

window.fetchStaffRegistry = async function (page = 0, searchQuery = "") {
    try {
        let url = `/ict/staff/registry?page=${page}&size=50`;
        if (searchQuery) url += `&search=${encodeURIComponent(searchQuery)}`;

        const data = await ApiGateway.get(url);
        if (data) {
            currentStaffPage = data.currentPage;
            window.renderStaffTable(data.content);
            window.buildPaginationUI(data.totalElements, data.totalPages, currentStaffPage, 'staff');
        }
    } catch (error) { console.error("Registry fetch failed", error); }
};

window.executeStaffSearch = function () {
    const query = document.getElementById('staffSearchInput').value.trim();
    clearTimeout(staffSearchTimeout);
    staffSearchTimeout = setTimeout(() => window.fetchStaffRegistry(0, query), 500);
};

window.changePage = function (tableContext, direction) {
    if (tableContext === 'staff') window.fetchStaffRegistry(currentStaffPage + direction);
};

window.buildPaginationUI = function (totalItems, totalPages, currentPageIndex, tableContext) {
    const container = document.getElementById(`${tableContext}PaginationControls`);
    if (!container) return;

    if (totalPages <= 1) { container.innerHTML = ''; return; }

    const currentPage = currentPageIndex + 1;
    const startItem = (currentPageIndex * 50) + 1;
    const endItem = Math.min(currentPage * 50, totalItems);

    container.innerHTML = `
        <div class="flex flex-col sm:flex-row justify-between items-center gap-4 py-4 px-6 border-t border-slate-200 bg-slate-50 rounded-b-3xl">
            <span class="text-xs font-bold text-slate-500 uppercase tracking-widest">Showing ${startItem} to ${endItem} of ${totalItems}</span>
            <div class="flex gap-2">
                <button onclick="window.changePage('${tableContext}', -1)" ${currentPage === 1 ? 'disabled' : ''} class="px-4 py-2 text-xs font-black uppercase tracking-widest rounded-lg border border-slate-300 ${currentPage === 1 ? 'bg-slate-100 text-slate-400 cursor-not-allowed' : 'bg-white text-gussNavy hover:bg-slate-100 transition-colors shadow-sm'}"><i class="fa-solid fa-chevron-left mr-1"></i> Prev</button>
                <div class="flex items-center justify-center px-4 font-bold text-slate-700 text-xs bg-white border border-slate-200 rounded-lg shadow-inner">Page ${currentPage} / ${totalPages}</div>
                <button onclick="window.changePage('${tableContext}', 1)" ${currentPage === totalPages ? 'disabled' : ''} class="px-4 py-2 text-xs font-black uppercase tracking-widest rounded-lg border border-slate-300 ${currentPage === totalPages ? 'bg-slate-100 text-slate-400 cursor-not-allowed' : 'bg-white text-gussNavy hover:bg-slate-100 transition-colors shadow-sm'}">Next <i class="fa-solid fa-chevron-right ml-1"></i></button>
            </div>
        </div>
    `;
};

window.syncPostgresToLocal = async function (skipStudents = false) {
    const toxicKeys = ['guss_gallery_db', 'rinoba_users_db', 'cloud_staff_registry', 'guss_staff_registry', 'cloud_student_registry', 'guss_teacher_allocations', 'guss_form_masters', 'guss_house_masters', 'guss_communications', 'guss_statutory_board'];
    toxicKeys.forEach(toxicKey => {
        localStorage.removeItem(toxicKey);
        sessionStorage.removeItem(toxicKey);
    });

    try {
        const [configs, db, boardData, delData, stdDb] = await Promise.all([
            ApiGateway.get('/config/all').catch(() => null),
            ApiGateway.get('/ict/staff/all-lightweight').catch(() => null),
            ApiGateway.get('/ict/statutory/board').catch(() => null),
            ApiGateway.get('/director/delegations').catch(() => null),
            skipStudents ? Promise.resolve(null) : ApiGateway.get('/bridge/all-lightweight').catch(() => null)
        ]);

        if (configs) {
            RAM_VAULT = configs;
            const lightConfigs = {};
            Object.keys(configs).forEach(k => {
                if (!k.startsWith('guss_grades_') && !k.startsWith('guss_eval_')) lightConfigs[k] = configs[k];
            });
            sessionStorage.setItem('cloud_configs', JSON.stringify(lightConfigs));
        }

        if (boardData) {
            RAM_VAULT['guss_statutory_board'] = JSON.stringify(boardData);
            sessionStorage.setItem('cloud_statutory_board', JSON.stringify(boardData));
        }

        if (delData) {
            RAM_VAULT['cloud_delegations'] = JSON.stringify(delData);
            sessionStorage.setItem('cloud_delegations', JSON.stringify(delData));
        }

        if (db && Array.isArray(db)) {
            const mappedRegistry = db.map(staff => ({
                id: staff.staffId ? staff.staffId : staff.trackingRef, trackingRef: staff.trackingRef, name: staff.fullName || staff.name,
                staffType: window.normalizeStaffType(staff.staffType), qual: staff.qualification || staff.qual,
                phone: staff.phone, personalEmail: staff.personalEmail, email: staff.officialEmail || staff.email,
                address: staff.residentialAddress || staff.address, bloodGroup: staff.bloodGroup,
                nokName: staff.nokName, nokPhone: staff.nokPhone, endDate: staff.endDate,
                photoUrl: staff.photoUrl, signatureUrl: staff.signatureUrl,
                status: staff.status || staff.approvalStatus, approvalStatus: staff.approvalStatus || staff.status,
                isLocked: staff.isLocked === true || staff.isLocked === 'true',
                hasCustomPassword: staff.hasCustomPassword === true || staff.hasCustomPassword === 'true',
                tempPassword: staff.tempPassword || 'GUSSR-STAFF-TEMP', staffId: staff.staffId
            }));

            window.ROOT_ADMIN_PROFILE = mappedRegistry.find(s => s.id === 'GUSS/STF/001') || { name: "ICT Administrator" };
            const ghostedDb = mappedRegistry.filter(staff => staff.id !== 'GUSS/STF/001');
            RAM_STAFF_REGISTRY = ghostedDb;
            sessionStorage.setItem('cloud_staff_registry', JSON.stringify(ghostedDb));
        }

        if (stdDb && Array.isArray(stdDb)) {
            stdDb.forEach(s => { if (s.uploadSignature) s.signatureUrl = s.uploadSignature; });
            RAM_STUDENT_REGISTRY = stdDb;
            sessionStorage.setItem('cloud_student_registry', JSON.stringify(stdDb));
        }

        if (typeof cachedUnifiedEntities !== 'undefined') cachedUnifiedEntities = null;
    } catch (error) { console.error("Critical Cloud Sync Error:", error); }
};

window.processMediaUpload = function (inputNode, previewId) {
    if (inputNode.files && inputNode.files[0]) {
        const file = inputNode.files[0];
        const reader = new FileReader();
        reader.onload = function (e) {
            const img = new Image();
            img.onload = function () {
                const canvas = document.createElement('canvas');
                const MAX_WIDTH = 250; const MAX_HEIGHT = 250;
                let width = img.width; let height = img.height;
                if (width > height) { if (width > MAX_WIDTH) { height *= MAX_WIDTH / width; width = MAX_WIDTH; } }
                else { if (height > MAX_HEIGHT) { width *= MAX_HEIGHT / height; height = MAX_HEIGHT; } }
                canvas.width = width; canvas.height = height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);

                const b64 = canvas.toDataURL('image/jpeg', 0.85);
                const targetPreview = document.getElementById(previewId);
                if (targetPreview) {
                    targetPreview.src = b64;
                    targetPreview.classList.remove('hidden');
                }
            };
            img.src = e.target.result;
        };
        reader.readAsDataURL(file);
    }
};

window.toggleTransientDate = function () {
    const type = document.getElementById('regStaffType').value;
    const dateContainer = document.getElementById('transientDateContainer');
    if (type === 'NYSC' || type === 'TP') {
        dateContainer.classList.remove('hidden');
        document.getElementById('regStaffEndDate').required = true;
    } else {
        dateContainer.classList.add('hidden');
        document.getElementById('regStaffEndDate').required = false;
        document.getElementById('regStaffEndDate').value = "";
    }
};

const staffForm = document.getElementById('staffRegistrationForm');
if (staffForm) {
    staffForm.addEventListener('submit', async function (e) {
        e.preventDefault();

        if (SessionManager.isHistoricalArchiveMode()) {
            return Swal.fire('Archive Lockout', 'Onboarding staff is strictly prohibited in historical view.', 'error');
        }

        const submitBtn = this.querySelector('button[type="submit"]');
        const originalBtnText = submitBtn.innerHTML;
        submitBtn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin mr-1"></i> Transmitting to Vault...';
        submitBtn.disabled = true;

        const payloadData = {
            fullName: document.getElementById('regStaffName').value,
            staffType: document.getElementById('regStaffType').value,
            qualification: document.getElementById('regStaffQual').value,
            phone: document.getElementById('regStaffPhone').value,
            personalEmail: document.getElementById('regStaffPersonalEmail').value,
            residentialAddress: document.getElementById('regStaffAddress').value,
            bloodGroup: document.getElementById('regStaffBlood').value,
            nokName: document.getElementById('regStaffNokName').value,
            nokPhone: document.getElementById('regStaffNokPhone').value,
            endDate: document.getElementById('regStaffEndDate').value
        };

        const formData = new FormData();
        formData.append("data", JSON.stringify(payloadData));

        const finalPhoto = document.getElementById('regStaffPhotoPreview').src;
        if (finalPhoto && finalPhoto.startsWith("data:image")) {
            formData.append("uploadPhoto", window.base64ToBlob(finalPhoto), "photo.jpg");
        }

        const sigPreview = document.getElementById('regStaffSigPreview');
        if (sigPreview && !sigPreview.classList.contains('hidden') && sigPreview.src.startsWith("data:image")) {
            formData.append("uploadSignature", window.base64ToBlob(sigPreview.src), "signature.jpg");
        }

        try {
            const data = await ApiGateway.postFormData('/ict/staff/onboard', formData);

            if (data) {
                Swal.fire('Onboarding Successful', `Faculty submitted to PostgreSQL Registry.\nStatus: ${data.status}\nTracking Reference: ${data.trackingRef}`, 'success');
                this.reset();
                window.toggleTransientDate();
                document.getElementById('regStaffPhotoPreview').src = "https://ui-avatars.com/api/?name=New+Staff&background=f1f5f9&color=94a3b8";
                document.getElementById('regStaffSigPreview').src = "";
                document.getElementById('regStaffSigPreview').classList.add('hidden');

                await window.syncPostgresToLocal(true);
                window.fetchStaffRegistry(currentStaffPage);
            }
        } catch (error) {
            Swal.fire('Onboarding Failed', error.message || "Connection to the Java Server Node failed.", 'error');
        } finally {
            submitBtn.innerHTML = originalBtnText;
            submitBtn.disabled = false;
        }
    });
}

window.renderStaffTable = async function (staffList = []) {
    const tbody = document.getElementById('staffRegistryBody');
    if (!tbody) return;

    staffList = staffList.filter(s => !(s.fullName || s.name || '').toLowerCase().includes('root admin'));
    tbody.innerHTML = '';

    if (staffList.length === 0) {
        tbody.innerHTML = `<tr><td colspan="4" class="py-12 text-center text-slate-400 font-bold text-xs"><i class="fa-solid fa-users-slash text-3xl mb-3 opacity-30 block"></i> No staff records exist.</td></tr>`;
        return;
    }

    const isHistorical = SessionManager.isHistoricalArchiveMode();
    let board = window.parseVault('guss_statutory_board') || {};
    const ddAdmin = board['ROLE_DEPUTY_DIR_ADMIN'];
    const ddAcademics = board['ROLE_DEPUTY_DIR_ACADEMICS'];
    const systemHasActiveDD = (ddAdmin && ddAdmin.staffId) || (ddAcademics && ddAcademics.staffId);

    let htmlBuffer = '';
    staffList.forEach(staff => {
        let badge = "";
        let isExpired = false;

        const name = DOMPurify.sanitize(staff.fullName || staff.name);
        const rawId = staff.staffId || staff.trackingRef || staff.id || '';
        const id = DOMPurify.sanitize(rawId);

        if ((staff.staffType === 'NYSC' || staff.staffType === 'TP') && staff.endDate) {
            const end = new Date(staff.endDate);
            const now = new Date(); now.setHours(0, 0, 0, 0);
            if (end < now) isExpired = true;
        }

        const currentStatus = String(staff.approvalStatus || staff.status || '').toUpperCase().trim();

        if (currentStatus === 'APPROVED' || currentStatus === 'ACTIVATED') {
            if (isExpired) badge = `<span class="bg-red-100 text-red-800 px-2 py-1 rounded text-[9px] font-black uppercase tracking-widest border border-red-200"><i class="fa-solid fa-ban"></i> Expired</span>`;
            else if (staff.staffType === 'NYSC' || staff.staffType === 'TP') badge = `<span class="bg-blue-100 text-blue-800 px-2 py-1 rounded text-[9px] font-black uppercase tracking-widest border border-blue-200"><i class="fa-solid fa-clock"></i> Active (Transient)</span>`;
            else badge = `<span class="bg-emerald-100 text-emerald-800 px-2 py-1 rounded text-[9px] font-black uppercase tracking-widest border border-emerald-200"><i class="fa-solid fa-check"></i> ${currentStatus}</span>`;
        } else if (currentStatus === 'ON_LEAVE') {
            badge = `<span class="bg-orange-100 text-orange-800 px-2 py-1 rounded text-[9px] font-black uppercase tracking-widest border border-orange-200"><i class="fa-solid fa-plane"></i> On Leave</span>`;
        } else if (currentStatus === 'REJECTED') {
            badge = `<span class="bg-red-100 text-red-800 px-2 py-1 rounded text-[9px] font-black uppercase tracking-widest border border-red-200 mr-1" title="Rejected by Deputy Director"><i class="fa-solid fa-xmark"></i> Rejected</span>`;
            if (!isHistorical) {
                badge += `<button onclick="window.openEditModal('STAFF', '${id}')" class="text-blue-500 hover:bg-blue-50 px-2 py-1 rounded border border-blue-200 transition-colors mr-1" title="Correct Data & Resubmit"><i class="fa-solid fa-pen"></i></button>
                          <button onclick="window.deleteStaffRequest('${staff.trackingRef}')" class="text-red-500 hover:bg-red-50 px-2 py-1 rounded border border-red-200 transition-colors" title="Delete Request Permanently"><i class="fa-solid fa-trash"></i></button>`;
            }
        } else {
            if (!systemHasActiveDD) {
                if (!isHistorical) {
                    badge = `<button onclick="window.forceBootstrapApprove('${staff.trackingRef}')" class="bg-amber-100 text-amber-800 hover:bg-emerald-100 hover:text-emerald-800 px-2 py-1 rounded text-[9px] font-black uppercase tracking-widest border border-amber-200 transition-colors shadow-sm mr-1" title="Genesis Override"><i class="fa-solid fa-unlock-keyhole mr-1"></i> Override</button>`;
                } else {
                    badge = `<span class="bg-slate-100 text-slate-500 px-2 py-1 rounded text-[9px] font-black uppercase tracking-widest border border-slate-300">Pending (Archived)</span>`;
                }
            } else {
                badge = `<span class="bg-amber-100 text-amber-800 px-2 py-1 rounded text-[9px] font-black uppercase tracking-widest border border-amber-200 mr-1"><i class="fa-solid fa-hourglass-half"></i> Pending DD</span>`;
            }
            if (!isHistorical) {
                badge += `<button onclick="window.openEditModal('STAFF', '${id}')" class="text-blue-500 hover:bg-blue-50 px-2 py-1 rounded border border-blue-200 transition-colors mr-1" title="Edit Data"><i class="fa-solid fa-pen"></i></button>`;
                badge += `<button onclick="window.deleteStaffRequest('${staff.trackingRef}')" class="text-red-500 hover:bg-red-50 px-2 py-1 rounded border border-red-200 transition-colors" title="Delete Request Permanently"><i class="fa-solid fa-trash"></i></button>`;
            }
        }

        const displayId = id.startsWith("REQ-") ? `<i class="fa-solid fa-lock text-amber-500 mr-1"></i> ${id}` : id;

        htmlBuffer += `
            <tr class="hover:bg-slate-50 transition-colors">
                <td class="py-3 px-3 flex items-center gap-3">
                    <img src="${window.resolveMediaUrl(DOMPurify.sanitize(staff.photoUrl))}" class="w-8 h-8 rounded-lg object-cover bg-slate-100 border border-slate-200 shrink-0">
                    <div>
                        <div class="font-black text-slate-800 text-xs uppercase cursor-pointer hover:text-blue-600" onclick="window.openDossierModal('STAFF', '${id}')">${name}</div>
                        <div class="text-[9px] font-mono text-slate-500">${displayId}</div>
                    </div>
                </td>
                <td class="py-3 px-3">
                    <div class="font-bold text-slate-700 text-xs">${DOMPurify.sanitize(staff.staffType)}</div>
                    <div class="text-[9px] font-medium text-slate-500">${DOMPurify.sanitize(staff.qualification || staff.qual || 'N/A')}</div>
                </td>
                <td class="py-3 px-3 text-[10px] font-mono">
                    <span class="block text-slate-700">${DOMPurify.sanitize(staff.phone)}</span>
                    <span class="block text-blue-600">${DOMPurify.sanitize(staff.officialEmail || '<i class="fa-solid fa-hourglass text-slate-400"></i> Awaiting Allocation')}</span>
                </td>
                <td class="py-3 px-3 text-right">${badge}</td>
            </tr>
        `;
    });

    tbody.innerHTML = htmlBuffer;
    window.applyArchiveReadonlyState();
};

window.forceBootstrapApprove = async function (trackingRef) {
    if (SessionManager.isHistoricalArchiveMode()) {
        return Swal.fire('Archive Lockout', 'Bootstrap approvals are strictly prohibited in historical view.', 'error');
    }

    const res = await Swal.fire({
        title: 'Genesis Protocol',
        text: "Are you sure you want to force-approve this profile without Deputy Director authorization?",
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#d97706',
        confirmButtonText: 'Yes, Override & Approve'
    });

    if (!res.isConfirmed) return;

    try {
        const data = await ApiGateway.post('/dd/admin/staff/approve', { targetStaffId: trackingRef });

        if (data) {
            await window.syncPostgresToLocal(true);
            window.fetchStaffRegistry(currentStaffPage);
            window.renderCredentialsTable();
            if (typeof window.initializeStatutoryPostings === 'function') window.initializeStatutoryPostings();

            Swal.fire(
                'Override Successful',
                'Staff approved. Access credentials generated and stored in vault.',
                'success'
            );
        }
    } catch (e) {
        Swal.fire('Critical Error', e.message || 'Could not reach the Central Server.', 'error');
    }
};

window.deleteStaffRequest = async function (trackingRef) {
    if (SessionManager.isHistoricalArchiveMode()) {
        return Swal.fire('Archive Lockout', 'Purging staff requests is strictly prohibited in historical view.', 'error');
    }

    const res = await Swal.fire({
        title: 'Permanently Delete?',
        text: "Are you sure you want to permanently delete this onboarding request? This action cannot be undone.",
        icon: 'error',
        showCancelButton: true,
        confirmButtonColor: '#ef4444',
        confirmButtonText: 'Yes, Delete Request'
    });

    if (!res.isConfirmed) return;

    try {
        await ApiGateway.delete(`/ict/staff/delete/${trackingRef}`);
        await Swal.fire('Deleted', 'Ghost request successfully purged from database.', 'success');
        await window.syncPostgresToLocal(true);
        window.fetchStaffRegistry(currentStaffPage);
    } catch (error) {
        Swal.fire('Deletion Failed', error.message || 'Connection to PostgreSQL Vault failed.', 'error');
    }
};

window.getUnifiedEntityList = function () {
    const students = window.getStudentRegistrySafe();
    let staff = window.getStaffRegistrySafe();
    let entities = [];

    students.filter(s => s.status === 'ADMITTED' || s.triageStatus === 'ADMITTED').forEach(s => {
        const name = s.name || s.fullName || 'Unknown Applicant';
        const admNo = s.admNo || "PENDING";
        const rawPhoto = s.photoUrl || s.uploadPassport || s.passportUrl;

        const photo = rawPhoto ? window.resolveMediaUrl(rawPhoto) : `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=0F172A&color=fff`;

        entities.push({
            type: 'STUDENT', id: admNo, realNIN: s.nin, name: name, photo: photo, dob: s.dob,
            isLocked: s.isLocked || false, hasCustomPassword: s.hasCustomPassword || false,
            queryTarget: `${name.toLowerCase()} ${admNo.toLowerCase()}`
        });
    });

    staff = staff.filter(s => !(s.name || s.fullName || '').toLowerCase().includes('root admin'));

    staff.forEach(s => {
        const activeId = s.id || s.staffId || s.trackingRef;
        const staffName = s.name || s.fullName || 'Unknown Staff';
        const rawPhoto = s.photoUrl || s.uploadPassport || s.passportUrl;

        const photo = rawPhoto ? window.resolveMediaUrl(rawPhoto) : `https://ui-avatars.com/api/?name=${encodeURIComponent(staffName)}&background=0F172A&color=fff`;

        entities.push({
            type: 'STAFF', id: activeId, realNIN: activeId, name: staffName, photo: photo,
            isLocked: s.isLocked || false, hasCustomPassword: s.hasCustomPassword || false, tempPassword: s.tempPassword || 'GUSSR-STAFF-TEMP',
            queryTarget: `${staffName.toLowerCase()} ${(activeId || '').toLowerCase()}`
        });
    });

    return entities;
};

window.openDossierModal = async function (type, targetId) {
    const body = document.getElementById('dossierBody');
    if (!body) return;

    body.innerHTML = '<div class="py-24 text-center"><i class="fa-solid fa-circle-notch fa-spin text-4xl text-blue-500 mb-4 block"></i><p class="font-bold text-slate-500 uppercase tracking-widest text-xs">Decrypting Secure Dossier...</p></div>';

    const modal = document.getElementById('dossierModal');
    modal.classList.remove('hidden');
    setTimeout(() => {
        modal.classList.remove('opacity-0');
        const content = document.getElementById('dossierContent');
        if (content) content.classList.remove('scale-95');
    }, 10);

    if (type === 'STUDENT') {
        try {
            const pendingDB = window.getStudentRegistrySafe();
            const cacheRef = pendingDB.find(s => s.admNo === targetId || s.nin === targetId);
            if (!cacheRef) throw new Error("Student not found in registry.");

            const student = await ApiGateway.get(`/bridge/student?nin=${cacheRef.nin}`);

            let logs = [];
            try {
                let parsedLogs = window.parseVault('guss_system_logs');
                logs = Array.isArray(parsedLogs) ? parsedLogs : [];
            } catch (e) { }

            const studentLogs = logs.filter(l => l.msg && (l.msg.includes(student.admNo) || l.msg.includes(student.nin)));
            let logsHtml = studentLogs.map(l => `<div class="border-b border-slate-100 py-2"><span class="text-[9px] text-slate-400 font-mono">${DOMPurify.sanitize(l.time || l.timestamp)}</span><p class="text-xs font-medium text-slate-700">${DOMPurify.sanitize(l.msg)}</p></div>`).join('');
            if (!logsHtml) logsHtml = '<p class="text-xs text-slate-400 italic font-medium p-2">No administrative actions recorded.</p>';

            const safePhoto = student.photoUrl || student.uploadPassport ? window.resolveMediaUrl(student.photoUrl || student.uploadPassport) : `https://ui-avatars.com/api/?name=${(student.name || 'Student').replace(/ /g, '+')}`;
            const safeSig = student.signatureUrl || student.uploadSignature ? window.resolveMediaUrl(student.signatureUrl || student.uploadSignature) : null;

            body.innerHTML = `
                <div class="flex flex-col md:flex-row gap-8 items-start">
                    <div class="flex flex-col items-center gap-4 w-full md:w-1/3 border-b md:border-b-0 md:border-r border-slate-200 pb-6 md:pb-0 md:pr-6 shrink-0">
                        <img src="${DOMPurify.sanitize(safePhoto)}" class="w-48 h-48 object-cover rounded-3xl shadow-md border border-slate-200">
                        <span class="bg-emerald-100 text-emerald-800 text-[10px] font-black uppercase tracking-widest px-3 py-1 rounded shadow-sm">Student Identity</span>
                        <div class="text-center w-full">
                            <p class="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Admission Number</p>
                            <p class="font-mono font-bold text-gussNavy bg-slate-100 py-2 rounded-lg border border-slate-200 text-lg">${DOMPurify.sanitize(student.admNo || "PENDING")}</p>
                        </div>
                        ${safeSig ? `<div class="mt-2 text-center w-full"><p class="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1 border-t border-slate-100 pt-3">Digital Signature</p><img src="${DOMPurify.sanitize(safeSig)}" class="h-12 object-contain mx-auto mix-blend-multiply opacity-80"></div>` : ''}
                    </div>
                    <div class="flex-1 w-full space-y-6">
                        <div>
                            <h2 class="text-2xl sm:text-3xl font-black text-gussNavy uppercase tracking-wide leading-tight">${DOMPurify.sanitize(student.name || student.fullName)}</h2>
                            <p class="text-xs text-slate-500 font-bold mt-1">Assigned Class: <span class="text-gussGreen">${DOMPurify.sanitize(student.assignedClass || "Unassigned")}</span> &nbsp;|&nbsp; Hostel: <span class="text-gussGold">${DOMPurify.sanitize(student.assignedHostel || "Day Student")}</span></p>
                        </div>
                        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-y-5 gap-x-6 bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
                            <div><p class="text-[9px] font-bold text-slate-400 uppercase tracking-widest">NIN Linked</p><p class="text-sm font-mono font-black text-slate-700">${DOMPurify.sanitize(student.nin || 'N/A')}</p></div>
                            <div><p class="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Date of Birth</p><p class="text-sm font-black text-slate-700">${DOMPurify.sanitize(student.dob || 'N/A')}</p></div>
                            <div><p class="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Gender</p><p class="text-sm font-black text-slate-700">${DOMPurify.sanitize(student.gender || 'N/A')}</p></div>
                            <div><p class="text-[9px] font-bold text-slate-400 uppercase tracking-widest">State of Origin</p><p class="text-sm font-black text-slate-700">${DOMPurify.sanitize(student.state || 'N/A')}</p></div>
                            <div><p class="text-[9px] font-bold text-slate-400 uppercase tracking-widest">L.G.A</p><p class="text-sm font-black text-slate-700">${DOMPurify.sanitize(student.lga || 'N/A')}</p></div>
                            <div><p class="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Blood Group</p><p class="text-sm font-black text-red-600">${DOMPurify.sanitize(student.blood || 'Unknown')}</p></div>
                        </div>
                        <div class="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-4">
                            <div><p class="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Primary Contact / Phone</p><p class="text-sm font-mono font-black text-blue-600">${DOMPurify.sanitize(student.nok1Phone || 'N/A')}</p></div>
                            <div><p class="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Residential Address</p><p class="text-sm font-black text-slate-700">${DOMPurify.sanitize(student.address || 'N/A')}</p></div>
                            <div class="border-t border-slate-100 pt-3"><p class="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Emergency Next of Kin</p><p class="text-sm font-black text-slate-700">${DOMPurify.sanitize(student.nok1Name || 'N/A')} <span class="font-mono text-blue-600 ml-2">${DOMPurify.sanitize(student.nok1Phone || '')}</span></p></div>
                        </div>
                        <div class="pt-2">
                            <h4 class="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2"><i class="fa-solid fa-file-medical text-red-400 mr-1"></i> Medical & Health Notes</h4>
                            <p class="text-xs font-bold text-slate-600 bg-red-50 p-4 rounded-xl border border-red-100 shadow-inner">Allergies: ${DOMPurify.sanitize(student.medAllergies || 'None declared')} &nbsp;|&nbsp; Disabilities: ${student.disabilityRadio === 'none' ? 'None' : 'Yes (Check Physical File)'}</p>
                        </div>
                    </div>
                </div>`;
        } catch (error) {
            body.innerHTML = `<div class="py-20 text-center text-red-500 font-bold"><i class="fa-solid fa-triangle-exclamation text-4xl mb-4 block"></i> Failed to decrypt student dossier. Network Error.</div>`;
        }
    } else if (type === 'STAFF') {
        try {
            const safeId = encodeURIComponent(targetId);
            const [staff, operationalRoles] = await Promise.all([
                ApiGateway.get(`/ict/staff/profile?id=${safeId}`),
                ApiGateway.get(`/ict/operational/staff?staffId=${safeId}`).catch(() => [])
            ]);

            body.innerHTML = window.buildStaffDossierHtml(staff, operationalRoles);
        } catch (error) {
            body.innerHTML = `<div class="py-20 text-center text-red-500 font-bold"><i class="fa-solid fa-triangle-exclamation text-4xl mb-4 block"></i> Failed to decrypt staff dossier. Network Error.</div>`;
        }
    }
};

window.buildStaffDossierHtml = function (staff, operationalRoles = []) {
    let rolesHtml = '';
    const staffIdCheck = staff.staffId || staff.trackingRef;

    const statBoard = (typeof window.parseVault === 'function') ? (window.parseVault('guss_statutory_board') || {}) : {};
    Object.entries(statBoard).forEach(([officeKey, data]) => {
        if (data.staffId && data.staffId.toUpperCase() === staffIdCheck.toUpperCase()) {
            let cleanTitle = officeKey.replace('ROLE_', '').replace(/_/g, ' ');
            if (officeKey === 'ROLE_DIRECTOR') cleanTitle = 'School Director';
            if (officeKey === 'ROLE_BURSAR') cleanTitle = 'Central Bursar';
            rolesHtml += `<span class="bg-gussGold text-gussNavy px-3 py-1 rounded text-[9px] font-black uppercase shadow-sm border border-yellow-600 mr-2 mb-2 inline-block"><i class="fa-solid fa-crown mr-1"></i> ${cleanTitle}</span>`;
        }
    });

    const delegations = (typeof window.parseVault === 'function') ? (window.parseVault('cloud_delegations') || {}) : {};
    Object.entries(delegations).forEach(([roleKey, data]) => {
        if (data.staffId && data.staffId.toUpperCase() === staffIdCheck.toUpperCase()) {
            rolesHtml += `<span class="bg-slate-800 text-white px-3 py-1 rounded text-[9px] font-black uppercase shadow-sm border border-slate-600 mr-2 mb-2 inline-block"><i class="fa-solid fa-shield-halved mr-1 text-blue-400"></i> ${roleKey.replace(/_/g, ' ')}</span>`;
        }
    });

    if (Array.isArray(operationalRoles)) {
        operationalRoles.forEach(op => {
            let icon = "fa-chalkboard-user";
            let colorClass = "text-blue-600 border-blue-600";

            if (op.type === 'HOUSE_WARDEN') {
                icon = "fa-building-user";
                colorClass = "text-purple-600 border-purple-600 bg-purple-50";
            } else if (op.type === 'FORM_MASTER') {
                icon = "fa-users-rectangle";
                colorClass = "text-orange-600 border-orange-600 bg-orange-50";
            } else if (op.type === 'SUBJECT_TEACHER') {
                colorClass = "text-blue-600 border-blue-600 bg-blue-50";
            }

            rolesHtml += `<span class="${colorClass} border text-[9px] font-black uppercase tracking-widest px-2 py-1 rounded shadow-sm mr-2 mb-2 inline-block"><i class="fa-solid ${icon} mr-1"></i> ${DOMPurify.sanitize(op.title)}</span>`;
        });
    }

    if (rolesHtml === '') {
        rolesHtml = `<span class="text-[9px] font-bold text-slate-400 uppercase"><i class="fa-solid fa-user text-slate-300 mr-1"></i> Standard Faculty Clearance</span>`;
    }

    const safePhoto = staff.photoUrl || staff.uploadPassport ? window.resolveMediaUrl(staff.photoUrl || staff.uploadPassport) : `https://ui-avatars.com/api/?name=${(staff.fullName || staff.name).replace(/ /g, '+')}`;
    const safeSig = staff.signatureUrl || staff.uploadSignature ? window.resolveMediaUrl(staff.signatureUrl || staff.uploadSignature) : null;

    let transientHtml = "";
    if (staff.staffType === 'NYSC' || staff.staffType === 'TP') {
        let isExpired = false;
        if (staff.endDate) {
            const end = new Date(staff.endDate);
            if (end < new Date()) isExpired = true;
        }
        transientHtml = `<div class="${isExpired ? 'bg-red-50 border-red-200' : 'bg-orange-50 border-orange-200'} border p-3 rounded-xl mb-4 mt-4">
            <p class="text-[9px] font-black ${isExpired ? 'text-red-800' : 'text-orange-800'} uppercase tracking-widest">Transient Status: ${isExpired ? '<span class="text-red-600">EXPIRED</span>' : 'ACTIVE'}</p>
            <p class="text-xs font-bold ${isExpired ? 'text-red-900' : 'text-orange-900'} mt-1">Passing Out Date: ${DOMPurify.sanitize(staff.endDate)}</p>
        </div>`;
    }

    const displayAddress = staff.residentialAddress || staff.address || 'N/A';
    const displayQual = staff.qualification || staff.qual || 'N/A';

    return `<div class="flex flex-col md:flex-row gap-8 items-start">
        <div class="flex flex-col items-center gap-4 w-full md:w-1/3 border-b md:border-b-0 md:border-r border-slate-200 pb-6 md:pb-0 md:pr-6 shrink-0">
            <img src="${DOMPurify.sanitize(safePhoto)}" class="w-48 h-48 object-cover rounded-3xl shadow-md border border-slate-200">
            <span class="bg-blue-100 text-blue-800 text-[10px] font-black uppercase tracking-widest px-3 py-1 rounded shadow-sm">Staff Identity</span>
            <div class="text-center w-full">
                <p class="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Staff ID Number</p>
                <p class="font-mono font-bold text-gussNavy bg-slate-100 py-2 rounded-lg border border-slate-200 text-lg">${DOMPurify.sanitize(staff.staffId || staff.trackingRef)}</p>
            </div>
            ${safeSig ? `<div class="mt-2 text-center w-full"><p class="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1 border-t border-slate-100 pt-3">Digital Signature</p><img src="${DOMPurify.sanitize(safeSig)}" class="h-12 object-contain mx-auto mix-blend-multiply opacity-80"></div>` : ''}
        </div>
        <div class="flex-1 w-full space-y-6">
            <div>
                <h2 class="text-2xl sm:text-3xl font-black text-gussNavy uppercase tracking-wide leading-tight">${DOMPurify.sanitize(staff.fullName || staff.name)}</h2>
                <p class="text-xs text-slate-500 font-bold mt-1">Track Category: <span class="text-blue-600">${DOMPurify.sanitize(staff.staffType)}</span> &nbsp;|&nbsp; Status: <span class="${(staff.approvalStatus || staff.status) === 'APPROVED' ? 'text-emerald-600' : 'text-amber-500'} font-black">${DOMPurify.sanitize(staff.approvalStatus || staff.status)}</span></p>
                
                <div class="mt-4 border-t border-slate-200 pt-4">
                    <p class="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-2">Active Assignments & Clearances</p>
                    ${rolesHtml}
                </div>
            </div>
            ${transientHtml}
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-y-5 gap-x-6 bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
                <div><p class="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Qualification</p><p class="text-sm font-black text-slate-700">${DOMPurify.sanitize(displayQual)}</p></div>
                <div><p class="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Blood Group</p><p class="text-sm font-black text-red-600">${DOMPurify.sanitize(staff.bloodGroup || 'N/A')}</p></div>
                <div><p class="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Personal Phone / Email</p><p class="text-sm font-mono font-black text-slate-700">${DOMPurify.sanitize(staff.phone || 'N/A')}<br><span class="text-slate-400 text-xs">${DOMPurify.sanitize(staff.personalEmail || 'N/A')}</span></p></div>
                <div><p class="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Official Email</p><p class="text-sm font-mono font-black text-blue-600">${DOMPurify.sanitize(staff.officialEmail || staff.email || 'Awaiting Allocation')}</p></div>
                <div class="col-span-1 sm:col-span-2 border-t border-slate-100 pt-3"><p class="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Residential Address</p><p class="text-sm font-black text-slate-700">${DOMPurify.sanitize(displayAddress)}</p></div>
            </div>
        </div>
    </div>`;
};

window.closeDossierModal = function () {
    const modal = document.getElementById('dossierModal');
    const content = document.getElementById('dossierContent');
    if (!modal) return;
    modal.classList.add('opacity-0');
    if (content) content.classList.add('scale-95');
    setTimeout(() => { modal.classList.add('hidden'); }, 300);
};

// ==========================================
// 3. CREDENTIALS & ACCOUNT SECURITY ENGINE
// ==========================================
window.toggleAccountLock = async function (dbKey, lockState) {
    if (SessionManager.isHistoricalArchiveMode()) {
        return Swal.fire('Archive Lockout', 'Modifying account lock states is strictly prohibited in historical view.', 'error');
    }

    const res = await Swal.fire({
        title: 'SECURITY OVERRIDE',
        text: `Are you sure you want to ${lockState ? 'LOCK' : 'UNLOCK'} this account?`,
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: lockState ? '#ef4444' : '#10b981',
        confirmButtonText: lockState ? 'Yes, Lock Account' : 'Yes, Unlock Account'
    });

    if (!res.isConfirmed) return;

    try {
        const data = await ApiGateway.post('/ict/staff/toggle-lock', { identifier: dbKey, lockState: lockState });

        if (data) {
            if (cachedUnifiedEntities) {
                const ent = cachedUnifiedEntities.find(e => e.realNIN === dbKey || e.id === dbKey);
                if (ent) ent.isLocked = lockState;
            }
            await window.syncPostgresToLocal(true);
            window.renderCredentialsTable();
            Swal.fire('State Updated', 'Account lock state updated successfully.', 'success');
        }
    } catch (error) {
        Swal.fire('Critical Error', error.message || 'Could not reach the Authentication Server.', 'error');
    }
};

window.forcePasswordReset = async function (dbKey, type) {
    if (SessionManager.isHistoricalArchiveMode()) {
        return Swal.fire('Archive Lockout', 'Forcing password resets is strictly prohibited in historical view.', 'error');
    }

    const res = await Swal.fire({
        title: 'Generate Access Key',
        text: "Generate a new unique access key for this account? This invalidates their current password.",
        icon: 'question',
        showCancelButton: true,
        confirmButtonColor: '#000',
        confirmButtonText: 'Yes, Force Reset'
    });

    if (!res.isConfirmed) return;

    try {
        const data = await ApiGateway.post('/ict/staff/force-reset', { identifier: dbKey, type: type });

        if (data) {
            await window.syncPostgresToLocal(true);
            cachedUnifiedEntities = window.getUnifiedEntityList();
            window.renderCredentialsTable();

            Swal.fire({
                title: 'Success',
                text: 'Unique key generated.',
                icon: 'success',
                confirmButtonText: 'Print Credentials'
            }).then(() => {
                window.printCredentialSlip(dbKey, data.tempPassword, type);
            });
        }
    } catch (error) {
        Swal.fire('Critical Error', error.message || 'Failed to communicate with the ICT Security Node.', 'error');
    }
};

window.printCredentialSlip = async function (entityId, overridePassword = null, type = 'STAFF') {
    let dynamicPassword = overridePassword;
    if (!dynamicPassword) {
        if (!cachedUnifiedEntities) cachedUnifiedEntities = window.getUnifiedEntityList();
        const memoryEntity = cachedUnifiedEntities.find(e => e.id === entityId || e.realNIN === entityId);
        if (memoryEntity) dynamicPassword = memoryEntity.tempPassword;
    }

    if (!dynamicPassword) return Swal.fire('Security Halt', "Generate a unique access key first.", 'error');

    const btn = window.event ? window.event.currentTarget : null;
    let ogText = "";
    if (btn) { ogText = btn.innerHTML; btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin mr-1"></i> Generating PDF...`; btn.disabled = true; }

    try {
        const blob = await secureBlobFetch('/reports/credential-slip', { entityId: entityId, tempPassword: dynamicPassword, type: type });

        if (blob) {
            const pdfBlob = new Blob([blob], { type: 'application/pdf' });
            const blobUrl = window.URL.createObjectURL(pdfBlob);
            window.open(blobUrl, '_blank');
        }
    } catch (error) {
        Swal.fire('Critical Error', 'Connection to Jasper Engine failed.', 'error');
    } finally {
        if (btn) { btn.innerHTML = ogText; btn.disabled = false; }
    }
};

window.renderCredentialsTable = function (searchQuery = "") {
    const tbody = document.getElementById('credentialsBody');
    if (!tbody) return;

    if (!cachedUnifiedEntities) cachedUnifiedEntities = window.getUnifiedEntityList();

    let filtered = cachedUnifiedEntities;
    if (searchQuery) {
        filtered = cachedUnifiedEntities.filter(e => e.queryTarget.includes(searchQuery));
    }

    if (filtered.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" class="py-12 text-center text-slate-400 font-bold text-xs">No active entities found.</td></tr>`;
        return;
    }

    const isHistorical = SessionManager.isHistoricalArchiveMode();
    let htmlBuffer = "";
    const displayLimit = 100;
    const toDisplay = filtered.slice(0, displayLimit);

    toDisplay.forEach(ent => {
        const hasCustomPass = ent.hasCustomPassword || false;
        const isLocked = ent.isLocked || false;

        const authStatus = hasCustomPass
            ? `<span class="bg-emerald-100 text-emerald-800 border border-emerald-300 px-2.5 py-1 rounded text-[10px] font-black uppercase tracking-wider inline-flex items-center gap-1.5 shadow-sm"><i class="fa-solid fa-shield-halved"></i> Custom</span>`
            : `<span class="bg-amber-100 text-amber-800 border border-amber-300 px-2.5 py-1 rounded text-[10px] font-black uppercase tracking-wider inline-flex items-center gap-1.5 shadow-sm"><i class="fa-solid fa-clock-rotate-left"></i> Default</span>`;

        const lockBtn = isHistorical
            ? `<span class="bg-slate-100 text-slate-500 border border-slate-300 px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider inline-flex items-center gap-1.5 cursor-not-allowed"><i class="fa-solid ${isLocked ? 'fa-lock text-red-500' : 'fa-lock-open text-slate-400'}"></i> ${isLocked ? 'Locked' : 'Active'}</span>`
            : (isLocked
                ? `<button onclick="window.toggleAccountLock('${ent.realNIN}', false)" class="bg-red-500 hover:bg-red-600 text-white border border-red-600 px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all w-24 shadow flex items-center justify-center gap-1.5"><i class="fa-solid fa-lock"></i> Locked</button>`
                : `<button onclick="window.toggleAccountLock('${ent.realNIN}', true)" class="bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-300 px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all w-24 shadow-sm flex items-center justify-center gap-1.5"><i class="fa-solid fa-lock-open"></i> Active</button>`);

        const printSlipBtn = hasCustomPass
            ? `<button disabled class="bg-slate-100 text-slate-400 border border-slate-200 px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-wider mr-1 shadow-sm cursor-not-allowed" title="Account Secured. Force Reset to print new slip."><i class="fa-solid fa-lock mr-1"></i> Secured</button>`
            : `<button onclick="window.printCredentialSlip('${ent.id}', null, '${ent.type}')" class="bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200 px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-wider transition-colors mr-1 shadow-sm"><i class="fa-solid fa-print mr-1"></i> Print Slip</button>`;

        const editPenBtn = isHistorical
            ? ''
            : `<button onclick="window.openEditModal('${ent.type}', '${ent.id}')" class="text-blue-500 hover:text-blue-700 text-[10px]"><i class="fa-solid fa-pen"></i></button>`;

        const forceResetBtn = isHistorical
            ? ''
            : `<button onclick="window.forcePasswordReset('${ent.realNIN}', '${ent.type}')" class="bg-slate-800 hover:bg-black text-white px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-wider transition-colors shadow-sm"><i class="fa-solid fa-rotate-left mr-1"></i> Force Reset</button>`;

        htmlBuffer += `
            <tr class="hover:bg-slate-50 transition-colors cred-row">
                <td class="py-3 px-4 flex items-center gap-3">
                    <img src="${window.resolveMediaUrl(DOMPurify.sanitize(ent.photo))}" onerror="this.src='https://ui-avatars.com/api/?name=${encodeURIComponent(ent.name)}&background=0F172A&color=fff'" class="w-8 h-8 rounded-lg object-cover bg-slate-100 border border-slate-200 shrink-0">
                    <div>
                        <div class="font-black text-slate-800 text-xs uppercase flex items-center gap-2">${DOMPurify.sanitize(ent.name)} ${editPenBtn}</div>
                        <div class="text-[9px] font-mono text-slate-500">${DOMPurify.sanitize(ent.id)}</div>
                    </div>
                </td>
                <td class="py-3 px-4"><span class="px-2 py-1 rounded text-[9px] font-black uppercase tracking-widest ${ent.type === 'STAFF' ? 'bg-purple-100 text-purple-800' : 'bg-blue-100 text-blue-800'}">${ent.type}</span></td>
                <td class="py-3 px-4">${authStatus}</td>
                <td class="py-3 px-4 text-center">${lockBtn}</td>
                <td class="py-3 px-4 text-right">
                    ${printSlipBtn}
                    ${forceResetBtn}
                </td>
            </tr>
        `;
    });

    if (filtered.length > displayLimit) {
        htmlBuffer += `<tr><td colspan="5" class="py-4 text-center text-blue-500 font-bold text-[10px] uppercase tracking-widest bg-blue-50 border-t border-blue-100">Showing top 100 results. Use search bar to find specific entities.</td></tr>`;
    }

    tbody.innerHTML = htmlBuffer;
    window.applyArchiveReadonlyState();
};

window.filterCredentials = function () {
    const query = document.getElementById('credSearchInput').value.toLowerCase();
    window.renderCredentialsTable(query);
};

// ==========================================
// 4. MASTER ARCHIVE LEDGER
// ==========================================
window.switchArchiveFilter = function (type) {
    activeArchiveType = type;
    document.getElementById('archiveFilterStudent').className = type === 'STUDENT' ? "flex-1 text-[10px] font-black uppercase tracking-widest px-4 py-1.5 rounded bg-white shadow-sm text-gussNavy border border-slate-200 transition-all" : "flex-1 text-[10px] font-black uppercase tracking-widest px-4 py-1.5 rounded text-slate-500 hover:text-gussNavy transition-all";
    document.getElementById('archiveFilterStaff').className = type === 'STAFF' ? "flex-1 text-[10px] font-black uppercase tracking-widest px-4 py-1.5 rounded bg-white shadow-sm text-gussNavy border border-slate-200 transition-all" : "flex-1 text-[10px] font-black uppercase tracking-widest px-4 py-1.5 rounded text-slate-500 hover:text-gussNavy transition-all";
    window.executeArchiveSearch();
};

window.executeArchiveSearch = function () {
    const query = (document.getElementById('archiveSearchInput').value || '').toLowerCase();
    const container = document.getElementById('archiveSearchResults');
    if (!container) return;

    let data = [];
    if (activeArchiveType === 'STUDENT') {
        const students = window.getStudentRegistrySafe();
        data = students.filter(s => s.status === 'ADMITTED');
        if (query) {
            data = data.filter(s => (s.name && s.name.toLowerCase().includes(query)) || (s.admNo && s.admNo.toLowerCase().includes(query)) || (s.nin && s.nin.toLowerCase().includes(query)));
        }
    } else {
        const staff = window.getStaffRegistrySafe();
        data = staff;
        if (query) {
            data = data.filter(s => (s.name && s.name.toLowerCase().includes(query)) || (s.id && s.id.toLowerCase().includes(query)));
        }
    }

    if (data.length === 0) {
        container.innerHTML = `<div class="col-span-1 lg:col-span-3 p-8 text-center text-slate-400 font-bold text-xs border border-dashed border-slate-200 rounded-xl bg-slate-50">No entities found.</div>`;
        return;
    }

    let htmlBuffer = "";
    const toDisplay = data.slice(0, 100);

    toDisplay.forEach(item => {
        const idStr = activeArchiveType === 'STUDENT' ? (item.admNo || item.nin) : item.id;
        htmlBuffer += `
            <div onclick="window.openDossierModal('${activeArchiveType}', '${idStr}')" class="p-4 bg-white border border-slate-200 rounded-xl hover:border-amber-400 cursor-pointer flex justify-between items-center group transition-all shadow-sm hover:shadow-md">
                <div class="flex items-center gap-4">
                    <img src="${window.resolveMediaUrl(DOMPurify.sanitize(item.photoUrl || 'https://ui-avatars.com/api/?name=User'))}" class="w-10 h-10 rounded-lg object-cover bg-slate-100 border border-slate-200 shrink-0">
                    <div><span class="font-black text-slate-800 uppercase text-sm group-hover:text-amber-600 transition-colors">${DOMPurify.sanitize(item.name || item.fullName)}</span><br><span class="text-[10px] font-mono text-slate-500 block mt-0.5">${DOMPurify.sanitize(idStr)}</span></div>
                </div>
                <i class="fa-solid fa-address-card text-slate-200 group-hover:text-amber-500 text-lg"></i>
            </div>
        `;
    });

    container.innerHTML = htmlBuffer;
};

// ==========================================
// 5. PROFILE EDITING MODAL 
// ==========================================
window.openEditModal = function (type, targetId) {
    if (SessionManager.isHistoricalArchiveMode()) {
        return Swal.fire('Archive Lockout', 'Modifying core identities is strictly prohibited in historical view.', 'error');
    }

    const entity = window.getUnifiedEntityList().find(e => e.type === type && e.id === targetId);
    if (!entity) return;

    document.getElementById('editEntityId').value = entity.id;
    document.getElementById('editEntityType').value = entity.type;
    document.getElementById('editNameInput').value = entity.name;
    document.getElementById('editPhotoPreview').src = window.resolveMediaUrl(entity.photo);
    document.getElementById('editPhotoInput').value = '';

    const sigPreviewNode = document.getElementById('editSignaturePreview');

    if (type === 'STUDENT') {
        const students = window.getStudentRegistrySafe();
        const sData = students.find(s => s.admNo === entity.id) || {};

        document.getElementById('editDobContainer').classList.remove('hidden');
        document.getElementById('editQualContainer').classList.add('hidden');
        document.getElementById('editDobInput').value = sData.dob || "";
        document.getElementById('editPhoneInput').value = sData.nok1Phone || "";
        document.getElementById('editPersonalEmailInput').value = sData.email || "";
        document.getElementById('editAddressInput').value = sData.address || "";
        document.getElementById('editNokName').value = sData.nok1Name || "";
        document.getElementById('editNokPhone').value = sData.nok1Phone || "";

        if (sigPreviewNode) {
            sigPreviewNode.src = window.resolveMediaUrl(sData.uploadSignature || sData.signatureUrl || '');
        }
    } else {
        const staffList = window.getStaffRegistrySafe();
        const stData = staffList.find(s => s.id === entity.id || s.staffId === entity.id) || {};

        document.getElementById('editDobContainer').classList.add('hidden');
        document.getElementById('editQualContainer').classList.remove('hidden');
        document.getElementById('editQualInput').value = stData.qual || "";
        document.getElementById('editPhoneInput').value = stData.phone || "";
        document.getElementById('editPersonalEmailInput').value = stData.personalEmail || "";
        document.getElementById('editOfficialEmailInput').value = stData.email || stData.officialEmail || "";
        document.getElementById('editAddressInput').value = stData.address || "";
        document.getElementById('editNokName').value = stData.nokName || "";
        document.getElementById('editNokPhone').value = stData.nokPhone || "";

        if (sigPreviewNode) {
            sigPreviewNode.src = window.resolveMediaUrl(stData.signatureUrl || '');
        }
    }

    document.getElementById('editDataModal').classList.remove('hidden');
};

window.closeEditModal = function () { document.getElementById('editDataModal').classList.add('hidden'); };

window.processSignatureEditPreview = function (inputNode) {
    if (inputNode.files && inputNode.files[0]) {
        const reader = new FileReader();
        reader.onload = function (e) {
            const img = document.getElementById('editSignaturePreview');
            if (img) img.src = e.target.result;
        };
        reader.readAsDataURL(inputNode.files[0]);
    }
};

window.saveProfileUpdates = async function () {
    if (SessionManager.isHistoricalArchiveMode()) {
        return Swal.fire('Archive Lockout', 'Modifying core identities is strictly prohibited in historical view.', 'error');
    }

    const id = document.getElementById('editEntityId').value;
    const type = document.getElementById('editEntityType').value;

    const newName = document.getElementById('editNameInput').value;
    const newPhone = document.getElementById('editPhoneInput').value;
    const newPEmail = document.getElementById('editPersonalEmailInput').value;
    const newOfficialEmail = document.getElementById('editOfficialEmailInput').value;
    const newAddress = document.getElementById('editAddressInput').value;
    const newNokName = document.getElementById('editNokName').value;
    const newNokPhone = document.getElementById('editNokPhone').value;
    const newPhotoUrl = document.getElementById('editPhotoPreview').src;

    const sigPreviewNode = document.getElementById('editSignaturePreview');
    const newSignatureUrl = sigPreviewNode ? sigPreviewNode.src : null;

    const saveBtn = window.event ? window.event.currentTarget : document.querySelector('button[onclick="window.saveProfileUpdates()"]');
    let ogText = "Save Changes";
    if (saveBtn) {
        ogText = saveBtn.innerHTML;
        saveBtn.innerHTML = `<i class="fa-solid fa-spinner fa-spin mr-1"></i> Committing to Vault...`;
        saveBtn.disabled = true;
    }

    try {
        if (type === 'STAFF') {
            let db = window.getStaffRegistrySafe();
            const idx = db.findIndex(s => s.id === id);

            if (idx > -1) {
                const payloadData = {
                    trackingRef: db[idx].trackingRef || null,
                    staffId: (db[idx].id && db[idx].id.startsWith("REQ-")) ? null : db[idx].id,
                    fullName: newName,
                    phone: newPhone,
                    personalEmail: newPEmail,
                    officialEmail: newOfficialEmail !== null ? newOfficialEmail : (db[idx].email || null),
                    residentialAddress: newAddress,
                    nokName: newNokName,
                    nokPhone: newNokPhone,
                    qualification: newName ? document.getElementById('editQualInput').value : db[idx].qual,
                    staffType: db[idx].staffType,
                    bloodGroup: db[idx].bloodGroup,
                    endDate: db[idx].endDate || null,
                    approvalStatus: db[idx].status || "PENDING_APPROVAL"
                };

                const formData = new FormData();
                formData.append("data", JSON.stringify(payloadData));

                if (newPhotoUrl && newPhotoUrl.startsWith("data:image")) {
                    formData.append("uploadPhoto", window.base64ToBlob(newPhotoUrl), "photo.jpg");
                }
                if (newSignatureUrl && newSignatureUrl.startsWith("data:image")) {
                    formData.append("uploadSignature", window.base64ToBlob(newSignatureUrl), "signature.jpg");
                }

                const data = await ApiGateway.postFormData('/ict/staff/onboard', formData);
                if (!data) throw new Error("Backend rejected the staff update");
            }
        } else {
            let db = window.getStudentRegistrySafe();
            const idx = db.findIndex(s => s.admNo === id);

            if (idx > -1) {
                db[idx].name = newName; db[idx].nok1Phone = newPhone; db[idx].email = newPEmail;
                db[idx].address = newAddress; db[idx].nok1Name = newNokName; db[idx].nok1Phone = newNokPhone;
                db[idx].dob = document.getElementById('editDobInput').value;

                db[idx].photoUrl = newPhotoUrl;
                db[idx].uploadPassport = newPhotoUrl;

                if (newSignatureUrl && !newSignatureUrl.includes(window.location.host)) {
                    db[idx].uploadSignature = newSignatureUrl;
                    db[idx].signatureUrl = newSignatureUrl;
                }

                const data = await ApiGateway.post('/bridge/save', db[idx]);
                if (!data) throw new Error("Backend rejected the student update");
            }
        }

        await window.syncPostgresToLocal(type === 'STAFF');
        Swal.fire('Updated', 'System Overwrite Successful: Immutable data updated in PostgreSQL Vault.', 'success');

        window.closeEditModal();
        window.renderCredentialsTable();
        if (typeof window.loadIdRoster === 'function') window.loadIdRoster(typeof activeIdFilter !== 'undefined' ? activeIdFilter : 'ALL');
        if (typeof window.executeArchiveSearch === 'function') window.executeArchiveSearch();

    } catch (error) {
        Swal.fire('Critical Error', error.message || 'Failed to reach the PostgreSQL Database. Changes were not saved.', 'error');
    } finally {
        if (saveBtn) {
            saveBtn.innerHTML = ogText;
            saveBtn.disabled = false;
        }
    }
};

// ==========================================
// 6. MASTER ID CARD SPOOLER ENGINE 
// ==========================================
window.loadIdRoster = function (type, searchQuery = "") {
    activeIdFilter = type;
    document.getElementById('idFilterStudent').className = type === 'STUDENT' ? "flex-1 text-[10px] font-black uppercase tracking-widest py-1.5 rounded bg-white shadow-sm text-gussNavy border border-slate-200 transition-all" : "flex-1 text-[10px] font-black uppercase tracking-widest py-1.5 rounded text-slate-500 hover:text-gussNavy transition-all";
    document.getElementById('idFilterStaff').className = type === 'STAFF' ? "flex-1 text-[10px] font-black uppercase tracking-widest py-1.5 rounded bg-white shadow-sm text-gussNavy border border-slate-200 transition-all" : "flex-1 text-[10px] font-black uppercase tracking-widest py-1.5 rounded text-slate-500 hover:text-gussNavy transition-all";

    const rosterList = document.getElementById('idRosterList');
    if (!rosterList) return;

    if (!cachedUnifiedEntities) cachedUnifiedEntities = window.getUnifiedEntityList();
    let entities = cachedUnifiedEntities.filter(e => e.type === type);

    if (searchQuery) {
        entities = entities.filter(e => e.queryTarget.includes(searchQuery));
    }

    if (entities.length === 0) {
        rosterList.innerHTML = `<div class="p-4 text-center text-slate-400 text-xs font-bold border border-slate-100 rounded-xl bg-slate-50">No records found.</div>`;
        return;
    }

    let htmlBuffer = "";
    const toDisplay = entities.slice(0, 100);

    toDisplay.forEach(ent => {
        const safeEnt = encodeURIComponent(JSON.stringify(ent)).replace(/'/g, "%27");
        const isChecked = printSpooler.has(ent.id) ? 'checked' : '';

        htmlBuffer += `
        <div class="flex justify-between items-center p-3 bg-white border border-slate-100 rounded-xl hover:border-blue-200 hover:shadow-md transition-all group id-roster-item">
            <div class="flex items-center gap-3">
                <input type="checkbox" onchange="window.toggleSpoolerItem('${ent.id}')" ${isChecked} class="w-4 h-4 text-blue-600 bg-slate-100 border-slate-300 rounded focus:ring-blue-500 cursor-pointer">
                
                <div class="flex items-center gap-3 cursor-pointer" onclick="window.renderIDCard(JSON.parse(decodeURIComponent('${safeEnt}')))">
                    <img src="${window.resolveMediaUrl(DOMPurify.sanitize(ent.photo))}" class="w-8 h-8 rounded-lg object-cover border border-slate-200 shrink-0 bg-slate-100">
                    <div>
                        <h5 class="text-[11px] font-black text-slate-800 uppercase tracking-wide group-hover:text-blue-700 transition-colors">${DOMPurify.sanitize(ent.name)}</h5>
                        <p class="text-[9px] font-mono text-slate-500 mt-0.5">${DOMPurify.sanitize(ent.id)}</p>
                    </div>
                </div>
            </div>
            <i class="fa-solid fa-chevron-right text-slate-200 cursor-pointer hover:text-blue-400" onclick="window.renderIDCard(JSON.parse(decodeURIComponent('${safeEnt}')))"></i>
        </div>`;
    });

    if (entities.length > 100) {
        htmlBuffer += `<div class="p-3 text-center text-blue-500 font-bold text-[9px] uppercase bg-blue-50 rounded-xl mt-2">Top 100 shown. Use Search.</div>`;
    }

    rosterList.innerHTML = htmlBuffer;
    window.updateSpoolerUI();
};

window.filterIdRoster = function () {
    const query = document.getElementById('idSearchInput').value.toLowerCase();
    window.loadIdRoster(activeIdFilter, query);
};

window.toggleSpoolerItem = function (id) {
    if (printSpooler.has(id)) {
        printSpooler.delete(id);
    } else {
        printSpooler.add(id);
    }
    window.updateSpoolerUI();
};

window.toggleBulkSelect = function () {
    const visibleQuery = document.getElementById('idSearchInput').value.toLowerCase();
    let entities = cachedUnifiedEntities.filter(e => e.type === activeIdFilter);
    if (visibleQuery) {
        entities = entities.filter(e => e.queryTarget.includes(visibleQuery));
    }

    const allVisibleSelected = entities.every(e => printSpooler.has(e.id));

    if (allVisibleSelected) {
        entities.forEach(e => printSpooler.delete(e.id));
    } else {
        entities.forEach(e => printSpooler.add(e.id));
    }

    window.loadIdRoster(activeIdFilter, visibleQuery);
};

window.updateSpoolerUI = function () {
    const count = printSpooler.size;
    const badge = document.getElementById('spoolerCountBadge');
    const btn = document.getElementById('btnExecuteBulk');

    if (!badge || !btn) return;

    if (count > 0) {
        badge.textContent = `${count} Selected`;
        badge.classList.remove('hidden');
        btn.innerHTML = `<i class="fa-solid fa-print"></i> Generate Batch PDF (${count})`;
        btn.disabled = false;
        btn.className = "w-full bg-gussNavy hover:bg-slate-800 text-white font-black py-3 rounded-xl text-[10px] uppercase tracking-widest shadow-md transition-all flex items-center justify-center gap-2";
    } else {
        badge.classList.add('hidden');
        btn.innerHTML = `<i class="fa-solid fa-print"></i> Print Batch (0)`;
        btn.disabled = true;
        btn.className = "w-full bg-slate-300 text-slate-500 font-black py-3 rounded-xl text-[10px] uppercase tracking-widest transition-all shadow-sm flex items-center justify-center gap-2 cursor-not-allowed";
    }
};

window.renderIDCard = async function (ent) {
    activePrintEntity = ent;
    const roleBadge = document.getElementById('idRoleBadge');
    const dynFields = document.getElementById('idDynamicFields');
    const validityText = document.getElementById('idValidityText');

    const boardConfig = window.parseVault('guss_statutory_board') || {};
    const directorOffice = boardConfig['ROLE_DIRECTOR'];

    if (directorOffice) {
        const dirProfile = window.getStaffRegistrySafe().find(s => s.id === directorOffice.staffId);
        if (dirProfile && dirProfile.signatureUrl) {
            document.getElementById('idDirectorSignature').src = window.resolveMediaUrl(dirProfile.signatureUrl);
        }
    }

    if (!dynFields) return;
    dynFields.innerHTML = '';

    const activeSessionStr = sessionStorage.getItem('guss_selected_session') || sessionStorage.getItem('guss_live_session') || '';
    const baseYearMatch = activeSessionStr.match(/\d{4}/);
    let anchorYear = baseYearMatch ? parseInt(baseYearMatch[0], 10) : new Date().getFullYear();

    document.getElementById('emptyIdState').classList.add('hidden');
    document.getElementById('activeIdState').classList.remove('hidden');
    document.getElementById('activeIdState').classList.add('flex');

    document.getElementById('idPhoto').src = window.resolveMediaUrl(ent.photo);
    document.getElementById('idName').textContent = ent.name;
    document.getElementById('idBarcodeText').textContent = ent.id.replace(/\//g, '');

    if (ent.type === 'STUDENT') {
        const students = window.getStudentRegistrySafe();
        const sData = students.find(s => s.admNo === ent.id) || {};

        if (sData.sessionApplied) {
            const studentYearMatch = sData.sessionApplied.match(/\d{4}/);
            if (studentYearMatch) anchorYear = parseInt(studentYearMatch[0], 10);
        }

        roleBadge.textContent = 'STUDENT';
        roleBadge.className = "text-[8px] font-bold text-white bg-gussGold px-2 py-0.5 rounded-full uppercase tracking-widest mb-2 shadow-sm";

        let addYears = 3;
        const cls = (sData.assignedClass || '').toUpperCase();
        if (cls.includes('3')) addYears = 1;
        else if (cls.includes('2')) addYears = 2;

        validityText.textContent = `VALID TILL: ${anchorYear + addYears}`;
        validityText.className = "bg-slate-800 text-white text-center px-2 py-1 rounded text-[5px] font-mono tracking-widest w-1/2";

        dynFields.innerHTML = `
            <div class="flex justify-between items-center text-[7px] font-bold uppercase"><span class="text-slate-500">ADM NO:</span> <span class="text-gussNavy">${DOMPurify.sanitize(ent.id)}</span></div>
            <div class="flex justify-between items-center text-[7px] font-bold uppercase"><span class="text-slate-500">CLASS:</span> <span class="text-gussNavy">${DOMPurify.sanitize(sData.assignedClass || 'UNASSIGNED')}</span></div>
            <div class="flex justify-between items-center text-[7px] font-bold uppercase"><span class="text-slate-500">HOUSE:</span> <span class="text-gussNavy truncate max-w-[80px] text-right">${DOMPurify.sanitize(sData.assignedHostel || 'DAY STUDENT')}</span></div>
            <div class="flex justify-between items-center text-[7px] font-bold uppercase"><span class="text-slate-500">BLOOD GRP:</span> <span class="text-red-600">${DOMPurify.sanitize(sData.blood || 'O+')}</span></div>
        `;
    } else {
        const staffList = window.getStaffRegistrySafe();
        const stData = staffList.find(s => s.id === ent.id || s.staffId === ent.id) || {};

        if (stData.status === 'PENDING_APPROVAL') return Swal.fire('Clearance Error', "This staff member's profile is locked. Identity cards can only be generated after approval by a Deputy Director.", 'error');

        try {
            const fullProfile = await ApiGateway.get(`/ict/staff/profile?id=${encodeURIComponent(ent.id)}`);
            if (fullProfile && fullProfile.photoUrl) {
                document.getElementById('idPhoto').src = window.resolveMediaUrl(fullProfile.photoUrl);
            }
        } catch (e) { console.error("Lazy load failed"); }

        let activeRoleTitle = stData.staffType ? `${stData.staffType} STAFF` : "STAFF";

        Object.keys(boardConfig).forEach(office => {
            if (boardConfig[office] && boardConfig[office].staffId && boardConfig[office].staffId.toUpperCase() === (stData.staffId || '').toUpperCase()) {
                if (office === 'ROLE_DIRECTOR' || office === 'DIRECTOR') activeRoleTitle = "SCHOOL DIRECTOR";
                else if (office === 'ROLE_DEPUTY_DIR_ACADEMICS') activeRoleTitle = "DEPUTY DIR. (ACADEMICS)";
                else if (office === 'ROLE_DEPUTY_DIR_ADMIN') activeRoleTitle = "DEPUTY DIR. (ADMIN)";
                else if (office === 'ROLE_BURSAR') activeRoleTitle = "CENTRAL BURSAR";
            }
        });

        roleBadge.textContent = activeRoleTitle;
        roleBadge.className = "text-[8px] font-bold text-white bg-blue-600 px-2 py-0.5 rounded-full uppercase tracking-widest mb-2 shadow-sm";

        if (stData.staffType === 'NYSC' || stData.staffType === 'TP') {
            roleBadge.textContent = stData.staffType;
            validityText.textContent = `VALID TILL: ${stData.endDate || `${anchorYear + 1}`}`;
            validityText.className = "w-full bg-orange-600 text-white text-center py-1 rounded text-[6px] font-mono tracking-widest mt-auto";
        } else {
            validityText.textContent = `VALID TILL: ${anchorYear + 1}`;
            validityText.className = "w-full bg-slate-800 text-white text-center py-1 rounded text-[6px] font-mono tracking-widest mt-auto";
        }

        dynFields.innerHTML = `
            <div class="flex justify-between items-center text-[7px] font-bold uppercase"><span class="text-slate-500">STAFF ID:</span> <span class="text-gussNavy">${DOMPurify.sanitize(ent.id)}</span></div>
            <div class="flex justify-between items-center text-[7px] font-bold uppercase"><span class="text-slate-500">TRACK:</span> <span class="text-gussNavy">${DOMPurify.sanitize(stData.staffType)}</span></div>
            <div class="flex justify-between items-center text-[7px] font-bold uppercase"><span class="text-slate-500">DEPT:</span> <span class="text-gussNavy">FACULTY</span></div>
            <div class="flex justify-between items-center text-[7px] font-bold uppercase"><span class="text-slate-500">BLOOD GRP:</span> <span class="text-red-600">${DOMPurify.sanitize(stData.bloodGroup || 'O+')}</span></div>
        `;
    }
};

window.printIdCard = async function () {
    if (!activePrintEntity) {
        return Swal.fire('Action Required', 'Please select a staff or student from the Identity Roster first.', 'info');
    }

    if (activePrintEntity.id && activePrintEntity.id.startsWith("REQ-")) {
        return Swal.fire('Security Halt', 'Smart ID cards can only be generated for personnel who have been approved by a Deputy Director.', 'error');
    }

    const activeContext = SessionManager.getCurrentContextString();
    const safeId = encodeURIComponent(activePrintEntity.id);
    const url = activePrintEntity.type === 'STAFF'
        ? `/reports/staff-id?id=${safeId}&session=${encodeURIComponent(activeContext)}`
        : `/reports/student-id?admNo=${safeId}&session=${encodeURIComponent(activeContext)}`;

    const btn = window.event ? window.event.currentTarget : document.querySelector('button[onclick="window.printIdCard()"]');
    let ogText = "";
    if (btn) {
        ogText = btn.innerHTML;
        btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin mr-2"></i> Compiling ID Card...`;
        btn.disabled = true;
    }

    try {
        const blob = await secureBlobFetch(url, null, 'GET');
        if (blob) {
            const pdfBlob = new Blob([blob], { type: 'application/pdf' });
            const blobUrl = window.URL.createObjectURL(pdfBlob);

            const newTab = window.open(blobUrl, '_blank');
            if (!newTab) {
                const a = document.createElement('a');
                a.href = blobUrl;
                a.download = `${activePrintEntity.type}_ID_${activePrintEntity.id.replace(/\//g, '_')}.pdf`;
                document.body.appendChild(a);
                a.click();
                a.remove();
            }
        }
    } catch (error) {
        Swal.fire('Critical Error', 'Connection to PDF Report Engine failed.', 'error');
    } finally {
        if (btn) { btn.innerHTML = ogText; btn.disabled = false; }
    }
};

window.executeBulkPrint = async function () {
    if (printSpooler.size === 0) return;

    const modal = document.getElementById('batchPreviewModal');
    const iframe = document.getElementById('pdfPreviewFrame');
    const loadingState = document.getElementById('batchLoadingState');
    const btnConfirm = document.getElementById('btnConfirmBatch');
    const btnCancel = document.getElementById('btnCancelBatch');
    const subtitle = document.getElementById('batchPreviewSubtitle');

    iframe.src = "";
    iframe.classList.add('hidden');
    if (btnConfirm) btnConfirm.classList.add('hidden');
    if (btnCancel) btnCancel.classList.remove('hidden');
    loadingState.classList.remove('hidden');
    subtitle.textContent = `Compiling ${printSpooler.size} ID Cards...`;

    modal.classList.remove('hidden');
    modal.classList.add('flex');

    const activeContext = SessionManager.getCurrentContextString();
    const payload = Array.from(printSpooler);
    const endpoint = (activeIdFilter === 'STAFF' ? '/reports/bulk-staff-id' : '/reports/bulk-student-id') + `?session=${encodeURIComponent(activeContext)}`;

    try {
        const blob = await secureBlobFetch(endpoint, payload, 'POST');
        if (blob) {
            const pdfBlob = new Blob([blob], { type: 'application/pdf' });
            const blobUrl = window.URL.createObjectURL(pdfBlob);

            iframe.src = blobUrl;
            loadingState.classList.add('hidden');
            iframe.classList.remove('hidden');
            if (btnConfirm) btnConfirm.classList.remove('hidden');
            if (btnCancel) btnCancel.classList.remove('hidden');
            subtitle.textContent = "Jasper Document Compiled. Ready for A4 Output.";
        } else {
            window.closeBatchPreview();
            Swal.fire('Server Error', 'Failed to compile Jasper batch.', 'error');
        }
    } catch (error) {
        window.closeBatchPreview();
        Swal.fire('Critical Error', 'Connection to Jasper Engine failed.', 'error');
    }
};

window.closeBatchPreview = function () {
    const modal = document.getElementById('batchPreviewModal');
    modal.classList.add('hidden');
    modal.classList.remove('flex');
    document.getElementById('pdfPreviewFrame').src = "";
};

// ==========================================
// 7. SYSOPS & STATUTORY MODULES
// ==========================================
window.clearSystemCache = async function () {
    const res = await Swal.fire({
        title: 'Clear System Cache?',
        text: 'Clear browser cache and UI rendering states? (This will NOT delete records or databases).',
        icon: 'question',
        showCancelButton: true,
        confirmButtonColor: '#005A36',
        confirmButtonText: 'Yes, Clear Cache'
    });
    if (res.isConfirmed) {
        sessionStorage.clear();
        localStorage.clear();
        await Swal.fire('Cleared', 'Cache cleared successfully. The interface will refresh on next load.', 'success');
        window.location.reload();
    }
};

window.exportDatabase = function () {
    Swal.fire('Disabled', 'Export functionality has been disabled in Cloud-Only Mode to prevent local data spillage.', 'info');
};

window.nukeDatabase = function () {
    Swal.fire('Disabled', 'Database Wiping is disabled in Cloud-Only Mode. Please drop the tables directly in backend.', 'error');
};

window.initializeStatutoryPostings = async function () {
    const staffList = window.getStaffRegistrySafe();
    const select = document.getElementById('statIncomingSelect');
    if (!select) return;

    select.innerHTML = '<option value="" disabled selected>Select an approved staff member...</option>';

    staffList.filter(s => {
        const currentStatus = String(s.approvalStatus || s.status || '').toUpperCase().trim();
        return (currentStatus === 'APPROVED' || currentStatus === 'ACTIVATED') && !(s.name || s.fullName || '').toLowerCase().includes('root admin');
    }).forEach(staff => {
        select.innerHTML += `<option value="${staff.id}">${DOMPurify.sanitize(staff.name || staff.fullName)} (${staff.id})</option>`;
    });

    window.renderStatutoryBoard();
};

window.detectOutgoingExecutive = async function () {
    let rawRole = document.getElementById('statOfficeSelect').value;
    const panel = document.getElementById('outgoingOfficerPanel');
    const nameDisplay = document.getElementById('outgoingOfficerName');

    if (!rawRole) {
        panel.classList.add('hidden');
        return;
    }

    let roleKey = rawRole.toUpperCase().replace("GUSS_STATUTORY_", "");
    if (!roleKey.startsWith("ROLE_")) {
        roleKey = "ROLE_" + roleKey;
    }

    try {
        const board = window.parseVault('guss_statutory_board') || {};
        const currentExec = board[roleKey];

        if (currentExec && currentExec.staffId) {
            nameDisplay.textContent = `${currentExec.name} (${currentExec.staffId})`;
            panel.classList.remove('hidden');
        } else {
            nameDisplay.textContent = `VACANT / NO APPOINTEE`;
            panel.classList.remove('hidden');
        }
    } catch (e) { console.error("Failed to detect outgoing executive."); }
};

const statutoryForm = document.getElementById('statutoryPostingForm');
if (statutoryForm) {
    statutoryForm.addEventListener('submit', async function (e) {
        e.preventDefault();

        if (SessionManager.isHistoricalArchiveMode()) {
            return Swal.fire('Archive Lockout', 'Statutory handovers are strictly prohibited in historical view.', 'error');
        }

        let rawRole = document.getElementById('statOfficeSelect').value;
        let roleKey = rawRole.toUpperCase().replace("GUSS_STATUTORY_", "");
        if (!roleKey.startsWith("ROLE_")) roleKey = "ROLE_" + roleKey;

        const departureReason = document.getElementById('statDepartureReason').value;
        const incomingId = document.getElementById('statIncomingSelect').value;
        const isActing = document.getElementById('statActingToggle').checked;
        const refNo = document.getElementById('statMinistryRef').value;

        const authRes = await Swal.fire({
            title: 'Zero-Trust Authorization',
            html: `You are about to execute a statutory handover for <b>${roleKey.replace('ROLE_', '').replace('_', ' ')}</b>.<br><br>Enter Admin Password to execute:`,
            input: 'password',
            inputAttributes: { autocapitalize: 'off', autocorrect: 'off' },
            icon: 'warning',
            showCancelButton: true,
            confirmButtonColor: '#ef4444',
            confirmButtonText: 'Authorize Handover'
        });

        if (!authRes.isConfirmed || !authRes.value) return;

        const btn = this.querySelector('button[type="submit"]');
        const ogText = btn.innerHTML;
        btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin mr-2"></i> Transmitting...`;
        btn.disabled = true;

        try {
            const apiPayload = {
                roleKey: roleKey,
                departureReason: departureReason,
                incomingId: incomingId,
                isActing: isActing,
                refNo: refNo,
                adminPassword: authRes.value
            };

            const data = await ApiGateway.post('/ict/statutory/handover', apiPayload);
            if (data) {
                Swal.fire('Handover Successful', `Security clearance transferred.`, 'success');
                this.reset();
                document.getElementById('outgoingOfficerPanel').classList.add('hidden');
                await window.syncPostgresToLocal(true);
                window.renderStatutoryBoard();
                window.renderCredentialsTable();
            }
        } catch (error) {
            Swal.fire('Authorization Failed', error.message || "Invalid PIN or Backend Rejection.", 'error');
        } finally {
            btn.innerHTML = ogText;
            btn.disabled = false;
        }
    });
}

window.renderStatutoryBoard = async function () {
    const grid = document.getElementById('statutoryBoardGrid');
    if (!grid) return;

    const board = window.parseVault('guss_statutory_board') || {};
    const isHistorical = SessionManager.isHistoricalArchiveMode();

    grid.innerHTML = '';
    const officeNames = {
        "ROLE_DIRECTOR": "School Director (Principal)",
        "ROLE_DEPUTY_DIR_ACADEMICS": "Deputy Director (Academics)",
        "ROLE_DEPUTY_DIR_ADMIN": "Deputy Director (Admin)",
        "ROLE_BURSAR": "Central Bursar"
    };

    Object.keys(officeNames).forEach(roleKey => {
        const exec = board[roleKey];

        if (!exec || !exec.staffId) {
            grid.innerHTML += `
            <div class="bg-slate-50 border border-slate-200 rounded-2xl p-4 hover:border-gussNavy transition-colors shadow-sm flex flex-col">
                <div class="flex justify-between items-start mb-3 border-b border-slate-200 pb-3">
                    <h4 class="text-[10px] font-black text-slate-500 uppercase tracking-widest max-w-[70%]">${officeNames[roleKey]}</h4>
                    <i class="fa-solid fa-shield-halved text-slate-300"></i>
                </div>
                <div class="flex-1 flex flex-col">
                    <p class="text-sm font-black text-slate-400 uppercase mb-2 truncate">VACANT OFFICE</p>
                </div>
            </div>`;
            return;
        }

        let statusBadge = `<span class="bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-widest border border-emerald-200"><i class="fa-solid fa-circle-check mr-1"></i> Active Appointee</span>`;
        let actionBtn = ``;

        if (exec.isActing) {
            statusBadge = `<span class="bg-amber-100 text-amber-700 px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-widest border border-amber-300 animate-pulse"><i class="fa-solid fa-bolt mr-1"></i> Acting Capacity</span>`;

            if (exec.originalId) {
                actionBtn = isHistorical
                    ? `<span class="w-full mt-3 bg-slate-100 text-slate-400 border border-slate-200 py-2 rounded-lg text-[9px] font-black uppercase tracking-widest text-center block cursor-not-allowed"><i class="fa-solid fa-lock mr-1"></i> Reinstatement Locked (Archive)</span>`
                    : `<button onclick="window.reinstateSuspendedExecutive('${roleKey}', '${exec.originalId}')" class="w-full mt-3 bg-slate-100 hover:bg-emerald-50 text-emerald-600 border border-slate-200 hover:border-emerald-300 transition-colors py-2 rounded-lg text-[9px] font-black uppercase tracking-widest"><i class="fa-solid fa-rotate-left mr-1"></i> Reinstate Original Exec</button>`;
            }
        }

        grid.innerHTML += `
            <div class="bg-slate-50 border border-slate-200 rounded-2xl p-4 hover:border-gussNavy transition-colors shadow-sm flex flex-col">
                <div class="flex justify-between items-start mb-3 border-b border-slate-200 pb-3">
                    <h4 class="text-[10px] font-black text-slate-500 uppercase tracking-widest max-w-[70%]">${officeNames[roleKey]}</h4>
                    <i class="fa-solid fa-shield-halved text-slate-300"></i>
                </div>
                <div class="flex-1 flex flex-col">
                    <p class="text-sm font-black text-gussNavy uppercase mb-2 truncate" title="${DOMPurify.sanitize(exec.name)}">${DOMPurify.sanitize(exec.name)}</p>
                    <div class="flex items-center gap-2 mb-2">
                        <span class="text-[9px] font-mono text-slate-400 bg-white px-2 py-0.5 rounded border border-slate-200">${DOMPurify.sanitize(exec.staffId)}</span>
                    </div>
                    <div class="mt-auto">
                        ${statusBadge}
                    </div>
                </div>
                ${actionBtn}
            </div>
        `;
    });
};

window.reinstateSuspendedExecutive = async function (roleKey, originalId) {
    if (SessionManager.isHistoricalArchiveMode()) {
        return Swal.fire('Archive Lockout', 'Reinstating executives is strictly prohibited in historical view.', 'error');
    }

    const authRes = await Swal.fire({
        title: 'Zero-Trust Reinstatement',
        html: `Reinstate the originally suspended executive?<br>The current Acting executive will be reverted.<br><br>Enter Admin Password to execute:`,
        input: 'password',
        inputAttributes: { autocapitalize: 'off', autocorrect: 'off' },
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#005A36',
        confirmButtonText: 'Authorize Reinstatement'
    });

    if (!authRes.isConfirmed || !authRes.value) return;

    try {
        const apiPayload = {
            roleKey: roleKey,
            originalId: originalId,
            adminPassword: authRes.value
        };

        const data = await ApiGateway.post('/ict/statutory/reinstate', apiPayload);
        if (data) {
            Swal.fire('Reinstated', 'Reinstatement Protocol Successful. The original statutory executive has regained control.', 'success');
            await window.syncPostgresToLocal(true);
            window.renderStatutoryBoard();
            window.renderCredentialsTable();
        }
    } catch (err) {
        Swal.fire('Authorization Failed', err.message || 'Invalid PIN or Backend Rejection.', 'error');
    }
};

window.openAdminProfileModal = function () {
    const staffList = window.getStaffRegistrySafe();
    const me = staffList.find(s => s.id === currentIctAdminStaffId) || window.ROOT_ADMIN_PROFILE || { name: "ICT Administrator" };

    const nameNode = document.getElementById('adminNameInput');
    if (nameNode) nameNode.textContent = me ? (me.fullName || me.name) : "ICT Administrator";

    const preview = document.getElementById('modalAdminSigPreview');
    const placeholder = document.getElementById('modalAdminSigPlaceholder');

    if (me && me.signatureUrl) {
        preview.src = window.resolveMediaUrl(me.signatureUrl);
        preview.classList.remove('hidden');
        if (placeholder) placeholder.classList.add('hidden');
    } else {
        preview.src = '';
        preview.classList.add('hidden');
        if (placeholder) placeholder.classList.remove('hidden');
    }

    const modal = document.getElementById('adminProfileModal');
    if (modal) {
        modal.classList.remove('hidden');
        modal.classList.add('flex');
    }

    window.applyArchiveReadonlyState();
};

window.closeAdminProfileModal = function () {
    const modal = document.getElementById('adminProfileModal');
    if (modal) {
        modal.classList.add('hidden');
        modal.classList.remove('flex');
    }
};

window.processAdminSignaturePreview = function (inputNode) {
    if (inputNode.files && inputNode.files[0]) {
        const reader = new FileReader();
        reader.onload = function (e) {
            const img = new Image();
            img.onload = function () {
                const canvas = document.createElement('canvas');
                const MAX_WIDTH = 300; const MAX_HEIGHT = 120;
                let width = img.width; let height = img.height;

                if (width > height) { if (width > MAX_WIDTH) { height *= MAX_WIDTH / width; width = MAX_WIDTH; } }
                else { if (height > MAX_HEIGHT) { width *= MAX_HEIGHT / height; height = MAX_HEIGHT; } }

                canvas.width = width; canvas.height = height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);

                tempAdminSigBase64 = canvas.toDataURL('image/jpeg', 0.85);

                const preview = document.getElementById('modalAdminSigPreview');
                const placeholder = document.getElementById('modalAdminSigPlaceholder');
                if (preview && placeholder) {
                    preview.src = tempAdminSigBase64;
                    preview.classList.remove('hidden');
                    placeholder.classList.add('hidden');
                }
            };
            img.src = e.target.result;
        };
        reader.readAsDataURL(inputNode.files[0]);
    }
};

window.saveAdminProfile = async function () {
    if (SessionManager.isHistoricalArchiveMode()) {
        return Swal.fire('Archive Lockout', 'Updating administrator credentials is strictly prohibited in historical view.', 'error');
    }

    const newName = document.getElementById('adminNameInput').value.trim();
    if (!newName) return Swal.fire('Validation Error', 'Administrator name cannot be empty.', 'error');

    const staffList = window.getStaffRegistrySafe();
    let me = staffList.find(s => s.id === currentIctAdminStaffId) || window.ROOT_ADMIN_PROFILE;

    if (!me) return Swal.fire('Error', 'Could not locate your staff identity record in the Cloud Database.', 'error');

    const payloadData = {
        trackingRef: me.trackingRef || null,
        staffId: (me.id && me.id.startsWith("REQ-")) ? null : me.id,
        fullName: newName, phone: me.phone, personalEmail: me.personalEmail, residentialAddress: me.address,
        nokName: me.nokName, nokPhone: me.nokPhone, qualification: me.qual, staffType: me.staffType, bloodGroup: me.bloodGroup,
        officialEmail: me.email || null, endDate: me.endDate || null, approvalStatus: me.status || "APPROVED"
    };

    const formData = new FormData();
    formData.append("data", JSON.stringify(payloadData));

    if (tempAdminSigBase64 && tempAdminSigBase64.startsWith("data:image")) {
        formData.append("uploadSignature", window.base64ToBlob(tempAdminSigBase64), "signature.jpg");
    }

    try {
        const data = await ApiGateway.postFormData('/ict/staff/onboard', formData);
        if (data) {
            await window.syncPostgresToLocal(true);
            window.resolveIctAdminIdentity();
            Swal.fire('Profile Updated', "Success: ICT Administrator profile & digital signature stamp updated in the Cloud Vault.", 'success');
            if (typeof window.closeAdminProfileModal === 'function') window.closeAdminProfileModal();
        }
    } catch (error) {
        Swal.fire('Critical Error', error.message || "Connection to Cloud Vault failed.", 'error');
    }
};

window.generateMasterVaultKey = async function () {
    if (SessionManager.isHistoricalArchiveMode()) {
        return Swal.fire('Archive Lockout', 'Master Vault Keys can only be generated in LIVE operational mode.', 'error');
    }

    const res = await Swal.fire({
        title: 'CRITICAL SECURITY NOTICE',
        text: 'Generating a new Master Vault Key will permanently overwrite and invalidate any existing keys. Are you ready to initialize the Key Ceremony?',
        icon: 'warning', showCancelButton: true, confirmButtonColor: '#ef4444', confirmButtonText: 'Yes, Initialize Ceremony'
    });

    if (!res.isConfirmed) return;

    const btn = window.event ? window.event.currentTarget : null;
    let ogHtml = "";
    if (btn) { ogHtml = btn.innerHTML; btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin mr-1"></i> Generating PDF...`; btn.disabled = true; }

    try {
        const blob = await secureBlobFetch('/ict/vault/generate-key', { staffId: currentIctAdminStaffId });
        if (blob) {
            const pdfBlob = new Blob([blob], { type: 'application/pdf' });
            const blobUrl = window.URL.createObjectURL(pdfBlob);

            await Swal.fire('KEY GENERATED SUCCESSFULLY', "The system will now open the secure PDF document. Print this immediately and store it in the Director's physical safe.", 'success');
            window.open(blobUrl, '_blank');
        }
    } catch (err) {
        Swal.fire('Critical Error', "Failed to reach the Central Vault.", 'error');
    } finally {
        if (btn) { btn.innerHTML = ogHtml; btn.disabled = false; }
    }
};