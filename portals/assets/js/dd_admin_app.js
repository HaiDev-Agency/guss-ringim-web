// =====================================================================
// G.U.S.S. RINGIM — DEPUTY DIRECTOR (ADMINISTRATION) CONTROLLER
// ARCHIVE-HARDENED ENTERPRISE SPECIFICATION
// =====================================================================
import { ENV } from './core_config.js';
import { ApiGateway } from './api_gateway.js';
import { CoreUI } from './core_ui.js';
import { SessionManager } from './session_manager.js';

window.resolveMediaUrl = function (url) {
    if (!url) return '';
    if (url.startsWith('http') || url.startsWith('data:')) return url;
    let cleanUrl = url.replace(/^\/+/, '');
    if (!cleanUrl.startsWith('uploads/')) cleanUrl = 'uploads/' + cleanUrl;
    return ENV.API_BASE_URL + '/' + cleanUrl;
};

let currentDDAdminStaffId = sessionStorage.getItem('guss_staff_id');
let activeDDAdminProfile = {
    name: "Deputy Director (Admin)", staffId: currentDDAdminStaffId, signatureUrl: null
};

let RAM_VAULT = {};
let RAM_STUDENT_REGISTRY = [];

window.parseVault = function (key) {
    const cloudConfigs = Object.keys(RAM_VAULT).length > 0 ? RAM_VAULT : (JSON.parse(sessionStorage.getItem('cloud_configs')) || {});
    let actualKey = key;
    if (key === 'cloud_statutory_board') actualKey = 'guss_statutory_board';
    let data = cloudConfigs[actualKey] || RAM_VAULT[actualKey] || sessionStorage.getItem(actualKey);
    if (!data) return null;
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
    CoreUI.init();
    await SessionManager.initHeaderDropdown();
    await window.syncPostgresToLocal();
    window.resolveDDAdminIdentity();
    await window.seedDropdowns();
    window.applyArchiveReadonlyState();
    window.switchTab('omnisearch');

    // Poller for pending leaves
    setInterval(async () => {
        try {
            const pendingLeaves = await ApiGateway.get('/dd/admin/welfare/leave/pending');
            const tabBtn = document.getElementById('tabBtnWelfare');
            if (tabBtn) {
                if (pendingLeaves && pendingLeaves.length > 0) {
                    tabBtn.innerHTML = `<i class="fa-solid fa-umbrella-beach mr-2 text-orange-500"></i> Staff Welfare <span class="ml-2 bg-red-500 text-white px-1.5 py-0.5 rounded-full text-[9px] animate-pulse">${pendingLeaves.length}</span>`;
                } else {
                    tabBtn.innerHTML = `<i class="fa-solid fa-umbrella-beach mr-2 text-orange-500"></i> Staff Welfare`;
                }
            }
        } catch (e) { }
    }, 30000);
};

//  TIME MACHINE CHANGE LISTENER
window.addEventListener('gussTimeMachineChanged', () => {
    window.applyArchiveReadonlyState();
    window.renderHostelMatrix();
    window.renderWelfareTable();
    window.renderApprovalsQueue();
    window.renderDisciplineRegistry();
});

// =====================================================================
// TOTAL ARCHIVE IMMUTABILITY ENFORCEMENT ENGINE
// =====================================================================
window.applyArchiveReadonlyState = function () {
    const isHistorical = SessionManager.isHistoricalArchiveMode();
    const main = document.querySelector('main');
    if (!main) return;

    const oldBanner = document.getElementById('ddAdminArchiveBanner');
    if (oldBanner) oldBanner.remove();

    if (isHistorical) {
        // 1. Prominent Warning Banner in Workspace
        const banner = document.createElement('div');
        banner.id = 'ddAdminArchiveBanner';
        banner.className = 'bg-red-50 border-l-4 border-red-500 p-4 rounded-2xl shadow-sm col-span-full mb-4 animate-fade-in flex items-center justify-between';
        banner.innerHTML = `
            <div>
                <h3 class="text-xs font-black text-red-800 uppercase tracking-widest flex items-center gap-2">
                    <i class="fa-solid fa-lock text-red-600 text-sm"></i> HISTORICAL ARCHIVE SEALED (READ-ONLY)
                </h3>
                <p class="text-[10px] text-red-700 font-bold mt-1">
                    You are reviewing a historical academic epoch. Disciplinary logging, staff approvals, leave authorizations, and hostel commissioning are cryptographically locked.
                </p>
            </div>
            <span class="bg-red-100 text-red-800 text-[9px] font-black uppercase px-3 py-1 rounded-full border border-red-300 shadow-sm shrink-0">Read-Only</span>
        `;
        main.prepend(banner);

        // 2. Lock Action Buttons & Forms
        document.querySelectorAll('#broadcastMessageInput, button[onclick="publishBroadcast()"]').forEach(el => {
            el.disabled = true;
            el.classList.add('opacity-50', 'cursor-not-allowed');
        });

        document.querySelectorAll('button[onclick="guiAddHostel()"], button[onclick="guiRemoveHostel()"], button[onclick="assignHouseMaster()"], button[onclick="executeHostelTransfer()"]').forEach(btn => {
            btn.disabled = true;
            btn.classList.add('opacity-50', 'cursor-not-allowed');
        });

        document.querySelectorAll('button[onclick="logDisciplinaryAction()"]').forEach(btn => {
            btn.disabled = true;
            btn.classList.add('opacity-50', 'cursor-not-allowed');
            btn.innerHTML = `<i class="fa-solid fa-lock mr-1"></i> Locked in Archive`;
        });
    } else {
        // Restore Live Controls
        document.querySelectorAll('#broadcastMessageInput, button[onclick="publishBroadcast()"]').forEach(el => {
            el.disabled = false;
            el.classList.remove('opacity-50', 'cursor-not-allowed');
        });

        document.querySelectorAll('button[onclick="guiAddHostel()"], button[onclick="guiRemoveHostel()"], button[onclick="assignHouseMaster()"], button[onclick="executeHostelTransfer()"]').forEach(btn => {
            btn.disabled = false;
            btn.classList.remove('opacity-50', 'cursor-not-allowed');
        });

        document.querySelectorAll('button[onclick="logDisciplinaryAction()"]').forEach(btn => {
            btn.disabled = false;
            btn.classList.remove('opacity-50', 'cursor-not-allowed');
            btn.innerHTML = `<i class="fa-solid fa-gavel mr-1"></i> Enforce & Log Penalty`;
        });
    }
};

window.resolveDDAdminIdentity = function () {
    const staffList = JSON.parse(sessionStorage.getItem('cloud_staff_registry')) || [];
    const me = staffList.find(s => s.id === currentDDAdminStaffId);
    if (me) {
        activeDDAdminProfile = { ...me };
        activeDDAdminProfile.staffId = me.id;
        activeDDAdminProfile.name = me.name;
    }
    const nameDisplay = document.getElementById('activeDDNameDisplay');
    if (nameDisplay) nameDisplay.textContent = DOMPurify.sanitize(activeDDAdminProfile.name);
};

window.seedDropdowns = async function () {
    const staffList = JSON.parse(sessionStorage.getItem('cloud_staff_registry')) || [];
    const statBoard = window.parseVault('guss_statutory_board') || {};
    const delegations = window.parseVault('cloud_delegations') || {};

    const activeStaff = staffList.filter(s => {
        const status = String(s.status || s.approvalStatus || '').toUpperCase().trim();
        const type = String(s.staffType || '').toUpperCase().trim();
        const name = String(s.name || s.fullName || '').toLowerCase();
        return (status === 'APPROVED' || status === 'ACTIVATED' || status === 'ON_LEAVE') && !name.includes('root admin') && type !== 'OFFICIAL' && s.id !== 'GUSS/STF/001';
    });

    let dynamicHostels = [];
    try {
        dynamicHostels = await ApiGateway.get('/dd/admin/hostels');
    } catch (e) { console.error(e); }

    let hostelHtml = '<option value="">Select Target Hostel...</option>';
    let transferHostelHtml = '<option value="">Select New Hostel...</option>';
    if (Array.isArray(dynamicHostels)) {
        dynamicHostels.forEach(h => {
            if (h.hostelName !== "Day Student") {
                hostelHtml += `<option value="${DOMPurify.sanitize(h.id)}">${DOMPurify.sanitize(h.hostelName)}</option>`;
            }
            transferHostelHtml += `<option value="${DOMPurify.sanitize(h.hostelName)}">${DOMPurify.sanitize(h.hostelName)}</option>`;
        });
    }

    if (document.getElementById('hmHostelSelect')) document.getElementById('hmHostelSelect').innerHTML = hostelHtml;
    if (document.getElementById('hostelTransferNew')) document.getElementById('hostelTransferNew').innerHTML = transferHostelHtml;

    let staffHtml = '<option value="">Select Staff Member...</option>';
    activeStaff.forEach(s => {
        let execRoles = [];
        Object.keys(statBoard).forEach(office => {
            if (statBoard[office] && statBoard[office].staffId === s.id) execRoles.push(office.replace('ROLE_', '').replace(/_/g, ' '));
        });
        Object.keys(delegations).forEach(k => {
            if (delegations[k].staffId === s.id) execRoles.push(k.replace(/_/g, ' '));
        });

        const isOnLeave = String(s.status || s.approvalStatus || '').toUpperCase().trim() === 'ON_LEAVE';
        let roleBadge = execRoles.length > 0 ? ` [★ ${execRoles.join(' / ')}]` : "";
        let leaveBadge = isOnLeave ? ` [✈️ ON LEAVE]` : "";

        staffHtml += `<option value="${s.id}" data-is-exec="${execRoles.length > 0 ? 'true' : 'false'}" data-is-on-leave="${isOnLeave}">${DOMPurify.sanitize(s.name)} (${DOMPurify.sanitize(s.staffType)})${roleBadge}${leaveBadge}</option>`;
    });

    if (document.getElementById('hmStaffSelect')) document.getElementById('hmStaffSelect').innerHTML = staffHtml;
};

window.renderHostelMatrix = async function () {
    const grid = document.getElementById('hostelCapacityGrid');
    if (!grid) return;
    grid.innerHTML = '<div class="col-span-3 text-center py-8 text-slate-400 font-bold text-xs"><i class="fa-solid fa-circle-notch fa-spin text-2xl mb-2 block"></i> Loading infrastructure...</div>';

    try {
        const hostels = await ApiGateway.get('/dd/admin/hostels');
        let htmlBuffer = '';
        const students = window.getStudentRegistrySafe();
        const admittedBoarders = students.filter(s => s.status === 'ADMITTED' && s.assignedHostel && s.assignedHostel !== 'Day Student');
        const isHistorical = SessionManager.isHistoricalArchiveMode();

        if (Array.isArray(hostels)) {
            hostels.forEach(hostel => {
                if (hostel.hostelName === "Day Student") return;

                const occupancy = admittedBoarders.filter(s => s.assignedHostel === hostel.hostelName).length;
                const capacity = hostel.capacity || 250;
                const pct = Math.min(Math.round((occupancy / capacity) * 100), 100);

                let masterHtml = `<span class="text-[9px] font-bold text-slate-400 uppercase italic">No Warden Assigned</span>`;

                if (hostel.warden) {
                    const safeStaffId = encodeURIComponent(hostel.warden.staffId || '').replace(/'/g, "%27");
                    const safeName = encodeURIComponent(hostel.warden.fullName || '').replace(/'/g, "%27");
                    const safeRole = encodeURIComponent('House Warden').replace(/'/g, "%27");
                    const safeScope = encodeURIComponent(hostel.hostelName || '').replace(/'/g, "%27");

                    //  DISABLE REVOKE BUTTON IN ARCHIVE MODE
                    const revokeBtnHtml = isHistorical
                        ? `<span class="text-[9px] text-slate-400"><i class="fa-solid fa-lock"></i></span>`
                        : `<button onclick="window.removeHouseMaster('${DOMPurify.sanitize(hostel.id)}')" title="Revoke Appointment" class="text-red-400 hover:text-red-600 text-[10px] transition-colors"><i class="fa-solid fa-trash"></i></button>`;

                    masterHtml = `<div class="flex justify-between items-center">
                        <div class="font-bold text-slate-700 text-[10px] uppercase truncate cursor-pointer hover:text-blue-600" onclick="window.openDossierModal('STAFF', '${DOMPurify.sanitize(hostel.warden.staffId)}')">
                            <i class="fa-solid fa-user-tie text-purple-400 mr-1"></i> ${DOMPurify.sanitize(hostel.warden.fullName)}
                        </div>
                        <div class="flex gap-2">
                            <button onclick="window.printAppointmentLetter('${safeStaffId}', '${safeName}', '${safeRole}', '${safeScope}')" title="Print Appointment Letter" class="text-slate-400 hover:text-gussNavy text-[10px] transition-colors"><i class="fa-solid fa-print"></i></button>
                            ${revokeBtnHtml}
                        </div>
                    </div>`;
                }

                let color = pct > 90 ? 'bg-red-500' : (pct > 75 ? 'bg-orange-500' : 'bg-emerald-500');

                htmlBuffer += `
                    <div class="bg-slate-50 border border-slate-200 rounded-xl p-4 hover:shadow-md transition-shadow">
                        <h4 class="font-black text-gussNavy uppercase text-xs mb-3 flex items-center justify-between">${DOMPurify.sanitize(hostel.hostelName)} <i class="fa-solid fa-building text-slate-300"></i></h4>
                        <div class="mb-4 bg-white p-2 rounded-lg border border-slate-100">
                            <p class="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">House Master</p>
                            ${masterHtml}
                        </div>
                        <div>
                            <div class="flex justify-between text-[9px] font-black uppercase tracking-widest text-slate-500 mb-1">
                                <span>Occupancy</span>
                                <span>${occupancy} / ${capacity}</span>
                            </div>
                            <div class="w-full bg-slate-200 rounded-full h-1.5">
                                <div class="${color} h-1.5 rounded-full" style="width: ${pct}%"></div>
                            </div>
                        </div>
                    </div>`;
            });
        }
        grid.innerHTML = htmlBuffer;
    } catch (e) {
        grid.innerHTML = '<div class="col-span-3 text-center py-8 text-red-500 font-bold text-xs">Failed to fetch hostel infrastructure.</div>';
    }
};

window.switchTab = function (tabId) {
    ['omnisearch', 'approvals', 'welfare', 'discipline', 'hostels'].forEach(id => {
        const btn = document.getElementById(`tabBtn${id.charAt(0).toUpperCase() + id.slice(1)}`);
        const content = document.getElementById(`tabContent${id.charAt(0).toUpperCase() + id.slice(1)}`);
        if (!btn || !content) return;

        if (id === tabId) {
            btn.className = "flex-1 whitespace-nowrap px-6 py-3 rounded-xl text-xs font-black uppercase tracking-widest transition-all bg-white shadow text-gussNavy border border-slate-200";
            content.classList.remove('hidden'); content.classList.add('block');
        } else {
            btn.className = "flex-1 whitespace-nowrap px-6 py-3 rounded-xl text-xs font-black uppercase tracking-widest transition-all text-slate-500 hover:text-gussNavy";
            content.classList.add('hidden'); content.classList.remove('block');
        }
    });

    if (tabId === 'approvals') window.renderApprovalsQueue();
    if (tabId === 'welfare') {
        window.renderWelfareTable();
        window.fetchPendingLeaves();
        window.fetchAllLeaveHistory();
    }
    if (tabId === 'discipline') window.renderDisciplineRegistry();
    if (tabId === 'hostels') window.renderHostelMatrix();
};

window.syncPostgresToLocal = async function () {
    try {
        const [confRes, staffRes, stdRes, boardRes, delRes] = await Promise.all([
            ApiGateway.get('/config/all').catch(() => null),
            ApiGateway.get('/ict/staff/all-lightweight').catch(() => null),
            ApiGateway.get('/bridge/all-lightweight').catch(() => null),
            ApiGateway.get('/ict/statutory/board').catch(() => null),
            ApiGateway.get('/director/delegations').catch(() => null)
        ]);

        if (confRes) {
            RAM_VAULT = confRes;
            const lightConfigs = {};
            Object.keys(confRes).forEach(k => { if (!k.startsWith('guss_grades_') && !k.startsWith('guss_eval_')) lightConfigs[k] = confRes[k]; });
            try {
                sessionStorage.setItem('cloud_configs', JSON.stringify(lightConfigs));
                Object.keys(lightConfigs).forEach(k => { if (!k.startsWith('guss_statutory_board') && !k.startsWith('guss_delegations')) localStorage.setItem(k, lightConfigs[k]); });
            } catch (e) { }
        }

        if (boardRes) {
            RAM_VAULT['guss_statutory_board'] = JSON.stringify(boardRes);
            sessionStorage.setItem('cloud_statutory_board', JSON.stringify(boardRes));
        }

        if (delRes) {
            RAM_VAULT['cloud_delegations'] = JSON.stringify(delRes);
            sessionStorage.setItem('cloud_delegations', JSON.stringify(delRes));
        }

        if (staffRes && Array.isArray(staffRes)) {
            const mappedRegistry = staffRes.map(staff => ({
                id: staff.staffId ? staff.staffId : staff.trackingRef, trackingRef: staff.trackingRef, name: staff.fullName || staff.name,
                staffType: window.normalizeStaffType(staff.staffType),
                qual: staff.qualification || staff.qual, phone: staff.phone, personalEmail: staff.personalEmail, email: staff.officialEmail || staff.email,
                address: staff.residentialAddress || staff.address, bloodGroup: staff.bloodGroup, nokName: staff.nokName, nokPhone: staff.nokPhone,
                endDate: staff.endDate, photoUrl: staff.photoUrl, signatureUrl: staff.signatureUrl, status: staff.status || staff.approvalStatus,
                approvalStatus: staff.approvalStatus || staff.status, isLocked: staff.isLocked === true || staff.isLocked === 'true',
                hasCustomPassword: staff.hasCustomPassword === true || staff.hasCustomPassword === 'true', tempPassword: staff.tempPassword || 'GUSSR-STAFF-TEMP', staffId: staff.staffId
            }));

            const ghostedRegistry = mappedRegistry.filter(s =>
                s.id !== 'GUSS/STF/001' && s.trackingRef !== 'GUSS/STF/001' && !(s.name || '').toLowerCase().includes('root admin')
            );

            try {
                sessionStorage.setItem('cloud_staff_registry', JSON.stringify(ghostedRegistry));
                localStorage.setItem('guss_staff_registry', JSON.stringify(ghostedRegistry));
            } catch (e) { }
        }

        if (stdRes && Array.isArray(stdRes)) {
            stdRes.forEach(s => { if (s.uploadSignature) s.signatureUrl = s.uploadSignature; });
            RAM_STUDENT_REGISTRY = stdRes;
            try { sessionStorage.setItem('cloud_student_registry', JSON.stringify(stdRes)); } catch (e) { }
        }
    } catch (error) { console.error("Cloud Sync Error:", error); }
};

window.getUnifiedEntityList = function () {
    let students = window.getStudentRegistrySafe();
    let staff = JSON.parse(sessionStorage.getItem('cloud_staff_registry')) || [];

    if (!Array.isArray(students)) students = [];
    if (!Array.isArray(staff)) staff = [];

    let entities = [];

    students.filter(s => s.status === 'ADMITTED' || s.triageStatus === 'ADMITTED').forEach(s => {
        const name = s.name || s.fullName || 'Unknown Applicant';
        const admNo = s.admNo || "PENDING";
        const rawPhoto = s.photoUrl || s.uploadPassport || s.passportUrl;
        const photo = rawPhoto ? window.resolveMediaUrl(rawPhoto) : `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=0F172A&color=fff`;

        entities.push({
            type: 'STUDENT', id: admNo, realNIN: s.nin, name: name, photo: photo, dob: s.dob,
            isLocked: s.isLocked || false, hasCustomPassword: s.hasCustomPassword || false,
            queryTarget: `${name.toLowerCase()} ${admNo.toLowerCase()} ${(s.nin || '').toLowerCase()}`
        });
    });

    staff.filter(s => s.id !== 'GUSS/STF/001' && !(s.name || '').toLowerCase().includes('root admin')).forEach(s => {
        const activeId = s.id || s.staffId || s.trackingRef;
        const rawPhoto = s.photoUrl || s.uploadPassport || s.passportUrl;
        const photo = rawPhoto ? window.resolveMediaUrl(rawPhoto) : `https://ui-avatars.com/api/?name=${encodeURIComponent(s.name || s.fullName)}&background=0F172A&color=fff`;

        entities.push({
            type: 'STAFF', id: activeId, realNIN: activeId, name: s.name || s.fullName, photo: photo,
            isLocked: s.isLocked || false, hasCustomPassword: s.hasCustomPassword || false, tempPassword: s.tempPassword || 'GUSSR-STAFF-TEMP',
            queryTarget: `${(s.name || s.fullName || '').toLowerCase()} ${(activeId || '').toLowerCase()}`
        });
    });

    return entities;
};

window.executeOmniSearch = function () {
    const query = document.getElementById('omniSearchInput').value.toLowerCase().trim();
    const res = document.getElementById('omniSearchResults');
    res.innerHTML = '';
    if (query.length < 2) return;

    let found = false;
    const entities = window.getUnifiedEntityList();
    let htmlBuffer = '';
    let matchCount = 0;
    const maxResults = 50;

    for (let i = 0; i < entities.length; i++) {
        const ent = entities[i];
        if (ent.queryTarget.includes(query)) {
            found = true;
            if (matchCount < maxResults) {
                htmlBuffer += `
                <div onclick="window.openDossierModal('${ent.type}', '${ent.id}')" class="p-4 bg-white border border-slate-200 rounded-xl hover:border-amber-400 cursor-pointer flex justify-between items-center group transition-all shadow-sm">
                    <div class="flex items-center gap-4">
                        <img src="${DOMPurify.sanitize(ent.photo)}" class="w-10 h-10 rounded-lg object-cover bg-slate-100 border border-slate-200 shrink-0">
                        <div>
                            <span class="font-black text-slate-800 uppercase text-sm group-hover:text-amber-600 transition-colors">${DOMPurify.sanitize(ent.name)}</span><br>
                            <span class="text-[10px] font-mono text-slate-500 block mt-0.5">${DOMPurify.sanitize(ent.id)}</span>
                        </div>
                    </div>
                    <i class="fa-solid fa-address-card text-slate-200 group-hover:text-amber-500 text-lg"></i>
                </div>`;
            }
            matchCount++;
        }
    }

    if (!found) {
        res.innerHTML = `<div class="col-span-1 sm:col-span-2 lg:col-span-3 text-center text-xs text-slate-400 py-4 font-bold border border-dashed rounded-xl">No records found.</div>`;
    } else {
        if (matchCount > maxResults) {
            htmlBuffer += `<div class="col-span-1 sm:col-span-2 lg:col-span-3 p-3 text-center text-blue-500 font-bold text-[9px] uppercase bg-blue-50 rounded-xl mt-2">Showing top ${maxResults} matches out of ${matchCount}. Refine search.</div>`;
        }
        res.innerHTML = htmlBuffer;
    }
};

window.renderApprovalsQueue = async function () {
    const tbody = document.getElementById('approvalsBody');
    if (!tbody) return;
    tbody.innerHTML = '<tr><td colspan="4" class="py-12 text-center text-slate-400 font-bold text-xs"><i class="fa-solid fa-circle-notch fa-spin text-3xl mb-3 block"></i> Fetching from Vault...</td></tr>';

    await window.syncPostgresToLocal();
    const staffList = JSON.parse(sessionStorage.getItem('cloud_staff_registry')) || [];
    const pendingStaff = staffList.filter(s => s.status === 'PENDING_APPROVAL' && s.staffType === 'Non-Academic');
    const isHistorical = SessionManager.isHistoricalArchiveMode();

    if (pendingStaff.length === 0) {
        tbody.innerHTML = `<tr><td colspan="4" class="py-12 text-center text-slate-400 font-bold text-xs"><i class="fa-solid fa-check-double text-3xl mb-3 opacity-30 block"></i> All non-academic operations staff have been approved.</td></tr>`;
        return;
    }

    let htmlBuffer = "";
    pendingStaff.slice(0, 100).forEach(staff => {
        const displayId = staff.id.startsWith("REQ-") ? `<i class="fa-solid fa-lock text-amber-500 mr-1"></i> ${DOMPurify.sanitize(staff.id)}` : DOMPurify.sanitize(staff.id);
        const safePhoto = staff.photoUrl ? window.resolveMediaUrl(staff.photoUrl) : 'https://ui-avatars.com/api/?name=Staff';

        //  DISABLE APPROVE/REJECT BUTTONS IN ARCHIVE MODE
        const actionHtml = isHistorical
            ? `<span class="bg-slate-100 text-slate-400 border border-slate-200 px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-wider shadow-inner"><i class="fa-solid fa-lock"></i> Sealed</span>`
            : `
                <button onclick="window.approveOperationsStaff('${DOMPurify.sanitize(staff.trackingRef)}')" class="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg text-[9px] font-black uppercase tracking-wider transition-colors shadow-sm"><i class="fa-solid fa-check mr-1"></i> Approve</button>
                <button onclick="window.rejectStaffRequest('${DOMPurify.sanitize(staff.trackingRef)}')" class="bg-red-50 hover:bg-red-100 text-red-600 px-3 py-2 rounded-lg text-[9px] font-black uppercase tracking-wider transition-colors shadow-sm ml-2"><i class="fa-solid fa-xmark"></i></button>
            `;

        htmlBuffer += `
            <tr class="hover:bg-slate-50 transition-colors border-b border-slate-100">
                <td class="py-3 px-3 flex items-center gap-3">
                    <img src="${safePhoto}" class="w-8 h-8 rounded-lg object-cover bg-slate-100 border border-slate-200 shrink-0">
                    <div>
                        <div class="font-black text-slate-800 text-xs uppercase cursor-pointer hover:text-blue-600" onclick="window.openDossierModal('STAFF', '${DOMPurify.sanitize(staff.id)}')">${DOMPurify.sanitize(staff.name)}</div>
                        <div class="text-[9px] font-mono text-slate-500">${displayId}</div>
                    </div>
                </td>
                <td class="py-3 px-3">
                    <div class="text-[10px] font-medium text-slate-500">${DOMPurify.sanitize(staff.qual || 'N/A')}</div>
                </td>
                <td class="py-3 px-3 text-[10px] font-mono">
                    <span class="block text-slate-700">${DOMPurify.sanitize(staff.phone || 'N/A')}</span>
                </td>
               <td class="py-3 px-3 text-right">
                    ${actionHtml}
                </td>
            </tr>`;
    });

    tbody.innerHTML = htmlBuffer;
};

window.approveOperationsStaff = async function (trackingRef) {
    if (SessionManager.isHistoricalArchiveMode()) {
        return Swal.fire('Archive Lockout', 'Staff onboarding approvals are strictly prohibited when viewing historical records.', 'error');
    }

    const authRes = await Swal.fire({
        title: 'Zero-Trust Authorization',
        html: `Approve this staff member?<br>This will permanently generate their official credentials.<br><br>Enter Admin Password to execute:`,
        input: 'password',
        inputAttributes: { autocapitalize: 'off', autocorrect: 'off' },
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#10b981',
        confirmButtonText: 'Authorize Approval'
    });

    if (!authRes.isConfirmed || !authRes.value) return;

    try {
        const data = await ApiGateway.post('/dd/admin/staff/approve', {
            targetStaffId: trackingRef,
            adminPassword: authRes.value
        });

        Swal.fire('Approved!', `Generated ID: ${data.staffId}\nOfficial Email: ${data.officialEmail}`, 'success');
        window.renderApprovalsQueue();
        window.seedDropdowns();
    } catch (error) {
        Swal.fire('Approval Failed', error.message || "Failed to approve.", 'error');
    }
};

window.rejectStaffRequest = async function (trackingRef) {
    if (SessionManager.isHistoricalArchiveMode()) {
        return Swal.fire('Archive Lockout', 'Rejecting staff onboarding is prohibited in historical view.', 'error');
    }

    const authRes = await Swal.fire({
        title: 'Zero-Trust Authorization',
        html: `Reject this onboarding request?<br>The profile will be permanently locked.<br><br>Enter Admin Password to execute:`,
        input: 'password',
        inputAttributes: { autocapitalize: 'off', autocorrect: 'off' },
        icon: 'error',
        showCancelButton: true,
        confirmButtonColor: '#ef4444',
        confirmButtonText: 'Authorize Rejection'
    });

    if (!authRes.isConfirmed || !authRes.value) return;

    try {
        await ApiGateway.post('/dd/admin/staff/reject', {
            targetStaffId: trackingRef,
            adminPassword: authRes.value
        });

        Swal.fire('Rejected', "Request rejected.", 'success');
        window.renderApprovalsQueue();
    } catch (error) {
        Swal.fire('Rejection Failed', error.message || "Failed to reject.", 'error');
    }
};

window.renderWelfareTable = function () {
    const tbody = document.getElementById('welfareBody');
    if (!tbody) return;

    const staffList = JSON.parse(sessionStorage.getItem('cloud_staff_registry')) || [];
    let htmlBuffer = '';
    const isHistorical = SessionManager.isHistoricalArchiveMode();

    staffList.forEach(staff => {
        if (staff.status === 'PENDING_APPROVAL') return;

        const isLeave = staff.status === 'ON_LEAVE';
        const badge = isLeave
            ? `<span class="bg-orange-100 text-orange-800 px-2 py-1 rounded text-[9px] font-black uppercase tracking-widest border border-orange-200"><i class="fa-solid fa-plane mr-1"></i> On Leave</span>`
            : `<span class="bg-emerald-100 text-emerald-800 px-2 py-1 rounded text-[9px] font-black uppercase tracking-widest border border-emerald-200"><i class="fa-solid fa-briefcase mr-1"></i> Active</span>`;

        //  DISABLE FORCE/RESUME LEAVE IN ARCHIVE MODE
        let actionBtn = '';
        if (isHistorical) {
            actionBtn = `<span class="bg-slate-100 text-slate-400 border border-slate-200 px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-wider shadow-inner"><i class="fa-solid fa-lock"></i> Sealed</span>`;
        } else {
            actionBtn = isLeave
                ? `<button onclick="window.resumeStaffLeave('${DOMPurify.sanitize(staff.id)}')" class="bg-gussNavy hover:bg-black text-white px-4 py-2 rounded-lg text-[9px] font-black uppercase tracking-wider transition-colors shadow-sm"><i class="fa-solid fa-arrow-rotate-left mr-1"></i> Authorize Resumption</button>`
                : `<button onclick="window.forceStaffLeave('${DOMPurify.sanitize(staff.id)}')" class="bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 px-4 py-2 rounded-lg text-[9px] font-black uppercase tracking-wider transition-colors shadow-sm"><i class="fa-solid fa-user-clock mr-1"></i> Force Leave</button>`;
        }

        htmlBuffer += `
            <tr class="hover:bg-slate-50 transition-colors">
                <td class="py-3 px-3">
                    <div class="font-black text-slate-800 text-xs uppercase cursor-pointer hover:text-blue-600" onclick="window.openDossierModal('STAFF', '${DOMPurify.sanitize(staff.id)}')">${DOMPurify.sanitize(staff.name)}</div>
                    <div class="text-[9px] font-mono text-slate-500">${DOMPurify.sanitize(staff.id)}</div>
                </td>
                <td class="py-3 px-3 font-bold text-slate-600">${DOMPurify.sanitize(staff.staffType)}</td>
                <td class="py-3 px-3 text-center">${badge}</td>
                <td class="py-3 px-3 text-right">${actionBtn}</td>
            </tr>`;
    });
    tbody.innerHTML = htmlBuffer;
};

window.forceStaffLeave = async function (staffId) {
    if (SessionManager.isHistoricalArchiveMode()) {
        return Swal.fire('Archive Lockout', 'Modifying staff leave status is strictly prohibited in historical view.', 'error');
    }

    const authRes = await Swal.fire({
        title: 'Zero-Trust Authorization',
        html: `Place staff on leave?<br>Enter Admin Password to execute:`,
        input: 'password',
        inputAttributes: { autocapitalize: 'off', autocorrect: 'off' },
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#f97316'
    });

    if (!authRes.isConfirmed || !authRes.value) return;

    try {
        await ApiGateway.post('/dd/admin/welfare/leave/force', {
            targetStaffId: staffId,
            adminPassword: authRes.value
        });

        await window.syncPostgresToLocal();
        Swal.fire('Leave Authorized', "Staff successfully placed on leave.", 'success');
        window.renderWelfareTable();
    } catch (error) {
        Swal.fire('Database Error', error.message || "Failed to update leave status.", 'error');
    }
};

window.resumeStaffLeave = async function (staffId) {
    if (SessionManager.isHistoricalArchiveMode()) {
        return Swal.fire('Archive Lockout', 'Modifying staff leave status is strictly prohibited in historical view.', 'error');
    }

    const authRes = await Swal.fire({
        title: 'Zero-Trust Authorization',
        html: `Authorize resumption?<br>Enter Admin Password to execute:`,
        input: 'password',
        inputAttributes: { autocapitalize: 'off', autocorrect: 'off' },
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#10b981'
    });

    if (!authRes.isConfirmed || !authRes.value) return;

    try {
        await ApiGateway.post('/dd/admin/welfare/leave/resume', {
            targetStaffId: staffId,
            adminPassword: authRes.value
        });

        await window.syncPostgresToLocal();
        Swal.fire('Resumption Authorized', "Staff access restored.", 'success');
        window.renderWelfareTable();
    } catch (error) {
        Swal.fire('Database Error', error.message || "Failed to restore staff access.", 'error');
    }
};

window.viewFullText = function (title, text) {
    Swal.fire({
        title: title,
        html: `<div class="text-left text-sm text-slate-700 leading-relaxed p-4 bg-slate-50 rounded-xl border border-slate-200">${DOMPurify.sanitize(text)}</div>`,
        confirmButtonColor: '#0F172A',
        confirmButtonText: 'Close'
    });
};

window.fetchPendingLeaves = async function () {
    const tbody = document.getElementById('leaveApprovalsBody');
    if (!tbody) return;

    tbody.innerHTML = '<tr><td colspan="4" class="py-12 text-center text-slate-400 font-bold text-xs"><i class="fa-solid fa-circle-notch fa-spin text-3xl mb-3 block"></i> Fetching Leave Requests...</td></tr>';

    try {
        const leaves = await ApiGateway.get('/dd/admin/welfare/leave/pending');
        const isHistorical = SessionManager.isHistoricalArchiveMode();

        if (!leaves || leaves.length === 0) {
            tbody.innerHTML = `<tr><td colspan="4" class="py-12 text-center text-slate-400 font-bold text-xs"><i class="fa-solid fa-check-double text-3xl mb-3 opacity-30 block"></i> No pending leave requests.</td></tr>`;
            return;
        }

        let htmlBuffer = '';
        leaves.forEach(leave => {
            const safeNotes = DOMPurify.sanitize(leave.handoverNotes || '---');
            const displayNotes = safeNotes.length > 30 ? `${safeNotes.substring(0, 30)}... <span class="text-blue-600 cursor-pointer hover:underline font-black" onclick="window.viewFullText('Handover Notes', \`${safeNotes.replace(/"/g, '&quot;')}\`)">Read More</span>` : safeNotes;

            //  DISABLE APPROVE/REJECT IN ARCHIVE MODE
            const actionsHtml = isHistorical
                ? `<span class="bg-slate-100 text-slate-400 border border-slate-200 px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-wider shadow-inner"><i class="fa-solid fa-lock"></i> Sealed</span>`
                : `
                    <button onclick="window.reviewLeaveRequest('${DOMPurify.sanitize(leave.id)}', 'APPROVE', '${DOMPurify.sanitize(leave.startDate)}', '${DOMPurify.sanitize(leave.endDate)}')" class="bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-wider transition-colors shadow-sm"><i class="fa-solid fa-check"></i></button>
                    <button onclick="window.reviewLeaveRequest('${DOMPurify.sanitize(leave.id)}', 'REJECT', null, null)" class="bg-red-50 hover:bg-red-100 text-red-600 px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-wider transition-colors shadow-sm ml-2"><i class="fa-solid fa-xmark"></i></button>
                `;

            htmlBuffer += `
                <tr class="hover:bg-slate-50 transition-colors border-b border-slate-100">
                    <td class="py-3 px-3">
                        <div class="font-black text-slate-800 text-xs uppercase cursor-pointer hover:text-blue-600" onclick="window.openDossierModal('STAFF', '${DOMPurify.sanitize(leave.staff.staffId || leave.staff.trackingRef)}')">${DOMPurify.sanitize(leave.staff.fullName)}</div>
                        <div class="text-[9px] font-mono text-slate-500">${DOMPurify.sanitize(leave.staff.staffId || leave.staff.trackingRef)}</div>
                    </td>
                    <td class="py-3 px-3">
                        <div class="text-[10px] font-black text-orange-600 uppercase tracking-widest">${DOMPurify.sanitize(leave.leaveType)}</div>
                        <div class="text-[9px] font-medium text-slate-500">${DOMPurify.sanitize(leave.startDate)} to ${DOMPurify.sanitize(leave.endDate)}</div>
                    </td>
                    <td class="py-3 px-3 text-xs font-medium text-slate-600 max-w-xs">
                        ${displayNotes}
                    </td>
                    <td class="py-3 px-3 text-right">
                        ${actionsHtml}
                    </td>
                </tr>`;
        });
        tbody.innerHTML = htmlBuffer;
    } catch (error) {
        tbody.innerHTML = `<tr><td colspan="4" class="py-12 text-center text-red-500 font-bold text-xs">Failed to fetch leave requests.</td></tr>`;
    }
};

window.fetchAllLeaveHistory = async function () {
    const tbody = document.getElementById('allLeaveHistoryBody');
    if (!tbody) return;

    tbody.innerHTML = '<tr><td colspan="4" class="py-12 text-center text-slate-400 font-bold text-xs"><i class="fa-solid fa-circle-notch fa-spin text-3xl mb-3 block"></i> Fetching Institutional Ledger...</td></tr>';

    try {
        const history = await ApiGateway.get('/dd/admin/welfare/leave/history');
        const processed = (history || []).filter(req => req.status !== 'PENDING');

        if (processed.length === 0) {
            tbody.innerHTML = `<tr><td colspan="4" class="py-12 text-center text-slate-400 font-bold text-xs"><i class="fa-solid fa-folder-open text-3xl mb-3 opacity-30 block"></i> No processed leave records found.</td></tr>`;
            return;
        }

        let htmlBuffer = '';
        processed.forEach(req => {
            let badge = "bg-slate-100 text-slate-600";
            if (req.status === 'APPROVE' || req.status === 'APPROVED') badge = "bg-emerald-100 text-emerald-700 border border-emerald-200";
            if (req.status === 'REJECT' || req.status === 'REJECTED') badge = "bg-red-100 text-red-700 border border-red-200";

            const safeNotes = DOMPurify.sanitize(req.handoverNotes || '---');
            const displayNotes = safeNotes.length > 30 ? `${safeNotes.substring(0, 30)}... <span class="text-blue-600 cursor-pointer hover:underline font-black" onclick="window.viewFullText('Admin Remarks', \`${safeNotes.replace(/"/g, '&quot;')}\`)">Read More</span>` : safeNotes;

            htmlBuffer += `
                <tr class="hover:bg-slate-50 transition-colors border-b border-slate-100">
                    <td class="py-3 px-3">
                        <div class="font-black text-slate-800 text-xs uppercase cursor-pointer hover:text-blue-600" onclick="window.openDossierModal('STAFF', '${DOMPurify.sanitize(req.staff.staffId || req.staff.trackingRef)}')">${DOMPurify.sanitize(req.staff.fullName)}</div>
                        <div class="text-[9px] font-mono text-slate-500">${DOMPurify.sanitize(req.staff.staffId || req.staff.trackingRef)}</div>
                    </td>
                    <td class="py-3 px-3">
                        <div class="text-[10px] font-black text-slate-700 uppercase tracking-widest">${DOMPurify.sanitize(req.leaveType)}</div>
                        <div class="text-[9px] font-medium text-slate-500">${DOMPurify.sanitize(req.startDate)} to ${DOMPurify.sanitize(req.endDate)}</div>
                    </td>
                    <td class="py-3 px-3 text-center">
                        <span class="px-2 py-1 rounded text-[9px] font-black uppercase tracking-widest ${badge}">${DOMPurify.sanitize(req.status)}</span>
                    </td>
                    <td class="py-3 px-3 text-xs font-medium text-slate-600 max-w-xs">
                        ${displayNotes}
                    </td>
                </tr>`;
        });
        tbody.innerHTML = htmlBuffer;
    } catch (error) {
        tbody.innerHTML = `<tr><td colspan="4" class="py-12 text-center text-red-500 font-bold text-xs">Failed to fetch leave history.</td></tr>`;
    }
};

window.reviewLeaveRequest = async function (leaveId, action, currentStart, currentEnd) {
    if (SessionManager.isHistoricalArchiveMode()) {
        return Swal.fire('Archive Lockout', 'Authorizing or rejecting leaves is prohibited in historical view.', 'error');
    }

    let newStart = currentStart;
    let newEnd = currentEnd;

    if (action === 'APPROVE') {
        const dateRes = await Swal.fire({
            title: 'Approve & Reschedule',
            html: `
                <p class="text-xs text-slate-500 mb-4">You can approve the requested dates or modify them below.</p>
                <div class="flex flex-col gap-2 text-left mb-3">
                    <label class="text-[10px] font-black uppercase text-slate-500">Approved Start Date</label>
                    <input type="date" id="swal-start" value="${currentStart}" class="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-sm font-bold focus:ring-2 focus:ring-emerald-500">
                </div>
                <div class="flex flex-col gap-2 text-left">
                    <label class="text-[10px] font-black uppercase text-slate-500">Approved Return Date</label>
                    <input type="date" id="swal-end" value="${currentEnd}" class="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-sm font-bold focus:ring-2 focus:ring-emerald-500">
                </div>
            `,
            showCancelButton: true,
            confirmButtonColor: '#10b981',
            confirmButtonText: 'Proceed to Remarks',
            preConfirm: () => {
                return {
                    s: document.getElementById('swal-start').value,
                    e: document.getElementById('swal-end').value
                }
            }
        });

        if (!dateRes.isConfirmed) return;
        newStart = dateRes.value.s;
        newEnd = dateRes.value.e;
    }

    const { value: remarks } = await Swal.fire({
        title: action === 'APPROVE' ? 'Finalize Approval' : 'Reject Leave',
        input: 'text',
        inputLabel: 'Administrative Remarks (Optional)',
        showCancelButton: true,
        confirmButtonColor: action === 'APPROVE' ? '#10b981' : '#ef4444',
        confirmButtonText: action === 'APPROVE' ? 'Approve Leave' : 'Reject Leave'
    });

    if (remarks === undefined) return;

    try {
        let url = `/dd/admin/welfare/leave/review/${leaveId}?action=${action}&remarks=${encodeURIComponent(remarks)}`;
        if (action === 'APPROVE') {
            url += `&newStartDate=${encodeURIComponent(newStart)}&newEndDate=${encodeURIComponent(newEnd)}`;
        }

        await ApiGateway.post(url, {});
        Swal.fire('Success', `Leave request ${action.toLowerCase()}d successfully.`, 'success');
        window.fetchPendingLeaves();
        window.renderWelfareTable();
    } catch (error) {
        Swal.fire('Error', error.message || "Failed to process leave request.", 'error');
    }
};

window.filterDisciplineStudents = function () {
    const query = document.getElementById('discSearchInput').value.toLowerCase().trim();
    const res = document.getElementById('discSearchResults');
    res.innerHTML = '';

    if (query.length < 2) {
        res.classList.add('hidden');
        return;
    }

    const pendingDB = window.getStudentRegistrySafe();
    let foundCount = 0;
    const maxResults = 10;

    for (let i = 0; i < pendingDB.length; i++) {
        const student = pendingDB[i];
        if (student.status === 'ADMITTED' && ((student.name || '').toLowerCase().includes(query) || (student.admNo && student.admNo.toLowerCase().includes(query)))) {
            const div = document.createElement('div');
            div.className = "p-3 hover:bg-red-50 border-b border-slate-100 cursor-pointer transition-colors";
            div.onclick = () => {
                document.getElementById('discSearchInput').value = `${student.name} (${student.admNo})`;
                document.getElementById('discSelectedStudentId').value = student.admNo;
                res.classList.add('hidden');
                window.renderDisciplineRegistry(student.admNo);
            };
            div.innerHTML = `<p class="text-xs font-black text-slate-800 uppercase">${DOMPurify.sanitize(student.name)}</p><p class="text-[9px] font-mono text-slate-500">${DOMPurify.sanitize(student.admNo)} • ${DOMPurify.sanitize(student.assignedClass || "Unassigned")}</p>`;
            res.appendChild(div);
            foundCount++;
            if (foundCount >= maxResults) break;
        }
    }

    if (foundCount > 0) res.classList.remove('hidden');
    else res.classList.add('hidden');
};

window.logDisciplinaryAction = async function () {
    if (SessionManager.isHistoricalArchiveMode()) {
        return Swal.fire('Archive Lockout', 'Logging disciplinary infractions is prohibited in historical view.', 'error');
    }

    const studentInputEl = document.getElementById('discSearchInput') || document.getElementById('discSelectedStudentId');
    const levelEl = document.getElementById('discLevelSelect');
    const reasonEl = document.getElementById('discReasonInput');
    const penaltyEl = document.getElementById('discPenaltyInput');

    if (!studentInputEl || !levelEl || !reasonEl || !penaltyEl) return Swal.fire('UI Error', "Missing interface elements.", 'error');

    let rawStudent = studentInputEl.value.trim();
    let admNo = rawStudent;
    if (rawStudent.includes('(') && rawStudent.includes(')')) {
        admNo = rawStudent.substring(rawStudent.lastIndexOf('(') + 1, rawStudent.lastIndexOf(')')).trim();
    }

    const severity = levelEl.value;
    const reason = reasonEl.value.trim();
    const penalty = penaltyEl.value.trim();

    if (!admNo || !reason || !penalty) return Swal.fire('Validation Error', "Please complete all disciplinary fields.", 'error');

    let db = window.getStudentRegistrySafe();
    const studentIndex = db.findIndex(s => s.admNo === admNo);
    if (studentIndex === -1) return Swal.fire('Error', 'Student not found in registry.', 'error');

    let student = db[studentIndex];
    let isExpulsionTriggered = false;
    let expulsionReason = "";

    let suspensionCount = 0;
    if (student.disciplinaryFlags && student.disciplinaryFlags !== 'PARDONED') {
        const pastFlags = String(student.disciplinaryFlags).split(' | ');
        suspensionCount = pastFlags.filter(f => f.includes('[Suspension]')).length;
    }

    if (severity === 'Dismissal') {
        isExpulsionTriggered = true;
        expulsionReason = "Level 4 Infraction (Immediate Dismissal)";
    } else if (severity === 'Suspension' && suspensionCount >= 2) {
        isExpulsionTriggered = true;
        expulsionReason = "Maximum Suspension Limit Reached (3 Strikes)";
    }

    let warningText = `Officially log a <b>${severity}</b> infraction against ${admNo}.`;
    if (isExpulsionTriggered) {
        warningText = `<span class='text-red-600 font-black'>CRITICAL: This action will trigger IMMEDIATE EXPULSION (${expulsionReason}). The student's status will be set to REJECTED globally.</span>`;
    }

    const authRes = await Swal.fire({
        title: 'Zero-Trust Authorization',
        html: `${warningText}<br><br>Enter Admin Password to execute:`,
        input: 'password',
        inputAttributes: { autocapitalize: 'off', autocorrect: 'off' },
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#ef4444',
        confirmButtonText: 'Authorize Penalty'
    });

    if (!authRes.isConfirmed || !authRes.value) return;

    try {
        await ApiGateway.post('/dd/admin/discipline/log', {
            admNo: admNo,
            category: isExpulsionTriggered ? 'Dismissal' : severity,
            reason: reason,
            penalty: penalty,
            adminPassword: authRes.value
        });

        if (isExpulsionTriggered) {
            student.status = 'REJECTED';
            student.assignedClass = 'EXPELLED';
            student.assignedHostel = 'EXPELLED';
            await ApiGateway.post('/bridge/save', student);
        }

        Swal.fire(isExpulsionTriggered ? 'Expulsion Executed' : 'Infraction Logged', "Action locked into Central Database.", 'success');
        studentInputEl.value = ''; reasonEl.value = ''; penaltyEl.value = '';
        window.renderDisciplineRegistry();
    } catch (error) {
        Swal.fire('Error', error.message || "Failed to log infraction.", 'error');
    }
};

window.renderDisciplineRegistry = async function (targetAdmNo = null) {
    const tbody = document.getElementById('activeDisciplineBody');
    if (!tbody) return;

    if (!targetAdmNo) {
        tbody.innerHTML = `<tr><td colspan="4" class="py-8 text-center text-slate-400 font-bold text-xs"><i class="fa-solid fa-search text-3xl mb-3 opacity-20 block"></i> Search and select a student to view their active infractions.</td></tr>`;
        return;
    }

    tbody.innerHTML = '<tr><td colspan="4" class="py-8 text-center text-slate-400 font-bold text-xs"><i class="fa-solid fa-circle-notch fa-spin text-2xl mb-2 block"></i> Fetching records from relational vault...</td></tr>';

    try {
        const records = await ApiGateway.get('/dd/admin/discipline/records');
        const targetRecords = (records || []).filter(rec => rec.student && rec.student.admNo === targetAdmNo);
        const isHistorical = SessionManager.isHistoricalArchiveMode();

        if (targetRecords.length === 0) {
            tbody.innerHTML = `<tr><td colspan="4" class="py-8 text-center text-slate-400 font-bold text-xs"><i class="fa-solid fa-shield-check text-3xl mb-3 opacity-20 block"></i> No disciplinary records found for this student.</td></tr>`;
            return;
        }

        let htmlBuffer = '';
        targetRecords.forEach(rec => {
            let badge = "bg-slate-100 text-slate-700";
            if (rec.infractionLevel === 'Warning') badge = "bg-yellow-100 text-yellow-700 border-yellow-300";
            if (rec.infractionLevel === 'Probation') badge = "bg-orange-100 text-orange-700 border-orange-300";
            if (rec.infractionLevel === 'Suspension') badge = "bg-red-100 text-red-700 border-red-300";
            if (rec.infractionLevel === 'Dismissal') badge = "bg-slate-900 text-red-400 border-red-900";

            //  DISABLE EDIT & PARDON IN ARCHIVE MODE
            const actionControls = isHistorical
                ? `
                    <button onclick="window.printDisciplinaryLetter('${DOMPurify.sanitize(rec.id)}')" class="text-[9px] font-black uppercase text-gussNavy hover:bg-slate-200 px-2.5 py-1 rounded border border-slate-300 transition-colors"><i class="fa-solid fa-print mr-1"></i> Letter</button>
                    <span class="text-[9px] text-slate-400 ml-2"><i class="fa-solid fa-lock"></i> Sealed</span>
                  `
                : `
                    <button onclick="window.editInfraction('${DOMPurify.sanitize(rec.id)}')"><i class="fa-solid fa-pen text-amber-600 hover:text-amber-700 text-sm mx-2"></i></button>
                    <button onclick="window.printDisciplinaryLetter('${DOMPurify.sanitize(rec.id)}')" class="text-[9px] font-black uppercase text-gussNavy hover:bg-slate-200 px-2 py-1 rounded border border-slate-300 transition-colors"><i class="fa-solid fa-print mr-1"></i> Letter</button>
                    <button onclick="window.pardonInfraction('${DOMPurify.sanitize(rec.id)}', '${DOMPurify.sanitize(rec.student.admNo)}')" class="text-[9px] font-black uppercase text-emerald-600 hover:bg-emerald-50 px-2 py-1 rounded border border-emerald-200 transition-colors">Pardon</button>
                  `;

            htmlBuffer += `
                <tr class="hover:bg-slate-50 transition-colors border-b border-slate-100">
                    <td class="py-3 px-4">
                        <div class="font-black text-slate-800 text-xs uppercase cursor-pointer hover:text-blue-600" onclick="window.openDossierModal('STUDENT', '${DOMPurify.sanitize(rec.student.admNo)}')">${DOMPurify.sanitize(rec.student.fullName || rec.student.name)}</div>
                        <div class="text-[9px] font-mono text-slate-500 mt-1">${DOMPurify.sanitize(rec.student.admNo)} • ${DOMPurify.sanitize(rec.student.assignedClass)}</div>
                    </td>
                    <td class="py-3 px-4"><span class="px-2 py-1 border rounded text-[9px] font-black uppercase tracking-widest ${badge}">${DOMPurify.sanitize(rec.infractionLevel)}</span></td>
                    <td class="py-3 px-4 text-xs font-bold text-slate-700 leading-relaxed max-w-xs whitespace-normal">
                        ${DOMPurify.sanitize(rec.reason)} 
                        <div class="text-[9px] font-black text-red-500 mt-1 uppercase tracking-widest"><i class="fa-solid fa-gavel mr-1"></i> Penalty: ${DOMPurify.sanitize(rec.penalty)}</div>
                        <div class="text-[9px] font-normal text-slate-400 mt-1">Recorded: ${new Date(rec.createdAt).toLocaleDateString('en-NG')}</div>
                    </td>
                    <td class="py-3 px-4 text-right space-x-2">
                        ${actionControls}
                    </td>
                </tr>`;
        });

        tbody.innerHTML = htmlBuffer;
    } catch (error) {
        tbody.innerHTML = `<tr><td colspan="4" class="py-8 text-center text-red-500 font-bold text-xs">Failed to fetch disciplinary records.</td></tr>`;
    }
};

window.editInfraction = async function (recordId) {
    if (SessionManager.isHistoricalArchiveMode()) {
        return Swal.fire('Archive Lockout', 'Editing disciplinary records is strictly prohibited in historical view.', 'error');
    }

    const reasonRes = await Swal.fire({
        title: 'Edit Official Reason',
        input: 'textarea',
        showCancelButton: true,
        confirmButtonColor: '#f59e0b'
    });

    if (!reasonRes.isConfirmed) return;
    const newReason = reasonRes.value.trim();

    const penaltyRes = await Swal.fire({
        title: 'Finalize Official Penalty',
        input: 'text',
        showCancelButton: true,
        confirmButtonColor: '#f59e0b'
    });

    if (!penaltyRes.isConfirmed) return;
    const newPenalty = penaltyRes.value.toUpperCase().trim();

    const authRes = await Swal.fire({
        title: 'Zero-Trust Authorization',
        html: `Updating disciplinary record.<br><br>Enter Admin Password to execute:`,
        input: 'password',
        inputAttributes: { autocapitalize: 'off', autocorrect: 'off' },
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#f59e0b'
    });

    if (!authRes.isConfirmed || !authRes.value) return;

    try {
        await ApiGateway.put(`/dd/admin/discipline/records/${recordId}`, {
            reason: newReason,
            penalty: newPenalty,
            adminPassword: authRes.value
        });

        window.renderDisciplineRegistry();
        Swal.fire('Updated', "Record securely updated in PostgreSQL.", 'success');
    } catch (error) {
        Swal.fire('Error', error.message || "Failed to update infraction via API.", 'error');
    }
};

window.pardonInfraction = async function (recordId, admNo) {
    if (SessionManager.isHistoricalArchiveMode()) {
        return Swal.fire('Archive Lockout', 'Pardoning disciplinary records is prohibited in historical view.', 'error');
    }

    const authRes = await Swal.fire({
        title: 'Zero-Trust Authorization',
        html: `Pardon and erase this disciplinary record?<br>Enter Admin Password to execute:`,
        input: 'password',
        inputAttributes: { autocapitalize: 'off', autocorrect: 'off' },
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#10b981',
        confirmButtonText: 'Authorize Pardon'
    });

    if (!authRes.isConfirmed || !authRes.value) return;

    try {
        await ApiGateway.post('/dd/admin/discipline/pardon', {
            recordId: recordId,
            adminPassword: authRes.value
        });

        window.renderDisciplineRegistry();
        Swal.fire('Pardoned', "Record purged from Active Registry.", 'success');
    } catch (error) {
        Swal.fire('Error', error.message || "Failed to pardon record.", 'error');
    }
};

window.printDisciplinaryLetter = async function (recordId) {
    const btn = window.event ? window.event.currentTarget : null;
    let ogHtml = btn ? btn.innerHTML : "";
    if (btn) { btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin mr-1"></i> Generating...`; btn.disabled = true; }

    try {
        const records = await ApiGateway.get('/dd/admin/discipline/records');
        const rec = records.find(r => r.id === recordId);

        if (!rec) throw new Error("Disciplinary record not found.");

        const payload = {
            refNo: rec.id,
            date: new Date(rec.createdAt).toLocaleDateString('en-GB'),
            studentName: rec.student.fullName || rec.student.name,
            admNo: rec.student.admNo,
            studentClass: `${rec.student.assignedClass} | ${rec.student.assignedHostel}`,
            infractionLevel: rec.infractionLevel.toUpperCase(),
            reason: rec.reason,
            penalty: rec.penalty,
            officerName: activeDDAdminProfile.name,
            signatureBase64: activeDDAdminProfile.signatureUrl
        };

        const response = await fetch(`${ENV.API_BASE_URL}/api/reports/disciplinary-letter`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${sessionStorage.getItem('guss_access_token')}`
            },
            body: JSON.stringify(payload)
        });

        if (response.ok) {
            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `Disciplinary_Notice_${rec.student.admNo.replace(/\//g, '_')}.pdf`;
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            a.remove();
        } else {
            Swal.fire('Error', "Server failed to generate Disciplinary PDF.", 'error');
        }
    } catch (error) {
        Swal.fire('Network Error', "Could not connect to PDF Report Engine.", 'error');
    } finally {
        if (btn) { btn.innerHTML = ogHtml; btn.disabled = false; }
    }
};

window.assignHouseMaster = async function () {
    if (SessionManager.isHistoricalArchiveMode()) {
        return Swal.fire('Archive Lockout', 'Appointing House Wardens is strictly prohibited in historical view.', 'error');
    }

    const targetHostelId = document.getElementById('hmHostelSelect').value;
    const staffSelectEl = document.getElementById('hmStaffSelect');
    const staffId = staffSelectEl.value;

    if (!targetHostelId || !staffId) return Swal.fire('Validation Error', "Please select a Hostel and a Staff Member.", 'error');

    const authRes = await Swal.fire({
        title: 'Zero-Trust Authorization',
        html: `Appointing House Warden.<br><br>Enter Admin Password to execute:`,
        input: 'password',
        inputAttributes: { autocapitalize: 'off', autocorrect: 'off' },
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#005A36',
        confirmButtonText: 'Authorize Appointment'
    });

    if (!authRes.isConfirmed || !authRes.value) return;

    try {
        await ApiGateway.post('/dd/admin/hostels/warden/assign', {
            hostelId: targetHostelId,
            targetStaffId: staffId,
            adminPassword: authRes.value
        });

        Swal.fire('Appointed', `Success: Warden assigned.`, 'success');
        window.renderHostelMatrix();
    } catch (error) {
        Swal.fire('Error', error.message || "Failed to assign Warden.", 'error');
    }
};

window.removeHouseMaster = async function (hostelId) {
    if (SessionManager.isHistoricalArchiveMode()) {
        return Swal.fire('Archive Lockout', 'Revoking House Wardens is strictly prohibited in historical view.', 'error');
    }

    const res = await Swal.fire({
        title: 'Revoke Warden?',
        text: `Revoke Warden appointment?`,
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#ef4444',
        confirmButtonText: 'Yes, Revoke'
    });

    if (!res.isConfirmed) return;

    const authRes = await Swal.fire({
        title: 'Zero-Trust Authorization',
        html: `Revoking House Warden clearance.<br><br>Enter Admin Password to execute:`,
        input: 'password',
        inputAttributes: { autocapitalize: 'off', autocorrect: 'off' },
        icon: 'error',
        showCancelButton: true,
        confirmButtonColor: '#ef4444',
        confirmButtonText: 'Authorize Revocation'
    });

    if (!authRes.isConfirmed || !authRes.value) return;

    try {
        await ApiGateway.post('/dd/admin/hostels/warden/revoke', {
            hostelId: hostelId,
            adminPassword: authRes.value
        });

        window.renderHostelMatrix();
        Swal.fire('Revoked', 'Warden successfully removed.', 'success');
    } catch (error) {
        Swal.fire('Error', error.message || 'Failed to revoke House Master.', 'error');
    }
};

window.filterHostelTransferStudents = function () {
    const query = document.getElementById('hostelTransferSearchInput').value.toLowerCase().trim();
    const res = document.getElementById('hostelTransferSearchResults');
    res.innerHTML = '';

    if (query.length < 2) { res.classList.add('hidden'); return; }

    const students = window.getStudentRegistrySafe();
    let foundCount = 0;
    const maxResults = 10;

    for (let i = 0; i < students.length; i++) {
        const student = students[i];
        if (student.status === 'ADMITTED' && ((student.name || '').toLowerCase().includes(query) || (student.admNo && student.admNo.toLowerCase().includes(query)))) {
            const div = document.createElement('div');
            div.className = "p-3 hover:bg-indigo-50 border-b border-slate-100 cursor-pointer transition-colors";
            div.onclick = () => {
                document.getElementById('hostelTransferSearchInput').value = `${student.name} (${student.admNo})`;
                document.getElementById('hostelTransferStudentId').value = student.admNo;
                document.getElementById('hostelTransferCurrent').value = student.assignedHostel || "Day Student";
                res.classList.add('hidden');
            };
            div.innerHTML = `<p class="text-xs font-black text-slate-800 uppercase">${DOMPurify.sanitize(student.name)}</p><p class="text-[9px] font-mono text-slate-500">${DOMPurify.sanitize(student.admNo)} • ${DOMPurify.sanitize(student.assignedHostel || "Day Student")}</p>`;
            res.appendChild(div);

            foundCount++;
            if (foundCount >= maxResults) break;
        }
    }

    if (foundCount > 0) res.classList.remove('hidden');
    else res.classList.add('hidden');
};

window.executeHostelTransfer = async function () {
    if (SessionManager.isHistoricalArchiveMode()) {
        return Swal.fire('Archive Lockout', 'Executing student hostel transfers is strictly prohibited in historical view.', 'error');
    }

    const studentInputEl = document.getElementById('hostelTransferSearchInput') || document.getElementById('hostelTransferStudentId');
    const oldHostelEl = document.getElementById('hostelTransferCurrent');
    const newHostelEl = document.getElementById('hostelTransferNew');
    const reasonEl = document.getElementById('hostelTransferReason');

    if (!studentInputEl || !oldHostelEl || !newHostelEl || !reasonEl) return Swal.fire('UI Error', "Missing elements.", 'error');

    let rawStudent = studentInputEl.value.trim();
    let admNo = rawStudent;
    if (rawStudent.includes('(') && rawStudent.includes(')')) {
        admNo = rawStudent.substring(rawStudent.lastIndexOf('(') + 1, rawStudent.lastIndexOf(')')).trim();
    }

    const oldHostel = oldHostelEl.value;
    const newHostel = newHostelEl.value.trim();
    const reason = reasonEl.value.trim();

    if (!admNo || !newHostel || !reason) return Swal.fire('Validation Error', "Please fill all transfer fields and provide a reason.", 'error');
    if (oldHostel === newHostel) return Swal.fire('Validation Error', "Destination is the same as current hostel.", 'error');

    const authRes = await Swal.fire({
        title: 'Zero-Trust Authorization',
        html: `Relocate ${admNo} to ${newHostel}.<br>Enter Admin Password to execute:`,
        input: 'password',
        inputAttributes: { autocapitalize: 'off', autocorrect: 'off' },
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#005A36',
        confirmButtonText: 'Authorize Relocation'
    });

    if (!authRes.isConfirmed || !authRes.value) return;

    try {
        await ApiGateway.post('/dd/admin/hostels/transfer', {
            admNo: admNo,
            targetHostel: newHostel,
            reason: reason,
            adminPassword: authRes.value
        });

        await window.syncPostgresToLocal();
        Swal.fire('Transferred', `Student relocated to ${newHostel}.`, 'success');
        studentInputEl.value = ''; reasonEl.value = ''; oldHostelEl.value = '';
        window.renderHostelMatrix();
    } catch (error) {
        Swal.fire('Error', error.message || "Relocation rejected.", 'error');
    }
};

window.guiAddHostel = async function () {
    if (SessionManager.isHistoricalArchiveMode()) {
        return Swal.fire('Archive Lockout', 'Commissioning new hostel infrastructure is strictly prohibited in historical view.', 'error');
    }

    const res = await Swal.fire({
        title: 'Add New Hostel',
        input: 'text',
        inputLabel: 'Official name of the new Hostel/Block',
        inputPlaceholder: 'e.g. Sultan Bello House',
        showCancelButton: true,
        confirmButtonColor: '#005A36'
    });

    if (!res.isConfirmed || !res.value || res.value.trim() === "") return;
    let newHostel = res.value.trim().toLowerCase().split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');

    const authRes = await Swal.fire({
        title: 'Zero-Trust Authorization',
        html: `Commissioning new infrastructure: <b>${newHostel}</b>.<br><br>Enter Admin Password to execute:`,
        input: 'password',
        inputAttributes: { autocapitalize: 'off', autocorrect: 'off' },
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#005A36',
        confirmButtonText: 'Authorize Commissioning'
    });

    if (!authRes.isConfirmed || !authRes.value) return;

    try {
        await ApiGateway.post('/dd/admin/hostels/add', {
            hostelName: newHostel,
            adminPassword: authRes.value
        });

        Swal.fire('Success', `Hostel '${newHostel}' added.`, 'success');
        window.seedDropdowns();
        window.renderHostelMatrix();
    } catch (error) {
        Swal.fire('Error', error.message || "Failed to commission hostel.", 'error');
    }
};

window.guiRemoveHostel = async function () {
    if (SessionManager.isHistoricalArchiveMode()) {
        return Swal.fire('Archive Lockout', 'Scrapping hostel infrastructure is strictly prohibited in historical view.', 'error');
    }

    let dynamicHostels = [];
    try {
        dynamicHostels = await ApiGateway.get('/dd/admin/hostels');
    } catch (e) { console.error(e); }

    const select = document.getElementById('removeHostelSelect');
    select.innerHTML = '<option value="">Select a hostel...</option>';
    if (Array.isArray(dynamicHostels)) {
        dynamicHostels.forEach(h => {
            select.innerHTML += `<option value="${DOMPurify.sanitize(h.id)}">${DOMPurify.sanitize(h.hostelName)}</option>`;
        });
    }

    document.getElementById('removeHostelModal').classList.remove('hidden');
};

window.executeRemoveHostel = async function () {
    if (SessionManager.isHistoricalArchiveMode()) {
        return Swal.fire('Archive Lockout', 'Scrapping hostel infrastructure is strictly prohibited in historical view.', 'error');
    }

    const targetHostelId = document.getElementById('removeHostelSelect').value;
    if (!targetHostelId) return Swal.fire('Validation Error', "Please select a hostel.", 'error');

    const authRes = await Swal.fire({
        title: 'Zero-Trust Authorization',
        html: `Scrapping hostel infrastructure.<br><br>Enter Admin Password to execute:`,
        input: 'password',
        inputAttributes: { autocapitalize: 'off', autocorrect: 'off' },
        icon: 'error',
        showCancelButton: true,
        confirmButtonColor: '#ef4444',
        confirmButtonText: 'Authorize Purge'
    });

    if (!authRes.isConfirmed || !authRes.value) return;

    try {
        await ApiGateway.post('/dd/admin/hostels/remove', {
            hostelId: targetHostelId,
            adminPassword: authRes.value
        });

        Swal.fire('Success', `Hostel scrapped.`, 'success');
        document.getElementById('removeHostelModal').classList.add('hidden');
        window.seedDropdowns();
        window.renderHostelMatrix();
    } catch (error) {
        Swal.fire('Error', error.message || 'Failed to scrap hostel.', 'error');
    }
};

window.openDDProfileSettings = async function () {
    const modal = document.getElementById('ddProfileModal');
    const sigPreview = document.getElementById('ddSignaturePreview');
    const nameDisplay = document.getElementById('readOnlyDDName');

    if (modal) modal.classList.remove('hidden');

    try {
        const safeId = encodeURIComponent(currentDDAdminStaffId);
        const dbProfile = await ApiGateway.get(`/ict/staff/profile?id=${safeId}`);

        if (dbProfile) {
            if (nameDisplay) nameDisplay.textContent = dbProfile.fullName || dbProfile.name || activeDDAdminProfile.name;
            if (dbProfile.signatureUrl) {
                sigPreview.src = window.resolveMediaUrl(dbProfile.signatureUrl);
                sigPreview.classList.remove('hidden');
            } else {
                sigPreview.classList.add('hidden');
            }
        }
    } catch (e) {
        console.warn("Could not fetch live signature from ICT Registry.");
    }
};

window.printAppointmentLetter = async function (encodedStaffId, encodedStaffName, encodedRoleTitle, encodedTargetScope) {
    const btn = window.event ? window.event.currentTarget : null;
    let ogHtml = btn ? btn.innerHTML : "";
    if (btn) { ogHtml = btn.innerHTML; btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i>`; btn.disabled = true; }

    try {
        const staffId = decodeURIComponent(encodedStaffId);
        const staffName = decodeURIComponent(encodedStaffName);
        const roleTitle = decodeURIComponent(encodedRoleTitle);
        const targetScope = decodeURIComponent(encodedTargetScope);

        const payload = {
            staffId: staffId,
            staffName: staffName.toUpperCase(),
            roleTitle: roleTitle.toUpperCase(),
            targetScope: targetScope.toUpperCase(),
            date: new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }),
            officerName: activeDDAdminProfile.name,
            signatureBase64: activeDDAdminProfile.signatureUrl
        };

        const response = await fetch(`${ENV.API_BASE_URL}/api/reports/appointment-letter`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${sessionStorage.getItem('guss_access_token')}`
            },
            body: JSON.stringify(payload)
        });

        if (response.ok) {
            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `Official_Appointment_${staffId}.pdf`;
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            a.remove();
        } else {
            Swal.fire('Error', "Server failed to generate Appointment Letter.", 'error');
        }
    } catch (error) {
        Swal.fire('Network Error', "Could not connect to Jasper Report Engine.", 'error');
    } finally {
        if (btn) { btn.innerHTML = ogHtml; btn.disabled = false; }
    }
};

//   Direct PostgreSQL Audit Trail PDF Dispatch
window.printStudentAuditTrail = async function (admNo, studentName) {
    const btn = window.event ? window.event.currentTarget : null;
    let ogHtml = btn ? btn.innerHTML : "";
    if (btn) { ogHtml = btn.innerHTML; btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin mr-1"></i> Printing...`; btn.disabled = true; }

    try {
        const payload = {
            admNo: admNo,
            studentName: studentName.toUpperCase(),
            datePrinted: new Date().toLocaleString('en-GB'),
            officerName: activeDDAdminProfile.name,
            signatureBase64: activeDDAdminProfile.signatureUrl
        };

        const response = await fetch(`${ENV.API_BASE_URL}/api/reports/student-audit-relational`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${sessionStorage.getItem('guss_access_token')}`
            },
            body: JSON.stringify(payload)
        });

        if (response.ok) {
            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `Audit_Trail_${admNo.replace(/\//g, '_')}.pdf`;
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            a.remove();
        } else {
            Swal.fire('Error', "Server failed to generate Audit Trail.", 'error');
        }
    } catch (error) {
        Swal.fire('Network Error', "Could not connect to Jasper Report Engine.", 'error');
    } finally {
        if (btn) { btn.innerHTML = ogHtml; btn.disabled = false; }
    }
};

window.publishBroadcast = async function () {
    if (SessionManager.isHistoricalArchiveMode()) {
        return Swal.fire('Archive Lockout', 'Transmitting broadcasts is prohibited in historical view.', 'error');
    }

    const msgEl = document.getElementById('broadcastMessageInput');
    if (!msgEl || msgEl.value.trim() === '') return Swal.fire('Validation Error', 'Broadcast message cannot be empty.', 'error');

    const authRes = await Swal.fire({
        title: 'Zero-Trust Authorization',
        html: `Transmit official broadcast to all staff portals?<br>Enter Admin Password to execute:`,
        input: 'password',
        inputAttributes: { autocapitalize: 'off', autocorrect: 'off' },
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#005A36',
        confirmButtonText: 'Authorize Broadcast'
    });

    if (!authRes.isConfirmed || !authRes.value) return;

    try {
        await ApiGateway.post('/dd/admin/comms/broadcast', {
            message: msgEl.value.trim(),
            adminPassword: authRes.value
        });

        Swal.fire('Transmitted', 'Official broadcast securely published.', 'success');
        msgEl.value = '';
    } catch (error) {
        Swal.fire('Error', error.message || 'Failed to transmit broadcast.', 'error');
    }
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

    try {
        if (type === 'STUDENT') {
            const pendingDB = window.getStudentRegistrySafe();
            const cacheRef = pendingDB.find(s => s.admNo === targetId || s.nin === targetId);
            if (!cacheRef) throw new Error("Student not found in registry.");

            const student = await ApiGateway.get(`/bridge/student?nin=${cacheRef.nin}`);

            let logs = [];
            try {
                let parsedLogs = window.parseVault('guss_system_logs');
                logs = Array.isArray(parsedLogs) ? parsedLogs : [];
            } catch (e) { }

            const studentLogs = logs.filter(l => l.message && (l.message.includes(student.admNo) || l.message.includes(student.nin)));
            let logsHtml = studentLogs.map(l => `<div class="border-b border-slate-100 py-2"><span class="text-[9px] text-slate-400 font-mono">${DOMPurify.sanitize(l.timestamp ? new Date(l.timestamp).toLocaleString('en-GB') : new Date().toLocaleString('en-GB'))}</span><p class="text-xs font-medium text-slate-700">${DOMPurify.sanitize(l.message)}</p></div>`).join('');
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
                            <div><p class="text-[9px] font-bold text-slate-400 uppercase tracking-widest">State of Origin</p><p class="text-sm font-black text-slate-700">${DOMPurify.sanitize(student.state || student.stateOfOrigin || 'N/A')}</p></div>
                            <div><p class="text-[9px] font-bold text-slate-400 uppercase tracking-widest">L.G.A</p><p class="text-sm font-black text-slate-700">${DOMPurify.sanitize(student.lga || 'N/A')}</p></div>
                            <div><p class="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Blood Group</p><p class="text-sm font-black text-red-600">${DOMPurify.sanitize(student.blood || student.bloodGroup || 'Unknown')}</p></div>
                        </div>
                        <div class="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-4">
                            <div><p class="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Primary Contact / Phone</p><p class="text-sm font-mono font-black text-blue-600">${DOMPurify.sanitize(student.nok1Phone || student.parentPhone || 'N/A')}</p></div>
                            <div><p class="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Residential Address</p><p class="text-sm font-black text-slate-700">${DOMPurify.sanitize(student.address || student.nok1Address || 'N/A')}</p></div>
                            <div class="border-t border-slate-100 pt-3"><p class="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Emergency Next of Kin</p><p class="text-sm font-black text-slate-700">${DOMPurify.sanitize(student.nok1Name || student.parentName || 'N/A')} <span class="font-mono text-blue-600 ml-2">${DOMPurify.sanitize(student.nok1Phone || student.parentPhone || '')}</span></p></div>
                        </div>
                        <div class="pt-2">
                            <h4 class="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2"><i class="fa-solid fa-file-medical text-red-400 mr-1"></i> Medical & Health Notes</h4>
                            <p class="text-xs font-bold text-slate-600 bg-red-50 p-4 rounded-xl border border-red-100 shadow-inner">Allergies: ${DOMPurify.sanitize(student.medAllergies || student.medicalAllergies || 'None declared')} &nbsp;|&nbsp; Disabilities: ${student.disabilityRadio === 'none' ? 'None' : 'Yes (Check Physical File)'}</p>
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
                ApiGateway.get(`/ict/operational/staff?staffId=${safeId}`).catch(() => [])
            ]);

            body.innerHTML = window.buildStaffDossierHtml(staff, operationalRoles);
            window.renderStaffLeaveHistoryInDossier(targetId);
        }
    } catch (e) {
        body.innerHTML = `<div class="py-20 text-center text-red-500 font-bold"><i class="fa-solid fa-triangle-exclamation text-4xl mb-4 block"></i> Failed to decrypt dossier. Network Error.</div>`;
    }
};

window.buildStaffDossierHtml = function (staff, operationalRoles = []) {
    let rolesHtml = '';
    const staffIdCheck = staff.staffId || staff.trackingRef;
    const formatTitle = (str) => str.toLowerCase().split(' ').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');

    const statBoard = (typeof window.parseVault === 'function') ? (window.parseVault('guss_statutory_board') || {}) : {};
    Object.entries(statBoard).forEach(([officeKey, data]) => {
        if (data.staffId && data.staffId.toUpperCase() === staffIdCheck.toUpperCase()) {
            let cleanTitle = officeKey.replace('ROLE_', '').replace(/_/g, ' ');
            if (officeKey === 'ROLE_DIRECTOR') cleanTitle = 'School Director';
            if (officeKey === 'ROLE_BURSAR') cleanTitle = 'Central Bursar';
            rolesHtml += `<span class="bg-gussGold text-gussNavy px-3 py-1 rounded text-[9px] font-black uppercase shadow-sm border border-yellow-600 mr-2 mb-2 inline-block"><i class="fa-solid fa-crown mr-1"></i> ${formatTitle(cleanTitle)}</span>`;
        }
    });

    const delegations = (typeof window.parseVault === 'function') ? (window.parseVault('cloud_delegations') || {}) : {};
    Object.entries(delegations).forEach(([roleKey, data]) => {
        if (data.staffId && data.staffId.toUpperCase() === staffIdCheck.toUpperCase()) {
            rolesHtml += `<span class="bg-slate-800 text-white px-3 py-1 rounded text-[9px] font-black uppercase shadow-sm border border-slate-600 mr-2 mb-2 inline-block"><i class="fa-solid fa-shield-halved mr-1 text-blue-400"></i> ${formatTitle(roleKey.replace(/_/g, ' '))}</span>`;
        }
    });

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
            <div class="pt-6 mt-2 border-t border-slate-200">
                <h4 class="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">Institutional Leave Ledger</h4>
                <div id="staffLeaveHistoryContainer" class="max-h-48 overflow-y-auto bg-slate-50 p-4 rounded-xl border border-slate-200 shadow-inner">
                    <i class="fa-solid fa-spinner fa-spin"></i> Loading History...
                </div>
            </div>
        </div>
    </div>`;
};

window.renderStaffLeaveHistoryInDossier = async function (staffId) {
    const container = document.getElementById('staffLeaveHistoryContainer');
    if (!container) return;

    try {
        const history = await ApiGateway.get(`/dd/admin/welfare/leave/history/staff?staffId=${encodeURIComponent(staffId)}`);

        if (!history || history.length === 0) {
            container.innerHTML = '<p class="text-[10px] text-slate-400 italic font-bold">No leave history found for this officer.</p>';
            return;
        }

        container.innerHTML = `
        <table class="w-full text-left border-collapse text-[10px]">
            <thead><tr class="text-slate-400 border-b border-slate-200"><th class="pb-1">Type</th><th class="pb-1">Dates</th><th class="pb-1">Status</th></tr></thead>
            <tbody class="divide-y divide-slate-100">
                ${history.map(h => `<tr>
                    <td class="py-2 font-black">${DOMPurify.sanitize(h.leaveType)}</td>
                    <td class="py-2 font-mono">${DOMPurify.sanitize(h.startDate)} to ${DOMPurify.sanitize(h.endDate)}</td>
                    <td class="py-2 font-black ${h.status === 'APPROVED' ? 'text-emerald-600' : 'text-amber-600'}">${DOMPurify.sanitize(h.status)}</td>
                </tr>`).join('')}
            </tbody>
        </table>`;
    } catch (e) {
        container.innerHTML = '<p class="text-red-500 text-[10px] font-bold">Error loading history.</p>';
    }
};

window.closeDossierModal = function () {
    const modal = document.getElementById('dossierModal');
    const content = document.getElementById('dossierContent');
    if (!modal) return;
    modal.classList.add('opacity-0');
    if (content) content.classList.add('scale-95');
    setTimeout(() => { modal.classList.add('hidden'); }, 300);
};