import { ApiGateway } from './api_gateway.js';
import { ENV } from './core_config.js';
import { SessionManager } from './session_manager.js';

let activeStaffProfile = null;

function resolveMediaUrl(url, fallbackName) {
    if (!url || typeof url !== 'string' || url.trim() === "") {
        return `https://ui-avatars.com/api/?name=${encodeURIComponent(fallbackName || 'Staff')}&background=005A36&color=fff`;
    }
    if (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('data:')) {
        return url;
    }
    const cleanPath = url.replace(/^\/+/, '');
    return `${ENV.API_BASE_URL}/${cleanPath}`;
}

window.onload = async function () {
    await SessionManager.initHeaderDropdown(); //  ADDED
    evaluateGreetingTime();
    initializeStaffProfile();
    renderBroadcasts();
    initializeNetworkMonitor(); //  ADDED
};

//  LISTEN FOR TIME TRAVEL
window.addEventListener('gussTimeMachineChanged', () => {
    evaluateAndRenderCapabilities();
});

//  ADVANCED HYBRID NETWORK TELEMETRY ENGINE
function initializeNetworkMonitor() {
    const pingText = document.getElementById('networkPingText');
    const pingDot = document.getElementById('networkPingDot');
    const pingBadge = document.getElementById('networkPingBadge');

    if (!pingText || !pingDot || !pingBadge) return;

    window.addEventListener('offline', () => {
        pingText.textContent = "NO INTERNET";
        pingText.className = "text-[10px] font-black text-red-500 tracking-widest";
        pingDot.className = "w-2 h-2 rounded-full bg-red-600";
        pingBadge.className = "bg-red-950/40 px-3 py-1 rounded-md border border-red-900/50 flex items-center gap-2 shadow-inner";
    });

    window.addEventListener('online', () => {
        pingText.textContent = "RECONNECTING...";
        pingText.className = "text-[10px] font-black text-amber-500 tracking-widest animate-pulse";
        pingDot.className = "w-2 h-2 rounded-full bg-amber-500 animate-pulse";
        pingBadge.className = "bg-amber-950/40 px-3 py-1 rounded-md border border-amber-900/50 flex items-center gap-2 shadow-inner";
        checkServerLatency();
    });

    async function checkServerLatency() {
        if (!navigator.onLine) return;
        const startTime = performance.now();
        try {
            const response = await fetch(`${ENV.API_BASE_URL}/api/director/epoch/current`, { method: 'GET', cache: 'no-store', signal: AbortSignal.timeout(5000) });
            if (response.ok) {
                const latency = Math.round(performance.now() - startTime);
                pingText.innerHTML = `SERVER: <span class="text-white">${latency}ms</span>`;
                if (latency < 150) {
                    pingText.className = "text-[9px] font-mono font-bold text-emerald-500 tracking-widest";
                    pingDot.className = "w-2 h-2 rounded-full bg-emerald-500 animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.8)]";
                    pingBadge.className = "bg-slate-900 px-3 py-1 rounded-md border border-slate-700 flex items-center gap-2 shadow-inner transition-colors duration-500";
                } else if (latency < 400) {
                    pingText.className = "text-[9px] font-mono font-bold text-amber-500 tracking-widest";
                    pingDot.className = "w-2 h-2 rounded-full bg-amber-500 animate-pulse shadow-[0_0_8px_rgba(245,158,11,0.8)]";
                    pingBadge.className = "bg-slate-900 px-3 py-1 rounded-md border border-amber-900/50 flex items-center gap-2 shadow-inner transition-colors duration-500";
                } else {
                    pingText.className = "text-[9px] font-mono font-bold text-red-500 tracking-widest";
                    pingDot.className = "w-2 h-2 rounded-full bg-red-500 animate-pulse shadow-[0_0_8px_rgba(239,68,68,0.8)]";
                    pingBadge.className = "bg-slate-900 px-3 py-1 rounded-md border border-red-900/50 flex items-center gap-2 shadow-inner transition-colors duration-500";
                }
            } else throw new Error("Server Error");
        } catch (error) {
            pingText.textContent = "SERVER UNREACHABLE";
            pingText.className = "text-[9px] font-black text-red-500 tracking-widest";
            pingDot.className = "w-2 h-2 rounded-full bg-red-600 shadow-[0_0_8px_rgba(239,68,68,0.8)]";
            pingBadge.className = "bg-red-950/40 px-3 py-1 rounded-md border border-red-900/50 flex items-center gap-2 shadow-inner transition-colors duration-500";
        }
    }
    if (navigator.onLine) checkServerLatency();
    setInterval(checkServerLatency, 15000);
}

function evaluateGreetingTime() {
    const hour = new Date().getHours();
    const greetingEl = document.getElementById('greetingTime');
    if (!greetingEl) return;
    if (hour < 12) greetingEl.textContent = "Good Morning,";
    else if (hour < 17) greetingEl.textContent = "Good Afternoon,";
    else greetingEl.textContent = "Good Evening,";
}

function initializeStaffProfile() {
    const sessionStaffId = sessionStorage.getItem('guss_staff_id') || "GUSS/STF/UNKNOWN";
    let staffName = sessionStorage.getItem('guss_user_name') || "Valued Employee";
    let rawPhoto = sessionStorage.getItem('guss_photo_url') || "";
    let email = sessionStorage.getItem('guss_email') || "";
    let staffType = sessionStorage.getItem('guss_staff_type') || "Official";

    const resolvedPhotoUrl = resolveMediaUrl(rawPhoto, staffName);
    if (!email) email = `${sessionStaffId.replace(/\//g, '').toLowerCase()}@gussringim.sch.ng`;

    activeStaffProfile = {
        id: sessionStaffId,
        name: staffName,
        staffType: staffType,
        email: email,
        photoUrl: resolvedPhotoUrl
    };

    //   textContent is natively safe from XSS. No DOMPurify needed here.
    const nameEl = document.getElementById('userName');
    const idEl = document.getElementById('userIdDisplay');
    const emailEl = document.getElementById('userEmailDisplay');
    const trackEl = document.getElementById('staffTrackText');
    const avatarEl = document.getElementById('userAvatar');

    if (nameEl) nameEl.textContent = activeStaffProfile.name;
    if (idEl) idEl.textContent = activeStaffProfile.id;
    if (emailEl) emailEl.textContent = activeStaffProfile.email;
    if (trackEl) trackEl.textContent = `${activeStaffProfile.staffType} Track`;
    if (avatarEl) avatarEl.src = activeStaffProfile.photoUrl;

    evaluateAndRenderCapabilities();
}

//  V2 ASYNCHRONOUS CAPABILITY ENGINE (API GATEWAY INTEGRATED)
async function evaluateAndRenderCapabilities() {
    const grid = document.getElementById('capabilityGrid');
    if (!grid) return;

    let capabilities = [];
    const staffId = activeStaffProfile.id;
    let activeRoles = [sessionStorage.getItem('guss_user_role') || 'ROLE_STAFF'];

    // Deep-Pass: Fetch Database Delegations via ApiGateway
    try {
        const delegations = await ApiGateway.get(`/bridge/staff-portals?staffId=${encodeURIComponent(staffId)}`);
        if (delegations && Array.isArray(delegations)) {
            activeRoles = [...new Set([...activeRoles, ...delegations])];
        }
    } catch (e) {
        console.warn("Could not fetch secondary capabilities.");
    }

    // Fetch Operational Roles (Teacher, Form Master, Warden) via ApiGateway
    try {
        //   Pass the active Time Machine session
        const activeContext = SessionManager.getCurrentContextString();
        const opRoles = await ApiGateway.get(`/ict/operational/staff?staffId=${encodeURIComponent(staffId)}&session=${encodeURIComponent(activeContext)}`);
        if (opRoles && Array.isArray(opRoles)) {
            opRoles.forEach(r => activeRoles.push(r.type));
        }
    } catch (e) {
        console.warn("Could not fetch operational capabilities.");
    }

    // Baseline Academic Role
    if (staffId.includes('STF') && (activeStaffProfile.staffType || '').toUpperCase().includes('ACADEMIC')) {
        capabilities.push({
            title: "Academic Grading Suite",
            desc: "Continuous Assessment (CA), Exam Marksheets & Subject Analytics.",
            icon: "fa-chalkboard-user",
            color: "from-emerald-900/40 to-slate-900 border-emerald-500/30 text-emerald-400",
            badge: "Subject Teacher",
            url: "teacher_grading.html",
            actionText: "Launch Grading Suite"
        });
    }

    // Role-Based Capabilities Matrix
    if (activeRoles.includes('ROLE_DIRECTOR') || activeRoles.includes('DIRECTOR')) {
        capabilities.push({
            title: "Executive Director Node",
            desc: "Institutional command, staff delegations & global oversight terminal.",
            icon: "fa-user-tie",
            color: "from-emerald-950 to-slate-900 border-gussGold text-gussGold",
            badge: "Executive Director",
            url: "director_terminal.html",
            actionText: "Open Director Terminal"
        });
    }

    if (activeRoles.includes('ROLE_ICT_ADMIN') || activeRoles.includes('ICT_ADMIN')) {
        capabilities.push({
            title: "ICT & Central Registry",
            desc: "Identity, security, systems management & staff onboarding.",
            icon: "fa-network-wired",
            color: "from-blue-950 to-slate-900 border-blue-500 text-blue-400",
            badge: "ICT Administrator",
            url: "ict_registry.html",
            actionText: "Open ICT Command Center"
        });
    }

    if (activeRoles.includes('ROLE_ADMISSIONS_OFFICER') || activeRoles.includes('ADMISSIONS_OFFICER')) {
        capabilities.push({
            title: "Admissions Console",
            desc: "Placement matrix, verification triage & batch publishing.",
            icon: "fa-id-card-clip",
            color: "from-purple-950 to-slate-900 border-purple-500 text-purple-400",
            badge: "Admissions Officer",
            url: "admission_officer.html",
            actionText: "Open Admissions Console"
        });
    }

    if (activeRoles.includes('ROLE_BURSAR') || activeRoles.includes('BURSAR')) {
        capabilities.push({
            title: "Central Bursary Terminal",
            desc: "Fee collection ledgers, payment verification, and audit reports.",
            icon: "fa-vault",
            color: "from-emerald-950 to-slate-900 border-gussGold/50 text-gussGold",
            badge: "Central Bursar",
            url: "bursary_terminal.html",
            actionText: "Open Bursary Console"
        });
    }

    if (activeRoles.includes('ROLE_CSO') || activeRoles.includes('CSO')) {
        capabilities.push({
            title: "Security Operations (CSO)",
            desc: "Gate pass scanner, exeat logs & campus security management.",
            icon: "fa-shield-halved",
            color: "from-red-950 to-slate-900 border-red-500/40 text-red-400",
            badge: "Chief Security Officer",
            url: "cso_terminal.html",
            actionText: "Open Security Console"
        });
    }

    if (activeRoles.includes('ROLE_DEPUTY_DIR_ADMIN') || activeRoles.includes('DEPUTY_DIR_ADMIN')) {
        capabilities.push({
            title: "DD Administration Console",
            desc: "Operations oversight, non-academic approvals & leave management.",
            icon: "fa-user-shield",
            color: "from-blue-950 to-slate-900 border-blue-500/50 text-blue-300",
            badge: "DD Admin",
            url: "dd_admin.html",
            actionText: "Open DD Admin Terminal"
        });
    }

    if (activeRoles.includes('ROLE_DEPUTY_DIR_ACADEMICS') || activeRoles.includes('DEPUTY_DIR_ACADEMICS')) {
        capabilities.push({
            title: "DD Academics Console",
            desc: "Curriculum oversight, teaching staff approvals & academic audit.",
            icon: "fa-graduation-cap",
            color: "from-emerald-950 to-slate-900 border-emerald-500/50 text-emerald-300",
            badge: "DD Academics",
            url: "dd_academics.html",
            actionText: "Open DD Academics Terminal"
        });
    }

    if (activeRoles.includes('ROLE_CHIEF_EXAMINER') || activeRoles.includes('CHIEF_EXAMINER')) {
        capabilities.push({
            title: "Chief Examiner Terminal",
            desc: "Master Broadsheets, Grading Deadlines & Terminal Report Publishing.",
            icon: "fa-scale-balanced",
            color: "from-blue-950 to-slate-900 border-blue-400 text-blue-300",
            badge: "Chief Examiner",
            url: "chief_examiner.html",
            actionText: "Open Examination Terminal"
        });
    }

    if (activeRoles.includes('ROLE_WEB_ADMIN') || activeRoles.includes('WEB_ADMIN')) {
        capabilities.push({
            title: "Web Administration",
            desc: "CMS management, Alumni directory moderation & ELECO controls.",
            icon: "fa-globe",
            color: "from-cyan-950 to-slate-900 border-cyan-500/50 text-cyan-300",
            badge: "Web Admin",
            url: "web_admin.html",
            actionText: "Open Web Admin Console"
        });
    }

    // General Universal Access
    capabilities.push({
        title: "Employee Service Desk",
        desc: "Request bio-data verification, apply for leave, and view official records.",
        icon: "fa-user-gear",
        color: "from-blue-900/40 to-slate-900 border-blue-500/30 text-blue-400",
        badge: "Self-Service",
        actionBtnOnClick: "openProfileRequestModal()",
        actionText: "Request Profile Correction"
    });

    // Form Master Capability
    if (activeRoles.includes('FORM_MASTER')) {
        capabilities.push({
            title: "Form Master Portal",
            desc: "Pastoral evaluations, class audits, and result management.",
            icon: "fa-users-rectangle",
            color: "from-purple-900/40 to-slate-900 border-purple-500/30 text-purple-400",
            badge: "Pastoral Node",
            url: "form_master.html",
            actionText: "Open Pastoral Console"
        });
    }

    // House Master Capability
    if (activeRoles.includes('HOUSE_WARDEN')) {
        capabilities.push({
            title: "House Master Portal",
            desc: "Hostel roster, exeat gate passes, and disciplinary logging.",
            icon: "fa-building-user",
            color: "from-amber-900/40 to-slate-900 border-amber-500/30 text-amber-400",
            badge: "Boarding Node",
            url: "house_master.html",
            actionText: "Open Boarding Console"
        });
    }

    const countEl = document.getElementById('activeCapabilitiesCount');
    if (countEl) countEl.textContent = `${capabilities.length} Workspaces Unlocked`;

    let cardsHtmlBuffer = '';
    capabilities.forEach(cap => {
        const actionHandler = cap.url
            ? `onclick="window.location.href='${cap.url}'"`
            : `onclick="${cap.actionBtnOnClick}"`;

        cardsHtmlBuffer += `
            <div class="bg-gradient-to-br ${cap.color} border rounded-3xl p-6 shadow-xl flex flex-col justify-between hover:scale-[1.02] transition-all duration-300 group">
                <div>
                    <div class="flex justify-between items-start mb-4">
                        <div class="w-12 h-12 rounded-2xl bg-slate-900/80 border border-slate-700/80 flex items-center justify-center text-xl shadow-inner">
                            <i class="fa-solid ${cap.icon}"></i>
                        </div>
                        <span class="text-[9px] font-black uppercase tracking-widest px-2.5 py-1 rounded-full bg-slate-900/80 border border-slate-700 text-slate-300">${cap.badge}</span>
                    </div>
                    <h3 class="text-base font-black text-white uppercase tracking-wide group-hover:text-gussGold transition-colors mb-2">${cap.title}</h3>
                    <p class="text-xs text-slate-400 font-medium leading-relaxed mb-6">${cap.desc}</p>
                </div>
                <button ${actionHandler} class="w-full bg-slate-900 hover:bg-black text-white font-black py-3 rounded-xl text-[10px] uppercase tracking-widest border border-slate-700 shadow-lg transition-all flex items-center justify-center gap-2 group-hover:border-gussGold">
                    <span>${cap.actionText}</span> <i class="fa-solid fa-arrow-right text-gussGold transition-transform group-hover:translate-x-1"></i>
                </button>
            </div>
        `;
    });

    grid.innerHTML = cardsHtmlBuffer;
}

window.openProfileRequestModal = function () {
    Swal.fire({
        title: 'Institutional Policy Notice',
        html: `Modifications to legal bio-data, official names, qualifications, or photos cannot be performed directly on self-service portals.<br><br>Please present your official documents at the <b>ICT & Central Registry Node</b> for biometric re-capture and record updating.`,
        icon: 'info',
        confirmButtonColor: '#005A36'
    });
}

async function renderBroadcasts() {
    const container = document.getElementById('broadcastContainer');
    if (!container) return;

    try {
        const announcements = await ApiGateway.get('/config/broadcasts');
        if (!announcements || announcements.length === 0) {
            container.innerHTML = `<p class="text-xs text-slate-500 font-medium text-center py-4">No active broadcasts transmitted from Administration.</p>`;
            return;
        }

        let htmlBuffer = '';
        announcements.forEach(notice => {
            htmlBuffer += `
                <div class="p-4 bg-slate-900 border border-slate-800 rounded-2xl flex items-start gap-3 shadow-sm">
                    <i class="fa-solid fa-circle-info text-blue-400 mt-0.5 text-sm"></i>
                    <div>
                        <p class="text-xs font-bold text-slate-200 leading-relaxed">${DOMPurify.sanitize(notice)}</p>
                        <span class="text-[8px] font-mono text-slate-500 uppercase tracking-widest mt-1 block">Official Circular</span>
                    </div>
                </div>
            `;
        });
        container.innerHTML = htmlBuffer;
    } catch (error) {
        container.innerHTML = `<p class="text-xs text-slate-500 font-medium text-center py-4">Unable to load institutional broadcasts.</p>`;
    }
}

window.openDigitalIdModal = function () {
    const modalPhoto = document.getElementById('modalIdPhoto');
    const modalName = document.getElementById('modalIdName');
    const modalRole = document.getElementById('modalIdRole');
    const modalNumber = document.getElementById('modalIdNumber');
    const modal = document.getElementById('digitalIdModal');

    if (modalPhoto) modalPhoto.src = activeStaffProfile.photoUrl || '';
    if (modalName) modalName.textContent = activeStaffProfile.name;
    if (modalRole) modalRole.textContent = `OFFICIAL STAFF`;
    if (modalNumber) modalNumber.textContent = activeStaffProfile.id;

    if (modal) {
        modal.classList.remove('hidden');
        modal.classList.add('flex');
    }
}

window.closeDigitalIdModal = function () {
    const modal = document.getElementById('digitalIdModal');
    if (!modal) return;
    modal.classList.add('hidden');
    modal.classList.remove('flex');
}

// ================= EXEAT & LEAVE MANAGEMENT =================
window.openLeaveModal = function () {
    const modal = document.getElementById('leaveModal');
    if (modal) modal.classList.remove('hidden');
    window.switchLeaveTab('apply'); // Default to apply tab
}

window.closeLeaveModal = function () {
    const modal = document.getElementById('leaveModal');
    if (modal) modal.classList.add('hidden');
}

window.switchLeaveTab = function (tabId) {
    const isHistory = tabId === 'history';
    document.getElementById('contentLeaveApply').classList.toggle('hidden', isHistory);
    document.getElementById('contentLeaveHistory').classList.toggle('hidden', !isHistory);

    document.getElementById('tabLeaveApply').className = isHistory
        ? "pb-3 text-xs font-black uppercase tracking-widest text-slate-500 border-b-2 border-transparent hover:text-slate-300 transition-colors"
        : "pb-3 text-xs font-black uppercase tracking-widest text-amber-500 border-b-2 border-amber-500 transition-colors";

    document.getElementById('tabLeaveHistory').className = isHistory
        ? "pb-3 text-xs font-black uppercase tracking-widest text-amber-500 border-b-2 border-amber-500 transition-colors"
        : "pb-3 text-xs font-black uppercase tracking-widest text-slate-500 border-b-2 border-transparent hover:text-slate-300 transition-colors";

    if (isHistory) window.fetchMyLeaveHistory();
}

window.toggleCustomLeaveType = function (value) {
    const container = document.getElementById('customLeaveTypeContainer');
    const input = document.getElementById('customLeaveType');
    if (value === 'Other') {
        container.classList.remove('hidden');
        container.classList.add('flex');
        input.required = true;
    } else {
        container.classList.add('hidden');
        container.classList.remove('flex');
        input.required = false;
        input.value = '';
    }
}

window.viewFullText = function (title, text) {
    Swal.fire({
        title: title,
        html: `<div class="text-left text-sm text-slate-700 leading-relaxed p-4 bg-slate-50 rounded-xl border border-slate-200">${DOMPurify.sanitize(text)}</div>`,
        confirmButtonColor: '#0F172A',
        confirmButtonText: 'Close'
    });
}

window.submitStaffLeave = async function (e) {
    e.preventDefault();
    let type = document.getElementById('leaveType').value;
    if (type === 'Other') {
        type = document.getElementById('customLeaveType').value.trim();
        if (!type) return Swal.fire('Validation Error', "Please specify the custom leave category.", 'error');
    }

    const start = document.getElementById('leaveStart').value;
    const end = document.getElementById('leaveEnd').value;
    const notes = document.getElementById('leaveNotes').value.trim();

    if (new Date(end) <= new Date(start)) {
        return Swal.fire('Validation Error', "Expected Return Date must be after the Commencement Date.", 'error');
    }

    const btn = e.target.querySelector('button[type="submit"]');
    const ogHtml = btn ? btn.innerHTML : "";
    if (btn) {
        btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin mr-1"></i> Submitting...`;
        btn.disabled = true;
    }

    try {
        //   Use the Relational Endpoint, NOT the JSON Blob
        await ApiGateway.post('/ict/operations/leave/request', {
            type: type,
            startDate: start,
            endDate: end,
            notes: notes
        });

        Swal.fire('Transmitted', `Success: Your ${type} Leave application has been securely transmitted to the DD Administration console.`, 'success');
        e.target.reset();
        window.toggleCustomLeaveType('Casual');
        window.switchLeaveTab('history');
    } catch (err) {
        Swal.fire('Critical Error', err.message || "Failed to transmit leave application.", 'error');
    } finally {
        if (btn) {
            btn.innerHTML = ogHtml;
            btn.disabled = false;
        }
    }
}

window.fetchMyLeaveHistory = async function () {
    const tbody = document.getElementById('myLeaveHistoryBody');
    if (!tbody) return;

    tbody.innerHTML = '<tr><td colspan="4" class="py-8 text-center text-slate-500 font-bold text-xs"><i class="fa-solid fa-spinner fa-spin text-2xl mb-2 block"></i> Loading history...</td></tr>';

    try {
        const history = await ApiGateway.get('/ict/operations/leave/history');

        if (!history || history.length === 0) {
            tbody.innerHTML = '<tr><td colspan="4" class="py-8 text-center text-slate-500 font-bold text-xs">No leave requests found.</td></tr>';
            return;
        }

        let html = '';
        history.forEach(req => {
            let badge = "bg-slate-800 text-slate-400";
            if (req.status === 'PENDING') badge = "bg-amber-900/40 text-amber-400 border border-amber-800 animate-pulse";
            if (req.status === 'APPROVE' || req.status === 'APPROVED') badge = "bg-emerald-900/40 text-emerald-400 border border-emerald-800";
            if (req.status === 'REJECT' || req.status === 'REJECTED') badge = "bg-red-900/40 text-red-400 border border-red-800";

            const actionBtn = req.status === 'PENDING'
                ? `<button onclick="window.revokeLeaveRequest('${req.id}')" class="bg-red-900/50 hover:bg-red-800 text-red-400 px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-wider transition-colors border border-red-800/50"><i class="fa-solid fa-trash-can"></i> Revoke</button>`
                : `<span class="text-[9px] text-slate-500 font-bold uppercase"><i class="fa-solid fa-lock"></i> Locked</span>`;

            //   Truncate notes and add a clickable "Read More" link
            const safeNotes = DOMPurify.sanitize(req.handoverNotes || '---');
            const displayNotes = safeNotes.length > 30 ? `${safeNotes.substring(0, 30)}... <span class="text-blue-400 cursor-pointer hover:underline" onclick="window.viewFullText('Leave Notes', \`${safeNotes.replace(/"/g, '&quot;')}\`)">Read More</span>` : safeNotes;

            html += `
                <tr class="hover:bg-slate-800/50 transition-colors">
                    <td class="py-3 px-2">
                        <div class="font-black text-slate-200 uppercase tracking-wide">${DOMPurify.sanitize(req.leaveType)}</div>
                        <div class="text-[9px] font-bold text-slate-500 mt-1 max-w-[150px]">Note: ${displayNotes}</div>
                    </td>
                    <td class="py-3 px-2 font-mono text-[10px] text-slate-400">${DOMPurify.sanitize(req.startDate)}<br>to ${DOMPurify.sanitize(req.endDate)}</td>
                    <td class="py-3 px-2 text-center"><span class="px-2 py-1 rounded text-[9px] font-black uppercase tracking-widest ${badge}">${DOMPurify.sanitize(req.status)}</span></td>
                    <td class="py-3 px-2 text-right">${actionBtn}</td>
                </tr>
            `;
        });
        tbody.innerHTML = html;
    } catch (e) {
        tbody.innerHTML = '<tr><td colspan="4" class="py-8 text-center text-red-500 font-bold text-xs">Failed to load history.</td></tr>';
    }
}

window.revokeLeaveRequest = async function (leaveId) {
    const res = await Swal.fire({
        title: 'Revoke Request?',
        text: 'Are you sure you want to cancel and delete this pending leave request?',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#ef4444',
        confirmButtonText: 'Yes, Revoke'
    });

    if (!res.isConfirmed) return;

    try {
        await ApiGateway.delete(`/ict/operations/leave/revoke/${leaveId}`);
        Swal.fire('Revoked', 'Your leave request has been successfully cancelled.', 'success');
        window.fetchMyLeaveHistory(); // Refresh the table
    } catch (error) {
        Swal.fire('Error', error.message || 'Failed to revoke request.', 'error');
    }
}

// ================= RELATIONAL NOTIFICATION ENGINE =================
window.checkForNotifications = async function () {
    try {
        const data = await ApiGateway.get('/ict/operations/comms/unread');
        const badge = document.getElementById('notifBadge');
        if (badge) {
            if (data && data.count > 0) {
                badge.classList.remove('hidden');
            } else {
                badge.classList.add('hidden');
            }
        }
    } catch (e) {
        console.warn("Silent fail: Could not fetch unread comms count.");
    }
}

window.openNotificationsModal = async function () {
    const modal = document.getElementById('notifModal');
    const content = document.getElementById('notifContent');
    const body = document.getElementById('notifBody');

    if (!modal || !content || !body) return;

    body.innerHTML = `<div class="text-center py-8 text-slate-400 font-bold text-xs"><i class="fa-solid fa-circle-notch fa-spin text-3xl mb-3 block"></i> Fetching Secure Comms...</div>`;

    modal.classList.remove('hidden');
    setTimeout(() => {
        modal.classList.remove('opacity-0');
        content.classList.remove('scale-95');
    }, 10);

    try {
        const msgs = await ApiGateway.get('/ict/operations/comms');

        if (!msgs || msgs.length === 0) {
            body.innerHTML = `<div class="text-center py-8 text-slate-400 font-bold text-xs"><i class="fa-regular fa-bell-slash text-3xl mb-3 opacity-30 block"></i> No administrative communications found.</div>`;
            return;
        }

        let htmlBuffer = '';
        msgs.forEach(msg => {
            let color = "bg-blue-50 border-blue-200 text-blue-800";
            let icon = "fa-circle-info text-blue-500";
            if (msg.severity === 'WARNING') { color = "bg-orange-50 border-orange-200 text-orange-800"; icon = "fa-triangle-exclamation text-orange-500"; }
            if (msg.severity === 'QUERY') { color = "bg-red-50 border-red-200 text-red-800"; icon = "fa-hand-paper text-red-500"; }

            htmlBuffer += `
                <div class="${color} border p-4 rounded-xl shadow-sm relative">
                    ${!msg.read ? '<span class="absolute top-2 right-2 flex h-2 w-2 rounded-full bg-red-500 animate-pulse"></span>' : ''}
                    <div class="flex items-center gap-2 mb-2 border-b border-black/10 pb-2">
                        <i class="fa-solid ${icon}"></i>
                        <h4 class="text-[10px] font-black uppercase tracking-widest">${DOMPurify.sanitize(msg.severity)} from ${DOMPurify.sanitize(msg.sender)}</h4>
                    </div>
                    <p class="text-xs font-medium leading-relaxed">${DOMPurify.sanitize(msg.message)}</p>
                    <p class="text-[8px] font-bold uppercase tracking-widest mt-3 opacity-60 text-right">${DOMPurify.sanitize(msg.timestamp)}</p>
                </div>
            `;
        });
        body.innerHTML = htmlBuffer;

        // Mark as read in PostgreSQL
        await ApiGateway.post('/ict/operations/comms/mark-read', {});
        window.checkForNotifications(); // Hide the red badge

    } catch (e) {
        body.innerHTML = `<div class="text-center py-8 text-red-500 font-bold text-xs">Failed to load communications.</div>`;
    }
}

window.closeNotificationsModal = function () {
    const modal = document.getElementById('notifModal');
    const content = document.getElementById('notifContent');
    if (!modal || !content) return;
    modal.classList.add('opacity-0');
    content.classList.add('scale-95');
    setTimeout(() => { modal.classList.add('hidden'); }, 300);
}

// Ensure the poller runs every 30 seconds
setInterval(window.checkForNotifications, 30000);