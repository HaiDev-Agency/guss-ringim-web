// =====================================================================
// G.U.S.S. RINGIM — CHIEF EXAMINER OVERSEER CONTROLLER
// ENTERPRISE HARDENED SPECIFICATION
// =====================================================================
import { ENV } from './core_config.js';
import { ApiGateway } from './api_gateway.js';
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

function base64ToBlob(base64Data, contentType = 'image/jpeg') {
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
}

window.toTitleCase = function (str) {
    return str.toLowerCase().split(' ').map(word => {
        if (word.includes('.') || word.includes('(') || word.includes('-')) return word.toUpperCase();
        return word.charAt(0).toUpperCase() + word.slice(1);
    }).join(' ');
};

window.alphaSort = function (arr) {
    if (!Array.isArray(arr)) return [];
    return [...arr].sort((a, b) => String(a || '').localeCompare(String(b || ''), undefined, { numeric: true, sensitivity: 'base' }));
};

// ==========================================
// 1. STATE & CONSTANTS
// ==========================================
let activeConfigTarget = null;
let activeConfigType = null;
let DB_CLASSES = [];

let activeExaminerId = sessionStorage.getItem('guss_staff_id');
let activeExaminerName = sessionStorage.getItem('guss_user_name') || "Chief Examiner";
let activeChiefProfile = {};

let RAM_VAULT = {};
let RAM_STUDENT_REGISTRY = [];
let CLASS_ROSTER_CACHE = {};

window.broadsheetDataCache = [];
window.broadsheetSubjectsCache = [];
window.activeAmendmentsCache = [];
window.currentBroadsheetPage = 1;

const parseVault = (key) => {
    const cloudConfigs = Object.keys(RAM_VAULT).length > 0 ? RAM_VAULT : (JSON.parse(sessionStorage.getItem('cloud_configs')) || {});
    let data = cloudConfigs[key];
    if (!data) return {};
    if (typeof data === 'object') return data;
    try {
        let parsed = JSON.parse(data);
        if (typeof parsed === 'string') parsed = JSON.parse(parsed);
        RAM_VAULT[key] = parsed;
        return parsed;
    } catch (e) { return data; }
};

function getStudentRegistrySafe() {
    if (Array.isArray(RAM_STUDENT_REGISTRY) && RAM_STUDENT_REGISTRY.length > 0) return RAM_STUDENT_REGISTRY;
    try {
        const stored = JSON.parse(sessionStorage.getItem('cloud_student_registry'));
        if (Array.isArray(stored)) return stored;
    } catch (e) { }
    return [];
}

// ==========================================
// 2. BOOT SEQUENCE (RESTORED & ARMORED)
// ==========================================
window.onload = async function () {
    // 1. Boot Global UI Components, Role Switcher & Telemetry
    CoreUI.init();

    // 2. Boot Time Machine Header Dropdown
    await SessionManager.initHeaderDropdown();

    // 3. Hydrate Terminal Infrastructure & Relational Data
    await window.syncPostgresToLocal();
    await window.fetchRelationalInfrastructure();
    resolveExaminerIdentity();
    populateDynamicChiefDropdowns();
    initializeCommencementPhases();
    initializeTemporalLock();
    renderGlobalPublishStatus();

    // 4. Default to Audit Matrix & Apply Historical Lock
    window.switchTab('audit');
    window.applyArchiveReadonlyState();
};

//  TIME TRAVEL LISTENER
window.addEventListener('gussTimeMachineChanged', () => {
    window.applyArchiveReadonlyState();
    if (!document.getElementById('tabContentAudit').classList.contains('hidden')) {
        renderChiefAuditMatrix();
    } else if (!document.getElementById('tabContentBroadsheet').classList.contains('hidden')) {
        window.loadMasterBroadsheet();
    } else if (!document.getElementById('tabContentRegistry').classList.contains('hidden')) {
        window.renderRestrictionsRegistry();
    }
});

window.fetchRelationalInfrastructure = async function () {
    try {
        const clsRes = await ApiGateway.get('/dd/academics/classes').catch(() => []);
        DB_CLASSES = Array.isArray(clsRes) ? clsRes : [];
    } catch (e) { console.error("Failed to load relational infrastructure.", e); }
};

function resolveExaminerIdentity() {
    activeExaminerName = sessionStorage.getItem('guss_user_name') || "Chief Examiner";
    activeChiefProfile.signatureUrl = sessionStorage.getItem('guss_signature_url') || "";
    const nameDisplay = document.getElementById('activeExaminerNameDisplay');
    if (nameDisplay) nameDisplay.textContent = DOMPurify.sanitize(activeExaminerName);
}

// =====================================================================
// TOTAL ARCHIVE IMMUTABILITY ENGINE
// =====================================================================
window.applyArchiveReadonlyState = function () {
    const isHistorical = SessionManager.isHistoricalArchiveMode();
    const mainContent = document.querySelector('main');
    if (!mainContent) return;

    const oldBanner = document.getElementById('chiefHistoricalBanner');
    if (oldBanner) oldBanner.remove();

    const commencementPanel = document.querySelector('.bg-white.border.border-slate-200.rounded-2xl.p-4.shadow-sm.flex.flex-col.lg\\:flex-row');
    const publishControls = document.getElementById('publishingControls');

    if (isHistorical) {
        const banner = document.createElement('div');
        banner.id = 'chiefHistoricalBanner';
        banner.className = 'bg-red-50 border-l-4 border-red-500 p-4 mb-6 rounded-r-xl shadow-sm w-full animate-fade-in';
        banner.innerHTML = `
            <h3 class="text-red-800 font-black uppercase tracking-widest text-xs"><i class="fa-solid fa-lock mr-2"></i> HISTORICAL ARCHIVE SEALED (READ-ONLY)</h3>
            <p class="text-red-700 text-[10px] mt-1 font-bold">You are reviewing a sealed academic epoch. Results publishing, revoking, grading phase toggles, timeline overrides, and student penalties are strictly disabled.</p>
        `;
        mainContent.prepend(banner);

        if (commencementPanel) commencementPanel.classList.add('hidden');
        if (publishControls) publishControls.classList.add('hidden');

        const inputs = mainContent.querySelectorAll('input:not([id*="Search"]), select:not(#broadsheetClassSelector), textarea');
        inputs.forEach(input => {
            input.setAttribute('data-archived-disabled', 'true');
            input.disabled = true;
            input.classList.add('opacity-50', 'cursor-not-allowed');
        });

        const actionButtons = mainContent.querySelectorAll('button:not([id^="tabBtn"]):not([onclick*="print"]):not([onclick*="openConfigModal"])');
        actionButtons.forEach(btn => {
            btn.setAttribute('data-archived-hidden', 'true');
            btn.classList.add('hidden');
        });
    } else {
        if (commencementPanel) commencementPanel.classList.remove('hidden');
        if (publishControls) publishControls.classList.remove('hidden');

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
    }
};

window.isHistoricalArchiveMode = function () {
    return SessionManager.isHistoricalArchiveMode();
};

window.syncPostgresToLocal = async function (skipStudents = false) {
    const toxicKeys = ['guss_gallery_db', 'rinoba_users_db', 'cloud_staff_registry', 'guss_staff_registry', 'cloud_student_registry', 'guss_teacher_allocations', 'guss_form_masters', 'guss_house_masters', 'guss_system_logs', 'guss_communications'];
    toxicKeys.forEach(toxicKey => {
        localStorage.removeItem(toxicKey);
        sessionStorage.removeItem(toxicKey);
    });

    if (!skipStudents) CLASS_ROSTER_CACHE = {};

    try {
        //   Added the fetch for /director/epoch/current
        const [confRes, staffRes, stdRes, epochRes] = await Promise.all([
            ApiGateway.get('/config/all').catch(() => null),
            ApiGateway.get('/ict/staff/all-lightweight').catch(() => null),
            skipStudents ? Promise.resolve(null) : ApiGateway.get('/bridge/all-lightweight').catch(() => null),
            ApiGateway.get('/director/epoch/current').catch(() => null)
        ]);

        //   Hydrate the RAM_VAULT with the current epoch
        if (epochRes) {
            RAM_VAULT['current_epoch'] = epochRes;
        }

        if (confRes) {
            Object.keys(confRes).forEach(k => RAM_VAULT[k] = confRes[k]);
            const lightConfigs = {};
            Object.keys(confRes).forEach(k => {
                if (!k.startsWith('guss_grades_') && !k.startsWith('guss_eval_')) lightConfigs[k] = confRes[k];
            });

            const allowedLocalStorageKeys = ['guss_academic_session', 'guss_global_deadline', 'guss_deadline_reason', 'guss_ca_status', 'guss_exam_status', 'guss_global_publish_status'];
            try {
                sessionStorage.setItem('cloud_configs', JSON.stringify(lightConfigs));
                Object.keys(lightConfigs).forEach(k => {
                    if (allowedLocalStorageKeys.includes(k)) localStorage.setItem(k, lightConfigs[k]);
                });
            } catch (e) { }
        }

        if (staffRes && Array.isArray(staffRes)) {
            try { sessionStorage.setItem('cloud_staff_registry', JSON.stringify(staffRes)); } catch (e) { }
        }

        if (stdRes && Array.isArray(stdRes) && !skipStudents) {
            stdRes.forEach(s => { if (s.uploadSignature) s.signatureUrl = s.uploadSignature; });
            RAM_STUDENT_REGISTRY = stdRes;
        }
    } catch (error) { console.error("Cloud Sync Error:", error); }
};

window.saveConfigToCloud = async function (configPayload) {
    try {
        await ApiGateway.post('/config/save', configPayload);
        Object.keys(configPayload).forEach(k => { RAM_VAULT[k] = configPayload[k]; });
        localStorage.setItem('guss_global_sync_pulse', Date.now().toString());
    } catch (error) {
        Swal.fire('Error', "Failed to sync configuration to Vault.", 'error');
        throw error;
    }
};

function getAllAdmittedStudents() {
    let pendingDB = getStudentRegistrySafe();
    if (!Array.isArray(pendingDB)) pendingDB = [];
    return pendingDB.filter(app => app.status === 'ADMITTED');
}

function getDynamicRoster(targetClass) {
    if (Object.keys(CLASS_ROSTER_CACHE).length === 0) {
        const students = getAllAdmittedStudents();
        students.forEach(s => {
            const cls = s.assignedClass || "Unassigned";
            if (!CLASS_ROSTER_CACHE[cls]) CLASS_ROSTER_CACHE[cls] = [];
            CLASS_ROSTER_CACHE[cls].push(s);
        });
    }
    return CLASS_ROSTER_CACHE[targetClass] || [];
}

window.switchTab = function (tabId) {
    ['audit', 'broadsheet', 'registry'].forEach(id => {
        const btn = document.getElementById(`tabBtn${id.charAt(0).toUpperCase() + id.slice(1)}`);
        const content = document.getElementById(`tabContent${id.charAt(0).toUpperCase() + id.slice(1)}`);
        if (!btn || !content) return;

        if (id === tabId) {
            btn.className = "flex-1 whitespace-nowrap lg:flex-none px-6 py-3 rounded-xl text-xs font-black uppercase tracking-widest transition-all bg-white shadow text-gussNavy border border-slate-200";
            content.classList.remove('hidden');
            if (id === 'registry') content.classList.add('grid');
            else if (id === 'broadsheet') content.classList.add('flex');
            else content.classList.add('block');
        } else {
            btn.className = "flex-1 whitespace-nowrap lg:flex-none px-6 py-3 rounded-xl text-xs font-black uppercase tracking-widest transition-all text-slate-500 hover:text-gussNavy";
            content.classList.add('hidden');
            content.classList.remove('grid', 'flex', 'block');
        }
    });

    if (tabId === 'audit') renderChiefAuditMatrix();
    else if (tabId === 'broadsheet') window.loadMasterBroadsheet();
    else if (tabId === 'registry') window.renderRestrictionsRegistry();
};

function initializeCommencementPhases() {
    const caToggle = document.getElementById('caPhaseToggle');
    const examToggle = document.getElementById('examPhaseToggle');
    const epoch = RAM_VAULT['current_epoch'] || {};
    if (caToggle) caToggle.checked = epoch.caStatus === 'OPEN';
    if (examToggle) examToggle.checked = epoch.examStatus === 'OPEN';
}

window.toggleAssessmentPhase = async function (phase) {
    if (SessionManager.isHistoricalArchiveMode()) {
        return Swal.fire('Archive Lockout', 'Modifying assessment phases is prohibited in historical view.', 'error');
    }

    const toggleEl = phase === 'CA' ? document.getElementById('caPhaseToggle') : document.getElementById('examPhaseToggle');
    if (!toggleEl) return;

    const isChecked = toggleEl.checked;
    const statusText = isChecked ? 'OPEN' : 'CLOSED';

    //   Strict Zero-Trust Password Prompt
    const authRes = await Swal.fire({
        title: 'Zero-Trust Authorization',
        html: `You are about to turn the ${phase} grading phase to <b>${statusText}</b> globally.<br><br>Enter Admin Password:`,
        input: 'password',
        inputAttributes: { autocapitalize: 'off', autocorrect: 'off' },
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: isChecked ? '#2563eb' : '#ef4444',
        confirmButtonText: 'Authorize'
    });

    if (!authRes.isConfirmed || !authRes.value) {
        toggleEl.checked = !isChecked; // Revert toggle if cancelled
        return;
    }

    try {
        const payload = phase === 'CA' ? { caStatus: statusText, adminPassword: authRes.value } : { examStatus: statusText, adminPassword: authRes.value };
        await ApiGateway.post('/academics/chief/timeline/update', payload);

        await window.syncPostgresToLocal(true);
        initializeCommencementPhases(); // Re-hydrate UI
        Swal.fire('Updated', `The ${phase} assessment phase is now ${statusText} globally.`, 'success');
    } catch (e) {
        toggleEl.checked = !isChecked;
        Swal.fire('Authorization Failed', e.message || 'Invalid Password.', 'error');
    }
};

function initializeTemporalLock() {
    const timerDisplay = document.getElementById('gradingTimerDisplay');
    if (!timerDisplay) return;

    const epoch = RAM_VAULT['current_epoch'] || {};
    const deadline = epoch.globalDeadline;

    if (!deadline || typeof deadline !== 'string') {
        timerDisplay.innerHTML = `<i class="fa-solid fa-infinity text-blue-400"></i> Open Timeline`;
        timerDisplay.className = "hidden sm:flex items-center gap-2 bg-slate-800 border border-slate-700 text-blue-300 px-3 py-1 rounded-md text-[10px] shadow-inner";
        return;
    }
    const distance = new Date(deadline + "T23:59:59").getTime() - new Date().getTime();
    if (distance < 0) {
        timerDisplay.innerHTML = `<i class="fa-solid fa-lock text-red-400"></i> SYSTEM LOCKED`;
        timerDisplay.className = "hidden sm:flex items-center gap-2 bg-slate-900/80 text-red-400 px-3 py-0.5 rounded-full border border-red-800/50 text-[10px]";
    } else {
        const days = Math.floor(distance / (1000 * 60 * 60 * 24));
        timerDisplay.innerHTML = `<i class="fa-solid fa-lock-open text-emerald-400"></i> ${days} Days Remaining`;
        timerDisplay.className = "hidden sm:flex items-center gap-2 bg-emerald-900/40 text-emerald-200 px-3 py-0.5 rounded-full border border-emerald-800/50 text-[10px]";
    }
}

window.openGlobalActionModal = async function (actionType) {
    if (SessionManager.isHistoricalArchiveMode()) {
        return Swal.fire('Archive Lockout', 'Overriding global deadlines is prohibited in historical view.', 'error');
    }

    const newDate = document.getElementById('globalDeadlineInput').value;
    if (!newDate) return Swal.fire('Validation Error', "Please select a valid target date first.", 'error');

    //   Combined Reason and Password Prompt
    const { value: formValues } = await Swal.fire({
        title: 'Global Deadline Override',
        html: `
            <p class="text-xs text-slate-500 mb-3">You are about to globally ${actionType.toLowerCase()} the deadline to <b>${newDate}</b>.</p>
            <input id="swal-reason" class="swal2-input" placeholder="Official Reason for Extension/Squeeze">
            <input id="swal-password" type="password" class="swal2-input" placeholder="Admin Password">
        `,
        focusConfirm: false,
        showCancelButton: true,
        confirmButtonColor: actionType === 'EXTEND' ? '#10b981' : '#ef4444',
        confirmButtonText: 'Enforce Override',
        preConfirm: () => {
            const reason = document.getElementById('swal-reason').value.trim();
            const password = document.getElementById('swal-password').value.trim();
            if (!reason || !password) {
                Swal.showValidationMessage('Both Reason and Password are required.');
                return false;
            }
            return { reason, password };
        }
    });

    if (!formValues) return;

    try {
        await ApiGateway.post('/academics/chief/timeline/update', {
            newDeadline: newDate,
            reason: formValues.reason,
            adminPassword: formValues.password
        });

        await window.syncPostgresToLocal(true);
        initializeTemporalLock();
        Swal.fire('Success', "Global timeline updated natively and staff notified.", 'success');
    } catch (e) {
        Swal.fire('Authorization Failed', e.message || 'Invalid Password.', 'error');
    }
};

function renderGlobalPublishStatus() {
    const panel = document.getElementById('globalStatusPanel');
    if (!panel) return;

    const isPublished = parseVault('guss_global_publish_status') === 'published';
    if (isPublished) {
        panel.innerHTML = `<span class="bg-emerald-100 text-emerald-800 border border-emerald-200 px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest"><i class="fa-solid fa-globe mr-1"></i> Results Published</span><button onclick="window.revokeGlobalResults()" class="bg-red-600 hover:bg-red-700 text-white px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider shadow-sm transition-colors"><i class="fa-solid fa-triangle-exclamation mr-1"></i> Revoke School-Wide</button>`;
    } else {
        panel.innerHTML = `<span class="bg-slate-200 text-slate-600 border border-slate-300 px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest"><i class="fa-solid fa-hourglass-half mr-1"></i> Compilation Pending</span><button onclick="window.publishAllResults()" class="bg-gussGreen hover:bg-emerald-800 text-white px-4 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider shadow-sm transition-colors"><i class="fa-solid fa-bullhorn mr-1"></i> Publish Term Results</button>`;
    }
}

window.publishAllResults = async function () {
    if (SessionManager.isHistoricalArchiveMode()) {
        return Swal.fire('Archive Lockout', 'Publishing results is prohibited in historical view.', 'error');
    }

    const auditBody = document.getElementById('chiefAuditBody');
    if (auditBody && auditBody.innerText.includes('Pending Data')) return Swal.fire('Publication Aborted', "One or more classes are missing data.", 'error');

    const authRes = await Swal.fire({
        title: 'Zero-Trust Authorization',
        html: `You are about to push results to the Student Portals globally.<br><br>Enter Admin Password to execute:`,
        input: 'password',
        inputAttributes: { autocapitalize: 'off', autocorrect: 'off' },
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#059669',
        confirmButtonText: '<i class="fa-solid fa-bullhorn"></i> Authorize Publish'
    });

    if (!authRes.isConfirmed || !authRes.value) return;

    try {
        await ApiGateway.post('/academics/chief/publish', { status: 'published', adminPassword: authRes.value });
        await window.saveConfigToCloud({ 'guss_global_publish_status': 'published' });
        renderGlobalPublishStatus();
        Swal.fire('Published', 'Results are now live globally.', 'success');
    } catch (e) {
        Swal.fire('Authorization Failed', e.message || 'Invalid Password.', 'error');
    }
};

window.revokeGlobalResults = async function () {
    if (SessionManager.isHistoricalArchiveMode()) {
        return Swal.fire('Archive Lockout', 'Revoking results is prohibited in historical view.', 'error');
    }

    const authRes = await Swal.fire({
        title: 'Zero-Trust Revocation',
        html: `CRITICAL: This pulls all results offline instantly. Students will lose access.<br><br>Enter Admin Password to execute:`,
        input: 'password',
        inputAttributes: { autocapitalize: 'off', autocorrect: 'off' },
        icon: 'error',
        showCancelButton: true,
        confirmButtonColor: '#ef4444',
        confirmButtonText: '<i class="fa-solid fa-triangle-exclamation"></i> Authorize Revocation'
    });

    if (!authRes.isConfirmed || !authRes.value) return;

    try {
        await ApiGateway.post('/academics/chief/publish', { status: 'revoked', adminPassword: authRes.value });
        await window.saveConfigToCloud({ 'guss_global_publish_status': 'revoked' });
        renderGlobalPublishStatus();
        Swal.fire('Revoked', 'Results have been pulled offline.', 'success');
    } catch (e) {
        Swal.fire('Authorization Failed', e.message || 'Invalid Password.', 'error');
    }
};

window.pushSystemAnnouncement = async function () {
    if (SessionManager.isHistoricalArchiveMode()) {
        return Swal.fire('Archive Lockout', 'Publishing broadcasts is prohibited in historical view.', 'error');
    }

    const input = document.getElementById('broadcastInput');
    const msg = input ? input.value.trim() : '';
    if (!msg) return Swal.fire('Error', 'Please enter a message to broadcast.', 'warning');

    const authRes = await Swal.fire({
        title: 'Zero-Trust Broadcast',
        html: `Push this announcement to all student portals?<br><br>Enter Admin Password to execute:`,
        input: 'password',
        inputAttributes: { autocapitalize: 'off', autocorrect: 'off' },
        icon: 'info',
        showCancelButton: true,
        confirmButtonColor: '#2563eb',
        confirmButtonText: '<i class="fa-solid fa-paper-plane"></i> Authorize Broadcast'
    });

    if (!authRes.isConfirmed || !authRes.value) return;

    try {
        await ApiGateway.post('/academics/chief/broadcast', { message: msg, adminPassword: authRes.value });
        Swal.fire('Sent', 'Broadcast pushed to all student nodes.', 'success');
        if (input) input.value = '';
    } catch (e) {
        Swal.fire('Authorization Failed', e.message || 'Invalid Password.', 'error');
    }
};

function buildDynamicSchoolHierarchy() {
    const students = getAllAdmittedStudents();
    const activeClasses = [...new Set(students.map(s => s.assignedClass))]
        .filter(cls => typeof cls === 'string' && cls.trim() !== '')
        .sort();

    const jssClasses = activeClasses.filter(c => c.startsWith('JSS'));
    const sssClasses = activeClasses.filter(c => c.startsWith('SSS'));

    let hierarchy = [];
    if (jssClasses.length > 0) hierarchy.push({ sectionId: "JUNIOR_SECTION", sectionName: "Junior Secondary", classes: jssClasses });
    if (sssClasses.length > 0) hierarchy.push({ sectionId: "SENIOR_SECTION", sectionName: "Senior Secondary", classes: sssClasses });

    return hierarchy;
}

// ==========================================
// 100% CLOUD-BASED CHIEF AUDIT MATRIX 
// ==========================================
async function renderChiefAuditMatrix() {
    const auditBody = document.getElementById('chiefAuditBody');
    if (!auditBody) return;

    auditBody.innerHTML = `<tr><td colspan="6" class="py-12 text-center text-slate-400 font-medium text-xs"><i class="fa-solid fa-spinner fa-spin text-3xl mb-3 opacity-20 block"></i> Compiling Global Hierarchy from Central Vault...</td></tr>`;

    try {
        const activeContext = SessionManager.getCurrentContextString();
        const dynamicHierarchy = await ApiGateway.get(`/academics/chief/audit?session=${encodeURIComponent(activeContext)}`);

        if (!dynamicHierarchy || dynamicHierarchy.length === 0) {
            auditBody.innerHTML = `<tr><td colspan="6" class="py-12 text-center text-slate-400 font-medium text-xs"><i class="fa-solid fa-school-circle-xmark text-3xl mb-3 opacity-20 block"></i>No commissioned classes found in the registry.</td></tr>`;
            return;
        }

        let htmlBuffer = '';

        dynamicHierarchy.forEach(section => {
            const secConfig = parseVault(`guss_config_${section.sectionId}`);
            const secBadge = (secConfig && (secConfig.withholdClass || secConfig.customDeadline)) ? '<span class="absolute -top-1 -right-1 w-2.5 h-2.5 bg-red-500 rounded-full border-2 border-white"></span>' : '';

            htmlBuffer += `
                <tr class="bg-slate-200/60 border-y border-slate-300">
                    <td colspan="5" class="py-3 px-4 font-black text-xs text-gussNavy uppercase tracking-widest"><i class="fa-solid fa-layer-group mr-2 text-slate-400"></i> ${DOMPurify.sanitize(section.sectionName)}</td>
                    <td class="py-3 px-4 text-right"><button onclick="window.openConfigModal('${DOMPurify.sanitize(section.sectionId)}', '${DOMPurify.sanitize(section.sectionName)}', 'SECTION')" class="bg-white hover:bg-slate-50 text-slate-700 px-3 py-1.5 rounded-lg text-[10px] font-black uppercase shadow-sm relative transition-colors"><i class="fa-solid fa-gears mr-1"></i> Section Config ${secBadge}</button></td>
                </tr>
            `;

            section.classes.forEach(classData => {
                const badgeClass = classData.isReady ? "bg-emerald-100 text-emerald-800 border-emerald-200" : "bg-orange-100 text-orange-800 border-orange-200";

                const classConfig = parseVault(`guss_config_${classData.className.replace(/\s/g, '')}`);
                let hasStudentConfig = classConfig && ((classConfig.withheldStudents && classConfig.withheldStudents.length > 0) || (classConfig.studentDeadlines && Object.keys(classConfig.studentDeadlines).length > 0));
                const classBadge = (classConfig && (classConfig.withholdClass || hasStudentConfig || classConfig.customDeadline)) ? '<span class="absolute -top-1 -right-1 w-2.5 h-2.5 bg-red-500 rounded-full border-2 border-white"></span>' : '';

                htmlBuffer += `
                    <tr class="hover:bg-slate-50 transition-colors border-b border-slate-100">
                        <td class="py-4 px-4 font-black text-sm text-gussNavy uppercase">${DOMPurify.sanitize(classData.className)}</td>
                        <td class="py-4 px-4"><div class="font-bold text-slate-700 text-xs uppercase"><i class="fa-solid fa-user-tie mr-1 text-slate-400"></i> ${DOMPurify.sanitize(classData.masterName)}</div><div class="text-[10px] font-mono text-blue-600 mt-0.5"><i class="fa-solid fa-phone mr-1"></i> ${DOMPurify.sanitize(classData.masterPhone)}</div></td>
                        <td class="py-4 px-4"><div class="flex flex-col items-center gap-1"><span class="text-[10px] font-black ${classData.acadProg === 100 ? 'text-emerald-600' : 'text-slate-500'}">${classData.acadProg}% Compiled</span><div class="w-3/4 bg-slate-200 rounded-full h-1"><div class="${classData.acadProg === 100 ? 'bg-emerald-500' : 'bg-blue-500'} h-1 rounded-full" style="width: ${classData.acadProg}%"></div></div></div></td>
                        <td class="py-4 px-4"><div class="flex flex-col items-center gap-1"><span class="text-[10px] font-black ${classData.pastProg === 100 ? 'text-emerald-600' : 'text-slate-500'}">${classData.pastProg}% Evaluated</span><div class="w-3/4 bg-slate-200 rounded-full h-1"><div class="${classData.pastProg === 100 ? 'bg-emerald-500' : 'bg-purple-500'} h-1 rounded-full" style="width: ${classData.pastProg}%"></div></div></div></td>
                        <td class="py-4 px-4 text-center"><span class="px-3 py-1.5 rounded text-[9px] font-black uppercase tracking-widest border ${badgeClass}">${classData.isReady ? "Cleared" : "Pending Data"}</span></td>
                        <td class="py-4 px-4 text-right"><button onclick="window.openConfigModal('${DOMPurify.sanitize(classData.className)}', '${DOMPurify.sanitize(classData.className)}', 'CLASS')" class="bg-slate-100 hover:bg-slate-200 text-slate-600 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors relative"><i class="fa-solid fa-gear mr-1"></i> Configure ${classBadge}</button></td>
                    </tr>
                `;
            });
        });

        auditBody.innerHTML = htmlBuffer;
    } catch (e) {
        auditBody.innerHTML = `<tr><td colspan="6" class="py-12 text-center text-red-500 font-bold text-xs"><i class="fa-solid fa-triangle-exclamation text-3xl mb-3 opacity-20 block"></i> Connection to Relational Audit Matrix Failed.</td></tr>`;
    }

    if (typeof window.loadGlobalAmendmentsQueue === 'function') {
        window.loadGlobalAmendmentsQueue();
    }
}

window.loadGlobalAmendmentsQueue = async function () {
    const panel = document.getElementById('activeAmendmentsPanel');
    const tbody = document.getElementById('activeAmendmentsBody');
    if (!panel || !tbody) return;

    try {
        const activeContext = SessionManager.getCurrentContextString();
        const orders = await ApiGateway.get(`/academics/chief/amendments/active-global?session=${encodeURIComponent(activeContext)}`);
        if (!orders || orders.length === 0) {
            panel.classList.add('hidden');
            return;
        }

        panel.classList.remove('hidden');
        let htmlBuffer = '';
        orders.forEach(o => {
            htmlBuffer += `
                <tr class="hover:bg-slate-50 transition-colors">
                    <td class="py-3 px-3"><div class="font-black text-slate-800 uppercase">${DOMPurify.sanitize(o.studentName)}</div><div class="font-mono text-[9px] text-slate-500">${DOMPurify.sanitize(o.admNo)}</div></td>
                    <td class="py-3 px-3 font-bold text-slate-700">${DOMPurify.sanitize(o.subjectName)}</td>
                    <td class="py-3 px-3 text-slate-600">${DOMPurify.sanitize(o.originalTeacher)}</td>
                    <td class="py-3 px-3 font-bold text-blue-600">${DOMPurify.sanitize(o.assignedMarker)}</td>
                    <td class="py-3 px-3 text-slate-500 text-[10px] max-w-xs truncate" title="${DOMPurify.sanitize(o.notes)}">${DOMPurify.sanitize(o.notes)}</td>
                    <td class="py-3 px-3 text-right">
                        <button onclick="window.reassignAmendmentAssessor('${o.orderId}', '${DOMPurify.sanitize(o.assignedMarker.replace(/'/g, "\\'"))}')" class="bg-red-50 hover:bg-red-100 text-red-600 border border-red-200 px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-wider transition-colors shadow-sm" data-archived-hidden="true">
                            <i class="fa-solid fa-shuffle mr-1"></i> Reassign
                        </button>
                    </td>
                </tr>
            `;
        });
        tbody.innerHTML = htmlBuffer;
    } catch (e) {
        panel.classList.add('hidden');
    }
};

function populateDynamicChiefDropdowns() {
    const classSelect = document.getElementById('broadsheetClassSelector');
    if (classSelect && DB_CLASSES && DB_CLASSES.length > 0) {
        classSelect.innerHTML = '<option value="">Select a class...</option>';
        const sortedClasses = window.alphaSort([...new Set(DB_CLASSES.map(c => `${c.level} ${c.arm}`))]);
        sortedClasses.forEach(cls => {
            classSelect.innerHTML += `<option value="${DOMPurify.sanitize(cls)}">${DOMPurify.sanitize(cls)}</option>`;
        });
    } else if (classSelect) {
        classSelect.innerHTML = '<option value="">No classes commissioned yet...</option>';
    }
}

// ==========================================
// BROADSHEET COMPILER
// ==========================================
window.loadMasterBroadsheet = async function () {
    const selectedClass = document.getElementById('broadsheetClassSelector').value;
    const thead = document.getElementById('broadsheetHead');
    const tbody = document.getElementById('broadsheetBody');
    const pubControls = document.getElementById('publishingControls');

    if (!thead || !tbody || !pubControls) return;

    if (!selectedClass) {
        thead.innerHTML = `<tr><th class="py-4 px-6 text-center text-slate-400">Select a class to generate broadsheet.</th></tr>`;
        tbody.innerHTML = '';
        pubControls.classList.add('hidden');
        pubControls.classList.remove('flex');
        return;
    }

    tbody.innerHTML = `<tr><td colspan="10" class="py-12 text-center text-slate-400 font-medium text-xs"><i class="fa-solid fa-spinner fa-spin text-3xl mb-3 opacity-20 block"></i> Syncing broadsheet data from PostgreSQL...</td></tr>`;

    try {
        const activeContext = SessionManager.getCurrentContextString();
        const data = await ApiGateway.get(`/academics/chief/broadsheet?className=${encodeURIComponent(selectedClass)}&session=${encodeURIComponent(activeContext)}`);

        window.broadsheetSubjectsCache = data.subjects || [];
        window.broadsheetDataCache = data.roster || [];

        if (window.broadsheetDataCache.length === 0) {
            thead.innerHTML = '';
            tbody.innerHTML = `<tr><td class="py-12 text-center text-slate-400 font-medium text-xs"><i class="fa-solid fa-users-slash text-3xl mb-3 opacity-20 block"></i>No admitted students or grade records found in this class.</td></tr>`;
            pubControls.classList.add('hidden');
            pubControls.classList.remove('flex');
            return;
        }

        let headHtml = `<tr>
            <th class="py-3 px-4 w-10 text-center border-r border-slate-200 bg-slate-100">S/N</th>
            <th class="py-3 px-4 w-64 border-r border-slate-200 bg-slate-100 sticky left-0 z-20 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]">Student Identity</th>`;

        window.broadsheetSubjectsCache.forEach(sub => {
            let shortSub = sub.substring(0, 3).toUpperCase();
            if (sub === "Mathematics") shortSub = "MTH";
            if (sub === "English Language") shortSub = "ENG";
            headHtml += `<th class="py-3 px-4 text-center border-r border-slate-200 text-blue-700 bg-blue-50/50" title="${DOMPurify.sanitize(sub)}">${DOMPurify.sanitize(shortSub)}</th>`;
        });

        headHtml += `<th class="py-3 px-4 text-center border-r border-slate-200 text-gussNavy bg-slate-100">Total</th>
                     <th class="py-3 px-4 text-center border-r border-slate-200 text-gussGreen bg-slate-100">Average</th>
                     <th class="py-3 px-4 text-center bg-slate-100 border-l border-slate-200">Position</th>
                     </tr>`;
        thead.innerHTML = headHtml;

        pubControls.classList.remove('hidden');
        pubControls.classList.add('flex');

        window.updatePublishUiState(data.isPublished === true);
        window.renderBroadsheetPage(1);

        if (typeof window.loadActiveAmendmentsUI === 'function') {
            window.loadActiveAmendmentsUI(selectedClass);
        }

    } catch (e) {
        tbody.innerHTML = `<tr><td colspan="10" class="py-12 text-center text-red-400 font-medium text-xs">Connection Error to Aggregation Engine.</td></tr>`;
    }
};

window.renderBroadsheetPage = function (pageNumber) {
    const tbody = document.getElementById('broadsheetBody');
    if (!tbody) return;

    window.currentBroadsheetPage = pageNumber;
    const pageSize = 50;
    const startIndex = (pageNumber - 1) * pageSize;
    const endIndex = startIndex + pageSize;
    const pageData = window.broadsheetDataCache.slice(startIndex, endIndex);

    let bodyHtmlBuffer = '';

    pageData.forEach((data, index) => {
        const absoluteIndex = data.position - 1;
        let posBadge = absoluteIndex === 0 ? `<span class="bg-gussGold text-white w-8 h-8 rounded-full flex items-center justify-center text-[10px] mx-auto shadow-sm font-black">1st</span>` :
            (absoluteIndex === 1 ? `<span class="bg-slate-300 text-slate-700 w-8 h-8 rounded-full flex items-center justify-center text-[10px] mx-auto shadow-sm font-black">2nd</span>` :
                (absoluteIndex === 2 ? `<span class="bg-orange-300 text-orange-900 w-8 h-8 rounded-full flex items-center justify-center text-[10px] mx-auto shadow-sm font-black">3rd</span>` :
                    `<span class="text-slate-500 font-black text-sm">${data.position}</span>`));

        let encodedScores = encodeURIComponent(JSON.stringify(data.scores));
        let hasActiveOrder = window.activeAmendmentsCache && window.activeAmendmentsCache.some(o => o.admNo === data.admNo);

        let actionCellHtml = hasActiveOrder
            ? `<span class="bg-amber-100 text-amber-800 px-2 py-1 rounded text-[8px] font-black uppercase tracking-widest border border-amber-200 ml-2"><i class="fa-solid fa-clock-rotate-left mr-1"></i> Pending Remark</span>`
            : `<button onclick="window.openStudentAmendmentModal('${DOMPurify.sanitize(data.admNo)}', '${encodedScores}')" class="bg-blue-50 hover:bg-blue-100 text-blue-600 border border-blue-200 px-2 py-1 rounded text-[8px] font-black uppercase tracking-widest shadow-sm transition-all ml-2" data-archived-hidden="true"><i class="fa-solid fa-pen-nib mr-1"></i> Remark</button>`;

        let trHtml = `
            <tr class="hover:bg-slate-50 transition-colors border-b border-slate-100">
                <td class="py-3 px-4 text-center border-r border-slate-100 bg-white text-xs font-bold text-slate-400">${startIndex + index + 1}</td>
                <td class="py-3 px-4 border-r border-slate-100 bg-white sticky left-0 z-10 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]">
                    <div class="font-black text-slate-800 text-xs uppercase">${DOMPurify.sanitize(data.name)}</div>
                    <div class="text-[9px] font-mono text-slate-500 mb-1">${DOMPurify.sanitize(data.admNo)}</div>
                    <div class="flex items-center mt-1">
                        <button onclick="window.printTermlyReportCard('${DOMPurify.sanitize(data.admNo)}', '${data.position}')" class="bg-gussNavy hover:bg-slate-800 text-white px-2 py-1 rounded text-[8px] font-black uppercase tracking-widest shadow-sm transition-colors"><i class="fa-solid fa-print mr-1"></i> Print</button>
                        ${actionCellHtml}
                    </div>
                </td>`;

        window.broadsheetSubjectsCache.forEach(sub => {
            let score = data.scores[sub];
            let colorClass = score === "-" ? "text-slate-300" : (score < 40 ? "text-red-500 font-bold" : "text-slate-700 font-bold");
            trHtml += `<td class="py-3 px-4 text-center border-r border-slate-100 ${colorClass} bg-slate-50/30">${score}</td>`;
        });

        trHtml += `
                <td class="py-3 px-4 text-center border-r border-slate-100 font-black text-gussNavy bg-white">${data.grandTotal}</td>
                <td class="py-3 px-4 text-center border-r border-slate-100 font-black text-gussGreen bg-emerald-50/20">${data.average}</td>
                <td class="py-3 px-4 text-center bg-white border-l border-slate-100">
                    ${posBadge}
                </td>
            </tr>`;
        bodyHtmlBuffer += trHtml;
    });

    const totalPages = Math.ceil(window.broadsheetDataCache.length / pageSize);
    if (totalPages > 1) {
        bodyHtmlBuffer += `
            <tr>
                <td colspan="${window.broadsheetSubjectsCache.length + 4}" class="py-4 px-6 bg-slate-50 border-t border-slate-200">
                    <div class="flex justify-between items-center">
                        <span class="text-xs font-bold text-slate-500 uppercase tracking-widest">Showing ${startIndex + 1} to ${Math.min(endIndex, window.broadsheetDataCache.length)} of ${window.broadsheetDataCache.length}</span>
                        <div class="flex gap-2">
                            <button onclick="window.renderBroadsheetPage(${pageNumber - 1})" ${pageNumber === 1 ? 'disabled' : ''} class="px-4 py-2 text-xs font-black uppercase tracking-widest rounded-lg border border-slate-300 ${pageNumber === 1 ? 'bg-slate-100 text-slate-400 cursor-not-allowed' : 'bg-white text-gussNavy hover:bg-slate-100 shadow-sm'}"><i class="fa-solid fa-chevron-left mr-1"></i> Prev</button>
                            <div class="flex items-center justify-center px-4 font-bold text-slate-700 text-xs bg-white border border-slate-200 rounded-lg shadow-inner">Page ${pageNumber} / ${totalPages}</div>
                            <button onclick="window.renderBroadsheetPage(${pageNumber + 1})" ${pageNumber === totalPages ? 'disabled' : ''} class="px-4 py-2 text-xs font-black uppercase tracking-widest rounded-lg border border-slate-300 ${pageNumber === totalPages ? 'bg-slate-100 text-slate-400 cursor-not-allowed' : 'bg-white text-gussNavy hover:bg-slate-100 shadow-sm'}">Next <i class="fa-solid fa-chevron-right ml-1"></i></button>
                        </div>
                    </div>
                </td>
            </tr>
        `;
    }

    tbody.innerHTML = bodyHtmlBuffer;
    window.applyArchiveReadonlyState();
};

window.printTermlyReportCard = async function (admNo, position) {
    const btn = window.event.currentTarget;
    const ogHtml = btn.innerHTML;
    btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i>`;
    btn.disabled = true;

    try {
        const activeContext = SessionManager.getCurrentContextString();
        const payload = {
            admNo: admNo,
            session: activeContext
        };

        const blob = await secureBlobFetch('/academics/chief/reports/generate', payload, 'POST');

        if (blob) {
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `Report_Card_${admNo.replace(/\//g, '_')}.pdf`;
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            a.remove();
        }
    } catch (e) {
        Swal.fire('Error', "Failed to generate Report Card. Ensure backend connectivity.", 'error');
    } finally {
        btn.innerHTML = ogHtml;
        btn.disabled = false;
    }
};

window.printClassBroadsheet = async function () {
    const className = document.getElementById('broadsheetClassSelector').value;
    if (!className) return Swal.fire('Validation Error', "Please select a class to generate a broadsheet printout.", 'error');

    const btn = document.getElementById('btnPublishResults')?.nextElementSibling;
    let ogText = "";
    if (btn) { ogText = btn.innerHTML; btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin mr-2"></i> Preparing...`; btn.disabled = true; }

    try {
        const theadHTML = document.getElementById('broadsheetHead').innerHTML;
        let tbodyHTML = document.getElementById('broadsheetBody').innerHTML;
        tbodyHTML = tbodyHTML.replace(/<button[^>]*>.*?<\/button>/g, '');

        let dirSig = '', ceSig = '', fmSig = '';

        async function getSignatureForStaff(staffId) {
            if (!staffId) return '';
            try {
                const prof = await ApiGateway.get(`/ict/staff/profile?id=${encodeURIComponent(staffId)}`);
                if (prof && prof.signatureUrl) return window.resolveMediaUrl(prof.signatureUrl);
            } catch (e) { }
            return '';
        }

        const [statBoard, formMasters, delegations] = await Promise.all([
            ApiGateway.get('/ict/statutory/board').catch(() => ({})),
            ApiGateway.get('/dd/academics/form-masters/all').catch(() => []),
            ApiGateway.get('/director/delegations').catch(() => ({}))
        ]);

        let dirId = statBoard['ROLE_DIRECTOR'] ? statBoard['ROLE_DIRECTOR'].staffId : 'GUSS/STF/001';
        dirSig = await getSignatureForStaff(dirId);

        let ceId = delegations['CHIEF_EXAMINER'] ? delegations['CHIEF_EXAMINER'].staffId : activeExaminerId;
        ceSig = await getSignatureForStaff(ceId);

        const fm = formMasters.find(f => f.targetClass === className);
        if (fm && fm.staffId) {
            fmSig = await getSignatureForStaff(fm.staffId);
        }

        const sigHtml = (url, title) => {
            if (url) {
                return `<div style="text-align: center;">
                            <img src="${url}" style="height: 40px; object-fit: contain; margin-bottom: 5px; mix-blend-mode: multiply;">
                            <br><span style="border-top: 1px solid #000; padding-top: 5px; display: inline-block; width: 180px; font-size: 11px;">Sign: ${title}</span>
                        </div>`;
            }
            return `<div style="text-align: center;">
                        <br><br><br>
                        <span style="border-top: 1px solid #000; padding-top: 5px; display: inline-block; width: 180px; font-size: 11px;">Sign: ${title}</span>
                    </div>`;
        };

        const epoch = typeof parseVault === 'function' ? (parseVault('current_epoch') || {}) : {};
        const sessionLabel = epoch.label || '2026/2027 SESSION | 1ST TERM';

        const printWindow = window.open('', '', 'width=1200,height=800');
        printWindow.document.write(`
            <html><head><title>${DOMPurify.sanitize(className)} - Master Broadsheet</title>
            <style>
                body { font-family: 'Arial', sans-serif; background: white; padding: 20px; }
                table { width: 100%; border-collapse: collapse; margin-top: 20px; font-size: 10px; }
                th, td { border: 1px solid #CBD5E1; padding: 8px; text-align: center; }
                th { background-color: #F1F5F9 !important; font-weight: 900; -webkit-print-color-adjust: exact; }
            </style>
            </head><body>
                <div style="text-align: center; margin-bottom: 20px;">
                    <h1 style="font-size: 24px; font-weight: 900; margin-bottom: 5px;">GOVERNMENT UNITY SECONDARY SCHOOL, RINGIM</h1>
                    <h2 style="font-size: 16px; font-weight: bold; text-transform: uppercase;">MASTER BROADSHEET - ${DOMPurify.sanitize(className)}</h2>
                    <p style="font-size: 12px; color: #64748B;">Academic Session: ${DOMPurify.sanitize(sessionLabel)}</p>
                </div>
                <table><thead>${theadHTML}</thead><tbody>${tbodyHTML}</tbody></table>
                <div style="margin-top: 50px; display: flex; justify-content: space-between; font-weight: bold;">
                    ${sigHtml(fmSig, 'Form Master')}
                    ${sigHtml(ceSig, 'Chief Examiner')}
                    ${sigHtml(dirSig, 'School Director')}
                </div>
                <script>setTimeout(() => { window.print(); window.close(); }, 800);<\/script>
            </body></html>
        `);
        printWindow.document.close();
    } catch (e) {
        Swal.fire('Error', 'Failed to generate broadsheet.', 'error');
    } finally {
        if (btn) { btn.innerHTML = ogText; btn.disabled = false; }
    }
};

window.updatePublishUiState = function (isPublished) {
    const statusText = document.getElementById('publishStatusText');
    const btnPub = document.getElementById('btnPublishResults');
    const btnRev = document.getElementById('btnRevokeResults');

    if (!statusText || !btnPub || !btnRev) return;

    if (isPublished) {
        statusText.textContent = "Live on Portal";
        statusText.className = "text-xs font-black text-emerald-400 uppercase";
        btnPub.classList.add('hidden');
        btnPub.classList.remove('flex');
        btnRev.classList.remove('hidden');
        btnRev.classList.add('flex');
    } else {
        statusText.textContent = "Pending Review";
        statusText.className = "text-xs font-black text-amber-400 uppercase";
        btnPub.classList.remove('hidden');
        btnPub.classList.add('flex');
        btnRev.classList.add('hidden');
        btnRev.classList.remove('flex');
    }
};

window.publishClassResults = async function () {
    if (SessionManager.isHistoricalArchiveMode()) {
        return Swal.fire('Archive Lockout', 'Publishing results is strictly prohibited in historical view.', 'error');
    }

    const className = document.getElementById('broadsheetClassSelector').value;
    if (!className) return;

    const authRes = await Swal.fire({
        title: 'Zero-Trust Authorization',
        html: `Publish results for <b>${className}</b>?<br>This locks all teachers out of grading for this class.<br><br>Enter Admin Password:`,
        input: 'password',
        inputAttributes: { autocapitalize: 'off', autocorrect: 'off' },
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#005A36',
        confirmButtonText: 'Publish Results'
    });

    if (!authRes.isConfirmed || !authRes.value) return;

    try {
        const activeContext = SessionManager.getCurrentContextString();
        await ApiGateway.post('/academics/chief/class-state/publish', {
            className: className,
            session: activeContext,
            adminPassword: authRes.value
        });

        Swal.fire('Published', `Success: ${className} Results are now LIVE.`, 'success');
        await window.syncPostgresToLocal(true);
        window.updatePublishUiState(true);
        renderChiefAuditMatrix();
    } catch (e) {
        Swal.fire('Authorization Failed', e.message || 'Invalid Password.', 'error');
    }
};

window.revokeClassResults = async function () {
    if (SessionManager.isHistoricalArchiveMode()) {
        return Swal.fire('Archive Lockout', 'Historical epochs are sealed. Cannot revoke in historical view.', 'error');
    }

    const className = document.getElementById('broadsheetClassSelector').value;
    if (!className) return;

    const authRes = await Swal.fire({
        title: 'Zero-Trust Revocation',
        html: `WARNING: Revoke results for <b>${className}</b>?<br>This pulls results offline and re-opens grading portals.<br><br>Enter Admin Password:`,
        input: 'password',
        inputAttributes: { autocapitalize: 'off', autocorrect: 'off' },
        icon: 'error',
        showCancelButton: true,
        confirmButtonColor: '#ef4444',
        confirmButtonText: 'Revoke & Unlock'
    });

    if (!authRes.isConfirmed || !authRes.value) return;

    try {
        const activeContext = SessionManager.getCurrentContextString();
        await ApiGateway.post('/academics/chief/class-state/revoke', {
            className: className,
            session: activeContext,
            adminPassword: authRes.value
        });

        Swal.fire('Revoked', `${className} Results pulled offline. Portals unlocked.`, 'success');
        await window.syncPostgresToLocal(true);
        window.updatePublishUiState(false);
        renderChiefAuditMatrix();
    } catch (e) {
        Swal.fire('Authorization Failed', e.message || 'Invalid Password.', 'error');
    }
};

window.openStudentAmendmentModal = async function (admNo, scoresJson) {
    if (SessionManager.isHistoricalArchiveMode()) {
        return Swal.fire('Archive Lockout', 'Ordering grade amendments is prohibited in historical view.', 'error');
    }

    let scores = {};
    try { scores = JSON.parse(decodeURIComponent(scoresJson)); } catch (e) { return Swal.fire('Error', 'Could not parse student subjects.', 'error'); }

    let gradedSubjects = Object.keys(scores).filter(sub => scores[sub] !== "-");
    if (gradedSubjects.length === 0) return Swal.fire('Notice', 'No graded subjects to remark yet.', 'info');

    let subjectOptions = gradedSubjects.map(sub => `<option value="${DOMPurify.sanitize(sub)}">${DOMPurify.sanitize(sub)}</option>`).join('');

    const authRes = await Swal.fire({
        title: 'Order Grade Remarking',
        html: `
            <p class="text-xs text-slate-500 mb-3 text-left">Unlock <b>${admNo}</b> for single-student re-grading.</p>
            <label class="block text-[9px] font-black uppercase text-slate-400 text-left mb-1">Select Graded Subject</label>
            <select id="swalTargetSubject" class="w-full p-3 border border-slate-300 rounded-xl text-xs font-bold mb-3 bg-slate-50">${subjectOptions}</select>
            <label class="block text-[9px] font-black uppercase text-slate-400 text-left mb-1">Investigation Notes</label>
            <textarea id="swalAmendmentNotes" placeholder="Reason for remarking / investigation notes..." class="w-full p-3 border border-slate-300 rounded-xl text-xs mb-3 resize-none" rows="3"></textarea>
            <label class="block text-[9px] font-black uppercase text-slate-400 text-left mb-1">Chief Examiner Password</label>
            <input type="password" id="swalAdminPass" placeholder="Enter Password" class="w-full p-3 border border-slate-300 rounded-xl text-xs">
        `,
        focusConfirm: false,
        showCancelButton: true,
        confirmButtonColor: '#005A36',
        confirmButtonText: 'Issue Order',
        preConfirm: () => {
            const subjectName = document.getElementById('swalTargetSubject').value;
            const notes = document.getElementById('swalAmendmentNotes').value.trim();
            const password = document.getElementById('swalAdminPass').value.trim();
            if (!subjectName || !notes || !password) {
                Swal.showValidationMessage('All fields are mandatory.');
                return false;
            }
            return { subjectName, notes, password };
        }
    });

    if (!authRes.isConfirmed) return;

    try {
        await ApiGateway.post('/academics/chief/amendments/order', {
            admNo: admNo,
            subjectName: authRes.value.subjectName,
            notes: authRes.value.notes,
            adminPassword: authRes.value.password
        });

        Swal.fire('Order Issued', `Student ${admNo} unlocked for remarking in ${authRes.value.subjectName}.`, 'success');
        if (typeof window.loadGlobalAmendmentsQueue === 'function') window.loadGlobalAmendmentsQueue();
        window.loadMasterBroadsheet();
    } catch (e) {
        Swal.fire('Failed', e.message || 'Could not issue amendment order.', 'error');
    }
};

window.reassignAmendmentAssessor = async function (orderId, currentMarkerName) {
    if (SessionManager.isHistoricalArchiveMode()) {
        return Swal.fire('Archive Lockout', 'Reassigning assessors is prohibited in historical view.', 'error');
    }

    const staffList = JSON.parse(sessionStorage.getItem('cloud_staff_registry') || '[]');
    let staffOptions = staffList
        .filter(s => s.approvalStatus === 'APPROVED' && s.staffId !== 'GUSS/STF/001' && (s.staffType === 'ACADEMIC' || s.staffType === 'OFFICIAL'))
        .map(s => `<option value="${s.staffId || s.trackingRef}">${s.fullName} (${s.staffId})</option>`)
        .join('');

    const authRes = await Swal.fire({
        title: 'Reassign Assessor',
        html: `
            <p class="text-xs text-red-500 mb-3 font-bold">Bypass current marker: ${currentMarkerName}</p>
            <select id="swalNewAssessor" class="w-full p-2.5 border border-slate-300 rounded-xl text-xs font-bold mb-3">${staffOptions}</select>
            <select id="swalReassignReason" class="w-full p-2.5 border border-slate-300 rounded-xl text-xs font-bold mb-3">
                <option value="TUTOR_UNRESPONSIVE">Tutor Unresponsive / Ignored Notice</option>
                <option value="TUTOR_ON_LEAVE_OR_INCAPACITATED">Tutor on Leave / Incapacitated</option>
                <option value="RECUSAL_BIAS_DISPUTE">Recusal / Bias Dispute</option>
                <option value="TRIBUNAL_DIRECTIVE">Academic Tribunal Directive</option>
            </select>
            <input type="password" id="swalAdminPass" placeholder="Enter Chief Examiner Password" class="w-full p-3 border border-slate-300 rounded-xl text-xs">
        `,
        focusConfirm: false,
        showCancelButton: true,
        confirmButtonColor: '#dc2626',
        confirmButtonText: 'Reassign Marker',
        preConfirm: () => {
            const targetStaffId = document.getElementById('swalNewAssessor').value;
            const reason = document.getElementById('swalReassignReason').value;
            const password = document.getElementById('swalAdminPass').value.trim();
            if (!password) {
                Swal.showValidationMessage('Admin password is required.');
                return false;
            }
            return { targetStaffId, reason, password };
        }
    });

    if (!authRes.isConfirmed) return;

    try {
        await ApiGateway.post('/academics/chief/amendments/reassign', {
            orderId: orderId,
            targetStaffId: authRes.value.targetStaffId,
            reason: authRes.value.reason,
            adminPassword: authRes.value.password
        });

        Swal.fire('Reassigned', 'Script transferred to replacement assessor.', 'success');
        if (typeof window.loadGlobalAmendmentsQueue === 'function') window.loadGlobalAmendmentsQueue();
    } catch (e) {
        Swal.fire('Failed', e.message || 'Could not reassign assessor.', 'error');
    }
};

window.loadActiveAmendmentsUI = async function (className) {
    const panel = document.getElementById('activeAmendmentsPanel');
    const tbody = document.getElementById('activeAmendmentsBody');
    if (!panel || !tbody) return;

    try {
        const activeContext = SessionManager.getCurrentContextString();
        const orders = await ApiGateway.get(`/academics/chief/amendments/active?className=${encodeURIComponent(className)}&session=${encodeURIComponent(activeContext)}`);
        window.activeAmendmentsCache = orders || [];

        if (!orders || orders.length === 0) {
            panel.classList.add('hidden');
            return;
        }

        panel.classList.remove('hidden');
        let htmlBuffer = '';
        orders.forEach(o => {
            htmlBuffer += `
                <tr class="hover:bg-slate-50 transition-colors">
                    <td class="py-3 px-3"><div class="font-black text-slate-800 uppercase">${DOMPurify.sanitize(o.studentName)}</div><div class="font-mono text-[9px] text-slate-500">${DOMPurify.sanitize(o.admNo)}</div></td>
                    <td class="py-3 px-3 font-bold text-slate-700">${DOMPurify.sanitize(o.subjectName)}</td>
                    <td class="py-3 px-3 text-slate-600">${DOMPurify.sanitize(o.originalTeacher)}</td>
                    <td class="py-3 px-3 font-bold text-blue-600">${DOMPurify.sanitize(o.assignedMarker)}</td>
                    <td class="py-3 px-3 text-slate-500 text-[10px] max-w-xs truncate" title="${DOMPurify.sanitize(o.notes)}">${DOMPurify.sanitize(o.notes)}</td>
                    <td class="py-3 px-3 text-right">
                        <button onclick="window.reassignAmendmentAssessor('${o.orderId}', '${DOMPurify.sanitize(o.assignedMarker.replace(/'/g, "\\'"))}')" class="bg-red-50 hover:bg-red-100 text-red-600 border border-red-200 px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-wider transition-colors shadow-sm" data-archived-hidden="true">
                            <i class="fa-solid fa-shuffle mr-1"></i> Reassign
                        </button>
                    </td>
                </tr>
            `;
        });
        tbody.innerHTML = htmlBuffer;
    } catch (e) {
        window.activeAmendmentsCache = [];
        panel.classList.add('hidden');
    }
};

window.openConfigModal = function (targetId, targetName, targetType) {
    activeConfigTarget = targetId;
    activeConfigType = targetType;
    document.getElementById('modalClassName').textContent = targetName;
    document.getElementById('modalScopeType').textContent = targetType === 'SECTION' ? 'Section-Wide Security Configuration' : 'Class Security Configuration';
    document.getElementById('lblExtension').textContent = targetType === 'SECTION' ? 'Section Deadline Override' : 'Class Deadline Override';
    document.getElementById('lblWithhold').textContent = targetType === 'SECTION' ? 'Withhold Entire Section' : 'Withhold Entire Class';

    const config = parseVault(`guss_config_${targetId.replace(/\s/g, '')}`);

    document.getElementById('modalSpecificDeadline').value = config.customDeadline || "";
    document.getElementById('modalExtensionReason').value = "";
    document.getElementById('modalClassWithholdToggle').checked = config.withholdClass || false;
    document.getElementById('modalClassReason').value = config.classReason || "";
    window.toggleClassReasonField();

    const studentSection = document.getElementById('studentWithholdSection');
    if (targetType === 'SECTION') {
        studentSection.classList.add('hidden');
    } else {
        studentSection.classList.remove('hidden');
        if (document.getElementById('modalSearchInput')) document.getElementById('modalSearchInput').value = '';
        const listContainer = document.getElementById('modalStudentList');
        listContainer.innerHTML = '';

        let htmlBuffer = '';
        const students = getDynamicRoster(targetId);

        students.forEach(student => {
            const isWithheld = config.withheldStudents && config.withheldStudents.find(s => s.id === student.admNo) ? 'checked' : '';
            const existingDeadline = (config.studentDeadlines && config.studentDeadlines[student.admNo]) ? config.studentDeadlines[student.admNo] : "";

            htmlBuffer += `
                <div class="px-4 py-3 grid grid-cols-12 items-center hover:bg-slate-50 transition-colors gap-2">
                    <div class="col-span-6"><p class="text-xs font-black text-slate-800 uppercase">${DOMPurify.sanitize(student.name)}</p><p class="text-[10px] font-mono text-slate-500">${DOMPurify.sanitize(student.admNo)}</p></div>
                    <div class="col-span-4 text-center"><input type="date" class="student-deadline-input w-full bg-white border border-slate-300 rounded px-2 py-1 text-[10px] font-bold" data-id="${DOMPurify.sanitize(student.admNo)}" value="${existingDeadline}"></div>
                    <div class="col-span-2 text-center"><input type="checkbox" class="student-withhold-cb w-4 h-4 text-red-600 rounded border-slate-300 focus:ring-red-500" data-id="${DOMPurify.sanitize(student.admNo)}" ${isWithheld}></div>
                </div>`;
        });
        listContainer.innerHTML = htmlBuffer;
    }
    document.getElementById('classConfigModal').classList.remove('hidden');
};

window.closeClassConfigModal = function () { document.getElementById('classConfigModal').classList.add('hidden'); };
window.clearSpecificDeadline = function () { document.getElementById('modalSpecificDeadline').value = ""; document.getElementById('modalExtensionReason').value = ""; };

window.filterModalStudents = function () {
    const query = document.getElementById('modalSearchInput').value.toLowerCase();
    const children = Array.from(document.getElementById('modalStudentList').children);

    let count = 0;
    children.forEach(item => {
        if (item.innerText.toLowerCase().includes(query) && count < 50) {
            item.style.display = '';
            count++;
        } else {
            item.style.display = 'none';
        }
    });
};

window.toggleClassReasonField = function () {
    const isChecked = document.getElementById('modalClassWithholdToggle').checked;
    const reasonBlock = document.getElementById('classReasonBlock');
    const studentSection = document.getElementById('studentWithholdSection');
    if (isChecked) {
        reasonBlock.classList.remove('hidden');
        if (activeConfigType === 'CLASS') studentSection.classList.add('opacity-50', 'pointer-events-none');
    } else {
        reasonBlock.classList.add('hidden');
        if (activeConfigType === 'CLASS') studentSection.classList.remove('opacity-50', 'pointer-events-none');
    }
};

window.applyScopeDeadlineAction = function (action) {
    if (SessionManager.isHistoricalArchiveMode()) {
        return Swal.fire('Archive Lockout', 'Modifying deadlines is prohibited in historical view.', 'error');
    }

    const dateVal = document.getElementById('modalSpecificDeadline').value;
    const reasonVal = document.getElementById('modalExtensionReason').value.trim();
    if (!dateVal || !reasonVal) return Swal.fire('Validation Error', "To alter a scope deadline, both Date and Reason are mandatory.", 'error');

    openSecurityModal(`Scope Override (${action})`, `You are adjusting the deadline for ${activeConfigTarget}.`, action === 'EXTEND' ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-red-600 hover:bg-red-700', "CONFIRM", '<i class="fa-solid fa-calendar-days"></i>', false, () => {
        let config = parseVault(`guss_config_${activeConfigTarget.replace(/\s/g, '')}`);
        if (!config) config = {};
        config.customDeadline = dateVal;
        config.extensionReason = `[SCOPE ${action}] ${reasonVal}`;
        window.saveClassConfiguration(false, config);
    });
};

window.saveClassConfiguration = async function (showAlert = true, overrideConfig = null) {
    if (SessionManager.isHistoricalArchiveMode()) {
        return Swal.fire('Archive Lockout', 'Modifying class configurations is prohibited in historical view.', 'error');
    }

    const configKey = `guss_config_${activeConfigTarget.replace(/\s/g, '')}`;
    let config = overrideConfig || parseVault(configKey);
    if (!config) config = {};

    const dateVal = document.getElementById('modalSpecificDeadline').value;
    if (!dateVal) { delete config.customDeadline; delete config.extensionReason; }

    config.withholdClass = document.getElementById('modalClassWithholdToggle').checked;
    config.classReason = document.getElementById('modalClassReason').value.trim();

    if (activeConfigType === 'CLASS' && !config.withholdClass) {
        config.withheldStudents = [];
        if (!config.studentDeadlines) config.studentDeadlines = {};

        document.querySelectorAll('.student-withhold-cb:checked').forEach(cb => {
            config.withheldStudents.push({ id: cb.getAttribute('data-id'), reason: "Administrative Hold" });
        });
        document.querySelectorAll('.student-deadline-input').forEach(inp => {
            const sId = inp.getAttribute('data-id');
            if (inp.value) config.studentDeadlines[sId] = inp.value;
            else delete config.studentDeadlines[sId];
        });
    }

    await window.saveConfigToCloud({ [configKey]: JSON.stringify(config) });

    if (showAlert) {
        Swal.fire('Saved', `Configuration for ${activeConfigTarget} saved to Vault.`, 'success');
        window.closeClassConfigModal();
        renderChiefAuditMatrix();
    } else {
        window.closeClassConfigModal();
        renderChiefAuditMatrix();
    }
    if (!document.getElementById('tabContentRegistry').classList.contains('hidden')) window.renderRestrictionsRegistry();
};

window.executeOmniSearch = function () {
    const query = document.getElementById('omniSearchInput').value.toLowerCase().trim();
    const resultsArea = document.getElementById('omniSearchResults');
    resultsArea.innerHTML = '';

    if (query.length < 2) return resultsArea.innerHTML = `<div class="text-center py-6 text-slate-400 text-xs font-bold"><i class="fa-solid fa-database block text-2xl mb-2 opacity-30"></i> Type at least 2 characters...</div>`;

    const students = getAllAdmittedStudents();
    let foundCount = 0;
    const maxResults = 50;
    let htmlBuffer = '';

    for (let i = 0; i < students.length; i++) {
        if (foundCount >= maxResults) break;
        const student = students[i];
        if ((student.name || '').toLowerCase().includes(query) || (student.admNo || '').toLowerCase().includes(query)) {
            const className = student.assignedClass || "Unassigned";

            htmlBuffer += `
            <div class="p-3 bg-white border border-slate-200 rounded-xl hover:border-blue-300 cursor-pointer flex justify-between items-center group" 
                 onclick="document.getElementById('activePenaltyForm').classList.remove('hidden'); document.getElementById('penaltyTargetName').textContent = '${DOMPurify.sanitize(student.name.replace(/'/g, "\\'"))}'; document.getElementById('penaltyTargetDetails').innerHTML = '${DOMPurify.sanitize(student.admNo)} <span class=\\'mx-1\\'>•</span> ${DOMPurify.sanitize(className)}'; document.getElementById('penaltyTargetId').value = '${DOMPurify.sanitize(student.admNo)}'; document.getElementById('penaltyTargetClass').value = '${DOMPurify.sanitize(className)}';">
                <div><p class="text-xs font-black text-slate-800 uppercase group-hover:text-blue-700">${DOMPurify.sanitize(student.name)}</p><p class="text-[10px] font-mono text-slate-500">${DOMPurify.sanitize(student.admNo)} <span class="mx-1">•</span> <span class="font-bold text-gussNavy">${DOMPurify.sanitize(className)}</span></p></div><i class="fa-solid fa-arrow-right text-slate-300 group-hover:text-blue-500"></i>
            </div>`;

            foundCount++;
        }
    }

    if (foundCount === 0) {
        resultsArea.innerHTML = `<div class="text-center py-6 text-red-400 text-xs font-bold">No student found matching "${DOMPurify.sanitize(query)}"</div>`;
    } else {
        if (foundCount >= maxResults) {
            htmlBuffer += `<div class="p-3 text-center text-blue-500 font-bold text-[9px] uppercase bg-blue-50 rounded-xl mt-2">Showing top ${maxResults} matches. Refine your search to see more.</div>`;
        }
        resultsArea.innerHTML = htmlBuffer;
    }
};

window.applyStudentPenalty = function () {
    if (SessionManager.isHistoricalArchiveMode()) {
        return Swal.fire('Archive Lockout', 'Applying student restrictions is prohibited in historical view.', 'error');
    }

    const admNo = document.getElementById('penaltyTargetId').value;
    const className = document.getElementById('penaltyTargetClass').value;
    const reason = document.getElementById('penaltyReason').value;

    openSecurityModal("Enforce Student Restriction", `You are about to withhold results for ${admNo}.`, "bg-red-600 hover:bg-red-700", "ENFORCE", '<i class="fa-solid fa-user-lock"></i>', false, async () => {
        const configKey = `guss_config_${className.replace(/\s/g, '')}`;
        let config = parseVault(configKey);
        if (!config) config = {};
        if (!config.withheldStudents) config.withheldStudents = [];

        const idx = config.withheldStudents.findIndex(s => s.id === admNo);
        if (idx !== -1) config.withheldStudents[idx].reason = reason; else config.withheldStudents.push({ id: admNo, reason: reason });

        await window.saveConfigToCloud({ [configKey]: JSON.stringify(config) });

        document.getElementById('activePenaltyForm').classList.add('hidden');
        document.getElementById('omniSearchInput').value = '';
        window.executeOmniSearch();
        window.renderRestrictionsRegistry();
        renderChiefAuditMatrix();
    });
};

window.renderRestrictionsRegistry = function () {
    const registryBody = document.getElementById('registryTableBody');
    if (!registryBody) return;

    let hasRestrictions = false;
    let htmlBuffer = '';
    const dynamicHierarchy = buildDynamicSchoolHierarchy();
    const isHistorical = SessionManager.isHistoricalArchiveMode();

    dynamicHierarchy.forEach(section => {
        const secConfig = parseVault(`guss_config_${section.sectionId}`);
        if (secConfig && secConfig.withholdClass) {
            hasRestrictions = true;
            const liftBtn = isHistorical
                ? `<span class="text-slate-400 text-[9px] font-bold"><i class="fa-solid fa-lock"></i> Sealed</span>`
                : `<button onclick="window.liftRestriction('SECTION', null, '${DOMPurify.sanitize(section.sectionId)}')" class="text-[9px] font-black uppercase text-emerald-600 hover:bg-emerald-50 px-2 py-1 rounded border border-emerald-200 transition-colors" data-archived-hidden="true">Lift Penalty</button>`;

            htmlBuffer += `<tr><td class="py-3 px-3"><div class="font-black text-red-600 uppercase">${DOMPurify.sanitize(section.sectionName)}</div></td><td class="py-3 px-3 font-bold text-slate-700">ENTIRE SECTION</td><td class="py-3 px-3 text-[10px] text-red-500 font-medium">${DOMPurify.sanitize(secConfig.classReason || "Administrative Hold")}</td><td class="py-3 px-3 text-right">${liftBtn}</td></tr>`;
        }

        section.classes.forEach(className => {
            const config = parseVault(`guss_config_${className.replace(/\s/g, '')}`);
            if (config && config.withholdClass) {
                hasRestrictions = true;
                const liftBtn = isHistorical
                    ? `<span class="text-slate-400 text-[9px] font-bold"><i class="fa-solid fa-lock"></i> Sealed</span>`
                    : `<button onclick="window.liftRestriction('CLASS', null, '${DOMPurify.sanitize(className)}')" class="text-[9px] font-black uppercase text-emerald-600 hover:bg-emerald-50 px-2 py-1 rounded border border-emerald-200 transition-colors" data-archived-hidden="true">Lift Penalty</button>`;

                htmlBuffer += `<tr><td class="py-3 px-3"><div class="font-black text-red-600 uppercase">ENTIRE CLASS</div></td><td class="py-3 px-3 font-bold text-slate-700">${DOMPurify.sanitize(className)}</td><td class="py-3 px-3 text-[10px] text-red-500 font-medium">${DOMPurify.sanitize(config.classReason || "Administrative Hold")}</td><td class="py-3 px-3 text-right">${liftBtn}</td></tr>`;
            }
            if (config && config.withheldStudents && config.withheldStudents.length > 0) {
                hasRestrictions = true;
                config.withheldStudents.forEach(restrictedStudent => {
                    const sName = getDynamicRoster(className).find(s => s.admNo === restrictedStudent.id)?.name || "Unknown";
                    const liftBtn = isHistorical
                        ? `<span class="text-slate-400 text-[9px] font-bold"><i class="fa-solid fa-lock"></i> Sealed</span>`
                        : `<button onclick="window.liftRestriction('STUDENT', '${DOMPurify.sanitize(restrictedStudent.id)}', '${DOMPurify.sanitize(className)}')" class="text-[9px] font-black uppercase text-emerald-600 hover:bg-emerald-50 px-2 py-1 rounded border border-emerald-200 transition-colors" data-archived-hidden="true">Lift Penalty</button>`;

                    htmlBuffer += `<tr><td class="py-3 px-3"><div class="font-black text-slate-800 uppercase">${DOMPurify.sanitize(sName)}</div><div class="font-mono text-[9px] text-slate-500">${DOMPurify.sanitize(restrictedStudent.id)}</div></td><td class="py-3 px-3 font-bold text-slate-700">${DOMPurify.sanitize(className)}</td><td class="py-3 px-3 text-[10px] text-red-500 font-medium">${DOMPurify.sanitize(restrictedStudent.reason || "Hold")}</td><td class="py-3 px-3 text-right">${liftBtn}</td></tr>`;
                });
            }
        });
    });

    if (!hasRestrictions) registryBody.innerHTML = `<tr><td colspan="4" class="py-8 text-center text-slate-400 font-bold text-xs"><i class="fa-solid fa-shield-check text-2xl mb-2 opacity-30 block"></i> Registry is clean. No active penalties.</td></tr>`;
    else registryBody.innerHTML = htmlBuffer;

    window.applyArchiveReadonlyState();
};

window.liftRestriction = function (type, targetId, scopeKey) {
    if (SessionManager.isHistoricalArchiveMode()) {
        return Swal.fire('Archive Lockout', 'Lifting penalties is prohibited in historical view.', 'error');
    }

    openSecurityModal("Lift Restriction", `Are you sure you want to lift this restriction?`, "bg-emerald-600 hover:bg-emerald-700", "LIFT PENALTY", '<i class="fa-solid fa-unlock"></i>', false, async () => {
        const configKey = `guss_config_${scopeKey.replace(/\s/g, '')}`;
        let config = parseVault(configKey);
        if (!config) config = {};
        if (type === 'SECTION' || type === 'CLASS') { config.withholdClass = false; config.classReason = ""; }
        else if (type === 'STUDENT') config.withheldStudents = config.withheldStudents.filter(s => s.id !== targetId);

        await window.saveConfigToCloud({ [configKey]: JSON.stringify(config) });
        window.renderRestrictionsRegistry();
        renderChiefAuditMatrix();
    });
};

// ================= PROFILE & SIGNATURE MANAGEMENT =================
window.openChiefProfileSettings = async function () {
    const preview = document.getElementById('chiefSignaturePreview');
    const modal = document.getElementById('chiefProfileModal');

    let mySig = "";
    if (activeExaminerId) {
        try {
            const prof = await ApiGateway.get(`/ict/staff/profile?id=${encodeURIComponent(activeExaminerId)}`);
            if (prof) mySig = prof.signatureUrl || "";
        } catch (e) { }
    }

    if (preview) {
        if (mySig) {
            preview.src = window.resolveMediaUrl(mySig);
            preview.classList.remove('hidden');
        } else {
            preview.src = '';
            preview.classList.add('hidden');
        }
    }
    if (modal) modal.classList.remove('hidden');
};