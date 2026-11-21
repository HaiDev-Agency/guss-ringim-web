// ==========================================
// 1. SESSION SECURITY & IDENTITY BINDING
// ==========================================
import { ENV } from './core_config.js';
import { ApiGateway } from './api_gateway.js';
import { CoreUI } from './core_ui.js';
import { SessionManager } from './session_manager.js';

let activeWardenId = sessionStorage.getItem('guss_staff_id');
let activeWardenName = sessionStorage.getItem('guss_user_name') || "Valued Warden";
let controlledHostel = null;

let RAM_VAULT = {};
let RAM_STUDENT_REGISTRY = [];

window.resolveMediaUrl = (url) => {
    if (!url) return 'https://ui-avatars.com/api/?name=Student';
    if (url.startsWith('http') || url.startsWith('data:')) return url;
    let cleanUrl = url.replace(/^\/+/, '');
    if (!cleanUrl.startsWith('uploads/')) cleanUrl = 'uploads/' + cleanUrl;
    return ENV.API_BASE_URL + '/' + cleanUrl;
};

window.parseVault = function (key) {
    const cloudConfigs = Object.keys(RAM_VAULT).length > 0 ? RAM_VAULT : (JSON.parse(sessionStorage.getItem('cloud_configs')) || {});
    let data = cloudConfigs[key];
    if (!data) return {};
    try {
        let parsed = JSON.parse(data);
        if (typeof parsed === 'string') parsed = JSON.parse(parsed);
        return parsed;
    } catch (e) { return {}; }
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

function normalizeStaffType(type) {
    if (!type) return "Unknown";
    const t = type.toUpperCase().trim();
    if (t === 'ACADEMIC' || (t.includes('ACADEMIC') && !t.includes('NON'))) return 'Academic';
    if (t === 'NON_ACADEMIC' || t === 'NON-ACADEMIC' || t.includes('NON')) return 'Non-Academic';
    if (t === 'TEACHING_PRACTICE' || t === 'TP') return 'TP';
    if (t === 'NYSC') return 'NYSC';
    return type;
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
    await resolveWardenIdentity();

    //  Apply the lockdown state immediately on boot
    window.applyArchiveReadonlyState(window.isHistoricalArchiveMode());
};

//  Listen for Time Travel events from the SessionManager
window.addEventListener('gussTimeMachineChanged', () => {
    window.applyArchiveReadonlyState(window.isHistoricalArchiveMode());
    loadHostelDashboard();
    if (document.getElementById('wTabContentExeat') && document.getElementById('wTabContentExeat').classList.contains('flex')) renderExeatRegistry();
    if (document.getElementById('wTabContentDiscipline') && document.getElementById('wTabContentDiscipline').classList.contains('flex')) renderHostelDisciplineLog();
});

window.applyArchiveReadonlyState = function (isArchived) {
    const mainContent = document.querySelector('main');
    if (!mainContent) return;

    const oldBanner = document.getElementById('houseArchiveBanner');
    if (oldBanner) oldBanner.remove();

    // Aggressively target all inputs EXCEPT search bars, dropdown filters, and tab navigation buttons
    const inputs = mainContent.querySelectorAll('input:not([id*="Search"]), select:not(#exeatFilter):not(#hostelSwitchDropdown), textarea, button:not([id^="wTabBtn"]):not([onclick^="openDossierModal"]):not([onclick^="switchWardenTab"])');

    if (isArchived) {
        const banner = document.createElement('div');
        banner.id = 'houseArchiveBanner';
        banner.className = 'bg-red-50 border-l-4 border-red-500 p-4 mb-6 rounded-r-xl shadow-sm w-full animate-fade-in flex items-center justify-between col-span-full';
        banner.innerHTML = `
            <div>
                <h3 class="text-red-800 font-black uppercase tracking-widest text-xs"><i class="fa-solid fa-lock mr-2"></i> HISTORICAL ARCHIVE ENFORCED</h3>
                <p class="text-red-700 text-[10px] mt-1 font-bold">You are viewing a sealed academic term. Issuing gate passes and logging disciplinary flags are strictly disabled.</p>
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
// CLOUD-BASED STATE SYNCHRONIZATION
// ==========================================
async function syncPostgresToLocal() {
    try {
        const [confRes, staffRes, stdRes] = await Promise.all([
            ApiGateway.get('/config/all').catch(() => null),
            ApiGateway.get('/ict/staff/all-lightweight').catch(() => null),
            ApiGateway.get('/bridge/all-lightweight').catch(() => null)
        ]);

        if (confRes) {
            RAM_VAULT = confRes;
            const lightConfigs = {};
            Object.keys(confRes).forEach(k => {
                if (!k.startsWith('guss_grades_') && !k.startsWith('guss_eval_')) {
                    lightConfigs[k] = confRes[k];
                }
            });

            sessionStorage.setItem('cloud_configs', JSON.stringify(lightConfigs));
            sessionStorage.setItem('cloud_statutory_board', lightConfigs['guss_statutory_board'] || '{}');
            sessionStorage.setItem('cloud_delegations', lightConfigs['guss_delegations'] || '{}');
            Object.keys(lightConfigs).forEach(k => {
                if (!k.startsWith('guss_statutory_board') && !k.startsWith('guss_delegations')) {
                    localStorage.setItem(k, lightConfigs[k]);
                }
            });
        }

        if (staffRes && Array.isArray(staffRes)) {
            const mappedRegistry = staffRes.map(staff => ({
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
            sessionStorage.setItem('cloud_staff_registry', JSON.stringify(mappedRegistry));
        }

        if (stdRes && Array.isArray(stdRes)) {
            stdRes.forEach(s => { if (s.uploadSignature) s.signatureUrl = s.uploadSignature; });
            RAM_STUDENT_REGISTRY = stdRes;
            sessionStorage.setItem('cloud_student_registry', JSON.stringify(stdRes));
        }
    } catch (error) { console.error("Critical Cloud Sync Error:", error); }
}

// ================= AUTHENTICATION & MULTI-HOSTEL WARDEN RESOLUTION =================
async function resolveWardenIdentity() {
    if (!activeWardenId) {
        document.getElementById('activeWardenNameDisplay').textContent = "UNAUTHORIZED ACCESS";
        Swal.fire('Access Denied', "Identity resolution failed. Please log in again.", 'error').then(() => {
            window.location.href = 'staff_login.html';
        });
        return;
    }

    try {
        //  RDBMS SOURCE OF TRUTH: Query relational hostels to find all blocks assigned to me
        const hostels = await ApiGateway.get('/dd/admin/hostels');
        const myHostels = hostels.filter(h => h.warden && (h.warden.staffId === activeWardenId || h.warden.trackingRef === activeWardenId));

        if (myHostels.length > 0) {
            // Default to the first assigned hostel if none selected yet
            if (!controlledHostel || !myHostels.some(h => h.hostelName === controlledHostel)) {
                controlledHostel = myHostels[0].hostelName;
            }

            document.getElementById('activeWardenNameDisplay').textContent = activeWardenName;
            renderHostelSelectorUI(myHostels, controlledHostel);
            loadHostelDashboard();
        } else {
            document.getElementById('activeWardenNameDisplay').textContent = "ACCESS DENIED";
            const displayEl = document.getElementById('hostelNameDisplay');
            if (displayEl) displayEl.textContent = "UNASSIGNED";

            Swal.fire('Security Halt', "You are not currently appointed as a House Warden for any hostel.", 'error').then(() => {
                window.location.href = 'staff_portal.html';
            });
        }
    } catch (e) {
        Swal.fire('Network Error', 'Could not resolve warden assignment from relational database.', 'error');
    }
}

//  DYNAMIC UI SWITCHER: Renders static badge for 1 hostel, or dropdown selector for multiple hostels
function renderHostelSelectorUI(hostels, activeName) {
    const container = document.getElementById('hostelNameDisplay')?.parentElement;
    if (!container) return;

    if (hostels.length === 1) {
        container.innerHTML = `
            <label class="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">Active Controlled Hostel</label>
            <div id="hostelNameDisplay" class="bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-black text-gussNavy uppercase tracking-wide truncate">
                ${DOMPurify.sanitize(activeName)}
            </div>
        `;
    } else {
        let options = '';
        hostels.forEach(h => {
            const sel = h.hostelName === activeName ? 'selected' : '';
            options += `<option value="${DOMPurify.sanitize(h.hostelName)}" ${sel}>${DOMPurify.sanitize(h.hostelName)}</option>`;
        });
        container.innerHTML = `
            <label class="block text-[10px] font-black text-amber-700 uppercase tracking-widest mb-1"><i class="fa-solid fa-shuffle mr-1"></i> Switch Controlled Hostel (${hostels.length} Assigned)</label>
            <select id="hostelSwitchDropdown" onchange="window.switchControlledHostel(this.value)" class="w-full bg-amber-50 border border-amber-300 rounded-xl px-4 py-2.5 text-xs font-black text-gussNavy uppercase tracking-wide focus:outline-none focus:ring-2 focus:ring-amber-400 shadow-sm cursor-pointer">
                ${options}
            </select>
        `;
    }
}

window.switchControlledHostel = function (hostelName) {
    controlledHostel = hostelName;
    loadHostelDashboard();

    // Refresh active tab views if open
    if (document.getElementById('wTabContentExeat') && document.getElementById('wTabContentExeat').classList.contains('flex')) {
        renderExeatRegistry();
    }
    if (document.getElementById('wTabContentDiscipline') && document.getElementById('wTabContentDiscipline').classList.contains('flex')) {
        if (typeof renderHostelDisciplineLog === 'function') renderHostelDisciplineLog();
    }
}

// ================= UI TAB LOGIC =================
window.switchWardenTab = function (tabId) {
    ['roster', 'exeat', 'discipline'].forEach(id => {
        const btn = document.getElementById(`wTabBtn${id.charAt(0).toUpperCase() + id.slice(1)}`);
        const content = document.getElementById(`wTabContent${id.charAt(0).toUpperCase() + id.slice(1)}`);
        if (!btn || !content) return;

        if (id === tabId) {
            btn.className = "flex-1 md:flex-none px-6 py-2.5 rounded-lg text-xs font-black uppercase tracking-wider transition-all bg-white shadow-sm text-gussNavy border border-slate-200 whitespace-nowrap";
            content.classList.remove('hidden');
            content.classList.add(id === 'roster' ? 'block' : 'flex');
        } else {
            btn.className = "flex-1 md:flex-none px-6 py-2.5 rounded-lg text-xs font-black uppercase tracking-wider transition-all text-slate-500 hover:text-gussNavy whitespace-nowrap";
            content.classList.add('hidden');
            content.classList.remove('block', 'flex');
        }
    });

    if (tabId === 'roster') loadHostelDashboard();
    if (tabId === 'exeat') renderExeatRegistry();
    if (tabId === 'discipline') renderHostelDisciplineLog();
}

// ================= DATA LOADING (ROSTER) =================
function getHostelRoster() {
    if (!controlledHostel) return [];
    const pendingDB = JSON.parse(sessionStorage.getItem('cloud_student_registry')) || [];
    return pendingDB.filter(app => app.status === 'ADMITTED' && app.assignedHostel && app.assignedHostel.toLowerCase() === controlledHostel.toLowerCase());
}

function loadHostelDashboard() {
    if (!controlledHostel) return;

    const students = getHostelRoster();
    const statBoardersEl = document.getElementById('statTotalBoarders');
    if (statBoardersEl) statBoardersEl.textContent = students.length;

    let exeatDB = parseVault('guss_exeat_registry');
    if (!Array.isArray(exeatDB)) exeatDB = [];
    const myExeats = exeatDB.filter(ex => ex.hostel && ex.hostel.toLowerCase() === controlledHostel.toLowerCase() && ex.status === 'ACTIVE');

    const statActiveExeatsEl = document.getElementById('statActiveExeats');
    if (statActiveExeatsEl) statActiveExeatsEl.textContent = myExeats.length;

    let discDB = parseVault('guss_disciplinary_records');
    if (!Array.isArray(discDB)) discDB = [];
    const myFlags = discDB.filter(d => students.some(s => s.admNo === d.admNo));

    const statInfractionsEl = document.getElementById('statInfractions');
    if (statInfractionsEl) statInfractionsEl.textContent = myFlags.length;

    const tbody = document.getElementById('wardenRosterBody');
    if (!tbody) return;

    if (students.length === 0) {
        tbody.innerHTML = `<tr><td colspan="4" class="py-12 text-center text-slate-400 font-bold text-xs"><i class="fa-solid fa-bed-empty text-3xl mb-3 opacity-30 block"></i> No students assigned to this hostel block.</td></tr>`;
    } else {
        let htmlBuffer = '';
        students.forEach(student => {
            const hasExeat = myExeats.find(ex => ex.admNo === student.admNo);
            const statusBadge = hasExeat
                ? `<span class="bg-amber-100 text-amber-800 px-2.5 py-1 rounded text-[9px] font-black uppercase tracking-wider border border-amber-200"><i class="fa-solid fa-person-walking-arrow-right mr-1"></i> On Exeat</span>`
                : `<span class="bg-emerald-100 text-emerald-800 px-2.5 py-1 rounded text-[9px] font-black uppercase tracking-wider border border-emerald-200"><i class="fa-solid fa-building-user mr-1"></i> In Hostel</span>`;

            htmlBuffer += `
                <tr class="hover:bg-slate-50 transition-colors border-b border-slate-100 roster-row">
                    <td class="py-3 px-4 flex items-center gap-3">
                        <img src="${DOMPurify.sanitize(student.photoUrl || student.uploadPassport || 'https://ui-avatars.com/api/?name=Student')}" class="w-8 h-8 rounded-lg object-cover bg-slate-100 border border-slate-200 shrink-0">
                        <div>
                            <div class="font-black text-slate-800 text-xs uppercase student-name-search">${DOMPurify.sanitize(student.name)}</div>
                            <div class="text-[9px] font-mono text-slate-500">${DOMPurify.sanitize(student.admNo)}</div>
                        </div>
                    </td>
                    <td class="py-3 px-4 text-xs font-bold text-slate-600 uppercase">${DOMPurify.sanitize(student.assignedClass || 'Unassigned')}</td>
                    <td class="py-3 px-4 text-center">${statusBadge}</td>
                    <td class="py-3 px-4 text-right">
                        <button onclick="openDossierModal('${DOMPurify.sanitize(student.admNo)}')" class="bg-slate-100 hover:bg-slate-200 text-slate-600 px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest transition-colors shadow-sm"><i class="fa-solid fa-folder-open mr-1"></i> View Profile</button>
                    </td>
                </tr>
            `;
        });
        tbody.innerHTML = htmlBuffer;
    }

    const exeatSelect = document.getElementById('exeatStudentSelect');
    const discSelect = document.getElementById('discStudentSelect');

    if (exeatSelect) {
        let exeatOptions = '<option value="">Select Resident...</option>';
        students.forEach(s => exeatOptions += `<option value="${DOMPurify.sanitize(s.admNo)}">${DOMPurify.sanitize(s.name)} (${DOMPurify.sanitize(s.admNo)})</option>`);
        exeatSelect.innerHTML = exeatOptions;
    }
    if (discSelect) {
        let discOptions = '<option value="">Select Resident...</option>';
        students.forEach(s => discOptions += `<option value="${DOMPurify.sanitize(s.admNo)}">${DOMPurify.sanitize(s.name)} (${DOMPurify.sanitize(s.admNo)})</option>`);
        discSelect.innerHTML = discOptions;
    }
}

window.filterWardenRoster = function () {
    const input = document.getElementById('rosterSearchInput');
    if (!input) return;
    const query = input.value.toLowerCase();
    const rows = document.querySelectorAll('.roster-row');

    rows.forEach(row => {
        const nameEl = row.querySelector('.student-name-search');
        if (!nameEl) return;
        row.style.display = nameEl.innerText.toLowerCase().includes(query) ? '' : 'none';
    });
}

// ================= DOSSIER VIEWER (RELATIONAL) =================
window.openDossierModal = async function (admNo) {
    const students = getHostelRoster();
    const studentRef = students.find(s => s.admNo === admNo);
    if (!studentRef) return Swal.fire('Error', 'Resident identity not found in local registry.', 'error');

    const targetNin = studentRef.nin;
    if (!targetNin) {
        console.error("Dossier Error: Student record lacks NIN linkage", studentRef);
        return Swal.fire('Error', "Resident profile is missing NIN linkage.", 'error');
    }

    const body = document.getElementById('dossierBody');
    if (!body) return;

    body.innerHTML = '<div class="py-24 text-center"><i class="fa-solid fa-circle-notch fa-spin text-4xl text-blue-500 mb-4 block"></i><p class="font-bold text-slate-500 uppercase tracking-widest text-xs">Decrypting Secure Dossier...</p></div>';

    const modal = document.getElementById('dossierModal');
    if (modal) modal.classList.remove('hidden');
    setTimeout(() => {
        modal.classList.remove('opacity-0');
        const content = document.getElementById('dossierContent');
        if (content) content.classList.remove('scale-95');
    }, 10);

    try {
        const student = await ApiGateway.get(`/bridge/student?nin=${encodeURIComponent(targetNin)}`);

        const safePhoto = window.resolveMediaUrl(student.photoUrl || student.uploadPassport || student.recentPassportUrl);
        const safeSig = window.resolveMediaUrl(student.uploadSignature || student.signatureUrl);

        // Map flat medical keys from BridgeService
        let dis = 'None';
        if (student.disabilityRadio && student.disabilityRadio !== 'none') {
            dis = student.disabilityCats ? student.disabilityCats.join(', ') : 'Yes';
            if (student.disabilityDetails) dis += ` (${student.disabilityDetails})`;
        }

        body.innerHTML = `
            <div class="flex flex-col md:flex-row gap-8 items-start">
                <div class="flex flex-col items-center gap-4 w-full md:w-1/3 border-b md:border-b-0 md:border-r border-slate-200 pb-6 md:pb-0 md:pr-6 shrink-0">
                    <img src="${DOMPurify.sanitize(safePhoto)}" class="w-48 h-48 object-cover rounded-3xl shadow-md border border-slate-200">
                    <span class="bg-emerald-100 text-emerald-800 text-[10px] font-black uppercase tracking-widest px-3 py-1 rounded shadow-sm">Resident Profile</span>
                    <div class="text-center w-full">
                        <p class="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Admission Number</p>
                        <p class="font-mono font-bold text-gussNavy bg-slate-100 py-2 rounded-lg border border-slate-200 text-lg">${DOMPurify.sanitize(student.admNo)}</p>
                    </div>
                </div>
                <div class="flex-1 w-full space-y-6">
                    <div>
                        <h2 class="text-2xl sm:text-3xl font-black text-gussNavy uppercase tracking-wide leading-tight">${DOMPurify.sanitize(student.name || student.fullName)}</h2>
                        <p class="text-xs text-slate-500 font-bold mt-1">Class: <span class="text-gussGreen">${DOMPurify.sanitize(student.assignedClass || 'Unassigned')}</span> &nbsp;|&nbsp; Hostel: <span class="text-gussGold">${DOMPurify.sanitize(student.assignedHostel || 'Day Student')}</span></p>
                    </div>
                    <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-y-5 gap-x-6 bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
                        <div><p class="text-[9px] font-bold text-slate-400 uppercase tracking-widest">State / LGA</p><p class="text-sm font-black text-slate-700">${DOMPurify.sanitize(student.state || student.stateOfOrigin || 'N/A')} / ${DOMPurify.sanitize(student.lga || 'N/A')}</p></div>
                        <div><p class="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Blood Group</p><p class="text-sm font-black text-red-600">${DOMPurify.sanitize(student.blood || 'Unknown')}</p></div>
                        <div><p class="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Genotype</p><p class="text-sm font-black text-blue-600">${DOMPurify.sanitize(student.genotype || 'Unknown')}</p></div>
                        <div class="sm:col-span-3"><p class="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Routine Medications / Health Notes</p><p class="text-sm font-bold text-slate-700">${DOMPurify.sanitize(student.routineMeds || 'None declared')} | Allergies: ${DOMPurify.sanitize(student.medAllergies || student.foodAllergies || 'None')} | Disability: ${DOMPurify.sanitize(dis)}</p></div>
                    </div>
                    <div class="bg-amber-50 p-5 rounded-2xl border border-amber-200 shadow-sm space-y-4">
                        <h4 class="text-[10px] font-black text-amber-800 uppercase tracking-widest border-b border-amber-200 pb-2"><i class="fa-solid fa-phone text-amber-500 mr-1"></i> Emergency Contact (Next of Kin)</h4>
                        <div class="grid sm:grid-cols-2 gap-4">
                            <div><p class="text-[9px] font-bold text-amber-700/70 uppercase tracking-widest">NOK Name</p><p class="text-sm font-black text-amber-900">${DOMPurify.sanitize(student.nok1Name || student.parentName || 'N/A')}</p></div>
                            <div><p class="text-[9px] font-bold text-amber-700/70 uppercase tracking-widest">NOK Phone</p><p class="text-sm font-mono font-black text-amber-900"><a href="tel:${DOMPurify.sanitize(student.nok1Phone || student.parentPhone)}">${DOMPurify.sanitize(student.nok1Phone || student.parentPhone || 'N/A')}</a></p></div>
                            <div class="sm:col-span-2"><p class="text-[9px] font-bold text-amber-700/70 uppercase tracking-widest">Residential Address</p><p class="text-sm font-bold text-amber-900">${DOMPurify.sanitize(student.address || student.nok1Address || 'N/A')}</p></div>
                        </div>
                    </div>
                </div>
            </div>`;
    } catch (e) {
        console.error(e);
        body.innerHTML = `<div class="py-20 text-center text-red-500 font-bold">Failed to decrypt resident dossier.</div>`;
    }
}

window.closeDossierModal = function () {
    const modal = document.getElementById('dossierModal');
    const content = document.getElementById('dossierContent');
    if (!modal) return;
    modal.classList.add('opacity-0');
    if (content) content.classList.add('scale-95');
    setTimeout(() => { modal.classList.add('hidden'); }, 300);
}

// ================= RELATIONAL GATE PASS ENGINE =================
window.issueExeatPass = async function () {
    const studentSelect = document.getElementById('exeatStudentSelect');
    const typeEl = document.getElementById('exeatType');
    const returnDateEl = document.getElementById('exeatReturnDate');

    if (!studentSelect || !typeEl || !returnDateEl) return;

    const admNo = studentSelect.value;
    const type = typeEl.value;
    const returnDate = returnDateEl.value;

    if (!admNo || !returnDate) return Swal.fire('Validation Error', "Select a student and return date.", 'error');

    try {
        //   Relational JPA endpoint
        await ApiGateway.post('/gate-pass/issue', {
            admNo: admNo,
            type: type,
            returnDate: returnDate
        });

        Swal.fire('Gate Pass Issued', `Official Gate Pass issued for ${admNo}.`, 'success');
        studentSelect.value = '';
        returnDateEl.value = '';
        renderExeatRegistry();
        loadHostelDashboard();
    } catch (e) {
        Swal.fire('Error', e.message || 'Failed to issue pass.', 'error');
    }
};

window.markExeatReturned = async function (exeatId) {
    const res = await Swal.fire({
        title: 'Confirm Return?',
        text: 'Confirm resident has physically returned?',
        icon: 'question',
        showCancelButton: true,
        confirmButtonColor: '#10b981',
        confirmButtonText: 'Yes, Sign In'
    });

    if (!res.isConfirmed) return;

    try {
        //   Relational JPA endpoint
        await ApiGateway.post(`/gate-pass/return/${exeatId}`, {});
        renderExeatRegistry();
        loadHostelDashboard();
        Swal.fire('Returned', 'Resident signed in.', 'success');
    } catch (e) {
        Swal.fire('Error', e.message || 'Failed to update status.', 'error');
    }
};

window.renderExeatRegistry = async function () {
    const tbody = document.getElementById('exeatRegistryBody');
    if (!tbody || !controlledHostel) return;

    tbody.innerHTML = '<tr><td colspan="5" class="py-8 text-center text-slate-400 font-bold text-xs"><i class="fa-solid fa-spinner fa-spin"></i> Loading...</td></tr>';

    try {
        //   Fetch directly from database
        const passes = await ApiGateway.get(`/gate-pass/hostel/${encodeURIComponent(controlledHostel)}`);

        if (passes.length === 0) {
            tbody.innerHTML = `<tr><td colspan="5" class="py-12 text-center text-slate-400 font-bold text-xs">No Exeats issued from this hostel.</td></tr>`;
            return;
        }

        let htmlBuffer = '';
        passes.forEach(ex => {
            let statusBadge = ex.status === 'RETURNED'
                ? `<span class="bg-emerald-100 text-emerald-800 px-2 py-1 rounded text-[9px] font-black uppercase tracking-widest border border-emerald-200">Returned</span>`
                : (ex.isOverdue
                    ? `<span class="bg-red-100 text-red-800 px-2 py-1 rounded text-[9px] font-black uppercase tracking-widest border border-red-200 animate-pulse">Overdue</span>`
                    : `<span class="bg-amber-100 text-amber-800 px-2 py-1 rounded text-[9px] font-black uppercase tracking-widest border border-amber-200">Active Leave</span>`);

            let actionBtn = ex.status === 'ACTIVE'
                ? `<button onclick="markExeatReturned('${DOMPurify.sanitize(ex.id)}')" class="bg-gussGreen hover:bg-emerald-800 text-white px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-wider transition-colors shadow-sm"><i class="fa-solid fa-check-double mr-1"></i> Sign In</button>`
                : `<span class="text-[10px] text-slate-400 font-bold uppercase tracking-widest"><i class="fa-solid fa-lock"></i> Closed</span>`;

            htmlBuffer += `
                <tr class="hover:bg-slate-50 transition-colors border-b border-slate-100">
                    <td class="py-3 px-4 font-black text-slate-800 text-xs uppercase">${DOMPurify.sanitize(ex.name)} <br><span class="text-[9px] font-mono text-slate-500 font-normal">${DOMPurify.sanitize(ex.admNo)}</span></td>
                    <td class="py-3 px-4 text-xs font-bold text-slate-600">${DOMPurify.sanitize(ex.type)}</td>
                    <td class="py-3 px-4 text-xs font-bold ${ex.isOverdue ? 'text-red-600' : 'text-slate-600'}">${DOMPurify.sanitize(ex.returnDate)}</td>
                    <td class="py-3 px-4 text-center">${statusBadge}</td>
                    <td class="py-3 px-4 text-right">${actionBtn}</td>
                </tr>`;
        });
        tbody.innerHTML = htmlBuffer;
    } catch (e) {
        tbody.innerHTML = '<tr><td colspan="5" class="py-8 text-center text-red-500 font-bold text-xs">Failed to load passes.</td></tr>';
    }
};

// ================= DISCIPLINARY LOGIC =================
window.submitDisciplinaryFlag = async function () {
    const studentSelect = document.getElementById('discStudentSelect');
    const severityEl = document.getElementById('discSeverity');
    const reportEl = document.getElementById('discReport');

    if (!studentSelect || !severityEl || !reportEl) return;

    const admNo = studentSelect.value;
    const severity = severityEl.value;
    const report = reportEl.value.trim();

    if (!admNo || !report) return Swal.fire('Validation Error', "Select an offender and detail the incident report.", 'error');

    //  ZERO-TRUST ENFORCEMENT
    const authRes = await Swal.fire({
        title: 'Zero-Trust Authorization',
        html: `Transmit official ${severity} flag against ${admNo}.<br><br>Enter Admin Password to execute:`,
        input: 'password',
        inputAttributes: { autocapitalize: 'off', autocorrect: 'off' },
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#ef4444',
        confirmButtonText: 'Authorize Flag'
    });

    if (!authRes.isConfirmed || !authRes.value) return;

    const btn = window.event ? window.event.currentTarget : null;
    let ogText = "";
    if (btn) {
        ogText = btn.innerHTML;
        btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin mr-1"></i> Transmitting...`;
        btn.disabled = true;
    }

    try {
        //  STRICT RELATIONAL BACKEND ENDPOINT WITH ZT PASSWORD
        await ApiGateway.post('/dd/admin/discipline/log', {
            admNo: admNo,
            category: severity,
            reason: `[${controlledHostel} Infraction] ${report}`,
            penalty: severity === 'Warning' ? "HOSTEL GROUNDING" : "ESCALATED TO DD ADMIN",
            adminPassword: authRes.value
        });

        Swal.fire('Transmitted', "Disciplinary Flag successfully committed to the PostgreSQL Relational Vault.", 'success');
        studentSelect.value = '';
        reportEl.value = '';
        renderHostelDisciplineLog(admNo); //  Pass the admNo here!
        loadHostelDashboard();

    } catch (error) {
        Swal.fire('Error', error.message || "Failed to transmit disciplinary flag.", 'error');
    } finally {
        if (btn) {
            btn.innerHTML = ogText;
            btn.disabled = false;
        }
    }
}

window.renderHostelDisciplineLog = async function (targetAdmNo = null) {
    const tbody = document.getElementById('hostelDisciplineBody');
    if (!tbody) return;

    if (!targetAdmNo) {
        tbody.innerHTML = `<tr><td colspan="3" class="py-12 text-center text-slate-400 font-bold text-xs"><i class="fa-solid fa-search text-3xl mb-3 opacity-20 block"></i> Search and select a resident above to view their infraction history.</td></tr>`;
        return;
    }

    tbody.innerHTML = `<tr><td colspan="3" class="py-12 text-center text-slate-400 font-bold text-xs"><i class="fa-solid fa-circle-notch fa-spin text-3xl mb-3 block"></i> Fetching from Relational Vault...</td></tr>`;

    try {
        const allRecords = await ApiGateway.get('/dd/admin/discipline/records');

        // Filter records to only show the specifically searched student
        const myFlags = allRecords.filter(d => d.student && d.student.admNo === targetAdmNo).reverse();

        if (myFlags.length === 0) {
            tbody.innerHTML = `<tr><td colspan="3" class="py-12 text-center text-slate-400 font-bold text-xs"><i class="fa-solid fa-shield-check text-3xl mb-3 opacity-30 block"></i> No infractions logged for this resident.</td></tr>`;
            return;
        }

        let htmlBuffer = '';
        myFlags.forEach(flag => {
            let badge = "bg-slate-100 text-slate-700 border-slate-300";
            if (flag.infractionLevel === 'Warning') badge = "bg-yellow-100 text-yellow-700 border-yellow-300";
            if (flag.infractionLevel === 'Probation') badge = "bg-orange-100 text-orange-700 border-orange-300";
            if (flag.infractionLevel === 'Suspension') badge = "bg-red-100 text-red-700 border-red-300";
            if (flag.infractionLevel === 'Dismissal') badge = "bg-slate-900 text-red-400 border-red-900";

            htmlBuffer += `
                <tr class="hover:bg-red-50/30 transition-colors border-b border-slate-100">
                    <td class="py-3 px-4">
                        <div class="font-black text-slate-800 text-xs uppercase cursor-pointer hover:text-blue-600" onclick="openDossierModal('${DOMPurify.sanitize(flag.student.admNo)}')">${DOMPurify.sanitize(flag.student.fullName)}</div>
                        <div class="text-[9px] font-mono text-slate-500">${DOMPurify.sanitize(flag.student.admNo)}</div>
                    </td>
                    <td class="py-3 px-4"><span class="px-2 py-1 border rounded text-[9px] font-black uppercase tracking-widest ${badge}">${DOMPurify.sanitize(flag.infractionLevel)}</span></td>
                    <td class="py-3 px-4 text-xs font-bold text-slate-700 leading-relaxed max-w-md break-words">${DOMPurify.sanitize(flag.reason)} <div class="text-[9px] font-normal text-slate-400 mt-1">Logged: ${new Date(flag.createdAt).toLocaleDateString('en-NG')}</div></td>
                </tr>
            `;
        });
        tbody.innerHTML = htmlBuffer;
    } catch (e) {
        tbody.innerHTML = `<tr><td colspan="3" class="py-12 text-center text-red-500 font-bold text-xs">Failed to fetch disciplinary records.</td></tr>`;
    }
}

window.openLeaveModal = function () {
    const modal = document.getElementById('leaveModal');
    if (modal) modal.classList.remove('hidden');
}

window.submitLeaveRequest = async function (e) {
    e.preventDefault();
    if (!activeWardenId) return;

    const type = document.getElementById('leaveType').value;
    const start = document.getElementById('leaveStart').value;
    const end = document.getElementById('leaveEnd').value;
    const notes = document.getElementById('leaveNotes').value.trim();

    if (new Date(end) <= new Date(start)) return Swal.fire('Validation Error', "Expected Return Date must be after the Start Date.", 'error');

    try {
        //  STRICT RELATIONAL BACKEND ENDPOINT
        await ApiGateway.post('/ict/operations/leave/request', {
            type: type,
            startDate: start,
            endDate: end,
            notes: notes
        });

        Swal.fire('Transmitted', `Success: Your ${type} Leave request has been securely transmitted to the DD Administration console for review.`, 'success');
        e.target.reset();
        const modal = document.getElementById('leaveModal');
        if (modal) modal.classList.add('hidden');
    } catch (err) {
        Swal.fire('Error', err.message || "Failed to transmit leave request.", 'error');
    }
}