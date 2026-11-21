// ==========================================
// ADMISSIONS OFFICER TERMINAL - MODULAR CONTROLLER
// ==========================================
import { ENV } from './core_config.js';
import { ApiGateway } from './api_gateway.js';
import { SessionManager } from './session_manager.js';
import { CoreUI } from './core_ui.js';

window.resolveMediaUrl = function (url) {
    if (!url) return '';
    if (url.startsWith('http') || url.startsWith('data:')) return url;
    if (url.startsWith('/uploads')) return ENV.API_BASE_URL + url;
    return url;
};

//  ENTERPRISE DEFENSIVE SORTING ENGINE
window.alphaSort = function (arr) {
    if (!Array.isArray(arr)) return [];
    return [...arr].sort((a, b) => String(a || '').localeCompare(String(b || ''), undefined, { numeric: true, sensitivity: 'base' }));
};

let DB_CLASSES = [];
let DB_HOSTELS = [];

let searchTimeout;
let pendingDB = [];
let activeViewingNIN = null;
let currentOmniSearchQuery = "";
let currentTribunalTarget = null;
let letterSpooler = new Set();
let activeViewingApp = null;
let cachedSignatureBase64 = "";

let currentTriagePage = 0;
let currentRegistryPage = 0;
const ROWS_PER_PAGE = 50;

let activeOfficerId = sessionStorage.getItem('guss_staff_id');
let activeOfficerProfile = {};

let RAM_VAULT = {};
let RAM_STUDENT_REGISTRY = [];

window.parseVault = function (key) {
    const cloudConfigs = Object.keys(RAM_VAULT).length > 0 ? RAM_VAULT : (JSON.parse(sessionStorage.getItem('cloud_configs')) || {});

    let actualKey = key;
    if (key === 'cloud_statutory_board') actualKey = 'guss_statutory_board';
    if (key === 'cloud_delegations') actualKey = 'guss_delegations';

    let data = cloudConfigs[actualKey];
    if (!data) return null;

    try {
        let parsed = JSON.parse(data);
        if (typeof parsed === 'string') parsed = JSON.parse(parsed);
        return parsed;
    } catch (e) { return null; }
};

function getStudentRegistrySafe() {
    if (Array.isArray(RAM_STUDENT_REGISTRY) && RAM_STUDENT_REGISTRY.length > 0) {
        return RAM_STUDENT_REGISTRY;
    }
    return [];
}

// ==========================================
// CENTRALIZED INITIALIZATION
// ==========================================
window.onload = async function () {
    // 1. Boot Global UI & Enterprise Telemetry
    CoreUI.init();

    // 2. Boot Time Machine Epoch Context
    await SessionManager.initHeaderDropdown();

    // 3. Load Portal Data
    await syncConfigFromCloud();
    await window.fetchRelationalInfrastructure();
    resolveOfficerIdentity();
    loadGlobalConfig();
    fetchLiveApplications();
    setupOmniSearchListener();
    initRegistryFilters();
    startDeadlineWatchdog();
    populateDynamicExportScopes();
    window.populateTribunalReasons();
};

window.addEventListener('gussTimeMachineChanged', () => {
    currentTriagePage = 0;
    currentRegistryPage = 0;
    fetchLiveApplications();
});

function resolveOfficerIdentity() {
    activeOfficerProfile.name = sessionStorage.getItem('guss_user_name') || "Admissions Officer";
    activeOfficerProfile.signatureUrl = sessionStorage.getItem('guss_signature_url') || "";
    activeOfficerProfile.id = activeOfficerId;

    const nameDisplay = document.getElementById('activeOfficerNameDisplay');
    if (nameDisplay) nameDisplay.textContent = DOMPurify.sanitize(activeOfficerProfile.name);
}

async function syncConfigFromCloud() {
    try {
        const [configs, stdDb] = await Promise.all([
            ApiGateway.get('/config/all').catch(() => null),
            ApiGateway.get('/bridge/all-lightweight?includeQuarantined=true').catch(() => null)
        ]);

        if (configs) {
            RAM_VAULT = configs;
            if (configs['guss_active_intake_session']) {
                sessionStorage.setItem('guss_active_intake_session', configs['guss_active_intake_session']);
            }
            const lightConfigs = {};
            Object.keys(configs).forEach(k => {
                if (!k.startsWith('guss_grades_') && !k.startsWith('guss_eval_') && !k.startsWith('guss_gallery_') && !k.startsWith('guss_archive_') && k !== 'rinoba_users_db') {
                    lightConfigs[k] = configs[k];
                }
            });
            try {
                sessionStorage.setItem('cloud_configs', JSON.stringify(lightConfigs));
            } catch (e) { }
        }

        if (stdDb && Array.isArray(stdDb)) {
            RAM_STUDENT_REGISTRY = stdDb;
            window.populateDynamicStates();
        }
    } catch (e) {
        console.error("Failed to sync cloud configurations:", e);
    }
}

async function refreshLightweightRegistry() {
    try {
        const res = await ApiGateway.get('/bridge/all-lightweight?includeQuarantined=true');
        if (res && Array.isArray(res)) {
            RAM_STUDENT_REGISTRY = res;
            updatePopulationMatrix();
            window.populateDynamicStates();
        }
    } catch (e) {
        console.error("Failed to refresh RAM registry");
    }
}

// ==========================================
// DATA FETCHING & PAGINATION
// ==========================================
async function fetchLiveApplications() {
    updateDashboardStats();
    fetchTriagePage(0);
    fetchRegistryPage(0);
}

async function updateDashboardStats() {
    try {
        const activeSession = sessionStorage.getItem('guss_selected_session') || 'ALL';
        const stats = await ApiGateway.get(`/admin/dashboard-stats?session=${encodeURIComponent(activeSession)}`);
        if (stats) {
            document.getElementById('stat-total').textContent = stats.total;
            document.getElementById('stat-pending').textContent = stats.pending;
            const totalPublishable = (stats.pooled || 0) + (stats.provisional || 0);
            if (document.getElementById('stat-pooled')) document.getElementById('stat-pooled').textContent = totalPublishable;
            document.getElementById('stat-admitted').textContent = stats.admitted;
            document.getElementById('stat-rejected').textContent = stats.rejected;

            const oldWarning = document.getElementById('prov-warning');
            if (oldWarning) oldWarning.remove();

            if (stats.provisional && stats.provisional > 0) {
                const pendingCard = document.getElementById('stat-pending').closest('.bg-amber-50');
                if (pendingCard) {
                    pendingCard.innerHTML += `<div id="prov-warning" onclick="event.stopPropagation(); window.openRegistryFilter('PROVISIONALLY_POOLED');" class="cursor-pointer w-full text-center mt-3 bg-red-100 text-red-700 text-[9px] font-black uppercase p-1 rounded animate-pulse border border-red-300 hover:bg-red-200 transition-colors">${stats.provisional} Deficient Files Pooled!</div>`;
                }
            }
            document.getElementById('pop-total-headcount').textContent = stats.admitted;
            if (typeof updatePopulationMatrix === 'function') updatePopulationMatrix();
        }
    } catch (e) { console.error("Stats Error:", e); }
}

async function fetchTriagePage(page = 0) {
    const activeSession = sessionStorage.getItem('guss_selected_session') || 'ALL';
    try {
        const data = await ApiGateway.get(`/admin/applications?page=${page}&size=${ROWS_PER_PAGE}&filter=AWAITING_VERIFICATION&session=${encodeURIComponent(activeSession)}`);
        if (data) {
            currentTriagePage = data.currentPage;
            pendingDB = data.content;
            renderTriageTable(data.content);
            buildPaginationUI(data.totalElements, data.totalPages, currentTriagePage, 'triage');
        }
    } catch (e) { console.error(e); }
}

async function fetchRegistryPage(page = 0) {
    const filterEl = document.getElementById('registryFilterSelect');
    const stateEl = document.getElementById('registryStateFilter');
    const sessionFilterEl = document.getElementById('registrySessionFilter');
    const clearanceEl = document.getElementById('registryClearanceFilter');

    const filter = filterEl ? filterEl.value : 'ALL';
    const stateFilter = stateEl ? stateEl.value : 'ALL';
    const clearanceFilter = clearanceEl ? clearanceEl.value : 'ALL';

    const chosenDropdownSession = (sessionFilterEl && sessionFilterEl.value) ? sessionFilterEl.value : null;
    const rawSession = chosenDropdownSession || sessionStorage.getItem('guss_selected_session') || 'ALL';
    const activeSession = rawSession === 'ALL' ? 'ALL' : rawSession.split(' ')[0];

    let safeFilter = filter.replace(/\s+/g, '_').toUpperCase();
    let endpoint = `/admin/applications?page=${page}&size=${ROWS_PER_PAGE}&filter=${encodeURIComponent(safeFilter)}&state=${encodeURIComponent(stateFilter)}&session=${encodeURIComponent(activeSession)}&clearance=${encodeURIComponent(clearanceFilter)}`;

    if (currentOmniSearchQuery !== "") {
        endpoint += `&search=${encodeURIComponent(currentOmniSearchQuery)}`;
    }

    const tbody = document.getElementById('registryTableBody');
    if (tbody) tbody.innerHTML = `<tr><td colspan="5" class="py-12 text-center text-slate-400 font-bold text-xs"><i class="fa-solid fa-circle-notch fa-spin text-3xl mb-3 block text-gussNavy"></i> Querying Central Database...</td></tr>`;

    try {
        const data = await ApiGateway.get(endpoint);
        if (data) {
            currentRegistryPage = data.currentPage;
            pendingDB = data.content;
            renderMasterRegistry(data.content);
            buildPaginationUI(data.totalElements, data.totalPages, currentRegistryPage, 'registry');
        } else {
            if (tbody) tbody.innerHTML = `<tr><td colspan="5" class="p-10 text-center text-red-400 font-bold">Failed to load registry data.</td></tr>`;
        }
    } catch (e) {
        if (tbody) tbody.innerHTML = `<tr><td colspan="5" class="p-10 text-center text-red-400 font-bold">Network Error.</td></tr>`;
    }
}

window.changePage = function (tableContext, direction) {
    if (tableContext === 'triage') fetchTriagePage(currentTriagePage + direction);
    else if (tableContext === 'registry') fetchRegistryPage(currentRegistryPage + direction);
};

function buildPaginationUI(totalItems, totalPages, currentPageIndex, tableContext) {
    const container = document.getElementById(`${tableContext}PaginationControls`);
    if (!container) return;

    if (totalPages <= 1) {
        container.innerHTML = '';
        return;
    }

    const currentPage = currentPageIndex + 1;
    const startItem = (currentPageIndex * ROWS_PER_PAGE) + 1;
    const endItem = Math.min(currentPage * ROWS_PER_PAGE, totalItems);

    container.innerHTML = `
        <div class="flex flex-col sm:flex-row justify-between items-center gap-4 py-4 px-6 border-t border-slate-200 bg-slate-50 rounded-b-3xl">
            <span class="text-xs font-bold text-slate-500 uppercase tracking-widest">
                Showing ${startItem} to ${endItem} of ${totalItems}
            </span>
            <div class="flex gap-2">
                <button onclick="window.changePage('${tableContext}', -1)" ${currentPage === 1 ? 'disabled' : ''} 
                    class="px-4 py-2 text-xs font-black uppercase tracking-widest rounded-lg border border-slate-300 ${currentPage === 1 ? 'bg-slate-100 text-slate-400 cursor-not-allowed' : 'bg-white text-gussNavy hover:bg-slate-100 transition-colors shadow-sm'}">
                    <i class="fa-solid fa-chevron-left mr-1"></i> Prev
                </button>
                <div class="flex items-center justify-center px-4 font-bold text-slate-700 text-xs bg-white border border-slate-200 rounded-lg shadow-inner">
                    Page ${currentPage} / ${totalPages}
                </div>
                <button onclick="window.changePage('${tableContext}', 1)" ${currentPage === totalPages ? 'disabled' : ''} 
                    class="px-4 py-2 text-xs font-black uppercase tracking-widest rounded-lg border border-slate-300 ${currentPage === totalPages ? 'bg-slate-100 text-slate-400 cursor-not-allowed' : 'bg-white text-gussNavy hover:bg-slate-100 transition-colors shadow-sm'}">
                    Next <i class="fa-solid fa-chevron-right ml-1"></i>
                </button>
            </div>
        </div>
    `;
}

window.fetchRelationalInfrastructure = async function () {
    try {
        const [clsRes, hostelRes] = await Promise.all([
            ApiGateway.get('/dd/academics/classes').catch(() => []),
            ApiGateway.get('/dd/admin/hostels').catch(() => [])
        ]);

        //  ENTERPRISE DEFENSIVE GUARD: Ensure they are always valid arrays
        DB_CLASSES = Array.isArray(clsRes) ? clsRes : [];
        DB_HOSTELS = Array.isArray(hostelRes) ? hostelRes : [];

        window.populateHostels();
        window.populateCalculatorDropdowns();
    } catch (e) {
        console.error("Failed to load relational infrastructure:", e);
    }
};

window.populateHostels = function () {
    const select = document.getElementById('alloc-hostel');
    if (!select) return;
    let html = '<option value="">Select Accommodation Block...</option>';

    if (!Array.isArray(DB_HOSTELS) || DB_HOSTELS.length === 0) {
        select.innerHTML = html;
        return;
    }

    //  DEFENSIVE COPY & SORT
    const sortedHostels = [...DB_HOSTELS].sort((a, b) => (a.hostelName || '').localeCompare(b.hostelName || ''));

    sortedHostels.forEach(h => {
        if (h && h.hostelName) {
            const safeName = DOMPurify.sanitize(h.hostelName);
            html += `<option value="${safeName}">${safeName}</option>`;
        }
    });

    select.innerHTML = html;
};


window.populateDynamicStates = function () {
    const stateSelect = document.getElementById('registryStateFilter');
    const sessionSelect = document.getElementById('registrySessionFilter');
    const registry = getStudentRegistrySafe();

    const states = new Set();
    const sessions = new Set();

    registry.forEach(s => {
        const stateVal = s.state || s.stateOfOrigin;
        if (stateVal && stateVal.trim() !== '') states.add(stateVal.trim().toUpperCase());
        const sessionVal = s.sessionApplied || s.academicSession || s.session;
        if (sessionVal && sessionVal.trim() !== '') sessions.add(sessionVal.trim().toUpperCase());
    });

    const liveSession = (sessionStorage.getItem('guss_live_session') || "2026/2027").split(' ')[0].trim();
    const startYear = parseInt(liveSession.substring(0, 4)) || new Date().getFullYear();
    const currentSession = liveSession;
    const nextSession = `${startYear + 1}/${startYear + 2}`;

    sessions.add(currentSession);
    sessions.add(nextSession);

    if (stateSelect) {
        const sortedStates = Array.from(states).sort();
        let stateHtml = '<option value="ALL">ALL STATES</option>';
        sortedStates.forEach(st => { stateHtml += `<option value="${DOMPurify.sanitize(st)}">${DOMPurify.sanitize(st)}</option>`; });
        const currentStateVal = stateSelect.value;
        stateSelect.innerHTML = stateHtml;
        if (sortedStates.includes(currentStateVal)) stateSelect.value = currentStateVal;
    }

    if (sessionSelect) {
        const sortedSessions = Array.from(sessions).sort().reverse();
        let sessionHtml = '<option value="ALL">ALL SESSIONS</option>';
        sortedSessions.forEach(sess => {
            sessionHtml += `<option value="${DOMPurify.sanitize(sess)}">${DOMPurify.sanitize(sess)}</option>`;
        });
        const currentSessVal = sessionSelect.value;
        sessionSelect.innerHTML = sessionHtml;
        if (sortedSessions.includes(currentSessVal)) sessionSelect.value = currentSessVal;
        window.updateSessionBadge(sessionSelect.value);
    }
};

window.executeSessionFilter = function (selectedValue) {
    window.updateSessionBadge(selectedValue);
    currentRegistryPage = 0;
    fetchRegistryPage(0);
};

window.updateSessionBadge = function (selectedSession) {
    const badge = document.getElementById('sessionFilterStatusBadge');
    if (!badge) return;

    if (!selectedSession || selectedSession === 'ALL') {
        badge.classList.add('hidden');
        return;
    }

    const epoch = RAM_VAULT['current_epoch'] || {};
    const activeLabel = epoch.label || "2027/2028 SESSION | 1ST TERM";
    const currentSession = activeLabel.split(' | ')[0].trim().toUpperCase();
    const startYear = parseInt(currentSession.substring(0, 4)) || new Date().getFullYear();
    const nextSession = `${startYear + 1}/${startYear + 2} SESSION`.toUpperCase();

    badge.classList.remove('hidden');

    if (selectedSession.toUpperCase() === nextSession) {
        badge.className = "text-[9px] font-black uppercase px-2.5 py-1.5 rounded-lg tracking-widest whitespace-nowrap shadow-sm border bg-blue-50 text-blue-700 border-blue-200 animate-pulse";
        badge.innerHTML = `<i class="fa-solid fa-sparkles mr-1"></i> Upcoming Intake`;
    } else if (selectedSession.toUpperCase() === currentSession) {
        badge.className = "text-[9px] font-black uppercase px-2.5 py-1.5 rounded-lg tracking-widest whitespace-nowrap shadow-sm border bg-emerald-50 text-emerald-700 border-emerald-200";
        badge.innerHTML = `<i class="fa-solid fa-circle-check mr-1"></i> Active Intake`;
    } else {
        badge.className = "text-[9px] font-black uppercase px-2.5 py-1.5 rounded-lg tracking-widest whitespace-nowrap shadow-sm border bg-slate-100 text-slate-600 border-slate-300";
        badge.innerHTML = `<i class="fa-solid fa-lock mr-1"></i> Archived (Read Only)`;
    }
};

window.populateCalculatorDropdowns = function () {
    const levelSelect = document.getElementById('calc-level');
    if (!levelSelect) return;

    if (!Array.isArray(DB_CLASSES) || DB_CLASSES.length === 0) {
        levelSelect.innerHTML = '<option value="ALL">Entire School (No Classes)</option>';
        return;
    }

    const uniqueLevels = window.alphaSort([...new Set(DB_CLASSES.map(c => c.level).filter(Boolean))]);
    let levelHtml = '<option value="ALL">Entire School</option>';
    uniqueLevels.forEach(l => {
        levelHtml += `<option value="${DOMPurify.sanitize(l)}">${DOMPurify.sanitize(l)} (All Arms)</option>`;
    });
    levelSelect.innerHTML = levelHtml;

    levelSelect.onchange = function () {
        window.populateCalculatorArms(this.value);
    };

    window.populateCalculatorArms('ALL');
};

window.populateCalculatorArms = function (levelVal) {
    const armSelect = document.getElementById('calc-arm');
    if (!armSelect) return;

    let armsToRender = [];
    if (levelVal === 'ALL') {
        armsToRender = [...new Set(DB_CLASSES.map(c => c.arm))];
    } else {
        armsToRender = DB_CLASSES.filter(c => c.level === levelVal).map(c => c.arm);
    }

    const uniqueArms = window.alphaSort([...new Set(armsToRender)]);
    let armHtml = '<option value="ALL">All Arms</option>';
    uniqueArms.forEach(a => {
        armHtml += `<option value="${DOMPurify.sanitize(a)}">Arm ${DOMPurify.sanitize(a)}</option>`;
    });
    armSelect.innerHTML = armHtml;
};

window.populateTribunalReasons = function () {
    const select = document.getElementById('tribunalReason');
    if (!select) return;

    const rawReasons = window.parseVault('guss_tribunal_reasons') ||
        "Disciplinary Expulsion,Forged Credentials Detected,Financial Default / Non-Payment,Court Order / Legal Mandate,Medical Quarantine";

    const reasonsArr = rawReasons.split(',').map(r => r.trim());
    let html = '';
    reasonsArr.forEach(r => {
        html += `<option value="${DOMPurify.sanitize(r)}">${DOMPurify.sanitize(r)}</option>`;
    });
    select.innerHTML = html;
};

function renderTriageTable(listData = pendingDB) {
    const tbody = document.getElementById('triageTableBody');
    if (!tbody) return;

    if (listData.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" class="p-8 text-center text-slate-400 font-bold"><i class="fa-solid fa-inbox text-3xl mb-2 block text-slate-300"></i> No pending applications.</td></tr>`;
        return;
    }

    let htmlBuffer = '';
    listData.forEach(app => {
        let pathway = DOMPurify.sanitize(app.pathway || app.trackMode || app.entryPathway || 'Standard Intake');
        let badgeColor = pathway === 'Standard Intake' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800';
        let target = DOMPurify.sanitize(app.targetClass || app.targetLevel || 'Undefined');
        let mode = DOMPurify.sanitize(app.mode || app.modeOfEntry || 'Fresh Intake');
        let safeName = DOMPurify.sanitize(app.name || app.fullName || 'Unknown Applicant');
        let safePhoto = window.resolveMediaUrl(DOMPurify.sanitize(app.photoUrl || app.uploadPassport || app.passportUrl || `https://ui-avatars.com/api/?name=${safeName}`));
        let safeNin = DOMPurify.sanitize(app.nin || '');

        htmlBuffer += `
            <tr class="hover:bg-slate-50/50 transition-colors group border-b border-slate-100">
                <td class="p-5 flex items-center gap-4">
                    <div class="w-10 h-10 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center font-black shrink-0 shadow-sm border border-emerald-200">
                        <img loading="lazy" src="${safePhoto}" class="w-10 h-10 rounded-lg object-cover border border-slate-200 shrink-0">
                    </div>
                    <div><p class="font-black text-gussNavy uppercase tracking-wide whitespace-nowrap">${safeName}</p><p class="text-[10px] text-slate-400 font-mono mt-0.5">${safeNin}</p></div>
                </td>
                <td class="p-5"><p class="font-black text-slate-700">${target}</p></td>
                <td class="p-5"><span class="${badgeColor} px-2.5 py-1 rounded text-[9px] font-black uppercase tracking-wider whitespace-nowrap">${pathway}</span></td>
                <td class="p-5"><span class="bg-slate-800 text-white font-mono tracking-widest px-2.5 py-1 rounded text-[9px] font-black whitespace-nowrap">${mode}</span></td>
                <td class="p-5 text-right"><button onclick="window.openScreeningModal('${safeNin}')" class="bg-gussGreen text-white px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest hover:bg-emerald-800 shadow-sm transition-all opacity-90 group-hover:opacity-100"><i class="fa-solid fa-scale-balanced mr-1"></i> Screen</button></td>
            </tr>
        `;
    });
    tbody.innerHTML = htmlBuffer;
}

window.renderMasterRegistry = function (listData = pendingDB) {
    const tbody = document.getElementById('registryTableBody');
    if (!tbody) return;

    let list = listData;

    if (list.length === 0) {
        const filterEl = document.getElementById('registryFilterSelect');
        const stateEl = document.getElementById('registryStateFilter');
        const isFiltered = (filterEl && filterEl.value !== 'ALL') || (stateEl && stateEl.value !== 'ALL') || currentOmniSearchQuery !== "";
        let clearBtnHtml = isFiltered ? `<button onclick="window.clearRegistryFilters()" class="mt-4 bg-white border border-slate-300 text-slate-600 px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest hover:bg-slate-50 transition-colors shadow-sm"><i class="fa-solid fa-filter-circle-xmark mr-1"></i> Clear Active Filters</button>` : '';
        tbody.innerHTML = `<tr><td colspan="5" class="p-12 text-center text-slate-400 font-bold"><i class="fa-solid fa-folder-open text-4xl mb-4 block text-slate-300"></i> No records found matching the current criteria.<br>${clearBtnHtml}</td></tr>`;
        return;
    }

    let htmlBuffer = '';
    list.forEach(app => {
        let safeName = DOMPurify.sanitize(app.name || app.fullName || 'Unknown Applicant');
        let safeNin = DOMPurify.sanitize(app.nin || '');
        let safeState = DOMPurify.sanitize(app.state || 'N/A');
        let target = DOMPurify.sanitize(app.targetClass || app.targetLevel || 'Undefined');
        let safeAdmNo = DOMPurify.sanitize(app.admNo || 'GUSSR/PENDING');
        let safeAssignedClass = DOMPurify.sanitize(app.assignedClass || 'Class Pending');
        let safeAssignedHostel = DOMPurify.sanitize(app.assignedHostel || 'Hostel Pending');

        let rawNotes = app.officerNotes || 'Unspecified';
        try { let parsed = JSON.parse(rawNotes); rawNotes = parsed.msg || rawNotes; } catch (e) { }
        let safeNotes = 'Unspecified';
        let safePhoto = window.resolveMediaUrl(DOMPurify.sanitize(app.photoUrl || app.uploadPassport || app.passportUrl || `https://ui-avatars.com/api/?name=${safeName}`));

        if (rawNotes.includes('Reason:')) {
            const parts = rawNotes.split('Reason:');
            safeNotes = parts[parts.length - 1].split('|')[0].split('[')[0].trim();
        } else {
            try {
                let parsed = JSON.parse(rawNotes);
                safeNotes = parsed.msg || rawNotes;
            } catch (e) {
                safeNotes = rawNotes.replace(/\{.*?\}/g, '').trim() || rawNotes;
            }
        }
        safeNotes = DOMPurify.sanitize(safeNotes);

        let statusBadge = '';
        let notes = '-';
        let checkboxHtml = '';

        if (app.status === 'ADMITTED') {
            statusBadge = `<span class="bg-emerald-100 text-emerald-800 px-2.5 py-1 rounded text-[9px] font-black uppercase tracking-wider"><i class="fa-solid fa-check mr-1"></i> Admitted</span>`;
            notes = `<span class="text-xs font-mono font-bold text-emerald-700 block">${safeAdmNo}</span><span class="text-[9px] text-slate-500 uppercase tracking-widest mt-0.5 block">${safeAssignedClass} | ${safeAssignedHostel}</span>`;
            const isChecked = letterSpooler.has(app.admNo) ? 'checked' : '';
            checkboxHtml = `<input type="checkbox" onchange="window.toggleLetterSpooler('${app.admNo}')" ${isChecked} class="w-4 h-4 text-emerald-600 bg-slate-100 border-slate-300 rounded focus:ring-emerald-500 cursor-pointer mr-3 shrink-0 shadow-sm">`;
        } else if (app.status === 'REVOKED_QUARANTINED') {
            statusBadge = `<span class="bg-red-950 text-red-300 border border-red-800 px-2.5 py-1 rounded text-[9px] font-black uppercase tracking-wider"><i class="fa-solid fa-skull mr-1"></i> Quarantined</span>`;
            notes = `<span class="text-xs font-bold text-red-700 block max-w-xs leading-relaxed"><i class="fa-solid fa-gavel mr-1"></i> Order: ${safeNotes}</span>`;
        } else if (app.status === 'POOLED') {
            statusBadge = `<span class="bg-indigo-100 text-indigo-800 px-2.5 py-1 rounded text-[9px] font-black uppercase tracking-wider"><i class="fa-solid fa-layer-group mr-1"></i> Pooled</span>`;
            notes = `<span class="text-xs font-mono font-bold text-indigo-700 block">${safeAdmNo}</span><span class="text-[9px] text-slate-500 uppercase tracking-widest mt-0.5 block">Waiting for Batch Publish</span>`;
        } else if (app.status === 'REJECTED') {
            statusBadge = `<span class="bg-red-100 text-red-800 px-2.5 py-1 rounded text-[9px] font-black uppercase tracking-wider"><i class="fa-solid fa-ban mr-1"></i> Rejected</span>`;
            notes = `<span class="text-xs font-semibold text-red-600 block line-clamp-2 max-w-xs" title="${safeNotes}">Reason: ${safeNotes}</span>`;
        } else if (app.status === 'RETURNED_FOR_CORRECTION') {
            statusBadge = `<span class="bg-amber-100 text-amber-800 px-2.5 py-1 rounded text-[9px] font-black uppercase tracking-wider"><i class="fa-solid fa-rotate-left mr-1"></i> Returned</span>`;
            notes = `<span class="text-xs font-semibold text-amber-700 block line-clamp-2 max-w-xs" title="${safeNotes}"> ${safeNotes}</span>`;
        } else {
            statusBadge = `<span class="bg-amber-50 text-amber-600 px-2.5 py-1 rounded text-[9px] font-black uppercase tracking-wider border border-amber-200">Pending Eval</span>`;
            notes = `<span class="text-xs text-slate-400 italic">Awaiting Officer Review</span>`;
        }

        let clearanceHtml = '-';
        if (app.status === 'ADMITTED') {
            const isCleared = app.physicalClearanceStatus === 'CLEARED';
            //  Check if we are in historical archive mode
            const currentSelected = sessionStorage.getItem('guss_selected_session');
            const liveSession = sessionStorage.getItem('guss_live_session') || "";
            const isHistorical = currentSelected && !liveSession.includes(currentSelected.split(' ')[0]);

            clearanceHtml = `
                <label class="relative inline-flex items-center ${isHistorical ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}" title="${isHistorical ? 'Locked in Archive Mode' : 'Toggle Physical Clearance'}">
                    <input type="checkbox" class="sr-only peer" onchange="window.togglePhysicalClearance('${safeNin}', this.checked, this)" ${isCleared ? 'checked' : ''} ${isHistorical ? 'disabled' : ''}>
                    <div class="w-9 h-5 bg-slate-300 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-emerald-500"></div>
                </label>
                <span class="block text-[8px] font-black uppercase tracking-widest mt-1 ${isCleared ? 'text-emerald-600' : 'text-slate-400'}">${isCleared ? 'CLEARED' : 'PENDING'}</span>
            `;
        }

        htmlBuffer += `
            <tr class="hover:bg-slate-50/50 transition-colors border-b border-slate-100">
                <td class="p-5 flex items-center">
                    ${checkboxHtml}
                    <img loading="lazy" src="${safePhoto}" class="w-10 h-10 rounded-lg object-cover border border-slate-200 shrink-0 mr-4">
                    <div>
                        <p class="font-black text-gussNavy uppercase tracking-wide text-xs whitespace-nowrap">${safeName}</p>
                        <p class="text-[9px] text-slate-400 font-mono mt-0.5">NIN: ${safeNin} <span class="font-black text-blue-500">| STATE: ${safeState.toUpperCase()}</span></p>
                    </div>
                </td>
                <td class="p-5 font-black text-slate-700 text-xs">${target}</td>
                <td class="p-5">${statusBadge}</td>
                <td class="p-5 text-center">${clearanceHtml}</td>
                <td class="p-5">${notes}</td>
                <td class="p-5 text-right"><button onclick="window.openScreeningModal('${safeNin}')" class="bg-slate-800 text-white px-3.5 py-2 rounded-lg text-[9px] font-black uppercase tracking-widest hover:bg-slate-700 shadow-sm transition-all whitespace-nowrap"><i class="fa-solid fa-folder-open mr-1"></i> Review</button></td>
            </tr>
        `;
    });
    tbody.innerHTML = htmlBuffer;
    window.updateLetterSpoolerUI();
};

window.togglePhysicalClearance = async function (nin, isCleared, checkboxElement) {
    const status = isCleared ? 'CLEARED' : 'PENDING';
    const actionText = isCleared ? "MARK AS CLEARED" : "REVOKE CLEARANCE";

    const confirmRes = await Swal.fire({
        title: 'Confirm Action',
        text: `Are you sure you want to ${actionText} for this student?`,
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: isCleared ? '#10b981' : '#ef4444',
        confirmButtonText: 'Yes, Proceed'
    });

    if (!confirmRes.isConfirmed) {
        checkboxElement.checked = !isCleared;
        return;
    }

    try {
        const payload = { nin: nin, status: 'ADMITTED', physicalClearanceStatus: status };
        const response = await ApiGateway.post('/admin/evaluate', payload);

        if (response) {
            const app = pendingDB.find(a => a.nin === nin);
            if (app) app.physicalClearanceStatus = status;

            Swal.fire({ toast: true, position: 'top-end', icon: 'success', title: `Physical Clearance: ${status}`, showConfirmButton: false, timer: 2000 });
            renderMasterRegistry();
        } else {
            throw new Error("Failed to update");
        }
    } catch (error) {
        checkboxElement.checked = !isCleared;
        Swal.fire('Error', error.message || 'Failed to update physical clearance status.', 'error');
    }
};

window.toggleLetterSpooler = function (admNo) {
    if (letterSpooler.has(admNo)) letterSpooler.delete(admNo);
    else letterSpooler.add(admNo);
    window.updateLetterSpoolerUI();
};

window.updateLetterSpoolerUI = function () {
    const count = letterSpooler.size;
    const badge = document.getElementById('letterSpoolerCountBadge');
    const btn = document.getElementById('btnExecuteBulkLetters');
    if (!badge || !btn) return;

    if (count > 0) {
        badge.textContent = `${count} Selected`;
        badge.classList.remove('hidden');
        btn.innerHTML = `<i class="fa-solid fa-print"></i> Generate Letters (${count})`;
        btn.disabled = false;
        btn.className = "bg-gussGreen hover:bg-emerald-800 text-white text-[9px] font-black px-4 py-2 rounded-lg uppercase tracking-widest shadow-sm transition-all ml-auto lg:ml-0 flex items-center gap-1.5";
    } else {
        badge.classList.add('hidden');
        btn.innerHTML = "Generate Batch PDF (0)";
        btn.disabled = true;
        btn.className = "bg-slate-300 text-slate-500 hover:bg-slate-400 text-[9px] font-black px-4 py-2 rounded-lg uppercase tracking-widest shadow-sm transition-all ml-auto lg:ml-0 cursor-not-allowed";
    }
};

window.closeBatchPreview = function () {
    const modal = document.getElementById('batchPreviewModal');
    modal.classList.add('hidden');
    modal.classList.remove('flex');
    document.getElementById('pdfPreviewFrame').src = "";
};

window.openRegistryFilter = function (statusFilter) {
    window.switchTab('registry');
    if (document.getElementById('registryFilterSelect')) document.getElementById('registryFilterSelect').value = statusFilter;
    fetchRegistryPage(0);
};

window.switchTab = function (tabId) {
    document.querySelectorAll('.tab-content').forEach(el => el.classList.add('hidden'));
    const target = document.getElementById('section-' + tabId);
    if (target) target.classList.remove('hidden');

    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.remove('active', 'bg-slate-100', 'text-gussNavy');
        btn.classList.add('text-slate-500');
    });
    const activeBtn = document.getElementById('tab-' + tabId);
    if (activeBtn) {
        activeBtn.classList.remove('text-slate-500');
        activeBtn.classList.add('active', 'bg-slate-100', 'text-gussNavy');
    }
};

function initRegistryFilters() {
    const filterSelect = document.getElementById('registryFilterSelect');
    const stateSelect = document.getElementById('registryStateFilter');
    const sessionSelect = document.getElementById('registrySessionFilter');

    if (filterSelect) filterSelect.addEventListener('change', () => { currentRegistryPage = 0; fetchRegistryPage(0); });
    if (stateSelect) stateSelect.addEventListener('change', () => { currentRegistryPage = 0; fetchRegistryPage(0); });
    if (sessionSelect) sessionSelect.addEventListener('change', () => { currentRegistryPage = 0; fetchRegistryPage(0); });
}

function setupOmniSearchListener() {
    const searchInput = document.getElementById('omniSearchInput');
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            clearTimeout(searchTimeout);
            currentOmniSearchQuery = e.target.value.trim();
            searchTimeout = setTimeout(() => { currentRegistryPage = 0; fetchRegistryPage(0); }, 500);
        });
    }
}

window.clearRegistryFilters = function () {
    if (document.getElementById('registryFilterSelect')) document.getElementById('registryFilterSelect').value = 'ALL';
    if (document.getElementById('registryStateFilter')) document.getElementById('registryStateFilter').value = 'ALL';
    if (document.getElementById('omniSearchInput')) document.getElementById('omniSearchInput').value = '';
    currentOmniSearchQuery = "";
    currentRegistryPage = 0;
    fetchRegistryPage(0);
};

window.executeStateOriginFilter = function () {
    currentRegistryPage = 0;
    fetchRegistryPage(0);
};

async function transmitEvaluation(nin, status, note = null, admNo = null, assignedClass = null, assignedHostel = null, approvedFields = null, rejectedFields = null) {
    try {
        const payload = {
            nin,
            status,
            officerNote: note,
            assignedClass,
            assignedHostel,
            approvedFields,
            rejectedFields
        };
        const data = await ApiGateway.post('/admin/evaluate', payload);
        if (data) {
            updateDashboardStats();
            fetchTriagePage(currentTriagePage);
            fetchRegistryPage(currentRegistryPage);
            await refreshLightweightRegistry();
            return data;
        }
        return null;
    } catch (error) {
        Swal.fire('Evaluation Failed', error.message || 'The server rejected the request.', 'error');
        return null;
    }
}

window.openScreeningModal = async function (nin) {
    activeViewingNIN = nin;
    const actionContainer = document.getElementById('modal-action-buttons');
    actionContainer.innerHTML = `<p class="text-center text-slate-400 font-bold py-4"><i class="fa-solid fa-spinner fa-spin mr-2"></i> Pulling Secure Dossier from Database...</p>`;

    const modal = document.getElementById('screeningModal');
    modal.classList.remove('hidden');
    setTimeout(() => modal.classList.remove('opacity-0'), 10);

    try {
        const app = await ApiGateway.get(`/bridge/student?nin=${encodeURIComponent(nin)}`);
        if (!app) throw new Error("Dossier fetch failed");

        activeViewingApp = app;

        document.getElementById('modal-nin').textContent = DOMPurify.sanitize(app.nin || '');
        document.getElementById('modal-photo').src = window.resolveMediaUrl(DOMPurify.sanitize(app.uploadPassport || 'https://ui-avatars.com/api/?name=User'));

        const nimcPhotoEl = document.getElementById('modal-nimc-photo');
        const nimcBadgeEl = document.getElementById('modal-nimc-badge');
        if (nimcPhotoEl) {
            if (app.nimcPhotoUrl && app.nimcPhotoUrl.trim() !== "") {
                nimcPhotoEl.src = window.resolveMediaUrl(DOMPurify.sanitize(app.nimcPhotoUrl));
                nimcPhotoEl.dataset.hasNimc = 'true';
                nimcPhotoEl.classList.add('cursor-pointer', 'hover:scale-105');
                if (nimcBadgeEl) { nimcBadgeEl.textContent = "NIMC Biometric"; nimcBadgeEl.className = "block text-[8px] font-black text-blue-600 uppercase mt-1"; }
            } else {
                nimcPhotoEl.src = 'https://ui-avatars.com/api/?name=NIMC&background=e2e8f0&color=64748b';
                nimcPhotoEl.dataset.hasNimc = 'false';
                nimcPhotoEl.classList.remove('cursor-pointer', 'hover:scale-105');
                if (nimcBadgeEl) { nimcBadgeEl.textContent = "No NIMC Image"; nimcBadgeEl.className = "block text-[8px] font-bold text-slate-400 uppercase mt-1"; }
            }
        }
        document.getElementById('modal-name').textContent = DOMPurify.sanitize(app.name || "PENDING");
        document.getElementById('modal-state').textContent = DOMPurify.sanitize(app.state || "---");
        document.getElementById('modal-lga').textContent = DOMPurify.sanitize(app.lga || "---");
        document.getElementById('modal-dob').textContent = DOMPurify.sanitize(app.dob || "---");
        document.getElementById('modal-rel').textContent = DOMPurify.sanitize(app.religion || "N/A");
        document.getElementById('modal-nok').textContent = DOMPurify.sanitize(app.nok1Phone || "---");

        const el = (id) => document.getElementById(id);
        if (el('modal-nok-name')) el('modal-nok-name').textContent = DOMPurify.sanitize(app.nok1Name || "N/A");
        if (el('modal-nok-phone')) el('modal-nok-phone').textContent = DOMPurify.sanitize(app.nok1Phone || "N/A");
        if (el('modal-parent-name')) el('modal-parent-name').textContent = DOMPurify.sanitize(app.parentName || "N/A");
        if (el('modal-parent-phone')) el('modal-parent-phone').textContent = DOMPurify.sanitize(app.parentPhone || "N/A");
        if (el('modal-parent-occ')) el('modal-parent-occ').textContent = DOMPurify.sanitize(app.parentOccupation || "N/A");

        document.getElementById('modal-track').textContent = DOMPurify.sanitize(app.pathway || app.trackMode || "PENDING");
        let target = DOMPurify.sanitize(app.targetClass || app.targetLevel || "---");
        document.getElementById('modal-target').textContent = target;
        document.getElementById('modal-mode').textContent = DOMPurify.sanitize(app.mode || "---");
        document.getElementById('modal-blood').textContent = DOMPurify.sanitize(app.blood || "N/A");
        document.getElementById('modal-gen').textContent = DOMPurify.sanitize(app.genotype || "N/A");
        document.getElementById('modal-allergies').textContent = DOMPurify.sanitize(app.medAllergies || "None");
        document.getElementById('modal-disability').textContent = DOMPurify.sanitize(app.disabilityRadio === 'none' ? 'None' : (app.disabilityCats ? app.disabilityCats.join(', ') : 'Yes'));
        document.getElementById('modal-food-allergies').textContent = DOMPurify.sanitize(app.foodAllergies || "None");
        document.getElementById('modal-surgeries').textContent = DOMPurify.sanitize(app.surgeries || "None");
        document.getElementById('modal-meds').textContent = DOMPurify.sanitize(app.routineMeds || "None");
        document.getElementById('modal-respiratory').textContent = DOMPurify.sanitize(app.respiratory || "No History");
        document.getElementById('modal-neuro').textContent = DOMPurify.sanitize(app.neurological || "None");

        const detailsEl = document.getElementById('modal-disability-details');
        if (detailsEl) detailsEl.textContent = DOMPurify.sanitize(app.disabilityDetails || 'N/A');

        const checklist = document.getElementById('modal-checklist');
        checklist.innerHTML = '';

        const approvedDocs = Array.isArray(app.approvedFields) ? app.approvedFields : [];
        const rejectedDocs = Array.isArray(app.rejectedFields) ? app.rejectedFields : [];

        const isPendingEval = (app.status === 'AWAITING_VERIFICATION' || app.status === 'RETURNED_FOR_CORRECTION');

        const addTextCheckItem = (id, label) => {
            let isChecked = (approvedDocs.length > 0 || rejectedDocs.length > 0) ? approvedDocs.includes(id) : !isPendingEval;
            let checkAttrs = isChecked ? 'checked' : '';
            if (!isPendingEval) checkAttrs += ' disabled';

            const li = document.createElement('li');
            li.className = "flex justify-between items-center text-xs font-bold text-slate-600 p-2.5 rounded-xl hover:bg-slate-50 border border-slate-200 mb-2 transition-colors shadow-sm";
            li.innerHTML = `
                <div class="flex items-center gap-3">
                    <input type="checkbox" id="chk_${id}" class="doc-verify-cb w-4 h-4 text-emerald-600 bg-slate-100 border-slate-300 rounded focus:ring-emerald-500 ${isPendingEval ? 'cursor-pointer' : 'cursor-not-allowed opacity-70'}" value="${id}" ${checkAttrs}>
                    <label for="chk_${id}" class="${isPendingEval ? 'cursor-pointer' : 'cursor-not-allowed opacity-70'} select-none"><i class="fa-solid fa-keyboard text-slate-400 mr-1"></i> ${DOMPurify.sanitize(label)}</label>
                </div>
            `;
            checklist.appendChild(li);
        };

        const addCheckItem = (id, label, imgData) => {
            if (!imgData) return;
            let isChecked = (approvedDocs.length > 0 || rejectedDocs.length > 0) ? approvedDocs.includes(id) : !isPendingEval;
            let checkAttrs = isChecked ? 'checked' : '';
            if (!isPendingEval) checkAttrs += ' disabled';

            const safeImgUrl = window.resolveMediaUrl(DOMPurify.sanitize(imgData));
            const li = document.createElement('li');
            li.className = "flex justify-between items-center text-xs font-bold text-slate-600 p-2.5 rounded-xl hover:bg-slate-50 border border-slate-200 mb-2 transition-colors shadow-sm";
            li.innerHTML = `
                <div class="flex items-center gap-3">
                    <input type="checkbox" id="chk_${id}" class="doc-verify-cb w-4 h-4 text-emerald-600 bg-slate-100 border-slate-300 rounded focus:ring-emerald-500 ${isPendingEval ? 'cursor-pointer' : 'cursor-not-allowed opacity-70'}" value="${id}" ${checkAttrs}>
                    <label for="chk_${id}" class="${isPendingEval ? 'cursor-pointer' : 'cursor-not-allowed opacity-70'} select-none">${DOMPurify.sanitize(label)}</label>
                </div>
               <button onclick="window.viewDocument('${safeImgUrl}')" class="text-[9px] font-black text-blue-600 hover:text-blue-800 uppercase tracking-widest bg-blue-50 hover:bg-blue-100 px-3 py-1.5 rounded-lg transition-colors"><i class="fa-solid fa-eye mr-1"></i> View</button>
            `;
            checklist.appendChild(li);
        };

        addTextCheckItem('text-demographics', 'Applicant Bio-Data & Demographics');
        addTextCheckItem('text-medical', 'Medical History Profile');
        addTextCheckItem('text-contacts', 'Emergency & Parent Contacts');

        addCheckItem('wrapper-passport', 'Photographic Passport', app.uploadPassport);
        addCheckItem('wrapper-nin', 'NIN Slip / ID Card', app.uploadNIN);
        addCheckItem('wrapper-birth', 'Certificate of Birth', app.uploadBirth);
        addCheckItem('wrapper-indigene', 'State Indigene Cert.', app.uploadIndigene);
        addCheckItem('wrapper-primary', 'Primary School Cert.', app.uploadPrimary);
        addCheckItem('wrapper-signature', 'Plain Paper Signature', app.uploadSignature);

        if (target.startsWith('SSS')) addCheckItem('wrapper-jsce', 'JSCE Testimonial', app.uploadJSCE);
        if (app.mode === 'Transfer Placement') addCheckItem('wrapper-transfer', 'Transfer Placement Letter', app.uploadTransfer);
        if (app.pathway === 'Exchange Scheme' || app.trackMode === 'Exchange Scheme') {
            addCheckItem('wrapper-exchange', 'Official Exchange Letter', app.uploadExchange);
            addCheckItem('wrapper-medical', 'Govt. Medical Certificate', app.uploadMedical);
        }

        const safeTarget = DOMPurify.sanitize(target);
        const safeNin = DOMPurify.sanitize(app.nin);
        const safeStatus = DOMPurify.sanitize(app.status.replace(/_/g, ' '));

        const activeIntakeSession = sessionStorage.getItem('guss_active_intake_session') || '2027/2028';
        const isHistoricalRecord = app.sessionApplied && app.sessionApplied !== activeIntakeSession;

        if (isHistoricalRecord) {
            let printBtnHtml = app.status === 'ADMITTED' ? `<button onclick="window.printAdmissionLetter('${safeNin}')" class="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg shadow-md transition-colors mt-3 w-full"><i class="fa-solid fa-print mr-1"></i> Reprint Admission Letter</button>` : '';
            actionContainer.innerHTML = `
                <div class="bg-slate-800 text-slate-300 p-4 rounded-xl border border-slate-700 text-center text-xs font-black uppercase tracking-widest shadow-inner mb-3">
                    <i class="fa-solid fa-box-archive mr-2 text-base text-gussGold"></i> Historical Record (${DOMPurify.sanitize(app.sessionApplied)})
                </div>
                <p class="text-[10px] text-slate-500 text-center font-bold mb-2">This dossier belongs to a past academic session and is cryptographically sealed. Administrative actions are disabled.</p>
                ${printBtnHtml}
            `;
        } else {
            if (app.status === 'ADMITTED') {
                let resolveBtnHtml = target.startsWith('SSS') && app.assignedClass && app.assignedClass.includes('Pending') ? `<button onclick="window.resolveSSSQualifyingClass('${safeNin}', '${safeTarget}')" class="w-full mt-3 border-2 border-blue-200 text-blue-600 hover:bg-blue-50 hover:border-blue-300 font-black py-2.5 rounded-xl text-[10px] uppercase tracking-widest transition-colors"><i class="fa-solid fa-graduation-cap mr-1"></i> Resolve Qualifying Class</button>` : '';
                actionContainer.innerHTML = `
                    <div class="bg-emerald-50 text-emerald-700 p-4 rounded-xl border border-emerald-200 flex justify-between items-center text-xs font-black uppercase tracking-widest shadow-inner">
                        <span><i class="fa-solid fa-check-circle mr-1 text-sm"></i> Applicant Admitted</span>
                        <button onclick="window.printAdmissionLetter('${safeNin}')" class="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg shadow-md transition-colors"><i class="fa-solid fa-print mr-1"></i> Print Letter</button>
                    </div>
                    ${resolveBtnHtml}
                    <button onclick="window.referToTribunal('${safeNin}')" class="w-full mt-3 border-2 border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100 font-black py-2.5 rounded-xl text-[10px] uppercase tracking-widest transition-colors flex items-center justify-center gap-2"><i class="fa-solid fa-gavel text-amber-600"></i> Refer to Identity Tribunal</button>
                `;
            } else if (app.status === 'REVOKED_QUARANTINED') {
                actionContainer.innerHTML = `
                    <div class="bg-red-950 text-red-300 p-4 rounded-xl border border-red-800 text-center text-xs font-black uppercase tracking-widest shadow-inner mb-3">
                        <i class="fa-solid fa-skull mr-2 text-base"></i> Identity Quarantined By Tribunal
                    </div>
                    <button onclick="window.referToTribunal('${safeNin}')" class="w-full bg-red-700 hover:bg-red-600 text-white font-black py-3 rounded-xl text-[10px] uppercase tracking-widest shadow-md transition-colors flex items-center justify-center gap-2">
                        <i class="fa-solid fa-gavel"></i> Manage in Identity Tribunal
                    </button>
                `;
            } else if (app.status === 'POOLED' || app.status === 'PROVISIONALLY_POOLED') {
                actionContainer.innerHTML = `
                    <div class="bg-indigo-50 text-indigo-700 p-4 rounded-xl border border-indigo-200 text-center text-xs font-black uppercase tracking-widest shadow-inner">
                        <i class="fa-solid fa-layer-group mr-1 text-sm"></i> Pooled For Batch Publish
                    </div>
                    <button onclick="window.revokeAdmission('${safeNin}')" class="w-full mt-3 border-2 border-red-200 text-red-500 hover:bg-red-50 hover:border-red-300 font-black py-2.5 rounded-xl text-[10px] uppercase tracking-widest transition-colors"><i class="fa-solid fa-triangle-exclamation mr-1"></i> Revoke & Reject</button>
                `;
            } else if (app.status === 'REJECTED' || app.status === 'RETURNED_FOR_CORRECTION') {
                actionContainer.innerHTML = `
                    <div class="bg-slate-100 p-3 rounded-xl border border-slate-200 text-xs font-bold text-slate-600 mb-3 text-center shadow-inner">
                        Status: <span class="${app.status === 'REJECTED' ? 'text-red-600' : 'text-amber-600'} uppercase font-black">${safeStatus}</span>
                    </div>
                    <div class="flex gap-3">
                        <button onclick="window.rejectApplicant()" class="flex-1 border border-red-200 text-red-500 hover:bg-red-50 font-black py-3 rounded-xl text-[11px] uppercase tracking-widest transition-colors"><i class="fa-solid fa-ban mr-1"></i> Force Reject</button>
                        <button onclick="window.openAllocationModal()" class="flex-[1.5] bg-gussGreen text-white font-black py-3 rounded-xl text-[11px] uppercase tracking-widest shadow-md hover:bg-emerald-800 transition-colors"><i class="fa-solid fa-check-double mr-1"></i> Overturn & Approve</button>
                    </div>
                `;
            } else {
                actionContainer.innerHTML = `
                    <button onclick="window.returnForCorrection()" class="w-full border-2 border-amber-400 text-amber-600 hover:bg-amber-50 font-black py-3 rounded-xl text-[11px] uppercase tracking-widest transition-colors"><i class="fa-solid fa-rotate-left mr-1"></i> Return for Correction</button>
                    <div class="flex gap-3 mt-3">
                        <button onclick="window.rejectApplicant()" class="flex-1 border border-red-200 text-red-500 hover:bg-red-50 font-black py-3 rounded-xl text-[11px] uppercase tracking-widest transition-colors"><i class="fa-solid fa-ban mr-1"></i> Reject</button>
                        <button onclick="window.openAllocationModal()" class="flex-[1.5] bg-gussGreen text-white font-black py-3 rounded-xl text-[11px] uppercase tracking-widest shadow-md hover:bg-emerald-800 transition-colors"><i class="fa-solid fa-check-double mr-1"></i> Approve & Pool</button>
                    </div>
                `;
            }
        }
    } catch (error) {
        actionContainer.innerHTML = `<p class="text-center text-red-500 font-bold py-4">Database Fetch Error.</p>`;
    }
};

window.closeScreeningModal = function () {
    const modal = document.getElementById('screeningModal');
    modal.classList.add('opacity-0');
    setTimeout(() => modal.classList.add('hidden'), 300);
    activeViewingNIN = null;
};

let currentDocZoom = 1;

window.zoomDocument = function (factor) {
    currentDocZoom += factor;
    currentDocZoom = Math.min(Math.max(0.5, currentDocZoom), 4);
    const img = document.getElementById('viewerImage');
    if (img) {
        img.style.transform = `scale(${currentDocZoom})`;
        img.style.transition = 'transform 0.1s ease-out';
    }
};

window.viewDocument = function (b64) {
    let zoomControls = document.getElementById('zoom-controls');
    if (!zoomControls) {
        zoomControls = document.createElement('div');
        zoomControls.id = 'zoom-controls';
        zoomControls.className = 'absolute bottom-6 flex gap-4 z-[150]';
        zoomControls.innerHTML = `
            <button onclick="window.zoomDocument(0.25)" class="bg-slate-800 text-white w-12 h-12 rounded-full shadow-lg hover:bg-slate-700 text-xl font-bold"><i class="fa-solid fa-magnifying-glass-plus"></i></button>
            <button onclick="window.zoomDocument(-0.25)" class="bg-slate-800 text-white w-12 h-12 rounded-full shadow-lg hover:bg-slate-700 text-xl font-bold"><i class="fa-solid fa-magnifying-glass-minus"></i></button>
        `;
        document.getElementById('viewerModal').appendChild(zoomControls);
    }

    currentDocZoom = 1;
    const img = document.getElementById('viewerImage');
    img.src = DOMPurify.sanitize(b64);
    img.style.transform = `scale(1)`;
    document.getElementById('viewerModal').classList.remove('hidden');
    setTimeout(() => document.getElementById('viewerModal').classList.remove('opacity-0'), 10);
};

window.closeViewer = function () {
    document.getElementById('viewerModal').classList.add('opacity-0');
    setTimeout(() => document.getElementById('viewerModal').classList.add('hidden'), 300);
};

window.returnForCorrection = async function () {
    if (!activeViewingNIN) return;

    const { value: reason } = await Swal.fire({
        title: 'Return for Correction',
        input: 'textarea',
        inputLabel: 'Correction Instructions',
        inputPlaceholder: 'State exactly what the applicant needs to fix...',
        showCancelButton: true,
        confirmButtonColor: '#f59e0b',
        confirmButtonText: 'Return Dossier'
    });

    if (!reason || !reason.trim()) return;

    const rejectedDocs = [];
    const approvedDocs = [];

    document.querySelectorAll('.doc-verify-cb').forEach(cb => {
        if (cb.checked) approvedDocs.push(cb.value);
        else rejectedDocs.push(cb.value);
    });

    if (rejectedDocs.length === 0) {
        return Swal.fire('Validation Error', 'Uncheck at least one field/document in the checklist to return for correction.', 'error');
    }

    if (await transmitEvaluation(activeViewingNIN, "RETURNED_FOR_CORRECTION", reason.trim(), null, null, null, approvedDocs, rejectedDocs)) {
        window.closeScreeningModal();
        Swal.fire('Returned!', 'Dossier returned. Selected fields have been unlocked for the applicant.', 'success');
    }
};

window.rejectApplicant = async function () {
    if (!activeViewingNIN) return;

    const { value: reason } = await Swal.fire({
        title: 'Permanent Rejection',
        input: 'text',
        inputLabel: 'Official Reason for Rejection',
        showCancelButton: true,
        confirmButtonColor: '#ef4444',
        confirmButtonText: 'Reject Application'
    });

    if (!reason) return;

    if (await transmitEvaluation(activeViewingNIN, "REJECTED", reason)) {
        window.closeScreeningModal();
        Swal.fire('Rejected', 'Application permanently rejected and logged in the database.', 'success');
    }
};

window.resolveSSSQualifyingClass = async function (nin, targetLevel) {
    if (!nin) return;

    const app = pendingDB.find(a => a.nin === nin);
    if (!app) {
        Swal.fire('Security Error', 'Applicant data not found in local pool.', 'error');
        return;
    }

    const safeLevel = (targetLevel || "SSS 1").replace(/([a-zA-Z]+)(\d+)/, '$1 $2').toUpperCase();
    const matchedClasses = DB_CLASSES.filter(c => c.level === safeLevel);
    const validArms = matchedClasses.map(c => c.arm).sort();

    if (validArms.length === 0) {
        return Swal.fire('Configuration Error', `No arms exist in the database for ${safeLevel}. Please contact DD Academics to commission classes first.`, 'error');
    }

    const { value: armPrompt } = await Swal.fire({
        title: 'Resolve Qualifying Class',
        input: 'text',
        inputLabel: `Qualifying exams passed. Enter the specific class ARM to assign for ${safeLevel} (Choose from ${validArms.join(', ')}):`,
        showCancelButton: true,
        confirmButtonText: 'Assign Arm',
        inputValidator: (value) => {
            if (!value || !validArms.map(v => v.toUpperCase()).includes(value.toUpperCase().trim())) {
                return `You must enter a valid class arm (${validArms.join(', ')}).`;
            }
        }
    });

    if (!armPrompt) return;

    const finalAssignedClass = `${safeLevel} ${armPrompt.toUpperCase().trim()}`;

    const confirmRes = await Swal.fire({
        title: 'Confirm Placement',
        text: `Are you sure you want to permanently assign ${app.name} to ${finalAssignedClass}?`,
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#005A36',
        confirmButtonText: 'Yes, Assign'
    });

    if (!confirmRes.isConfirmed) return;

    if (await transmitEvaluation(nin, "ADMITTED", "Qualifying Class Resolved Successfully", app.admNo, finalAssignedClass, app.assignedHostel)) {
        window.closeScreeningModal();
        Swal.fire('Success!', `Applicant has been officially placed in ${finalAssignedClass}.`, 'success');
    }
};

function generateSmartClassOptions(targetLevel) {
    const safeLevel = (targetLevel || "JSS 1").replace(/([a-zA-Z]+)(\d+)/, '$1 $2').toUpperCase();
    const matchedClasses = DB_CLASSES.filter(c => c.level === safeLevel);
    const arms = matchedClasses.map(c => c.arm).sort();

    let options = `<option value="">Select Exact Class Arm for ${safeLevel}...</option>`;
    arms.forEach(arm => { options += `<option value="${DOMPurify.sanitize(safeLevel)} ${DOMPurify.sanitize(arm)}">${DOMPurify.sanitize(safeLevel)} ${DOMPurify.sanitize(arm)}</option>`; });

    if (arms.length === 0) {
        options += `<option value="" disabled>No arms commissioned for ${safeLevel} yet!</option>`;
    }

    return options;
}

window.openAllocationModal = async function () {
    if (!activeViewingNIN || !activeViewingApp) return;

    const uncheckedBoxes = document.querySelectorAll('.doc-verify-cb:not(:checked)');

    if (uncheckedBoxes.length > 0) {
        const res = await Swal.fire({
            title: 'Incomplete Verification Detected',
            html: `You are attempting to approve an applicant without verifying all required credentials.<br><br><strong>Do you want to force a Provisional Approval or return the dossier to the applicant?</strong>`,
            icon: 'warning',
            showDenyButton: true,
            showCancelButton: true,
            confirmButtonText: '<i class="fa-solid fa-triangle-exclamation"></i> Force Provisional Pool',
            denyButtonText: '<i class="fa-solid fa-rotate-left"></i> Return for Correction',
            confirmButtonColor: '#f59e0b',
            denyButtonColor: '#005A36'
        });

        if (res.isDenied) return window.returnForCorrection();
        else if (!res.isConfirmed) return;

        window.isDeficientApproval = true;
    } else {
        window.isDeficientApproval = false;
    }

    const app = activeViewingApp;
    let target = app.targetClass || app.targetLevel || "JSS 1";

    const idDisplay = document.getElementById('alloc-adm-no');
    if (idDisplay) {
        const idContainer = idDisplay.closest('div.bg-slate-900') || idDisplay.parentElement;
        if (idContainer) idContainer.classList.add('hidden');
    }

    const isSSS = target.startsWith('SSS');
    const classSelect = document.getElementById('alloc-class');
    const sssNote = document.getElementById('alloc-sss-note');

    if (isSSS) {
        const baseClass = target.substring(0, 5).trim();
        classSelect.innerHTML = `<option value="${baseClass} (Pending Exams)">${baseClass} (Pending Exams)</option>`;
        classSelect.disabled = true;
        if (sssNote) sssNote.classList.remove('hidden');
    } else {
        classSelect.innerHTML = generateSmartClassOptions(target);
        classSelect.disabled = false;
        if (sssNote) sssNote.classList.add('hidden');
    }

    document.getElementById('screeningModal').classList.add('hidden');
    const amodal = document.getElementById('allocationModal');
    amodal.classList.remove('hidden');
    setTimeout(() => amodal.classList.remove('opacity-0'), 10);
};

window.finalizeAdmission = async function () {
    const targetClass = document.getElementById('alloc-class').value;
    const targetHostel = document.getElementById('alloc-hostel').value;

    if (!targetClass || !targetHostel) {
        Swal.fire('Validation Error', 'You must select both a Class Arm and a Hostel Block to finalize placement.', 'error');
        return;
    }

    const btn = window.event ? window.event.currentTarget : document.querySelector('#allocationModal button.bg-blue-600');
    let originalText = "";
    if (btn) {
        originalText = btn.innerHTML;
        btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Processing...`;
        btn.disabled = true;
    }

    const finalStatus = window.isDeficientApproval ? "PROVISIONALLY_POOLED" : "POOLED";

    const rejectedDocs = [];
    const approvedDocs = [];
    document.querySelectorAll('.doc-verify-cb').forEach(cb => {
        if (cb.checked) approvedDocs.push(cb.value);
        else rejectedDocs.push(cb.value);
    });

    const cleanNote = window.isDeficientApproval
        ? "PROVISIONALLY POOLED: Outstanding credentials flagged for physical verification."
        : "CLEARED & POOLED: All digital credentials verified.";

    const evalResult = await transmitEvaluation(activeViewingNIN, finalStatus, cleanNote, null, targetClass, targetHostel, approvedDocs, rejectedDocs);

    if (evalResult) {
        const idDisplay = document.getElementById('alloc-adm-no');
        if (idDisplay) {
            const idContainer = idDisplay.closest('div.bg-slate-900') || idDisplay.parentElement;
            if (idContainer) {
                idContainer.classList.remove('hidden');
                idContainer.style.transition = "opacity 0.5s ease-in";
                idContainer.style.opacity = "1";
            }

            idDisplay.textContent = evalResult.admNo;
            idDisplay.className = "text-emerald-400 font-black text-xl tracking-widest mt-2 block";
        }

        if (btn) {
            btn.innerHTML = `<i class="fa-solid fa-check-double"></i> Placed Successfully`;
            btn.classList.replace('bg-blue-600', 'bg-emerald-600');
        }

        setTimeout(() => {
            const amodal = document.getElementById('allocationModal');
            amodal.classList.add('opacity-0');

            setTimeout(() => {
                amodal.classList.add('hidden');
                if (btn) {
                    btn.innerHTML = originalText;
                    btn.classList.replace('bg-emerald-600', 'bg-blue-600');
                    btn.disabled = false;
                }
            }, 300);

            activeViewingNIN = null;
            Swal.fire('Processed!', `Admission Pooled! The student was officially assigned ID: ${evalResult.admNo}. It will remain hidden from the applicant until you click Publish Batch.`, 'success');
        }, 2000);

    } else {
        if (btn) {
            btn.innerHTML = originalText;
            btn.disabled = false;
        }
    }
};

window.closeAllocationModal = function () {
    const amodal = document.getElementById('allocationModal');
    amodal.classList.add('opacity-0');
    setTimeout(() => { amodal.classList.add('hidden'); document.getElementById('screeningModal').classList.remove('hidden'); }, 300);
};

window.revokeAdmission = async function (nin) {
    const confirmRes = await Swal.fire({
        title: 'CRITICAL WARNING',
        text: "Are you sure you want to revoke this admission? This action will permanently strip the student's Admission Number and flag them as REJECTED due to fraud or forgery.",
        icon: 'error',
        showCancelButton: true,
        confirmButtonColor: '#ef4444',
        confirmButtonText: 'Yes, Revoke Admission'
    });

    if (!confirmRes.isConfirmed) return;

    if (await transmitEvaluation(nin, "REJECTED", "Admission Revoked (Post-Approval Fraud/Forgery Detected)")) {
        window.closeScreeningModal();
        Swal.fire('Revoked', 'Admission has been successfully revoked and the applicant has been flagged.', 'success');
    }
};

window.referToTribunal = function (nin) {
    window.closeScreeningModal();
    window.switchTab('tribunal');
    const input = document.getElementById('tribunalSearchInput');
    if (input && nin) {
        input.value = nin;
        window.searchTribunalTarget();
    }
};

window.publishAdmissionsBatch = async function () {
    const pooledCount = document.getElementById('stat-pooled').textContent;
    if (pooledCount === "0") {
        return Swal.fire('Pool Empty', 'The pool is empty. Process and approve applications first.', 'info');
    }

    const confirmRes = await Swal.fire({
        title: 'CRITICAL ACTION',
        text: `Publish ${pooledCount} pooled candidates to the public admission list?`,
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#005A36',
        confirmButtonText: 'Yes, Publish Batch'
    });

    if (!confirmRes.isConfirmed) return;

    try {
        const data = await ApiGateway.post('/admin/publish-batch', {});
        if (!data) throw new Error("Failed to publish batch.");

        await Swal.fire('SUCCESS', `${data.publishedCount} students published as BATCH ${data.batchLetter || 'NEW'}. The public portal admission banner has been updated automatically.`, 'success');

        await syncConfigFromCloud();
        updateDashboardStats();
        fetchRegistryPage(0);
        loadGlobalConfig();
        await refreshLightweightRegistry();
    } catch (error) {
        Swal.fire('Critical Error', error.message || 'Failed to execute batch publish.', 'error');
    }
};

window.printAdmissionLetter = async function (nin) {
    const btn = window.event ? window.event.currentTarget : null;
    let ogText = "";
    if (btn) { ogText = btn.innerHTML; btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin mr-1"></i> Generating...`; btn.disabled = true; }

    try {
        const app = pendingDB.find(a => a.nin === nin) || activeViewingApp;
        if (!app || !app.admNo) throw new Error("Admission Number Not Found");

        const payload = {
            letterData: {
                admNo: app.admNo,
                officerName: activeOfficerProfile.name || "Admissions Officer",
                officerPhone: sessionStorage.getItem('guss_phone') || "N/A"
            },
            nin: nin
        };

        const blob = await ApiGateway.postBlob('/reports/admission-letter', payload);
        if (blob) {
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `Admission_Letter_${app.admNo.replace(/\//g, '_')}.pdf`;
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            a.remove();
        }
    } catch (error) {
        Swal.fire('Generation Error', error.message || 'Could not generate PDF.', 'error');
    } finally {
        if (btn) { btn.innerHTML = ogText; btn.disabled = false; }
    }
};

window.executeBulkAdmissionLetters = async function () {
    if (letterSpooler.size === 0) return;

    const modal = document.getElementById('batchPreviewModal');
    const iframe = document.getElementById('pdfPreviewFrame');
    const loadingState = document.getElementById('batchLoadingState');
    const btnConfirm = document.getElementById('btnConfirmBatch');
    const subtitle = document.getElementById('batchPreviewSubtitle');

    iframe.src = "";
    iframe.classList.add('hidden');
    btnConfirm.classList.add('hidden');
    loadingState.classList.remove('hidden');
    subtitle.textContent = `Compiling ${letterSpooler.size} Admission Letters...`;

    modal.classList.remove('hidden');
    modal.classList.add('flex');

    const adminProfile = JSON.parse(localStorage.getItem('guss_admin_profile')) || { name: activeOfficerProfile.name, phone: "", signature: "" };

    let rawSignature = adminProfile.signature || cachedSignatureBase64 || "";
    let cleanSignature = rawSignature;
    if (cleanSignature.includes("base64,")) {
        cleanSignature = cleanSignature.split("base64,")[1];
    }

    const payload = {
        admNos: Array.from(letterSpooler),
        officerDetails: {
            officerName: adminProfile.name || activeOfficerProfile.name || "Admissions Officer",
            officerPhone: adminProfile.phone || "N/A"
        },
        signatureBase64: cleanSignature
    };

    try {
        const blob = await ApiGateway.postBlob('/reports/bulk-admission-letter', payload);
        if (blob) {
            const pdfBlob = new Blob([blob], { type: 'application/pdf' });
            const blobUrl = window.URL.createObjectURL(pdfBlob);

            iframe.src = blobUrl;
            loadingState.classList.add('hidden');
            iframe.classList.remove('hidden');
            btnConfirm.classList.remove('hidden');
            subtitle.textContent = "Jasper Document Compiled. Ready for A4 Output.";

            await ApiGateway.post('/director/logs', {
                message: `GENERATED: Admissions Officer processed ${letterSpooler.size} official admission letters in bulk.`,
                tag: 'HR'
            }).catch(() => { });
        } else {
            window.closeBatchPreview();
            Swal.fire('Server Error', 'Failed to compile Jasper batch.', 'error');
        }
    } catch (error) {
        window.closeBatchPreview();
        Swal.fire('Critical Error', error.message || 'Connection to Jasper Engine failed.', 'error');
    }
};

window.updateConfigUIForTarget = function (targetSession) {
    const state = RAM_VAULT[`guss_admission_portal_state_${targetSession}`] || 'CLOSED';
    const broadcast = RAM_VAULT[`guss_admission_broadcast_${targetSession}`] || '';
    const deadline = RAM_VAULT[`guss_admission_deadline_${targetSession}`] || '';

    const toggle = document.getElementById('config-gateway-toggle');
    if (toggle) toggle.checked = (state === 'OPEN');

    const broadcastInput = document.getElementById('config-broadcast');
    if (broadcastInput) broadcastInput.value = broadcast;

    const deadlineInput = document.getElementById('config-deadline');
    if (deadlineInput) deadlineInput.value = deadline;
};

async function loadGlobalConfig() {
    const activeSession = (sessionStorage.getItem('guss_selected_session') || '2027/2028').split(' ')[0];
    const liveSession = sessionStorage.getItem('guss_live_session') || "2027/2028 SESSION";
    const currentSessionStr = liveSession.split(' ')[0];
    const startYear = parseInt(currentSessionStr.substring(0, 4));
    const nextSessionStr = `${startYear + 1}/${startYear + 2}`;

    const isHistorical = activeSession !== currentSessionStr && activeSession !== nextSessionStr;

    const sessionSelect = document.getElementById('config-session');
    if (sessionSelect) {
        sessionSelect.innerHTML = `
            <option value="${currentSessionStr}">${currentSessionStr} (Current Active Intake)</option>
            <option value="${nextSessionStr}">${nextSessionStr} (Upcoming Advance Intake)</option>
        `;
        if (isHistorical) {
            sessionSelect.innerHTML += `<option value="${activeSession}">${activeSession} (Archived Intake)</option>`;
        }
        sessionSelect.value = activeSession;

        sessionSelect.onchange = function () {
            window.updateConfigUIForTarget(this.value);
        };
    }

    window.updateConfigUIForTarget(activeSession);

    const statusBadge = document.getElementById('livePortalStatus');
    const currentState = RAM_VAULT[`guss_admission_portal_state_${activeSession}`] || 'CLOSED';
    if (statusBadge) {
        if (currentState === 'OPEN') {
            statusBadge.className = "bg-emerald-50 text-emerald-700 border border-emerald-200 px-4 py-2 rounded-lg text-xs font-black uppercase tracking-wider flex items-center gap-2";
            statusBadge.innerHTML = `<i class="fa-solid fa-globe"></i> Application Portal is Live`;
        } else {
            statusBadge.className = "bg-red-50 text-red-700 border border-red-200 px-4 py-2 rounded-lg text-xs font-black uppercase tracking-wider flex items-center gap-2";
            statusBadge.innerHTML = `<i class="fa-solid fa-lock"></i> Application Portal is Closed`;
        }
    }

    const nameInput = document.getElementById('config-officer-name');
    const phoneInput = document.getElementById('config-officer-phone');
    const sigPreview = document.getElementById('preview-signature');

    if (isHistorical) {
        if (nameInput) nameInput.value = RAM_VAULT[`guss_officer_name_${activeSession}`] || 'Archived Officer';
        if (phoneInput) phoneInput.value = RAM_VAULT[`guss_officer_phone_${activeSession}`] || 'N/A';
        if (sigPreview) {
            const sig = RAM_VAULT[`guss_officer_signature_${activeSession}`];
            if (sig) {
                sigPreview.src = window.resolveMediaUrl(sig);
                sigPreview.classList.remove('hidden');
            } else {
                sigPreview.classList.add('hidden');
            }
        }
    } else {
        if (nameInput) nameInput.value = sessionStorage.getItem('guss_user_name') || activeOfficerProfile.name || "Admissions Officer";
        if (phoneInput) phoneInput.value = sessionStorage.getItem('guss_phone') || "N/A";

        const localSig = sessionStorage.getItem('guss_signature_url');
        if (sigPreview && localSig && localSig !== "null") {
            sigPreview.src = window.resolveMediaUrl(localSig);
            sigPreview.classList.remove('hidden');
        }

        try {
            //   Routed through ApiGateway.get
            const profile = await ApiGateway.get(`/ict/staff/profile?id=${activeOfficerId}`);
            if (profile) {
                if (nameInput) nameInput.value = profile.fullName || nameInput.value;
                if (phoneInput) {
                    phoneInput.value = profile.phone || phoneInput.value;
                    sessionStorage.setItem('guss_phone', profile.phone);
                }
                if (sigPreview && profile.signatureUrl) {
                    sigPreview.src = window.resolveMediaUrl(profile.signatureUrl);
                    sigPreview.classList.remove('hidden');
                    sessionStorage.setItem('guss_signature_url', profile.signatureUrl);
                }
            }
        } catch (e) {
            console.warn("Background profile sync failed. Relying on cached credentials.");
        }
    }

    const configSection = document.getElementById('section-config');
    if (isHistorical) {
        const inputs = configSection.querySelectorAll('input, select, button');
        inputs.forEach(input => {
            input.disabled = true;
            input.classList.add('opacity-50', 'cursor-not-allowed');
        });

        if (!document.getElementById('historicalConfigWarning')) {
            const warningDiv = document.createElement('div');
            warningDiv.id = 'historicalConfigWarning';
            warningDiv.innerHTML = `
                <div class="bg-amber-50 border-l-4 border-amber-500 p-4 mb-6 rounded-r-xl shadow-sm">
                    <h3 class="text-amber-800 font-black uppercase tracking-widest text-xs"><i class="fa-solid fa-lock mr-2"></i> Historical Archive Mode</h3>
                    <p class="text-amber-700 text-[10px] mt-1 font-bold">You are viewing a past academic session. Global portal configurations cannot be modified in historical view.</p>
                </div>
            `;
            configSection.querySelector('.max-w-3xl').prepend(warningDiv);
        }
    } else {
        const warning = document.getElementById('historicalConfigWarning');
        if (warning) warning.remove();
        const inputs = configSection.querySelectorAll('input, select, button');
        inputs.forEach(input => {
            input.disabled = false;
            input.classList.remove('opacity-50', 'cursor-not-allowed');
        });
    }
}

window.saveGlobalSettings = async function () {
    const isOpen = document.getElementById('config-gateway-toggle').checked;
    const session = document.getElementById('config-session').value;
    const broadcast = document.getElementById('config-broadcast').value;
    const deadline = document.getElementById('config-deadline') ? document.getElementById('config-deadline').value : '';
    const currentActiveIntake = localStorage.getItem('guss_active_intake_session');

    if (isOpen && currentActiveIntake && currentActiveIntake !== session) {
        const confirmSwitch = await Swal.fire({
            title: 'HIGHLANDER RULE ENFORCEMENT',
            html: `The gateway for session <b>${currentActiveIntake}</b> is currently registered as active.<br><br>Opening the gateway for <b>${session}</b> will <span class="text-red-600 font-bold">AUTOMATICALLY AND PERMANENTLY CLOSE</span> the ${currentActiveIntake} portal.<br><br>Do you authorize this atomic transition?`,
            icon: 'warning',
            showCancelButton: true,
            confirmButtonColor: '#ef4444',
            confirmButtonText: 'Yes, Close Old & Open New'
        });

        if (!confirmSwitch.isConfirmed) {
            document.getElementById('config-gateway-toggle').checked = false;
            return;
        }
    }

    const authRes = await Swal.fire({
        title: 'Zero-Trust Authorization',
        html: `You are modifying global admissions gateway parameters for <b>${session}</b>.<br><br>Enter Officer Password to commit changes:`,
        input: 'password',
        inputAttributes: { autocapitalize: 'off', autocorrect: 'off' },
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#005A36',
        confirmButtonText: '<i class="fa-solid fa-lock"></i> Authorize & Sync'
    });

    if (!authRes.isConfirmed || !authRes.value) return;

    try {
        const officerName = document.getElementById('config-officer-name').value;
        const officerPhone = document.getElementById('config-officer-phone').value;
        const sigPreview = document.getElementById('preview-signature');
        const officerSig = sigPreview && !sigPreview.classList.contains('hidden') ? sigPreview.src : '';

        const configPayload = {
            configs: {
                'target_session': session.replace(/ \| .*/, '').trim(),
                'guss_admission_portal_state': isOpen ? 'OPEN' : 'CLOSED',
                'guss_admission_broadcast': broadcast,
                'guss_admission_deadline': deadline
            },
            adminPassword: authRes.value
        };

        //   Routed through ApiGateway.post
        const data = await ApiGateway.post('/admin/config/save', configPayload);

        if (!data) return;

        Object.keys(configPayload.configs).forEach(k => {
            if (k !== 'target_session' && k !== 'guss_officer_signature') {
                localStorage.setItem(k, configPayload.configs[k]);
            }
        });

        await syncConfigFromCloud();
        loadGlobalConfig();
        await refreshLightweightRegistry();
        fetchTriagePage(0);
        fetchRegistryPage(0);

        Swal.fire('Synchronized!', 'Gateway parameters successfully updated. The public portal has been routed to this session.', 'success');

    } catch (error) {
        Swal.fire('Security Alert', error.message || 'Invalid Password.', 'error');
    }
};

window.processAdminSignature = function (inputNode) {
    if (inputNode.files && inputNode.files[0]) {
        const file = inputNode.files[0];
        const reader = new FileReader();
        reader.onload = function (e) {
            const img = new Image();
            img.onload = function () {
                const canvas = document.createElement('canvas');
                const MAX_WIDTH = 600; const MAX_HEIGHT = 300;
                let width = img.width; let height = img.height;
                if (width > height) { if (width > MAX_WIDTH) { height *= MAX_WIDTH / width; width = MAX_WIDTH; } }
                else { if (height > MAX_HEIGHT) { width *= MAX_HEIGHT / height; height = MAX_HEIGHT; } }
                canvas.width = width; canvas.height = height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);
                cachedSignatureBase64 = canvas.toDataURL('image/png', 0.95);
                const preview = document.getElementById('preview-signature');
                if (preview) {
                    preview.src = cachedSignatureBase64;
                    preview.classList.remove('hidden');
                }
            };
            img.src = e.target.result;
        };
        reader.readAsDataURL(file);
    }
};

function updatePopulationMatrix() {
    const registry = getStudentRegistrySafe();
    const activeSession = (sessionStorage.getItem('guss_selected_session') || '2027/2028').split(' ')[0];

    const admittedStudents = registry.filter(s =>
        (s.status === 'ADMITTED' || s.triageStatus === 'ADMITTED') &&
        (s.sessionApplied && s.sessionApplied.includes(activeSession))
    );

    let jss = 0, sss = 0, graduating = 0;

    admittedStudents.forEach(s => {
        const cls = (s.assignedClass || "").toUpperCase();
        if (cls.includes('JSS')) jss++;
        if (cls.includes('SSS')) sss++;
        if (cls.includes('JSS 3') || cls.includes('JSS3') || cls.includes('SSS 3') || cls.includes('SSS3')) {
            graduating++;
        }
    });

    const jssEl = document.getElementById('pop-total-jss');
    const sssEl = document.getElementById('pop-total-sss');
    const gradEl = document.getElementById('pop-graduating');

    if (jssEl) jssEl.innerText = jss.toLocaleString();
    if (sssEl) sssEl.innerText = sss.toLocaleString();
    if (gradEl) gradEl.innerText = graduating.toLocaleString();
}

window.runSmartCalculator = function () {
    const level = document.getElementById('calc-level').value;
    const arm = document.getElementById('calc-arm').value;

    const registry = getStudentRegistrySafe();
    const admittedStudents = registry.filter(s => s.status === 'ADMITTED' || s.triageStatus === 'ADMITTED');

    let count = 0;
    admittedStudents.forEach(s => {
        const cls = (s.assignedClass || "").toUpperCase();
        let match = true;

        if (level !== 'ALL' && !cls.includes(level)) match = false;
        if (arm !== 'ALL' && !cls.endsWith(arm)) match = false;

        if (match) count++;
    });

    const resBox = document.getElementById('calc-result-box');
    document.getElementById('calc-query-text').innerText = `Query: ${level} ${arm === 'ALL' ? '(ALL ARMS)' : `(ARM ${arm})`}`;
    document.getElementById('calc-result-number').innerText = `${count.toLocaleString()} STUDENTS`;

    resBox.classList.remove('hidden');
    resBox.classList.add('flex');
};

function startDeadlineWatchdog() {
    setInterval(async () => {
        const activeSession = sessionStorage.getItem('guss_active_intake_session');
        if (!activeSession) return;
        const deadlineStr = RAM_VAULT[`guss_admission_deadline_${activeSession}`];
        const currentState = RAM_VAULT[`guss_admission_portal_state_${activeSession}`] || 'CLOSED';

        if (deadlineStr && currentState === 'OPEN' && Date.now() > new Date(deadlineStr).getTime()) {
            await syncConfigFromCloud();
            loadGlobalConfig();
        }
    }, 30000);
}

window.exportRegistryData = async function () {
    const scopeSelect = (document.getElementById('exportScopeFilter') || document.getElementById('exportScopeSelect'))?.value || 'ALL';
    const formatSelect = document.getElementById('exportFormatSelect')?.value || 'EXCEL';

    try {
        const response = await fetch(`${ENV.API_BASE_URL}/api/admin/export/registry?format=${encodeURIComponent(formatSelect)}&targetScope=${encodeURIComponent(scopeSelect)}`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${sessionStorage.getItem('guss_access_token')}`
            }
        });

        if (response.ok) {
            const blob = await response.blob();
            const extension = formatSelect.toUpperCase().includes('EXCEL') || formatSelect.toUpperCase().includes('CSV') ? 'csv' : 'txt';
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `GUSS_Registry_${scopeSelect}_${new Date().toISOString().slice(0, 10)}.${extension}`;
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            a.remove();
        } else {
            Swal.fire('Export Denied', 'Unable to generate registry dump.', 'error');
        }
    } catch (e) {
        Swal.fire('Network Error', 'Failed to reach Export Endpoint.', 'error');
    }
};

window.bulkRejectProvisionals = async function () {
    const reasonInput = document.getElementById('bulkRejectReason').value.trim();
    if (!reasonInput) return Swal.fire('Validation Error', 'You must provide an official reason for the mass purge.', 'warning');

    const authRes = await Swal.fire({
        title: 'Zero-Trust Mass Purge',
        html: `You are about to reject all provisionally pooled applicants.<br><br>Enter Admin Password to proceed:`,
        input: 'password',
        inputAttributes: { autocapitalize: 'off', autocorrect: 'off' },
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#ef4444',
        confirmButtonText: '<i class="fa-solid fa-trash-can"></i> Authorize Purge'
    });

    if (!authRes.isConfirmed || !authRes.value) return;

    try {
        //   Routed through ApiGateway.post
        const data = await ApiGateway.post('/admin/bulk-reject-provisional', {
            reason: reasonInput,
            adminPassword: authRes.value
        });

        if (data) {
            Swal.fire('Purge Complete', data.message, 'success');
            document.getElementById('bulkRejectReason').value = '';
            fetchLiveApplications();
            await refreshLightweightRegistry();
        }
    } catch (error) {
        Swal.fire('Authorization Failed', error.message || 'Server rejected mass rejection.', 'error');
    }
};

window.bulkQuarantineUncleared = async function () {
    const reasonInput = document.getElementById('bulkQuarantineReason').value.trim();
    if (!reasonInput) return Swal.fire('Validation Error', 'You must provide an official reason for the mass quarantine.', 'warning');

    const authRes = await Swal.fire({
        title: 'Zero-Trust Mass Quarantine',
        html: `You are about to revoke admission for ALL students who have not completed physical clearance.<br><br>Enter Admin Password to proceed:`,
        input: 'password',
        inputAttributes: { autocapitalize: 'off', autocorrect: 'off' },
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#ea580c',
        confirmButtonText: '<i class="fa-solid fa-gavel"></i> Authorize Quarantine'
    });

    if (!authRes.isConfirmed || !authRes.value) return;

    try {
        //   Routed through ApiGateway.post
        const data = await ApiGateway.post('/admin/bulk-quarantine-uncleared', {
            reason: reasonInput,
            adminPassword: authRes.value
        });

        if (data) {
            Swal.fire('Quarantine Complete', data.message, 'success');
            document.getElementById('bulkQuarantineReason').value = '';
            fetchLiveApplications();
            await refreshLightweightRegistry();
        }
    } catch (error) {
        Swal.fire('Authorization Failed', error.message || 'Server rejected mass quarantine.', 'error');
    }
};

window.searchTribunalTarget = function () {
    const query = document.getElementById('tribunalSearchInput').value.trim().toLowerCase();
    if (!query) return;

    const globalRegistry = getStudentRegistrySafe();
    currentTribunalTarget = globalRegistry.find(s =>
        (s.admNo && s.admNo.toLowerCase() === query) ||
        (s.nin && s.nin.toLowerCase() === query)
    );

    if (!currentTribunalTarget) {
        Swal.fire('Target Not Found', `Target identity does not exist in the institutional database. Check the NIN or Admission Number.`, 'error');
        document.getElementById('tribunalTargetDisplay').classList.add('hidden');
        return;
    }

    document.getElementById('tribTargetPhoto').src = window.resolveMediaUrl(currentTribunalTarget.photoUrl || currentTribunalTarget.uploadPassport);
    document.getElementById('tribTargetName').textContent = DOMPurify.sanitize(currentTribunalTarget.fullName || currentTribunalTarget.name || 'UNKNOWN');
    document.getElementById('tribTargetId').textContent = DOMPurify.sanitize(`${currentTribunalTarget.admNo || 'PENDING'} | NIN: ${currentTribunalTarget.nin}`);

    const statusEl = document.getElementById('tribTargetStatus');
    const btnGuillotine = document.getElementById('btnExecuteGuillotine');
    const btnLazarus = document.getElementById('btnExecuteLazarus');
    const reasonSelect = document.getElementById('tribunalReason');

    const liveSession = sessionStorage.getItem('guss_live_session') || "2027/2028 SESSION";
    const currentSelected = sessionStorage.getItem('guss_selected_session');
    const currentSessionStr = liveSession.split(' ')[0];
    const startYear = parseInt(currentSessionStr.substring(0, 4));
    const nextSessionStr = `${startYear + 1}/${startYear + 2} SESSION`;

    const isHistorical = currentSelected !== liveSession && currentSelected !== nextSessionStr;

    const oldWarning = document.getElementById('tribunalHistoricalWarning');
    if (oldWarning) oldWarning.remove();

    if (isHistorical) {
        statusEl.textContent = currentTribunalTarget.status === 'REVOKED_QUARANTINED' ? `QUARANTINED (ARCHIVED)` : `ACTIVE (ARCHIVED)`;
        statusEl.className = "ml-auto text-[9px] font-black uppercase px-2 py-1 rounded bg-slate-800 text-slate-400 border border-slate-600";

        btnGuillotine.classList.add('hidden');
        btnLazarus.classList.add('hidden');
        reasonSelect.classList.add('hidden');

        const warningDiv = document.createElement('div');
        warningDiv.id = 'tribunalHistoricalWarning';
        warningDiv.className = 'mt-4 bg-amber-50 border border-amber-200 p-3 rounded-lg text-[10px] font-black text-amber-800 uppercase tracking-widest text-center';
        warningDiv.innerHTML = '<i class="fa-solid fa-lock mr-1"></i> Tribunal actions disabled in Historical Archive Mode. Return to LIVE session to execute judgments.';
        document.getElementById('tribunalTargetDisplay').appendChild(warningDiv);
    } else {
        if (currentTribunalTarget.status === 'REVOKED_QUARANTINED') {
            statusEl.textContent = `QUARANTINED`;
            statusEl.className = "ml-auto text-[9px] font-black uppercase px-2 py-1 rounded bg-red-950 text-red-500 border border-red-800";
            btnGuillotine.classList.add('hidden');
            reasonSelect.classList.add('hidden');
            btnLazarus.classList.remove('hidden');
        } else {
            statusEl.textContent = `ACTIVE IDENTITY`;
            statusEl.className = "ml-auto text-[9px] font-black uppercase px-2 py-1 rounded bg-emerald-950 text-emerald-500 border border-emerald-800";
            btnGuillotine.classList.remove('hidden');
            reasonSelect.classList.remove('hidden');
            btnLazarus.classList.add('hidden');
        }
    }

    document.getElementById('tribunalTargetDisplay').classList.remove('hidden');
};

window.executeGuillotine = async function () {
    if (!currentTribunalTarget) return;
    const reason = document.getElementById('tribunalReason').value;

    const authRes = await Swal.fire({
        title: 'Zero-Trust Guillotine Protocol',
        html: `Executing quarantine on <b>${DOMPurify.sanitize(currentTribunalTarget.name)}</b>.<br><br>Confirm protocol execution:`,
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#ef4444',
        confirmButtonText: '<i class="fa-solid fa-skull"></i> Execute Quarantine'
    });

    if (!authRes.isConfirmed) return;
    processTribunalAction("GUILLOTINE", reason);
};

window.executeLazarus = async function () {
    if (!currentTribunalTarget) return;

    const authRes = await Swal.fire({
        title: 'Zero-Trust Lazarus Reinstatement',
        html: `Reinstating admission privileges for <b>${DOMPurify.sanitize(currentTribunalTarget.name)}</b>.<br><br>Confirm reinstatement:`,
        icon: 'info',
        showCancelButton: true,
        confirmButtonColor: '#059669',
        confirmButtonText: '<i class="fa-solid fa-unlock-keyhole"></i> Authorize Reinstatement'
    });

    if (!authRes.isConfirmed) return;
    processTribunalAction("LAZARUS", "Legal/Administrative Reinstatement Executed.");
};

async function processTribunalAction(action, reason) {
    const authRes = await Swal.fire({
        title: 'Zero-Trust Authorization',
        html: `Executing <b>${action}</b> protocol.<br><br>Enter Admin Password to authorize:`,
        input: 'password',
        inputAttributes: { autocapitalize: 'off', autocorrect: 'off' },
        icon: action === 'GUILLOTINE' ? 'error' : 'warning',
        showCancelButton: true,
        confirmButtonColor: action === 'GUILLOTINE' ? '#dc2626' : '#10b981',
        confirmButtonText: 'Authorize Action'
    });

    if (!authRes.isConfirmed || !authRes.value) return;

    try {
        //   Routed through ApiGateway.post
        const data = await ApiGateway.post('/admin/tribunal/revoke', {
            nin: currentTribunalTarget.nin,
            action: action,
            reason: reason,
            adminPassword: authRes.value
        });

        if (data) {
            Swal.fire('Protocol Executed', data.message, 'success');
            if (currentTribunalTarget) {
                currentTribunalTarget.status = action === 'GUILLOTINE' ? 'REVOKED_QUARANTINED' : 'ADMITTED';
            }
            fetchLiveApplications();
            document.getElementById('tribunalTargetDisplay').classList.add('hidden');
            await refreshLightweightRegistry();
        }
    } catch (error) {
        Swal.fire('Authorization Failed', error.message || 'Tribunal command rejected.', 'error');
    }
}

function populateDynamicExportScopes() {
    const registry = getStudentRegistrySafe();
    const classSet = new Set();

    registry.forEach(s => {
        if (s.assignedClass && !s.assignedClass.includes("Pending") && s.assignedClass !== "QUARANTINED") {
            classSet.add(s.assignedClass.toUpperCase());
        }
    });

    const sortedClasses = Array.from(classSet).sort();
    const selectEl = document.getElementById('exportScopeFilter');
    if (!selectEl) return;

    let htmlBuffer = `
        <option value="ALL">Entire Registry Database</option>
        <optgroup label="Global Sections">
            <option value="JUNIOR_SECONDARY">All Junior Secondary (JSS 1-3)</option>
            <option value="SENIOR_SECONDARY">All Senior Secondary (SSS 1-3)</option>
        </optgroup>
        <optgroup label="Active Class Arms (Dynamic)">
    `;

    sortedClasses.forEach(cls => {
        htmlBuffer += `<option value="${DOMPurify.sanitize(cls)}">${DOMPurify.sanitize(cls)}</option>`;
    });

    htmlBuffer += `</optgroup>`;
    selectEl.innerHTML = htmlBuffer;
}