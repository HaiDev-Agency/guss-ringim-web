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

// ==========================================
// 1. ENTERPRISE STATE & CONSTANTS
// ==========================================
const App = {
    staffId: sessionStorage.getItem('guss_staff_id'),
    role: sessionStorage.getItem('guss_user_role'),
    profile: { name: "Executive Director", signatureUrl: null },
    data: {
        staff: [], students: [], delegations: {}, board: {}, logs: [], discipline: [], epochs: [], classRestrictions: [], studentRestrictions: []
    },
    ui: { activeTab: 'delegation', logFilter: 'ALL', epochView: 'LIVE' }
};

window.formatDynamicRoleName = function (key) {
    if (!key) return "Unknown Role";
    return key.replace('ROLE_', '').replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
}

// ==========================================
// 2. BOOT SEQUENCE & DATA HYDRATION
// ==========================================
window.onload = async () => {
    // 1. Boot Global UI Components & Role Switcher
    CoreUI.init();

    // 2. Boot Time Machine Epoch Context
    await SessionManager.initHeaderDropdown();

    // 3. Hydrate Terminal Data
    await bootSystemData();
    resolveDirectorIdentity();
    renderAllDashboards();
    attachGlobalListeners();
    window.applyArchiveReadonlyState();
};

//  LISTEN FOR TIME TRAVEL (Time Machine Sync)
window.addEventListener('gussTimeMachineChanged', () => {
    window.applyArchiveReadonlyState();
    bootSystemData().then(() => renderAllDashboards());
});

//  TIME MACHINE ARCHIVE DETECTOR
window.isHistoricalArchiveMode = function () {
    const currentSession = sessionStorage.getItem('guss_selected_session');
    const currentTerm = sessionStorage.getItem('guss_selected_term');
    const liveSession = sessionStorage.getItem('guss_live_session');
    const liveTerm = sessionStorage.getItem('guss_live_term');
    if (!liveSession || !currentSession) return false;
    return (currentSession !== liveSession || currentTerm !== liveTerm);
};

// ==========================================
// RIGOROUS ARCHIVE READ-ONLY ENFORCEMENT
// ==========================================
window.applyArchiveReadonlyState = function () {
    const isHistorical = window.isHistoricalArchiveMode();
    const main = document.querySelector('main');
    if (!main) return;

    const oldBanner = document.getElementById('directorArchiveBanner');
    if (oldBanner) oldBanner.remove();

    const advanceBtn = document.querySelector('button[onclick="openEpochModal()"]');
    const delegateBtn = document.querySelector('button[onclick="guiDelegateRole()"]');
    const internalBtn = document.getElementById('btnInternalDispatch');
    const externalBtn = document.getElementById('btnExternalDispatch');
    const staffSelect = document.getElementById('staffSelect');

    if (isHistorical) {
        // 1. Prominent Warning Banner in Workspace
        const banner = document.createElement('div');
        banner.id = 'directorArchiveBanner';
        banner.className = 'bg-red-50 border-l-4 border-red-500 p-4 rounded-2xl shadow-sm col-span-full mb-2 animate-fade-in flex items-center justify-between';
        banner.innerHTML = `
            <div>
                <h3 class="text-xs font-black text-red-800 uppercase tracking-widest flex items-center gap-2">
                    <i class="fa-solid fa-lock text-red-600 text-sm"></i> HISTORICAL ARCHIVE ENFORCED
                </h3>
                <p class="text-[10px] text-red-700 font-bold mt-1">
                    You are reviewing a sealed term. Executive delegations, ministerial dispatches, and term advancement protocols are strictly locked.
                </p>
            </div>
            <span class="bg-red-100 text-red-800 text-[9px] font-black uppercase px-3 py-1 rounded-full border border-red-300 shadow-sm shrink-0">Read-Only</span>
        `;
        main.prepend(banner);

        // 2. Lock Delegation Form
        if (staffSelect) {
            staffSelect.disabled = true;
            staffSelect.classList.add('opacity-50', 'cursor-not-allowed', 'bg-slate-100');
        }
        if (delegateBtn) {
            delegateBtn.disabled = true;
            delegateBtn.classList.add('opacity-50', 'cursor-not-allowed');
            delegateBtn.innerHTML = '<i class="fa-solid fa-lock mr-1"></i> Locked in Archive';
        }

        // 3. Lock Dispatcher Forms (Internal & External)
        document.querySelectorAll('#commsInternalTarget, #commsInternalSubject, #commsInternalBody, #commsExternalTo, #commsExternalSubject, #commsExternalFile, #commsExternalBody').forEach(el => {
            el.disabled = true;
            el.classList.add('opacity-50', 'cursor-not-allowed', 'bg-slate-100');
        });

        if (internalBtn) {
            internalBtn.disabled = true;
            internalBtn.classList.add('opacity-50', 'cursor-not-allowed');
            internalBtn.innerHTML = '<i class="fa-solid fa-lock mr-1"></i> Locked in Archive';
        }
        if (externalBtn) {
            externalBtn.disabled = true;
            externalBtn.classList.add('opacity-50', 'cursor-not-allowed');
            externalBtn.innerHTML = '<i class="fa-solid fa-lock mr-1"></i> Locked in Archive';
        }

        // 4. Lock Advance Term Button in Header
        if (advanceBtn) {
            advanceBtn.disabled = true;
            advanceBtn.classList.replace('bg-red-600', 'bg-slate-800');
            advanceBtn.classList.add('opacity-50', 'cursor-not-allowed', 'border', 'border-slate-700');
            advanceBtn.innerHTML = '<i class="fa-solid fa-lock mr-2 text-red-400"></i> Term Locked (Archive)';
        }
    } else {
        // RESTORE LIVE CAPABILITIES
        if (staffSelect) {
            staffSelect.disabled = false;
            staffSelect.classList.remove('opacity-50', 'cursor-not-allowed', 'bg-slate-100');
        }
        if (delegateBtn) {
            delegateBtn.disabled = false;
            delegateBtn.classList.remove('opacity-50', 'cursor-not-allowed');
            delegateBtn.innerHTML = '<i class="fa-solid fa-user-plus mr-1"></i> Delegate Role';
        }

        document.querySelectorAll('#commsInternalTarget, #commsInternalSubject, #commsInternalBody, #commsExternalTo, #commsExternalSubject, #commsExternalFile, #commsExternalBody').forEach(el => {
            el.disabled = false;
            el.classList.remove('opacity-50', 'cursor-not-allowed', 'bg-slate-100');
        });

        if (internalBtn) {
            internalBtn.disabled = false;
            internalBtn.classList.remove('opacity-50', 'cursor-not-allowed');
            internalBtn.innerHTML = '<i class="fa-solid fa-paper-plane mr-1"></i> Send Internal Dispatch';
        }
        if (externalBtn) {
            externalBtn.disabled = false;
            externalBtn.classList.remove('opacity-50', 'cursor-not-allowed');
            externalBtn.innerHTML = '<i class="fa-solid fa-stamp mr-1 text-gussGold"></i> Authorize & Transmit Formal Letter';
        }

        if (advanceBtn) {
            advanceBtn.disabled = false;
            advanceBtn.classList.replace('bg-slate-800', 'bg-red-600');
            advanceBtn.classList.remove('opacity-50', 'cursor-not-allowed', 'border', 'border-slate-700');
            advanceBtn.innerHTML = '<i class="fa-solid fa-forward-step mr-2"></i> Advance Academic Term';
        }
    }
};

async function bootSystemData() {
    try {
        //   Routed through ApiGateway.get
        const [staffRes, stdRes, boardRes, delRes, epochRes, oversightRes, hostelsRes] = await Promise.all([
            ApiGateway.get('/ict/staff/all-lightweight').catch(() => null),
            ApiGateway.get('/bridge/all-lightweight').catch(() => null),
            ApiGateway.get('/ict/statutory/board').catch(() => null),
            ApiGateway.get('/director/delegations').catch(() => null),
            ApiGateway.get('/director/epoch/current').catch(() => null),
            ApiGateway.get('/director/oversight').catch(() => null),
            ApiGateway.get('/dd/admin/hostels').catch(() => null)
        ]);

        if (staffRes) App.data.staff = staffRes.filter(s => s.staffId !== 'GUSS/STF/001' && s.trackingRef !== 'GUSS/STF/001');
        if (stdRes) App.data.students = stdRes;
        if (boardRes) App.data.board = boardRes;
        if (delRes) App.data.delegations = delRes;
        if (epochRes) { App.data.currentEpoch = epochRes.label; }
        if (oversightRes) {
            App.data.classRestrictions = oversightRes.classRestrictions || [];
            App.data.studentRestrictions = oversightRes.studentRestrictions || [];
        }
        if (hostelsRes) App.data.hostels = hostelsRes;

        fetchLogs();
        fetchDisciplineRecords();
    } catch (e) {
        Swal.fire('Boot Failure', 'Unable to synchronize with the Central Java Node.', 'error');
    }
}

function resolveDirectorIdentity() {
    const me = App.data.staff.find(s => s.staffId === App.staffId || s.trackingRef === App.staffId);
    if (me) {
        App.profile.name = me.fullName || me.name;
        App.profile.signatureUrl = me.signatureUrl;
    }
    const nameDisplay = document.getElementById('activeDirectorNameDisplay');
    if (nameDisplay) nameDisplay.textContent = DOMPurify.sanitize(App.profile.name);
}

function attachGlobalListeners() {
    window.switchDirTab('delegation');
}

function renderAllDashboards() {
    updateTelemetry();
    renderOmniSearch("");
    populateDropdowns();
    renderDelegationTable();
    renderExamsOversight();
    renderCertsTable();
    window.renderHRTable();
}

function resolveMedia(url) {
    if (!url) return 'https://ui-avatars.com/api/?name=User&background=0F172A&color=fff';
    if (url.startsWith('http') || url.startsWith('data:')) return url;
    return `${ENV.API_BASE_URL}/${url.replace(/^\/+/, '')}`;
}

window.resolveMediaUrl = resolveMedia;

// ==========================================
// 4. TELEMETRY & DASHBOARD METRICS
// ==========================================
function updateTelemetry() {
    const activeStudents = App.data.students.filter(s => s.status === 'ADMITTED' || s.triageStatus === 'ADMITTED').length;
    const approvedStaff = App.data.staff.filter(s => s.status === 'APPROVED' || s.approvalStatus === 'APPROVED' || s.status === 'ACTIVATED' || s.status === 'ON_LEAVE' || s.approvalStatus === 'ON_LEAVE').length;

    let totalFlags = 0;
    App.data.students.forEach(s => { if (Array.isArray(s.disciplinaryFlags)) totalFlags += s.disciplinaryFlags.length; });

    document.getElementById('telStudents').textContent = activeStudents.toLocaleString();
    document.getElementById('telStaff').textContent = App.data.staff.length.toLocaleString();
    document.getElementById('telStaffApproved').textContent = `${approvedStaff} Approved`;
    document.getElementById('telDiscipline').textContent = `${totalFlags} Flags`;
}

// ==========================================
// 5. GLOBAL OMNI-SEARCH GATEWAY
// ==========================================
window.executeDirectorSearch = function () {
    const query = document.getElementById('directorSearchInput').value.toLowerCase().trim();
    renderOmniSearch(query);
}

function renderOmniSearch(query) {
    const res = document.getElementById('directorSearchResults');
    res.innerHTML = '';
    if (query.length < 2) return;

    let foundCount = 0;
    let html = '';

    App.data.staff.forEach(s => {
        if (foundCount >= 50) return;
        const name = (s.fullName || s.name || "").toLowerCase();
        const id = (s.staffId || s.trackingRef || "").toLowerCase();

        if (name.includes(query) || id.includes(query)) {
            let role = "Standard Faculty";
            Object.entries(App.data.delegations).forEach(([k, v]) => {
                if (v.staffId === s.staffId) role = window.formatDynamicRoleName(k);
            });
            html += `
                <div onclick="window.openDossierModal('STAFF', '${s.staffId || s.trackingRef}')" class="p-3 bg-purple-50 border border-purple-200 rounded-lg flex justify-between items-center mb-2 cursor-pointer hover:border-purple-400 transition-colors group shadow-sm">
                    <div class="flex items-center gap-3">
                        <img src="${resolveMedia(s.photoUrl)}" class="w-8 h-8 rounded-lg object-cover bg-slate-100 border border-slate-200 shrink-0">
                        <div><span class="font-black text-purple-900 uppercase text-xs group-hover:text-purple-700 transition-colors">${DOMPurify.sanitize(s.fullName || s.name)}</span><br><span class="text-[10px] font-mono text-purple-600 mt-0.5 block">${DOMPurify.sanitize(id.toUpperCase())} • ${DOMPurify.sanitize(s.staffType || 'Official')}</span></div>
                    </div>
                    <div class="text-right text-[9px] font-bold text-purple-800 px-3 py-1 bg-white rounded shadow-sm border border-purple-100 hidden sm:block">${DOMPurify.sanitize(role)}</div>
                </div>`;
            foundCount++;
        }
    });

    App.data.students.filter(s => s.status === 'ADMITTED' || s.status === 'REVOKED_QUARANTINED').forEach(s => {
        if (foundCount >= 50) return;
        const name = (s.name || s.fullName || "").toLowerCase();
        const adm = (s.admNo || "").toLowerCase();

        if (name.includes(query) || adm.includes(query)) {
            const cls = s.assignedClass || "Unassigned";
            let statusObj = { text: "Clear Status", cls: "text-emerald-600 bg-emerald-50 border-emerald-200" };

            const isClassWithheld = App.data.classRestrictions.some(c => c.className === cls && c.isWithheld);
            const isStudentWithheld = App.data.studentRestrictions.some(ws => ws.studentId === s.admNo);

            if (isClassWithheld) { statusObj = { text: "Class Withheld", cls: "text-red-600 bg-red-50 border-red-200" }; }
            else if (isStudentWithheld) { statusObj = { text: "Result Withheld", cls: "text-red-600 bg-red-50 border-red-200" }; }

            if (s.status === 'REVOKED_QUARANTINED' || cls === 'QUARANTINED') {
                statusObj = { text: " Quarantined", cls: "text-red-700 bg-red-100 border-red-300 font-black animate-pulse" };
            }

            html += `
                <div onclick="window.openDossierModal('STUDENT', '${s.admNo}')" class="p-3 bg-slate-50 border border-slate-200 rounded-lg flex justify-between items-center mb-2 cursor-pointer hover:bg-slate-100 transition-colors group shadow-sm">
                    <div class="flex items-center gap-3">
                        <img src="${resolveMedia(s.photoUrl)}" class="w-8 h-8 rounded-lg object-cover bg-slate-100 border border-slate-200 shrink-0">
                        <div><span class="font-black text-slate-800 uppercase text-xs group-hover:text-gussGreen transition-colors">${DOMPurify.sanitize(s.name || s.fullName)}</span><br><span class="text-[10px] font-mono text-slate-500 mt-0.5 block">${DOMPurify.sanitize(s.admNo)} • ${DOMPurify.sanitize(cls)}</span></div>
                    </div>
                    <div class="text-right text-[9px] font-bold px-3 py-1 rounded border shadow-sm ${statusObj.cls} truncate hidden sm:block">${statusObj.text}</div>
                </div>`;
            foundCount++;
        }
    });

    if (foundCount === 0) {
        res.innerHTML = `<div class="text-xs text-slate-400 p-3 font-bold border border-dashed rounded-lg text-center">No records found for "${DOMPurify.sanitize(query)}"</div>`;
    } else {
        if (foundCount >= 50) html += `<div class="p-2 text-center text-blue-500 font-bold text-[9px] uppercase bg-blue-50 rounded-xl mt-2">Showing top 50 matches. Refine search.</div>`;
        res.innerHTML = html;
    }
}

// ==========================================
// 6. INFINITE RELATIONAL DELEGATION ENGINE
// ==========================================
function populateDropdowns() {
    const staffSelect = document.getElementById('staffSelect');
    if (staffSelect) {
        staffSelect.innerHTML = '<option value="" disabled selected>Select an approved staff member...</option>';
        App.data.staff.filter(s => {
            const stat = String(s.status || s.approvalStatus || '').toUpperCase().trim();
            return (stat === 'APPROVED' || stat === 'ACTIVATED' || stat === 'ON_LEAVE') && !s.name?.toLowerCase().includes('root admin');
        }).forEach(s => {
            const isOnLeave = String(s.status || s.approvalStatus || '').toUpperCase().trim() === 'ON_LEAVE';
            const leaveBadge = isOnLeave ? ` [✈️ ON LEAVE]` : "";
            staffSelect.innerHTML += `<option value="${s.staffId || s.trackingRef}">${DOMPurify.sanitize(s.name || s.fullName)} ${leaveBadge}</option>`;
        });
    }

    const commsSelect = document.getElementById('commsInternalTarget');
    if (commsSelect) {
        let commsHtml = '<option value="">Select Target...</option><option value="ALL_STAFF" class="font-black text-red-600 bg-red-50"> GLOBAL DISPATCH: ALL STAFF</option>';
        App.data.staff.filter(s => {
            const stat = String(s.status || s.approvalStatus || '').toUpperCase().trim();
            return (stat === 'APPROVED' || stat === 'ACTIVATED' || stat === 'ON_LEAVE') && !s.name?.toLowerCase().includes('root admin');
        }).forEach(s => {
            let role = s.staffType;
            Object.entries(App.data.delegations).forEach(([k, v]) => {
                if (v.staffId === (s.staffId || s.trackingRef)) role = window.formatDynamicRoleName(k);
            });
            commsHtml += `<option value="${s.staffId || s.trackingRef}">${DOMPurify.sanitize(s.name || s.fullName)} (${role})</option>`;
        });
        commsSelect.innerHTML = commsHtml;
    }
}

// ==========================================
// ZERO-TRUST ACTION GUARDS
// ==========================================
window.guiDelegateRole = async function () {
    if (window.isHistoricalArchiveMode()) {
        return Swal.fire('Archive Lockout', 'Delegating operational roles is strictly prohibited when viewing historical records.', 'error');
    }

    const staffId = document.getElementById('staffSelect').value;
    if (!staffId) return Swal.fire('Error', "Please select a staff member first.", 'error');

    const delegationRoles = {
        "ICT_ADMIN": "ICT & Central Registry Admin",
        "WEB_ADMIN": "Web & Alumni Registry Admin",
        "CHIEF_EXAMINER": "Chief Examiner",
        "ADMISSIONS_OFFICER": "Admissions Officer",
        "CSO": "Chief Security Officer"
    };

    const uniqueAssignedRoles = [...new Set(Object.keys(App.data.delegations))];

    let optionsHtml = '<option value="__NEW__" class="font-black text-purple-600">+ Create Brand New Custom Title</option>';
    optionsHtml += '<optgroup label="Core Management Nodes">';
    Object.entries(delegationRoles).forEach(([k, v]) => optionsHtml += `<option value="${k}" class="font-bold">${v}</option>`);
    optionsHtml += '</optgroup>';

    const customRoles = uniqueAssignedRoles.filter(r => !delegationRoles[r]);
    if (customRoles.length > 0) {
        optionsHtml += '<optgroup label="Organic Operational Titles">';
        customRoles.forEach(r => optionsHtml += `<option value="${r}">${window.formatDynamicRoleName(r)}</option>`);
        optionsHtml += '</optgroup>';
    }

    const roleRes = await Swal.fire({
        title: 'Executive Delegation',
        html: `
            <label class="text-xs font-bold text-slate-500 uppercase tracking-widest block mb-2 text-left">Select Target Clearance</label>
            <select id="swal-role-select" class="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-3 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-purple-500">
                ${optionsHtml}
            </select>
        `,
        showCancelButton: true, confirmButtonColor: '#0F172A',
        preConfirm: () => document.getElementById('swal-role-select').value
    });

    if (!roleRes.isConfirmed) return;
    let roleKey = roleRes.value;

    if (roleKey === '__NEW__') {
        const newRoleRes = await Swal.fire({
            title: 'New Executive Title',
            text: 'Type the official title:',
            input: 'text', showCancelButton: true, confirmButtonColor: '#0F172A',
            inputValidator: (value) => { if (!value.trim()) return 'Title cannot be empty!' }
        });
        if (!newRoleRes.isConfirmed) return;
        roleKey = newRoleRes.value.toUpperCase().replace(/\s+/g, '_').replace(/[^A-Z0-9_&]/g, '');
    }

    const exactMatch = Object.entries(App.data.delegations).find(([k, v]) => k === roleKey && v.staffId === staffId);
    if (exactMatch) return Swal.fire('Redundant', 'Staff member already holds this exact role.', 'warning');

    const authRes = await Swal.fire({
        title: 'Zero-Trust Authorization',
        html: `Elevating staff clearance.<br><br>Enter Admin Password to execute:`,
        input: 'password', inputAttributes: { autocapitalize: 'off', autocorrect: 'off' }, icon: 'warning',
        showCancelButton: true, confirmButtonColor: '#005A36', confirmButtonText: 'Authorize Elevation'
    });

    if (!authRes.isConfirmed || !authRes.value) return;

    const btn = document.querySelector('button[onclick="window.guiDelegateRole()"]');
    const ogHtml = btn ? btn.innerHTML : "Delegate Role";
    if (btn) { btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin mr-1"></i> Syncing...`; btn.disabled = true; }

    try {
        const data = await ApiGateway.post('/director/delegations/assign', {
            staffId: staffId, roleKey: roleKey, adminPassword: authRes.value
        });

        if (data) {
            Swal.fire('Elevated', 'Delegation securely synchronized.', 'success');
            document.getElementById('staffSelect').value = '';
            App.data.delegations = await ApiGateway.get('/director/delegations');
            window.renderDelegationTable();
            window.fetchLogs();
        }
    } catch (e) {
        Swal.fire('Authorization Failed', e.message || "Invalid PIN or Backend Rejection.", 'error');
    } finally {
        if (btn) { btn.innerHTML = ogHtml; btn.disabled = false; }
    }
};

window.revokeRole = async function (roleKey) {
    if (window.isHistoricalArchiveMode()) {
        return Swal.fire('Archive Lockout', 'Revoking delegations is strictly prohibited in historical view.', 'error');
    }

    const authRes = await Swal.fire({
        title: 'Zero-Trust Revocation',
        html: `Permanently revoke clearance for <b>${window.formatDynamicRoleName(roleKey)}</b>?<br><br>Enter Admin Password to execute:`,
        input: 'password', inputAttributes: { autocapitalize: 'off', autocorrect: 'off' }, icon: 'warning',
        showCancelButton: true, confirmButtonColor: '#ef4444', confirmButtonText: 'Authorize Revocation'
    });

    if (!authRes.isConfirmed || !authRes.value) return;

    try {
        const data = await ApiGateway.post('/director/delegations/revoke', {
            roleKey: roleKey, adminPassword: authRes.value
        });

        if (data) {
            Swal.fire('Revoked', 'Clearance permanently removed.', 'success');
            App.data.delegations = await ApiGateway.get('/director/delegations');
            window.renderDelegationTable();
            window.fetchLogs();
        }
    } catch (e) {
        Swal.fire('Authorization Failed', e.message || "Invalid PIN.", 'error');
    }
};

// ==========================================
// DELEGATION TABLE (ARCHIVE-AWARE)
// ==========================================
window.renderDelegationTable = function () {
    const tbody = document.getElementById('delegationTableBody');
    if (!tbody) return;

    if (Object.keys(App.data.delegations).length === 0) {
        tbody.innerHTML = `<tr><td colspan="3" class="py-8 text-center text-slate-400 font-bold text-xs"><i class="fa-solid fa-network-wired text-3xl mb-3 opacity-20 block"></i> No operational delegations active.</td></tr>`;
        return;
    }

    const isHistorical = window.isHistoricalArchiveMode();
    let html = '';

    Object.entries(App.data.delegations).forEach(([k, data]) => {
        //   In Archive mode, Revoke button is replaced with an inert badge
        const btnState = isHistorical
            ? `<span class="bg-slate-100 text-slate-400 border border-slate-200 px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-wider inline-flex items-center gap-1 cursor-not-allowed shadow-inner"><i class="fa-solid fa-lock"></i> Sealed</span>`
            : `<button onclick="window.revokeRole('${k}')" class="bg-red-50 text-red-600 hover:bg-red-100 border border-red-200 px-3 py-1.5 rounded-lg text-[9px] font-black uppercase shadow-sm transition-colors active:scale-95"><i class="fa-solid fa-trash-can mr-1"></i> Revoke</button>`;

        html += `
            <tr class="hover:bg-slate-50 transition-colors whitespace-nowrap border-b border-slate-100">
                <td class="py-3 px-4 font-black text-gussNavy uppercase text-[10px]"><i class="fa-solid fa-shield-halved text-gussGold mr-2"></i> ${window.formatDynamicRoleName(k)}</td>
                <td class="py-3 px-4"><div class="font-bold text-slate-800 text-xs cursor-pointer hover:text-blue-600" onclick="window.openDossierModal('STAFF', '${data.staffId}')">${DOMPurify.sanitize(data.name)}</div><div class="text-[9px] text-slate-500 font-mono mt-0.5">Assigned: ${DOMPurify.sanitize(data.dateAssigned)}</div></td>
                <td class="py-3 px-4 text-right">${btnState}</td>
            </tr>`;
    });
    tbody.innerHTML = html;
};


// ==========================================
// 7. EXAMINATIONS & DISCIPLINE
// ==========================================
function renderExamsOversight() {
    const tbody = document.getElementById('oversightTableBody');
    if (!tbody) return;

    let hasData = false;
    let html = '';

    App.data.classRestrictions.forEach(clsReq => {
        hasData = true;
        html += `<tr><td class="py-3 px-4 font-black text-slate-700 text-xs pl-8 border-l-2 border-slate-200 uppercase">${DOMPurify.sanitize(clsReq.className)}</td><td class="py-3 px-4 text-xs font-bold ${clsReq.isWithheld ? 'text-red-600' : 'text-emerald-600'}">${DOMPurify.sanitize(clsReq.isWithheld ? clsReq.withholdReason : 'Clear')}</td><td class="py-3 px-4 text-xs font-bold ${clsReq.customDeadline ? 'text-orange-600' : 'text-slate-500'}">${clsReq.customDeadline ? DOMPurify.sanitize(clsReq.customDeadline) + ' <br><span class="text-[9px] text-slate-400 font-normal">' + DOMPurify.sanitize(clsReq.extensionReason) + '</span>' : 'Standard'}</td></tr>`;
    });

    App.data.studentRestrictions.forEach(ws => {
        hasData = true;
        html += `<tr><td class="py-3 px-4 font-bold text-slate-600 text-[10px] pl-12 border-l-2 border-red-200 cursor-pointer hover:text-blue-600" onclick="window.openDossierModal('STUDENT', '${ws.studentId}')"><i class="fa-solid fa-user-lock text-red-400 mr-1"></i> ${DOMPurify.sanitize(ws.studentName)} (${DOMPurify.sanitize(ws.studentId)})</td><td class="py-3 px-4 text-xs font-bold text-red-600">${DOMPurify.sanitize(ws.reason)}</td><td class="py-3 px-4 text-xs font-bold text-slate-500">Standard</td></tr>`;
    });

    tbody.innerHTML = hasData ? html : `<tr><td colspan="3" class="text-center text-slate-400 py-8 font-bold text-xs"><i class="fa-solid fa-shield-check text-3xl mb-3 opacity-20 block"></i> System nominal. No active examination overrides.</td></tr>`;
}

async function fetchDisciplineRecords() {
    try {
        App.data.discipline = await ApiGateway.get('/dd/admin/discipline/records');
        window.renderDisciplineTable();
    } catch (e) { console.error("Discipline fetch failed"); }
}

window.renderDisciplineTable = function () {
    const filter = document.getElementById('disciplineFilter')?.value || 'ALL';
    const tbody = document.getElementById('disciplineTableBody');
    if (!tbody) return;

    const filtered = App.data.discipline.filter(r => filter === 'ALL' || r.infractionLevel === filter);

    if (filtered.length === 0) {
        tbody.innerHTML = `<tr><td colspan="3" class="text-center text-slate-400 py-8 font-bold text-xs">No disciplinary records found.</td></tr>`;
        return;
    }

    let html = '';
    filtered.forEach(rec => {
        let badge = "bg-slate-100 text-slate-700";
        if (rec.infractionLevel === 'Warning') badge = "bg-yellow-100 text-yellow-700 border-yellow-300";
        if (rec.infractionLevel === 'Probation') badge = "bg-orange-100 text-orange-700 border-orange-300";
        if (rec.infractionLevel === 'Suspension') badge = "bg-red-100 text-red-700 border-red-300";
        if (rec.infractionLevel === 'Dismissal') badge = "bg-slate-900 text-red-400 border-red-900";

        html += `<tr>
            <td class="py-3 px-4 whitespace-nowrap"><div class="font-black text-slate-800 text-xs uppercase cursor-pointer hover:text-blue-600" onclick="window.openDossierModal('STUDENT', '${rec.student?.admNo}')">${DOMPurify.sanitize(rec.student?.fullName || 'Unknown')}</div><div class="text-[9px] font-mono text-slate-500 mt-1">${DOMPurify.sanitize(rec.student?.admNo || '')}</div></td>
            <td class="py-3 px-4 whitespace-nowrap"><span class="px-2 py-1 border rounded text-[9px] font-black uppercase ${badge}">${DOMPurify.sanitize(rec.infractionLevel)}</span></td>
            <td class="py-3 px-4 text-xs font-bold text-slate-700 leading-relaxed min-w-[200px]">${DOMPurify.sanitize(rec.reason)}<div class="text-[9px] font-black text-red-500 mt-1 uppercase"><i class="fa-solid fa-gavel mr-1"></i> Penalty: ${DOMPurify.sanitize(rec.penalty)}</div><div class="text-[9px] text-slate-400 mt-1">Logged: ${new Date(rec.createdAt).toLocaleDateString()}</div></td>
        </tr>`;
    });
    tbody.innerHTML = html;
}

// ==========================================
// 8. TRANSIENT CERTS & HR
// ==========================================
window.renderCertsTable = function () {
    const tbody = document.getElementById('certificatesBody');
    if (!tbody) return;

    const transientStaff = App.data.staff.filter(s => s.staffType === 'NYSC' || s.staffType === 'TP');

    if (transientStaff.length === 0) {
        tbody.innerHTML = `<tr><td colspan="4" class="py-12 text-center text-slate-400 font-bold text-xs"><i class="fa-solid fa-ghost text-3xl mb-3 opacity-30 block"></i> No NYSC or TP personnel found in registry.</td></tr>`;
        return;
    }

    const isHistorical = window.isHistoricalArchiveMode();
    let html = '';

    transientStaff.forEach(staff => {
        let isExpired = false;
        if (staff.endDate) {
            const end = new Date(staff.endDate);
            const now = new Date(); now.setHours(0, 0, 0, 0);
            if (end < now) isExpired = true;
        }

        const badge = isExpired
            ? `<span class="bg-emerald-100 text-emerald-800 px-2.5 py-1 rounded text-[9px] font-black uppercase border border-emerald-300 shadow-sm"><i class="fa-solid fa-check-circle mr-1"></i> Eligible for Discharge</span>`
            : `<span class="bg-blue-100 text-blue-800 px-2.5 py-1 rounded text-[9px] font-black uppercase border border-blue-200"><i class="fa-solid fa-clock mr-1"></i> Active Duty</span>`;

        const tenureBtn = isHistorical
            ? `<button disabled class="bg-slate-100 text-slate-400 px-3 py-2 rounded-lg text-[9px] font-black uppercase shadow-sm cursor-not-allowed w-32 flex items-center justify-center gap-1.5"><i class="fa-solid fa-lock"></i> Adjust Tenure</button>`
            : `<button onclick="window.openTenureModal('${staff.staffId || staff.trackingRef}', '${DOMPurify.sanitize((staff.name || staff.fullName).replace(/'/g, "\\'"))}', '${staff.endDate || ''}')" class="bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-300 px-3 py-2 rounded-lg text-[9px] font-black uppercase transition-colors shadow-sm w-32 flex items-center justify-center gap-1.5"><i class="fa-solid fa-clock-rotate-left"></i> Adjust Tenure</button>`;

        const printBtn = isExpired
            ? `<button onclick="window.printServiceCertificate('${staff.staffId || staff.trackingRef}')" class="bg-gussGreen hover:bg-emerald-800 text-white px-3 py-2 rounded-lg text-[9px] font-black uppercase shadow-sm transition-all w-36 flex items-center justify-center gap-1.5"><i class="fa-solid fa-print"></i> Print Certificate</button>`
            : `<button disabled class="bg-slate-200 text-slate-400 px-3 py-2 rounded-lg text-[9px] font-black uppercase shadow-sm cursor-not-allowed w-36 flex items-center justify-center gap-1.5" title="Service tenure not yet completed"><i class="fa-solid fa-lock"></i> Print Certificate</button>`;

        html += `<tr class="hover:bg-slate-50 transition-colors border-b border-slate-100">
            <td class="py-3 px-4 flex items-center gap-3">
                <img src="${resolveMedia(staff.photoUrl)}" class="w-9 h-9 rounded-lg object-cover bg-slate-100 border border-slate-200 shrink-0">
                <div>
                    <div class="font-black text-slate-800 text-xs uppercase cursor-pointer hover:text-blue-600" onclick="window.openDossierModal('STAFF', '${staff.staffId || staff.trackingRef}')">${DOMPurify.sanitize(staff.name || staff.fullName)}</div>
                    <div class="text-[9px] font-mono text-slate-500">${DOMPurify.sanitize(staff.staffId || staff.trackingRef)}</div>
                </div>
            </td>
            <td class="py-3 px-4 align-middle">
                <div class="text-[10px] font-black text-gussNavy uppercase">${DOMPurify.sanitize(staff.staffType)}</div>
                <div class="text-[9px] font-bold text-slate-500">Passing Out: ${DOMPurify.sanitize(staff.endDate || 'Not Specified')}</div>
            </td>
            <td class="py-3 px-4 text-center align-middle">${badge}</td>
            <td class="py-3 px-4 text-right align-middle">
                <div class="flex items-center justify-end gap-2 h-full">
                    ${tenureBtn}
                    ${printBtn}
                </div>
            </td>
        </tr>`;
    });

    tbody.innerHTML = html;
};

// ==========================================
// TENURE MODAL CONTROLS
// ==========================================
window.openTenureModal = function (staffId, staffName, currentEndDate) {
    document.getElementById('tenureStaffId').value = staffId;
    document.getElementById('tenureStaffName').textContent = staffName;
    document.getElementById('tenureCurrentEnd').textContent = `Current Passing Out Date: ${currentEndDate || 'N/A'}`;
    document.getElementById('tenureNewEndDate').value = currentEndDate || '';
    document.getElementById('tenureReason').value = '';

    const modal = document.getElementById('tenureModal');
    if (modal) {
        modal.classList.remove('hidden');
        modal.classList.add('flex');
    }
};

window.closeTenureModal = function () {
    const modal = document.getElementById('tenureModal');
    if (modal) {
        modal.classList.add('hidden');
        modal.classList.remove('flex');
    }
};

window.submitTenureAdjustment = async function (e) {
    e.preventDefault();
    const staffId = document.getElementById('tenureStaffId').value;
    const actionType = document.getElementById('tenureActionType').value;
    const newEndDate = document.getElementById('tenureNewEndDate').value;
    const reason = document.getElementById('tenureReason').value.trim();

    if (!newEndDate || !reason) {
        return Swal.fire('Validation Error', 'New date and mandatory reason must be provided.', 'warning');
    }

    const authRes = await Swal.fire({
        title: 'Zero-Trust Authorization',
        html: `Executing <b>${actionType}</b> on corps personnel.<br><br>Enter Admin Password to commit:`,
        input: 'password',
        inputAttributes: { autocapitalize: 'off', autocorrect: 'off' },
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#005A36',
        confirmButtonText: 'Authorize Adjustment'
    });

    if (!authRes.isConfirmed || !authRes.value) return;

    const btn = document.getElementById('btnSubmitTenure');
    const ogHtml = btn.innerHTML;
    btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin mr-1"></i> Committing...`;
    btn.disabled = true;

    try {
        await ApiGateway.post('/director/staff/tenure/adjust', {
            staffId: staffId,
            actionType: actionType,
            newEndDate: newEndDate,
            reason: reason,
            adminPassword: authRes.value
        });

        Swal.fire('Tenure Modified', 'Personnel records and passing-out date updated in PostgreSQL.', 'success');
        window.closeTenureModal();
        await bootSystemData();
        renderCertsTable();
    } catch (err) {
        Swal.fire('Authorization Failed', err.message || 'Operation rejected.', 'error');
    } finally {
        btn.innerHTML = ogHtml;
        btn.disabled = false;
    }
};

window.printServiceCertificate = async function (staffId) {
    const btn = window.event ? window.event.currentTarget : null;
    let ogHtml = "";
    if (btn) {
        ogHtml = btn.innerHTML;
        btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin mr-1"></i> Compiling...`;
        btn.disabled = true;
    }

    try {
        const blob = await secureBlobFetch('/reports/service-certificate', {
            staffId: staffId
        }, 'POST');

        if (blob) {
            const pdfBlob = new Blob([blob], { type: 'application/pdf' });
            const blobUrl = window.URL.createObjectURL(pdfBlob);
            const a = document.createElement('a');
            a.href = blobUrl;
            a.download = `Certificate_of_Service_${staffId.replace(/\//g, '_')}.pdf`;
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(blobUrl);
            a.remove();
        }
    } catch (e) {
        Swal.fire('Compilation Error', 'Failed to generate Certificate of Service.', 'error');
    } finally {
        if (btn) {
            btn.innerHTML = ogHtml;
            btn.disabled = false;
        }
    }
};

window.renderHRTable = function () {
    const tbody = document.getElementById('hrTableBody');
    if (tbody) tbody.innerHTML = `<tr><td colspan="3" class="py-8 text-center text-slate-400 font-bold text-xs"><i class="fa-solid fa-folder-open text-3xl mb-3 opacity-20 block"></i> HR Archives Empty. No historical records established yet.</td></tr>`;
}

// ==========================================
// 9. REBUILT WATCHDOG LOGS ENGINE
// ==========================================
window.logEvent = async function (message, tag = 'SYSTEM') {
    try {
        await ApiGateway.post('/director/logs', { message, tag });
        fetchLogs();
    } catch (e) { }
}

window.filterLogs = function (tag) {
    App.ui.logFilter = tag;
    Array.from(document.getElementById('logFilterChips')?.children || []).forEach(chip => {
        if (chip.innerText.toUpperCase() === tag || (tag === 'ALL' && chip.innerText === 'ALL LOGS')) {
            chip.className = "px-3 py-1.5 rounded-lg bg-emerald-500 text-white text-[9px] font-black uppercase whitespace-nowrap shadow-sm";
        } else {
            chip.className = "px-3 py-1.5 rounded-lg bg-slate-800 text-slate-400 hover:bg-slate-700 text-[9px] font-black uppercase whitespace-nowrap border border-slate-700 transition-colors";
        }
    });
    window.executeLogSearch();
}

window.fetchLogs = async function () {
    try {
        App.data.logs = await ApiGateway.get('/director/logs');
        const bell = document.getElementById('logNotificationBell');
        if (bell) bell.classList.remove('hidden');
        window.executeLogSearch();
    } catch (e) {
        document.getElementById('systemLogs').innerHTML = `<div class="text-red-500 text-center mt-8 text-[10px] font-bold">Failed to fetch logs.</div>`;
    }
}

// ==========================================
// WATCHDOG FILTER ENGINE (SUPPRESS SMTP NOISE)
// ==========================================
window.executeLogSearch = function () {
    const query = (document.getElementById('logSearchInput')?.value || '').toLowerCase();
    const exactDate = document.getElementById('logDateFilter')?.value;

    const container = document.getElementById('systemLogs');
    if (!container) return;
    container.innerHTML = '';

    let filtered = App.data.logs.filter(l => {
        const msg = l.message || '';
        //  CLEANUP: Suppress any individual SMTP delivery noise
        if (msg.startsWith("EMAIL DELIVERED:") || msg.startsWith("EMAIL FAILED:")) return false;

        if (App.ui.logFilter === 'ALL') return true;
        const dbTag = (l.tag || '').toUpperCase();

        if (App.ui.logFilter === 'SYSTEM' && (dbTag === 'SYSTEM' || dbTag === 'GOVERNANCE')) return true;
        if (App.ui.logFilter === 'EXECUTIVE' && dbTag === 'EXECUTIVE') return true;
        if (App.ui.logFilter === 'COMMUNICATION' && (dbTag === 'COMMUNICATION' || dbTag === 'COMMS')) return true;
        if (App.ui.logFilter === 'DISCIPLINE' && dbTag === 'DISCIPLINE') return true;
        if (App.ui.logFilter === 'HR' && dbTag === 'HR') return true;
        if (App.ui.logFilter === 'ACADEMICS' && (dbTag === 'ACADEMICS' || dbTag === 'EXAM')) return true;

        return false;
    });

    if (query) filtered = filtered.filter(l => l.message.toLowerCase().includes(query) || (l.tag && l.tag.toLowerCase().includes(query)));
    if (exactDate) filtered = filtered.filter(l => l.timestamp && l.timestamp.startsWith(exactDate));

    if (filtered.length === 0) {
        container.innerHTML = `<div class="text-slate-500 text-center mt-8 text-[10px] font-bold opacity-60"><i class="fa-solid fa-satellite-dish block text-2xl mb-2"></i> No records match criteria...</div>`;
        return;
    }

    filtered.slice(0, 100).forEach((logObj, index) => {
        const p = document.createElement('p');
        p.className = `pb-3 mb-3 leading-relaxed text-[11px] ${index > 25 ? 'opacity-70' : 'border-b border-slate-800/60'}`;

        let tagColor = "text-slate-400 bg-slate-800 border-slate-700";
        let textColor = "text-slate-300";

        const dbTag = (logObj.tag || 'SYSTEM').toUpperCase();
        if (dbTag === 'COMMUNICATION' || dbTag === 'COMMS') { tagColor = "text-indigo-300 bg-indigo-900/40 border-indigo-800"; textColor = "text-indigo-100"; }
        if (dbTag === 'EXECUTIVE') { tagColor = "text-yellow-400 bg-yellow-900/40 border-yellow-700"; textColor = "text-yellow-100"; }
        if (dbTag === 'ACADEMICS' || dbTag === 'EXAM') { tagColor = "text-purple-300 bg-purple-900/40 border-purple-800"; textColor = "text-purple-100"; }
        if (dbTag === 'DISCIPLINE') { tagColor = "text-red-300 bg-red-900/40 border-red-800"; textColor = "text-red-100"; }
        if (dbTag === 'HR') { tagColor = "text-pink-300 bg-pink-900/40 border-pink-800"; textColor = "text-pink-100"; }
        if (dbTag === 'SYSTEM') { tagColor = "text-emerald-400 bg-emerald-950/40 border-emerald-800"; textColor = "text-emerald-100"; }

        p.classList.add(textColor);
        p.innerHTML = `<span class="text-[9px] text-slate-500 font-mono block mb-1">${new Date(logObj.timestamp || logObj.logTime).toLocaleString()}</span> <span class="text-[8px] px-1.5 py-0.5 rounded border mr-2 font-black uppercase ${tagColor}">${DOMPurify.sanitize(dbTag)}</span> ${DOMPurify.sanitize(logObj.message)}`;
        container.appendChild(p);
    });
};

// ==========================================
// 10. UNIFIED MASTER DOSSIER
// ==========================================
window.openDossierModal = async function (type, targetId) {
    const body = document.getElementById('dossierBody');
    if (!body) return;

    body.innerHTML = '<div class="py-24 text-center"><i class="fa-solid fa-circle-notch fa-spin text-4xl text-blue-500 mb-4 block"></i><p class="font-bold text-slate-500 uppercase tracking-widest text-xs">Decrypting Secure Dossier...</p></div>';

    const modal = document.getElementById('dossierModal');
    modal.classList.remove('hidden');
    setTimeout(() => {
        modal.classList.remove('opacity-0');
        document.getElementById('dossierContent')?.classList.remove('scale-95');
    }, 10);

    try {
        if (type === 'STUDENT') {
            const studentRef = App.data.students.find(s => s.admNo === targetId || s.nin === targetId);
            if (!studentRef) throw new Error("Student not found");

            const student = await ApiGateway.get(`/bridge/student?nin=${studentRef.nin}`);

            let logs = [];
            try {
                let parsedLogs = App.data.logs;
                logs = Array.isArray(parsedLogs) ? parsedLogs : [];
            } catch (e) { }

            const studentLogs = logs.filter(l => l.message && (l.message.includes(student.admNo) || l.message.includes(student.nin)));
            let logsHtml = studentLogs.map(l => `<div class="border-b border-slate-100 py-2"><span class="text-[9px] text-slate-400 font-mono">${DOMPurify.sanitize(l.timestamp)}</span><p class="text-xs font-medium text-slate-700">${DOMPurify.sanitize(l.message)}</p></div>`).join('');
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
                            <p class="text-xs font-bold text-slate-600 bg-red-50 p-4 rounded-xl border border-red-100 shadow-inner">Allergies: ${DOMPurify.sanitize(student.medAllergies || 'None declared')} &nbsp;|&nbsp; Disabilities:${student.disabilityRadio === 'none' ? 'None' : 'Yes (Check Physical File)'}</p>
                        </div>
                        <div class="pt-6 mt-2 border-t border-slate-200">
                            <div class="flex justify-between items-center mb-3">
                                <h4 class="text-[10px] font-black text-slate-400 uppercase tracking-widest"><i class="fa-solid fa-clock-rotate-left text-blue-400 mr-1"></i> Administrative Audit Trail</h4>
                            </div>
                            <div class="bg-slate-50 p-4 rounded-xl border border-slate-200 max-h-48 overflow-y-auto shadow-inner no-scrollbar">
                                ${logsHtml}
                            </div>
                        </div>
                    </div>
                </div>`;
        } else {
            const safeId = encodeURIComponent(targetId);

            const [staff, operationalRoles] = await Promise.all([
                ApiGateway.get(`/ict/staff/profile?id=${safeId}`),
                //  FETCHING FROM THE NEW UNIFIED OPERATIONAL PILLAR
                ApiGateway.get(`/ict/operational/staff?staffId=${safeId}`).catch(() => [])
            ]);

            body.innerHTML = window.buildStaffDossierHtml(staff, operationalRoles);
        }
    } catch (e) {
        body.innerHTML = `<div class="py-20 text-center text-red-500 font-bold"><i class="fa-solid fa-triangle-exclamation text-4xl mb-4 block"></i> Failed to decrypt dossier. Network Error.</div>`;
    }
}

window.buildStaffDossierHtml = function (staff, operationalRoles = []) {
    let rolesHtml = '';
    const staffIdCheck = staff.staffId || staff.trackingRef;
    const formatTitle = (str) => str.toLowerCase().split(' ').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');

    // STATUTORY PILLAR
    Object.entries(App.data.board).forEach(([officeKey, data]) => {
        if (data.staffId && data.staffId.toUpperCase() === staffIdCheck.toUpperCase()) {
            let cleanTitle = officeKey.replace('ROLE_', '').replace(/_/g, ' ');
            if (officeKey === 'ROLE_DIRECTOR') cleanTitle = 'School Director';
            if (officeKey === 'ROLE_BURSAR') cleanTitle = 'Central Bursar';
            rolesHtml += `<span class="bg-gussGold text-gussNavy px-3 py-1 rounded text-[9px] font-black uppercase shadow-sm border border-yellow-600 mr-2 mb-2 inline-block"><i class="fa-solid fa-crown mr-1"></i> ${formatTitle(cleanTitle)}</span>`;
        }
    });

    // DELEGATION PILLAR 
    Object.entries(App.data.delegations).forEach(([roleKey, data]) => {
        if (data.staffId && data.staffId.toUpperCase() === staffIdCheck.toUpperCase()) {
            rolesHtml += `<span class="bg-slate-800 text-white px-3 py-1 rounded text-[9px] font-black uppercase shadow-sm border border-slate-600 mr-2 mb-2 inline-block"><i class="fa-solid fa-shield-halved mr-1 text-blue-400"></i> ${formatTitle(roleKey.replace(/_/g, ' '))}</span>`;
        }
    });

    // OPERATIONAL PILLAR (Dynamic Badges via OperationalController)
    if (Array.isArray(operationalRoles)) {
        operationalRoles.forEach(op => {
            let icon = "fa-chalkboard-user";
            let colorClass = "text-blue-600 border-blue-600 bg-blue-50";

            if (op.type === 'HOUSE_WARDEN') {
                icon = "fa-building-user";
                colorClass = "text-purple-600 border-purple-600 bg-purple-50";
            } else if (op.type === 'FORM_MASTER') {
                icon = "fa-users-rectangle";
                colorClass = "text-orange-600 border-orange-600 bg-orange-50";
            }

            rolesHtml += `<span class="${colorClass} border text-[9px] font-black uppercase tracking-widest px-2 py-1 rounded shadow-sm mr-2 mb-2 inline-block"><i class="fa-solid ${icon} mr-1"></i> ${DOMPurify.sanitize(op.title)}</span>`;
        });
    }

    if (rolesHtml === '') {
        rolesHtml = `<span class="text-[9px] font-bold text-slate-400 uppercase"><i class="fa-solid fa-user text-slate-300 mr-1"></i> Standard Faculty Clearance</span>`;
    }

    const resolveFn = typeof window.resolveMediaUrl === 'function' ? window.resolveMediaUrl : resolveMedia;
    const safePhoto = staff.photoUrl || staff.uploadPassport ? resolveFn(staff.photoUrl || staff.uploadPassport) : `https://ui-avatars.com/api/?name=${(staff.fullName || staff.name).replace(/ /g, '+')}`;
    const safeSig = staff.signatureUrl || staff.uploadSignature ? resolveFn(staff.signatureUrl || staff.uploadSignature) : null;

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
}

window.closeDossierModal = function () {
    const modal = document.getElementById('dossierModal');
    if (!modal) return;
    modal.classList.add('opacity-0');
    document.getElementById('dossierContent')?.classList.add('scale-95');
    setTimeout(() => modal.classList.add('hidden'), 300);
}

// ==========================================
// 11. EPOCH VAULT & TERM ADVANCEMENT
// ==========================================
async function fetchEpochArchives() {
    try {
        //   Routed through ApiGateway.get
        App.data.epochs = await ApiGateway.get('/director/epoch/archives');
        const filter = document.getElementById('vaultSessionFilter');
        if (filter) {
            const uniqueSessions = [...new Set(App.data.epochs.map(a => a.label.split(' | ')[0]))];
            filter.innerHTML = '<option value="ALL">All Sessions</option>' + uniqueSessions.sort().reverse().map(s => `<option value="${DOMPurify.sanitize(s)}">${DOMPurify.sanitize(s)}</option>`).join('');
        }
    } catch (e) { }
}

window.openEpochModal = function () { document.getElementById('securityModal')?.classList.remove('hidden'); }
window.closeEpochVault = function () {
    document.getElementById('epochVaultModal')?.classList.add('opacity-0');
    setTimeout(() => document.getElementById('epochVaultModal')?.classList.add('hidden'), 300);
}

window.openEpochVault = function () {
    const modal = document.getElementById('epochVaultModal');
    if (!modal) return;
    modal.classList.remove('hidden');
    window.renderVaultGrid(App.data.epochs);
    setTimeout(() => modal.classList.remove('opacity-0'), 10);
}

window.filterVaultGrid = function () {
    const query = document.getElementById('vaultSearchInput')?.value.toLowerCase() || '';
    const session = document.getElementById('vaultSessionFilter')?.value || 'ALL';
    const filtered = App.data.epochs.filter(a => a.label.toLowerCase().includes(query) && (session === 'ALL' || a.label.includes(session)));
    renderVaultGrid(filtered);
}

window.renderVaultGrid = function (archives) {
    const container = document.getElementById('vaultGridContainer');
    if (!container) return;

    if (archives.length === 0) {
        container.innerHTML = `<div class="col-span-full text-center py-12 bg-white rounded-2xl border border-slate-200"><i class="fa-solid fa-box-open text-4xl text-slate-300 mb-3 block"></i><p class="text-slate-500 font-bold text-sm">No matching epochs found.</p></div>`;
        return;
    }

    container.innerHTML = archives.map(arc => {
        const isSelected = App.ui.epochView === arc.key;
        const [session, term] = arc.label.split(' | ');
        return `<div onclick="window.engageVaultArchive('${arc.key}', '${arc.label}')" class="p-5 rounded-2xl border-2 transition-all cursor-pointer group flex flex-col justify-between ${isSelected ? 'bg-red-50 border-red-400 shadow-md' : 'bg-white border-slate-200 hover:border-gussNavy hover:shadow-md'}">
            <div class="flex justify-between items-start mb-4">
                <div class="w-10 h-10 rounded-full flex items-center justify-center text-lg ${isSelected ? 'bg-red-200 text-red-700' : 'bg-slate-100 text-slate-500 group-hover:bg-gussNavy group-hover:text-white'}">
                    <i class="fa-solid ${isSelected ? 'fa-lock' : 'fa-database'}"></i>
                </div>
                ${isSelected ? '<span class="bg-red-600 text-white text-[9px] font-black uppercase px-2 py-1 rounded shadow-sm animate-pulse">Active View</span>' : ''}
            </div>
            <div><h4 class="text-sm font-black uppercase text-slate-800 mb-1">${DOMPurify.sanitize(session)}</h4><p class="text-[11px] font-bold text-slate-500 uppercase tracking-widest">${DOMPurify.sanitize(term || 'Archive')}</p></div>
        </div>`;
    }).join('');
}

window.engageVaultArchive = function (key, label) {
    App.ui.epochView = key;
    syncAcademicSession();
    document.getElementById('vaultTriggerBtn').className = "bg-red-900/30 text-red-400 px-4 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest border border-red-500/50 animate-pulse flex items-center gap-2";
    document.getElementById('vaultTriggerBtn').innerHTML = `<i class="fa-solid fa-lock"></i> Vault Active`;
    toggleReadonly(true);
    renderDelegationTable();
    window.closeEpochVault();
}

window.activateLiveSession = function () {
    App.ui.epochView = 'LIVE';
    syncAcademicSession();
    document.getElementById('vaultTriggerBtn').className = "bg-slate-800 hover:bg-slate-700 border border-slate-600 text-slate-200 px-4 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest shadow-sm flex items-center gap-2";
    document.getElementById('vaultTriggerBtn').innerHTML = `<i class="fa-solid fa-clock-rotate-left text-gussGold"></i> Time Vault`;
    toggleReadonly(false);
    renderDelegationTable();
    window.closeEpochVault();
}

window.executeTermAdvancement = async function () {
    if (window.isHistoricalArchiveMode()) {
        return Swal.fire('Archive Lockout', 'You cannot advance from a historical archive. Return to LIVE session.', 'error');
    }

    const input = document.getElementById('epochConfirmInput');
    if (!input || input.value !== 'ADVANCE') return Swal.fire('Aborted', "Type ADVANCE exactly.", 'error');

    const authRes = await Swal.fire({
        title: 'Zero-Trust Authorization',
        html: `You are about to permanently seal this academic term.<br><br>Enter Admin Password to execute:`,
        input: 'password',
        inputAttributes: { autocapitalize: 'off', autocorrect: 'off' },
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#ef4444',
        confirmButtonText: 'Seal & Advance'
    });

    if (!authRes.isConfirmed || !authRes.value) return;

    try {
        //   Routed through ApiGateway.post
        const data = await ApiGateway.post('/director/epoch/advance', { adminPassword: authRes.value });
        if (data) {
            document.getElementById('securityModal')?.classList.add('hidden');
            await bootSystemData();
            Swal.fire('Advancement Success', `System advanced to ${data.newSession}.`, 'success');
        }
    } catch (e) {
        Swal.fire('Error', e.message || "Authorization failed.", 'error');
    }
};

function toggleReadonly(isArchived) {
    const main = document.querySelector('main');
    if (!main) return;
    const inputs = main.querySelectorAll('input, select, textarea, button:not([id^="tabBtn"])');
    if (isArchived) {
        main.classList.add('grayscale', 'opacity-90');
        inputs.forEach(el => { if (!el.disabled) { el.setAttribute('data-arc', 'true'); el.disabled = true; el.classList.add('opacity-50', 'cursor-not-allowed'); } });
    } else {
        main.classList.remove('grayscale', 'opacity-90');
        inputs.forEach(el => { if (el.hasAttribute('data-arc')) { el.disabled = false; el.classList.remove('opacity-50', 'cursor-not-allowed'); el.removeAttribute('data-arc'); } });
    }
}

// ==========================================
// 12. UI TABBING & DIRECTOR PROFILE
// ==========================================
window.switchDirTab = function (tabName) {
    const tabs = ['delegation', 'oversight', 'discipline', 'certs', 'hr', 'comms'];
    const btnMap = { 'delegation': 'tabBtnDel', 'oversight': 'tabBtnOver', 'discipline': 'tabBtnDisc', 'certs': 'tabBtnCerts', 'hr': 'tabBtnHR', 'comms': 'tabBtnComms' };
    const contentMap = { 'delegation': 'tabDelegation', 'oversight': 'tabOversight', 'discipline': 'tabDiscipline', 'certs': 'tabCerts', 'hr': 'tabHR', 'comms': 'tabComms' };

    tabs.forEach(t => {
        const btn = document.getElementById(btnMap[t]);
        const content = document.getElementById(contentMap[t]);
        if (btn) btn.className = "px-5 py-2 rounded-xl text-xs font-black uppercase tracking-widest transition-all text-slate-500 hover:bg-slate-100 whitespace-nowrap";
        if (content) content.classList.add('hidden');
    });

    const activeBtn = document.getElementById(btnMap[tabName]);
    const activeContent = document.getElementById(contentMap[tabName]);

    if (activeBtn) activeBtn.className = "px-5 py-2 rounded-xl text-xs font-black uppercase tracking-widest transition-all bg-gussNavy text-white shadow-md whitespace-nowrap";
    if (activeContent) activeContent.classList.remove('hidden');
    if (App.ui.epochView !== 'LIVE') toggleReadonly(true);
}

// ==========================================
// 14. EXECUTIVE COMMUNICATIONS ENGINE
// ==========================================
window.executeInternalDispatch = async function () {
    if (window.isHistoricalArchiveMode()) {
        return Swal.fire('Archive Lockout', 'Dispatching internal directives is prohibited in historical view.', 'error');
    }

    const targetId = document.getElementById('commsInternalTarget').value;
    const subject = document.getElementById('commsInternalSubject').value.trim();
    const message = document.getElementById('commsInternalBody').value.trim();
    if (!targetId || !subject || !message) return Swal.fire('Error', 'Please fill all internal dispatch fields.', 'error');

    const authRes = await Swal.fire({
        title: 'Authorize Dispatch', html: `Enter Admin Password:`, input: 'password',
        inputAttributes: { autocapitalize: 'off', autocorrect: 'off' }, icon: 'warning',
        showCancelButton: true, confirmButtonColor: '#0F172A', confirmButtonText: 'Authorize'
    });
    if (!authRes.isConfirmed || !authRes.value) return;

    try {
        //   Routed through ApiGateway.post
        const data = await ApiGateway.post('/director/comms/internal', {
            targetId, subject, message, adminPassword: authRes.value
        });
        if (data) {
            Swal.fire('Dispatched', 'Internal directive distributed.', 'success');
            document.getElementById('commsInternalSubject').value = '';
            document.getElementById('commsInternalBody').value = '';
            window.fetchLogs();
        }
    } catch (e) { Swal.fire('Error', e.message || 'Network connection failed.', 'error'); }
};

window.executeExternalDispatch = async function () {
    if (window.isHistoricalArchiveMode()) {
        return Swal.fire('Archive Lockout', 'Transmitting external letterheads is prohibited in historical view.', 'error');
    }

    const toEmail = document.getElementById('commsExternalTo').value.trim();
    const subject = document.getElementById('commsExternalSubject').value.trim();
    const message = document.getElementById('commsExternalBody').value.trim();
    const attachmentFiles = document.getElementById('commsExternalFile')?.files;

    if (!toEmail || !subject || !message) return Swal.fire('Error', 'Please fill all external dispatch fields.', 'error');
    if (!App.profile.signatureUrl) return Swal.fire('Signature Required', 'External dispatches require an authorized digital signature.', 'warning');

    const authRes = await Swal.fire({
        title: 'Authorize Letterhead', html: `Enter Admin Password:`, input: 'password',
        inputAttributes: { autocapitalize: 'off', autocorrect: 'off' }, icon: 'warning',
        showCancelButton: true, confirmButtonColor: '#0F172A', confirmButtonText: 'Authorize'
    });
    if (!authRes.isConfirmed || !authRes.value) return;

    const fd = new FormData();
    fd.append('toEmail', toEmail);
    fd.append('subject', subject);
    fd.append('message', message);
    fd.append('adminPassword', authRes.value);

    if (attachmentFiles && attachmentFiles.length > 0) {
        for (let i = 0; i < attachmentFiles.length; i++) {
            fd.append('attachments', attachmentFiles[i]);
        }
    }

    try {
        //   Routed through ApiGateway.postFormData
        const data = await ApiGateway.postFormData('/director/comms/external', fd);
        if (data) {
            Swal.fire('Transmitted', 'Official letterhead securely transmitted.', 'success');
            document.getElementById('commsExternalTo').value = '';
            document.getElementById('commsExternalSubject').value = '';
            document.getElementById('commsExternalBody').value = '';
            if (document.getElementById('commsExternalFile')) document.getElementById('commsExternalFile').value = '';
            window.fetchLogs();
        }
    } catch (e) { Swal.fire('Error', e.message || 'Network connection failed.', 'error'); }
};