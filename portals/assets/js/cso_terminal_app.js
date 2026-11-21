import { ENV, getAuthHeaders, getMultipartAuthHeaders } from './core_config.js';
import { CoreUI } from './core_ui.js';
import { SessionManager } from './session_manager.js';

// ==========================================
// 1. GLOBAL VARIABLES & IDENTITY
// ==========================================
let activeArchiveView = 'LIVE';
let activeCsoId = sessionStorage.getItem('guss_staff_id');
let activeCsoName = sessionStorage.getItem('guss_user_name') || "Chief Security Officer";

//  ENTERPRISE ENUM NORMALIZER
function normalizeStaffType(type) {
    if (!type) return "Unknown";
    const t = type.toUpperCase().trim();
    if (t === 'ACADEMIC' || (t.includes('ACADEMIC') && !t.includes('NON'))) return 'Academic';
    if (t === 'NON_ACADEMIC' || t === 'NON-ACADEMIC' || t.includes('NON')) return 'Non-Academic';
    if (t === 'TEACHING_PRACTICE' || t === 'TP') return 'TP';
    if (t === 'NYSC') return 'NYSC';
    return type;
}

// ==========================================
// ARMORED VAULT PARSER & RAM REPOSITORIES
// ==========================================
let RAM_VAULT = {};
let RAM_STUDENT_REGISTRY = [];

const parseVault = (key) => {
    const cloudConfigs = Object.keys(RAM_VAULT).length > 0 ? RAM_VAULT : (JSON.parse(sessionStorage.getItem('cloud_configs')) || {});
    let data = cloudConfigs[key];
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
    try {
        const stored = JSON.parse(sessionStorage.getItem('cloud_student_registry'));
        if (Array.isArray(stored)) return stored;
    } catch (e) { }
    return [];
}

// ========================================================
// TIME MACHINE & ARCHIVE READ-ONLY ENFORCEMENT
// ========================================================

window.isHistoricalArchiveMode = function () {
    const currentSession = sessionStorage.getItem('guss_selected_session');
    const currentTerm = sessionStorage.getItem('guss_selected_term');
    const liveSession = sessionStorage.getItem('guss_live_session');
    const liveTerm = sessionStorage.getItem('guss_live_term');
    if (!liveSession || !currentSession) return false;
    return (currentSession !== liveSession || currentTerm !== liveTerm);
};

window.onload = async function () {
    CoreUI.init();
    await SessionManager.initHeaderDropdown();
    await syncPostgresToLocal();
    resolveCsoIdentity();
    renderExeatLedger();

    //  Apply the lockdown state immediately on boot
    window.applyArchiveReadonlyState(window.isHistoricalArchiveMode());
};

//  Listen for Time Travel events from the SessionManager
window.addEventListener('gussTimeMachineChanged', () => {
    window.applyArchiveReadonlyState(window.isHistoricalArchiveMode());
    renderExeatLedger();
});

window.applyArchiveReadonlyState = function (isArchived) {
    const mainContent = document.querySelector('main');
    if (!mainContent) return;

    const oldBanner = document.getElementById('csoArchiveBanner');
    if (oldBanner) oldBanner.remove();

    // In CSO Terminal, scanning for Exeats in the past makes no sense, so we lock the scanner input too.
    const inputs = mainContent.querySelectorAll('input, select:not(#exeatFilter), textarea, button:not([onclick^="openDossierModal"])');

    if (isArchived) {
        const banner = document.createElement('div');
        banner.id = 'csoArchiveBanner';
        banner.className = 'bg-red-50 border-l-4 border-red-500 p-4 mb-6 rounded-r-xl shadow-sm w-full animate-fade-in flex items-center justify-between col-span-full';
        banner.innerHTML = `
            <div>
                <h3 class="text-red-800 font-black uppercase tracking-widest text-xs"><i class="fa-solid fa-lock mr-2"></i> HISTORICAL ARCHIVE ENFORCED</h3>
                <p class="text-red-700 text-[10px] mt-1 font-bold">You are viewing a sealed academic term. The active Gate Verification Scanner and all security mutations are disabled.</p>
            </div>
            <span class="bg-red-100 text-red-800 text-[9px] font-black uppercase px-3 py-1 rounded-full border border-red-300 shadow-sm shrink-0">Read-Only</span>
        `;
        mainContent.prepend(banner);

        mainContent.classList.add('grayscale', 'opacity-90');
        inputs.forEach(el => {
            if (!el.disabled) {
                el.setAttribute('data-archived-disabled', 'true');
                el.disabled = true;
                el.classList.add('opacity-50', 'cursor-not-allowed');
            }
        });
    } else {
        mainContent.classList.remove('grayscale', 'opacity-90');
        inputs.forEach(el => {
            if (el.hasAttribute('data-archived-disabled')) {
                el.disabled = false;
                el.classList.remove('opacity-50', 'cursor-not-allowed');
                el.removeAttribute('data-archived-disabled');
            }
        });
    }
};

// ==========================================
// 100% CLOUD-BASED STATE SYNCHRONIZATION
// ==========================================
async function syncPostgresToLocal() {
    try {
        const [confRes, staffRes, stdRes] = await Promise.all([
            fetch(`${ENV.API_BASE_URL}/api/config/all`, { method: 'GET', headers: window.getAuthHeaders(), cache: 'no-store' }).catch(() => null),
            fetch(`${ENV.API_BASE_URL}/api/ict/staff/all-lightweight`, { method: 'GET', headers: window.getAuthHeaders(), cache: 'no-store' }).catch(() => null),
            fetch(`${ENV.API_BASE_URL}/api/bridge/all-lightweight`, { method: 'GET', headers: window.getAuthHeaders(), cache: 'no-store' }).catch(() => null)
        ]);

        if (confRes && confRes.ok) {
            const configs = await confRes.json();
            RAM_VAULT = configs;

            const lightConfigs = {};
            Object.keys(configs).forEach(k => {
                if (!k.startsWith('guss_grades_') && !k.startsWith('guss_eval_')) {
                    lightConfigs[k] = configs[k];
                }
            });

            try {
                sessionStorage.setItem('cloud_configs', JSON.stringify(lightConfigs));
                sessionStorage.setItem('cloud_statutory_board', lightConfigs['guss_statutory_board'] || '{}');
                sessionStorage.setItem('cloud_delegations', lightConfigs['guss_delegations'] || '{}');
                Object.keys(lightConfigs).forEach(k => {
                    if (!k.startsWith('guss_statutory_board') && !k.startsWith('guss_delegations')) localStorage.setItem(k, lightConfigs[k]);
                });
            } catch (e) {
                console.debug("Storage Quota bypassed using RAM_VAULT for configs.");
            }
        }

        if (staffRes && staffRes.ok) {
            const db = await staffRes.json();
            if (Array.isArray(db)) {
                const mappedRegistry = db.map(staff => ({
                    id: staff.staffId ? staff.staffId : staff.trackingRef,
                    trackingRef: staff.trackingRef,
                    name: staff.fullName || staff.name,
                    staffType: typeof normalizeStaffType === 'function' ? normalizeStaffType(staff.staffType) : staff.staffType,
                    qual: staff.qualification || staff.qual,
                    phone: staff.phone,
                    personalEmail: staff.personalEmail,
                    email: staff.officialEmail || staff.email,
                    address: staff.residentialAddress || staff.address,
                    bloodGroup: staff.bloodGroup,
                    nokName: staff.nokName,
                    nokPhone: staff.nokPhone,
                    endDate: staff.endDate,
                    photoUrl: staff.photoUrl,
                    signatureUrl: staff.signatureUrl,
                    status: staff.status || staff.approvalStatus,
                    approvalStatus: staff.approvalStatus || staff.status,
                    isLocked: staff.isLocked === true || staff.isLocked === 'true',
                    hasCustomPassword: staff.hasCustomPassword === true || staff.hasCustomPassword === 'true',
                    tempPassword: staff.tempPassword || 'GUSSR-STAFF-TEMP',
                    staffId: staff.staffId
                }));
                try {
                    sessionStorage.setItem('cloud_staff_registry', JSON.stringify(mappedRegistry));
                    localStorage.setItem('guss_staff_registry', JSON.stringify(mappedRegistry));
                } catch (e) {
                    console.debug("Staff registry cached locally.");
                }
            }
        }

        if (stdRes && stdRes.ok) {
            const stdDb = await stdRes.json();
            if (Array.isArray(stdDb)) {
                stdDb.forEach(s => { if (s.uploadSignature) s.signatureUrl = s.uploadSignature; });
                RAM_STUDENT_REGISTRY = stdDb;

                const lightStudents = stdDb.map(s => ({
                    admNo: s.admNo,
                    nin: s.nin,
                    name: s.name || s.fullName,
                    status: s.status,
                    triageStatus: s.triageStatus,
                    assignedClass: s.assignedClass,
                    assignedHostel: s.assignedHostel,
                    photoUrl: s.photoUrl || s.uploadPassport,
                    isLocked: s.isLocked,
                    hasCustomPassword: s.hasCustomPassword,
                    dob: s.dob
                }));

                try {
                    sessionStorage.setItem('cloud_student_registry', JSON.stringify(lightStudents));
                } catch (e) {
                    console.debug("SessionStorage cap reached. Operating in RAM mode for student payloads.");
                }
            }
        }

        if (typeof cachedUnifiedEntities !== 'undefined') cachedUnifiedEntities = null;
        if (typeof liveStudentRegistry !== 'undefined') liveStudentRegistry = getStudentRegistrySafe();
        if (typeof liveStaffRegistry !== 'undefined') liveStaffRegistry = JSON.parse(sessionStorage.getItem('cloud_staff_registry')) || [];

        if (typeof globalUsers !== 'undefined') {
            const cloudConfigs = Object.keys(RAM_VAULT).length > 0 ? RAM_VAULT : (JSON.parse(sessionStorage.getItem('cloud_configs')) || {});
            let parsedUsers = cloudConfigs['rinoba_users_db'];
            if (typeof parsedUsers === 'string') parsedUsers = JSON.parse(parsedUsers);
            globalUsers = Array.isArray(parsedUsers) ? parsedUsers : [];
        }
    } catch (error) { console.error("Critical Cloud Sync Error:", error); }
}

window.syncConfigFromCloud = syncPostgresToLocal;

async function saveConfigToCloud(configPayload) {
    try {
        await fetch(`${ENV.API_BASE_URL}/api/config/save`, {
            method: 'POST',
            headers: window.getAuthHeaders(),
            body: JSON.stringify(configPayload)
        });

        Object.keys(configPayload).forEach(k => {
            RAM_VAULT[k] = configPayload[k];
        });

        const cloudConfigs = Object.keys(RAM_VAULT).length > 0 ? RAM_VAULT : (JSON.parse(sessionStorage.getItem('cloud_configs')) || {});
        Object.keys(configPayload).forEach(k => {
            if (!k.startsWith('guss_grades_') && !k.startsWith('guss_eval_')) {
                cloudConfigs[k] = configPayload[k];
            }
        });
        sessionStorage.setItem('cloud_configs', JSON.stringify(cloudConfigs));

        localStorage.setItem('guss_global_sync_pulse', Date.now().toString());
    } catch (error) {
        Swal.fire('Critical Error', "Failed to sync configuration with the PostgreSQL Vault.", 'error');
    }
}

window.addEventListener('storage', async function (e) {
    if (e.key === 'guss_global_sync_pulse') {
        console.log("Global pulse detected! Re-syncing CSO Security Feed...");
        await syncPostgresToLocal();
        renderExeatLedger();
        checkForNotifications();
    }
});

// ================= DYNAMIC AUTHENTICATION =================
function resolveCsoIdentity() {
    if (!activeCsoId) {
        document.getElementById('activeCsoNameDisplay').textContent = "UNAUTHORIZED ACCESS";
        Swal.fire('Access Denied', "Identity resolution failed. Please log in again.", 'error').then(() => {
            window.location.href = 'staff_login.html';
        });
        return;
    }

    const delegations = parseVault('cloud_delegations') || {};
    const activeDelegation = delegations['CSO'] || delegations['ROLE_CSO'];

    if (activeDelegation && activeDelegation.staffId === activeCsoId) {
        document.getElementById('activeCsoNameDisplay').textContent = activeCsoName;
    } else {
        document.getElementById('activeCsoNameDisplay').textContent = "ACCESS DENIED";
        Swal.fire('Security Halt', "You are not currently appointed as the Chief Security Officer.", 'error').then(() => {
            window.location.href = 'staff_portal.html';
        });
    }
}

// ================= RELATIONAL CSO SCANNER ENGINE =================
window.verifyStudentAccess = async function (e) {
    e.preventDefault();
    const scanEl = document.getElementById('scanInput');
    const admNo = scanEl.value.trim().toUpperCase();
    if (!admNo) return;

    const pane = document.getElementById('scanResultPane');
    pane.classList.remove('hidden');
    pane.innerHTML = `<div class="text-center text-slate-400 py-4"><i class="fa-solid fa-spinner fa-spin text-2xl mb-2 block"></i> Verifying Databases...</div>`;

    try {
        //   Query the unified relational scanner endpoint
        const res = await ApiGateway.get(`/gate-pass/verify/${encodeURIComponent(admNo)}`);
        const photo = res.photoUrl ? (res.photoUrl.startsWith('http') ? res.photoUrl : `${ENV.API_BASE_URL}/${res.photoUrl.replace(/^\/+/, '')}`) : 'https://ui-avatars.com/api/?name=Student';

        if (res.accessStatus === 'DENIED_DISCIPLINE') {
            pane.className = "rounded-2xl p-5 border-2 bg-red-950 border-red-800 animate-fade-in";
            pane.innerHTML = `
                <div class="flex items-start gap-4">
                    <img src="${DOMPurify.sanitize(photo)}" class="w-16 h-16 rounded-xl object-cover border-2 border-red-500 shrink-0 opacity-80 grayscale">
                    <div class="w-full">
                        <div class="flex justify-between items-start">
                            <h4 class="font-black uppercase tracking-wide text-lg text-white">${DOMPurify.sanitize(res.name)}</h4>
                            <span class="bg-red-600 text-white px-2.5 py-1 rounded text-[10px] font-black tracking-widest uppercase animate-pulse">ACCESS DENIED</span>
                        </div>
                        <p class="text-[10px] text-red-400 font-mono mt-1">${DOMPurify.sanitize(res.admNo)} • ${DOMPurify.sanitize(res.className)}</p>
                        <div class="mt-4 p-3 bg-red-900/50 rounded-xl border border-red-800/50 text-xs text-red-200 font-medium">
                            <i class="fa-solid fa-gavel mr-1"></i> <strong>ACTIVE DISCIPLINARY HOLD:</strong><br>${DOMPurify.sanitize(res.flagDetails)}
                        </div>
                    </div>
                </div>`;
        } else if (res.accessStatus === 'CLEAR_TO_PASS') {
            pane.className = "rounded-2xl p-5 border-2 bg-emerald-950 border-emerald-800 animate-fade-in";
            pane.innerHTML = `
                <div class="flex items-start gap-4">
                    <img src="${DOMPurify.sanitize(photo)}" class="w-16 h-16 rounded-xl object-cover border-2 border-emerald-500 shrink-0">
                    <div class="w-full">
                        <div class="flex justify-between items-start">
                            <h4 class="font-black uppercase tracking-wide text-lg text-white">${DOMPurify.sanitize(res.name)}</h4>
                            <span class="bg-emerald-600 text-white px-2.5 py-1 rounded text-[10px] font-black tracking-widest uppercase">CLEAR TO PASS</span>
                        </div>
                        <p class="text-[10px] text-emerald-400 font-mono mt-1">${DOMPurify.sanitize(res.admNo)} • ${DOMPurify.sanitize(res.className)}</p>
                        <div class="mt-4 p-3 bg-emerald-900/50 rounded-xl border border-emerald-800/50 text-xs text-emerald-200 font-medium">
                            <i class="fa-solid fa-person-walking-arrow-right mr-1"></i> Valid Gate Pass: <strong>${DOMPurify.sanitize(res.passType)}</strong>.<br>Authorized by: ${DOMPurify.sanitize(res.issuedBy)} (${DOMPurify.sanitize(res.hostel)})
                        </div>
                    </div>
                </div>`;
        } else if (res.accessStatus === 'OVERDUE') {
            pane.className = "rounded-2xl p-5 border-2 bg-amber-950 border-amber-800 animate-fade-in";
            pane.innerHTML = `
                <div class="flex items-start gap-4">
                    <img src="${DOMPurify.sanitize(photo)}" class="w-16 h-16 rounded-xl object-cover border-2 border-amber-500 shrink-0">
                    <div class="w-full">
                        <div class="flex justify-between items-start">
                            <h4 class="font-black uppercase tracking-wide text-lg text-white">${DOMPurify.sanitize(res.name)}</h4>
                            <span class="bg-amber-600 text-slate-900 px-2.5 py-1 rounded text-[10px] font-black tracking-widest uppercase animate-pulse">OVERDUE RETURN</span>
                        </div>
                        <p class="text-[10px] text-amber-400 font-mono mt-1">${DOMPurify.sanitize(res.admNo)} • ${DOMPurify.sanitize(res.className)}</p>
                        <div class="mt-4 p-3 bg-amber-900/50 rounded-xl border border-amber-800/50 text-xs text-amber-200 font-medium">
                            <i class="fa-solid fa-clock-rotate-left mr-1"></i> Returning late. Expected date: <strong>${DOMPurify.sanitize(res.returnDate)}</strong>. Detain and contact Warden.
                        </div>
                    </div>
                </div>`;
        } else {
            pane.className = "rounded-2xl p-5 border-2 bg-slate-800 border-slate-700 animate-fade-in";
            pane.innerHTML = `
                <div class="flex items-start gap-4">
                    <img src="${DOMPurify.sanitize(photo)}" class="w-16 h-16 rounded-xl object-cover border-2 border-slate-600 shrink-0">
                    <div class="w-full">
                        <div class="flex justify-between items-start">
                            <h4 class="font-black uppercase tracking-wide text-lg text-white">${DOMPurify.sanitize(res.name)}</h4>
                            <span class="bg-slate-700 text-slate-300 px-2.5 py-1 rounded text-[10px] font-black tracking-widest uppercase">NO GATE PASS</span>
                        </div>
                        <p class="text-[10px] text-slate-400 font-mono mt-1">${DOMPurify.sanitize(res.admNo)} • ${DOMPurify.sanitize(res.className)}</p>
                        <div class="mt-4 p-3 bg-slate-900 rounded-xl border border-slate-700 text-xs text-slate-400 font-medium">
                            <i class="fa-solid fa-lock mr-1"></i> No active House Warden gate pass. Perimeter exit denied.
                        </div>
                    </div>
                </div>`;
        }
    } catch (err) {
        pane.className = "rounded-2xl p-5 border-2 bg-slate-800 border-slate-700 animate-fade-in";
        pane.innerHTML = `<div class="text-center text-red-400 font-bold text-xs"><i class="fa-solid fa-triangle-exclamation mr-1"></i> ${DOMPurify.sanitize(err.message || 'Scan error')}</div>`;
    }
};

window.renderExeatLedger = async function () {
    const tbody = document.getElementById('csoExeatBody');
    if (!tbody) return;

    const filter = document.getElementById('exeatFilter')?.value || 'ALL';
    tbody.innerHTML = '<tr><td colspan="4" class="py-8 text-center text-slate-400 font-bold text-xs"><i class="fa-solid fa-spinner fa-spin"></i> Querying Ledger...</td></tr>';

    try {
        //   Fetch ledger directly from PostgreSQL
        const passes = await ApiGateway.get(`/gate-pass/ledger?filter=${encodeURIComponent(filter)}`);

        let activeCount = passes.filter(p => p.status === 'ACTIVE').length;
        let overdueCount = passes.filter(p => p.isOverdue).length;

        document.getElementById('statActiveExeats').textContent = activeCount;
        document.getElementById('statOverdue').textContent = overdueCount;

        if (passes.length === 0) {
            tbody.innerHTML = `<tr><td colspan="4" class="py-12 text-center text-slate-400 font-bold text-xs">No matching gate activity.</td></tr>`;
            return;
        }

        let htmlBuffer = '';
        passes.forEach(ex => {
            let statusBadge = ex.status === 'RETURNED'
                ? `<span class="bg-slate-100 text-slate-500 px-2 py-1 rounded text-[9px] font-black uppercase tracking-widest border border-slate-200">Returned</span>`
                : (ex.isOverdue
                    ? `<span class="bg-red-100 text-red-800 px-2 py-1 rounded text-[9px] font-black uppercase tracking-widest border border-red-200 animate-pulse">Overdue Defaulter</span>`
                    : `<span class="bg-amber-100 text-amber-800 px-2 py-1 rounded text-[9px] font-black uppercase tracking-widest border border-amber-200">Away</span>`);

            htmlBuffer += `
                <tr class="hover:bg-slate-50 transition-colors border-b border-slate-100">
                    <td class="py-3 px-4 font-black text-slate-800 text-xs uppercase">${DOMPurify.sanitize(ex.name)} <br><span class="text-[9px] font-mono text-slate-500 font-normal">${DOMPurify.sanitize(ex.admNo)}</span></td>
                    <td class="py-3 px-4 text-xs font-bold text-slate-600">${DOMPurify.sanitize(ex.type)} <br><span class="text-[9px] ${ex.isOverdue ? 'text-red-600 font-black' : 'text-slate-400 font-normal'}">Return: ${DOMPurify.sanitize(ex.returnDate)}</span></td>
                    <td class="py-3 px-4 text-center">${statusBadge}</td>
                    <td class="py-3 px-4 text-right text-[10px] font-bold text-slate-700 uppercase">${DOMPurify.sanitize(ex.issuedBy)} <br><span class="text-[9px] text-slate-400 font-normal">${DOMPurify.sanitize(ex.hostel)}</span></td>
                </tr>`;
        });
        tbody.innerHTML = htmlBuffer;
    } catch (e) {
        tbody.innerHTML = '<tr><td colspan="4" class="py-8 text-center text-red-500 font-bold text-xs">Ledger connection failed.</td></tr>';
    }
};

window.openLeaveModal = function () {
    const modal = document.getElementById('leaveModal');
    if (modal) modal.classList.remove('hidden');
}

async function submitLeaveRequest(e) {
    e.preventDefault();
    if (!activeCsoId) return;

    const typeEl = document.getElementById('leaveType');
    const startEl = document.getElementById('leaveStart');
    const endEl = document.getElementById('leaveEnd');
    const notesEl = document.getElementById('leaveNotes');

    if (!typeEl || !startEl || !endEl || !notesEl) return;

    const type = typeEl.value;
    const start = startEl.value;
    const end = endEl.value;
    const notes = notesEl.value.trim();

    if (new Date(end) <= new Date(start)) return Swal.fire('Validation Error', "Expected Return Date must be after the Start Date.", 'error');

    let requestsDB = parseVault('guss_leave_requests');
    if (!Array.isArray(requestsDB)) requestsDB = [];

    requestsDB.push({
        id: `LVR-${new Date().getTime()}`,
        staffId: activeCsoId,
        name: activeCsoName,
        type: type,
        startDate: start,
        endDate: end,
        notes: notes,
        status: "PENDING_DD_APPROVAL",
        submittedAt: new Date().toLocaleString('en-NG')
    });

    const btn = e.target.querySelector('button[type="submit"]');
    const ogHtml = btn ? btn.innerHTML : "";
    if (btn) {
        btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin mr-1"></i> Submitting...`;
        btn.disabled = true;
    }

    try {
        await saveConfigToCloud({ 'guss_leave_requests': JSON.stringify(requestsDB) });
        Swal.fire('Transmitted', `Success: Your ${type} Leave request has been securely transmitted to the DD Administration console for review.`, 'success');
        e.target.reset();
        const modal = document.getElementById('leaveModal');
        if (modal) modal.classList.add('hidden');
    } catch (err) {
        Swal.fire('Critical Error', "Failed to transmit leave request to Cloud Vault.", 'error');
    } finally {
        if (btn) {
            btn.innerHTML = ogHtml;
            btn.disabled = false;
        }
    }
}