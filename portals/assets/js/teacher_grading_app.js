import { ApiGateway } from './api_gateway.js';
import { ENV, getAuthHeaders } from './core_config.js';
import { SessionManager } from './session_manager.js'; //  IMPORT TIME MACHINE

let activeTeacherId = sessionStorage.getItem('guss_staff_id');
let activeTeacherName = sessionStorage.getItem('guss_user_name') || "Valued Staff";
let RAM_VAULT = {};

async function syncPostgresToLocal() {
    try {
        const epochRes = await ApiGateway.get('/director/epoch/current').catch(() => null);
        if (epochRes) {
            RAM_VAULT['current_epoch'] = epochRes;
        }
    } catch (error) {
        console.error("Critical Relational Sync Error:", error);
    }
}
window.syncConfigFromCloud = syncPostgresToLocal;

window.onload = async function () {
    await SessionManager.initHeaderDropdown(); //  INITIALIZE TIME MACHINE
    await syncPostgresToLocal();
    resolveTeacherIdentity();
    evaluateTemporalLock();
    checkForNotifications();
    enforceTeacherAllocations();
    initializeRoleSwitcher();
    initializeNetworkMonitor(); //  INITIALIZE TELEMETRY
};

//  LISTEN FOR TIME TRAVEL
window.addEventListener('gussTimeMachineChanged', () => {
    if (document.getElementById('classSelector').value && document.getElementById('subjectSelector').value) {
        window.loadStudentRoster();
    }
    window.applyArchiveReadonlyState();
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

function resolveTeacherIdentity() {
    if (!activeTeacherId) {
        document.getElementById('activeTeacherNameDisplay').textContent = "UNAUTHORIZED ACCESS";
        Swal.fire('Authentication Error', 'Identity resolution failed. Please log in again.', 'error').then(() => {
            window.location.href = 'staff_login.html';
        });
        return;
    }
    document.getElementById('activeTeacherNameDisplay').textContent = activeTeacherName;
}

window.executeSystemLogout = async function () {
    const res = await Swal.fire({
        title: 'System Logout',
        text: 'Terminate Academic Session?',
        icon: 'question',
        showCancelButton: true,
        confirmButtonColor: '#005A36',
        confirmButtonText: 'Yes, Sign Out'
    });
    if (res.isConfirmed) {
        sessionStorage.clear();
        window.location.href = "staff_login.html";
    }
};

// ================= DYNAMIC WORKLOAD & SUBSTITUTES (RELATIONAL) =================
async function enforceTeacherAllocations() {
    if (!activeTeacherId) return;

    const classSelect = document.getElementById('classSelector');
    const subjectSelect = document.getElementById('subjectSelector');
    if (!classSelect || !subjectSelect) return;

    try {
        //   Pass the Time Machine session to the backend
        const activeContext = SessionManager.getCurrentContextString();
        const myWorkload = await ApiGateway.get(`/academics/grades/my-workload?session=${encodeURIComponent(activeContext)}`);

        window.teacherActiveWorkload = myWorkload;

        const uniqueClasses = [...new Set(myWorkload.map(w => w.class))].sort();

        let classOptionsHtml = '<option value="">Select Assigned Class...</option>';
        uniqueClasses.forEach(cls => {
            classOptionsHtml += `<option value="${DOMPurify.sanitize(cls)}">${DOMPurify.sanitize(cls)}</option>`;
        });
        classSelect.innerHTML = classOptionsHtml;

        classSelect.onchange = function () {
            const selectedCls = this.value;
            if (!selectedCls) {
                subjectSelect.innerHTML = '<option value="">Awaiting Class Selection...</option>';
                document.getElementById('substituteBanner').classList.add('hidden');
                return;
            }

            const validSubjects = window.teacherActiveWorkload.filter(w => w.class === selectedCls);

            let subjectOptionsHtml = '<option value="">Select Subject Matrix...</option>';
            validSubjects.forEach(w => {
                //  Handle Amendment Tags
                let tag = "";
                if (w.isAmendment) tag = " (Remarking Order)";
                else if (w.isCover) tag = " (Substitute)";

                subjectOptionsHtml += `<option value="${DOMPurify.sanitize(w.subject)}" data-cover="${w.isCover}" data-amendment="${w.isAmendment}">${DOMPurify.sanitize(w.subject)}${tag}</option>`;
            });
            subjectSelect.innerHTML = subjectOptionsHtml;

            document.getElementById('gradingTableBody').innerHTML = `
                <tr><td colspan="7" class="py-12 text-center text-slate-400 font-medium text-xs">
                    <i class="fa-solid fa-shield-halved text-3xl mb-3 opacity-20 block"></i>
                    Subject allocation verified. Click Load Roster to proceed.
                </td></tr>`;
            document.getElementById('saveGradesBtn').classList.add('hidden');
            document.getElementById('saveGradesBtn').classList.remove('flex');
        };

        subjectSelect.onchange = function () {
            const selectedOption = this.options[this.selectedIndex];
            if (!selectedOption) return;
            const isCover = selectedOption.getAttribute('data-cover') === 'true';
            const isAmendment = selectedOption.getAttribute('data-amendment') === 'true';
            const subBanner = document.getElementById('substituteBanner');

            if (isCover || isAmendment) {
                subBanner.classList.remove('hidden');
                subBanner.classList.add('flex');
                if (isAmendment) {
                    subBanner.querySelector('h4').textContent = "Surgical Remarking Order Active";
                    subBanner.querySelector('p').textContent = "You have been granted temporary write access to remark specific students in this class.";
                } else {
                    subBanner.querySelector('h4').textContent = "Temporary Delegation Active";
                    subBanner.querySelector('p').textContent = "You are currently accessing this class as a temporary substitute. Your actions are being logged.";
                }
            } else {
                subBanner.classList.add('hidden');
                subBanner.classList.remove('flex');
            }
        };

    } catch (e) {
        console.error("Workload Error:", e);
        classSelect.innerHTML = '<option value="">Error fetching workload...</option>';
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

        await ApiGateway.post('/ict/operations/comms/mark-read', {});
        window.checkForNotifications();

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

setInterval(window.checkForNotifications, 30000);

// ================= GRADING LOGIC (100% RELATIONAL EPOCH) =================

function evaluateTemporalLock() {
    const timerDisplay = document.getElementById('gradingTimerDisplay');
    const banner = document.getElementById('extensionNotificationBanner');
    const reasonText = document.getElementById('extensionReasonText');
    const epoch = RAM_VAULT['current_epoch'] || {};

    const globalLockString = epoch.globalDeadline || `${new Date().getFullYear()}-12-31`;
    const globalReason = epoch.timelineNote || "No active directives.";
    const temporalState = epoch.temporalState || "COMMENCED";
    const caStatus = epoch.caStatus || 'OPEN';
    const examStatus = epoch.examStatus || 'OPEN';

    const distance = new Date(globalLockString + "T23:59:59").getTime() - new Date().getTime();
    if (timerDisplay) {
        if (distance < 0) {
            timerDisplay.innerHTML = `<i class="fa-solid fa-lock text-red-400"></i> PORTAL LOCKED`;
            timerDisplay.className = "hidden sm:flex items-center gap-2 bg-slate-900/80 text-red-400 px-3 py-0.5 rounded-full border border-red-800/50 text-[10px]";
        } else {
            const days = Math.floor(distance / (1000 * 60 * 60 * 24));
            timerDisplay.innerHTML = `<i class="fa-solid fa-lock-open text-emerald-400"></i> ${days} Days Remaining`;
            timerDisplay.className = "hidden sm:flex items-center gap-2 bg-emerald-900/40 text-emerald-200 px-3 py-0.5 rounded-full border border-emerald-800/50 text-[10px]";
        }
    }

    if (banner && reasonText) {
        banner.classList.remove('hidden');
        let phaseNotice = `<span class="px-2 py-0.5 rounded text-[9px] font-black mr-2 ${caStatus === 'OPEN' ? 'bg-blue-100 text-blue-700' : 'bg-slate-200 text-slate-500'}">C.A: ${caStatus}</span>`;
        phaseNotice += `<span class="px-2 py-0.5 rounded text-[9px] font-black mr-2 ${examStatus === 'OPEN' ? 'bg-purple-100 text-purple-700' : 'bg-slate-200 text-slate-500'}">EXAM: ${examStatus}</span>`;

        let displayTitle = "Assessment Commenced";
        let displayColor = "bg-blue-50 border-blue-400 text-blue-800";
        let iconColor = "text-blue-500";

        if (temporalState === "EXTENDED") {
            displayTitle = "Deadline Extended";
            displayColor = "bg-emerald-50 border-emerald-400 text-emerald-800";
            iconColor = "text-emerald-500";
            banner.classList.remove('animate-pulse');
        } else if (temporalState === "SQUEEZED") {
            displayTitle = "URGENT: Deadline Squeezed";
            displayColor = "bg-red-50 border-red-400 text-red-800";
            iconColor = "text-red-500";
            banner.classList.add('animate-pulse');
        }

        reasonText.innerHTML = `<div class="mb-2">${phaseNotice}</div><strong>${displayTitle}:</strong> ${DOMPurify.sanitize(globalReason)}`;
        banner.className = `${displayColor} border-l-4 p-4 rounded-r-xl shadow-sm flex flex-col sm:flex-row items-start sm:items-center gap-4 mb-6`;
        document.getElementById('bannerIcon').className = `${iconColor} text-2xl mt-0.5`;
        document.getElementById('bannerTitle').className = `text-xs font-black uppercase tracking-widest mb-1`;
    }
}

// ================= SECURE ROSTER FETCHING =================
window.loadStudentRoster = async function () {
    await syncPostgresToLocal();
    evaluateTemporalLock();

    const selectedClass = document.getElementById('classSelector').value;
    const selectedSubject = document.getElementById('subjectSelector').value;
    const tbody = document.getElementById('gradingTableBody');

    if (!selectedClass || !selectedSubject) {
        Swal.fire('Missing Parameters', 'Please ensure both a Class and Subject are selected before loading the roster.', 'warning');
        return;
    }

    document.getElementById('sheetStatusText').innerHTML = `Currently grading <strong>${DOMPurify.sanitize(selectedSubject)}</strong> for <strong>${DOMPurify.sanitize(selectedClass)}</strong>`;
    tbody.innerHTML = `<tr><td colspan="7" class="py-12 text-center text-slate-400 font-medium text-xs"><i class="fa-solid fa-spinner fa-spin text-3xl mb-3 opacity-50 block"></i> Connecting to Central Registry...</td></tr>`;

    try {
        const epoch = RAM_VAULT['current_epoch'] || {};
        const activeSession = epoch.label || "2026/2027 SESSION | 1ST TERM";

        const activeContext = SessionManager.getCurrentContextString();
        const students = await ApiGateway.get(`/academics/grades/roster?className=${encodeURIComponent(selectedClass)}&subjectName=${encodeURIComponent(selectedSubject)}&session=${encodeURIComponent(activeContext)}`);

        if (!students || students.length === 0) {
            tbody.innerHTML = `<tr><td colspan="7" class="py-12 text-center text-slate-400 font-medium text-xs">
                <i class="fa-solid fa-users-slash text-3xl mb-3 opacity-20 block"></i>
                No admitted students found allocated to ${DOMPurify.sanitize(selectedClass)}.
            </td></tr>`;
            document.getElementById('saveGradesBtn').classList.add('hidden');
            document.getElementById('saveGradesBtn').classList.remove('flex');
            return;
        }

        const globalLockString = epoch.globalDeadline || `${new Date().getFullYear()}-12-31`;
        const caStatus = epoch.caStatus || 'OPEN';
        const examStatus = epoch.examStatus || 'OPEN';
        const isTimeLocked = new Date(globalLockString + "T23:59:59").getTime() - new Date().getTime() < 0;

        let htmlBuffer = '';
        let hasAnyUnlockedRow = false;

        students.forEach((student, index) => {
            const isClassPublished = student.isClassPublished === true;
            const isAmendmentUnlocked = student.isAmendmentUnlocked === true;

            let caDisabled = false;
            let examDisabled = false;
            let rowStyle = "";
            let badgeHtml = "";

            if (isClassPublished) {
                if (isAmendmentUnlocked) {
                    //  SURGICAL UNLOCK: This student has an official remark order!
                    caDisabled = false;
                    examDisabled = false;
                    rowStyle = "bg-emerald-50/60 border-2 border-emerald-400";
                    badgeHtml = `<span class="bg-emerald-100 text-emerald-800 text-[8px] font-black px-2 py-0.5 rounded uppercase tracking-widest border border-emerald-300 ml-2 animate-pulse"><i class="fa-solid fa-lock-open mr-1"></i> Authorized Remark</span>`;
                    hasAnyUnlockedRow = true;
                } else {
                    // Published & Sealed: Lock inputs completely
                    caDisabled = true;
                    examDisabled = true;
                    rowStyle = "opacity-60 bg-slate-50";
                }
            } else {
                // Routine Pre-Publication Checks
                if (isTimeLocked || caStatus !== 'OPEN') caDisabled = true;
                if (isTimeLocked || examStatus !== 'OPEN') examDisabled = true;
                if (!caDisabled || !examDisabled) hasAnyUnlockedRow = true;
            }

            const caClass = caDisabled
                ? "w-full bg-slate-100 text-slate-400 text-center font-bold py-2 rounded border border-slate-200 cursor-not-allowed"
                : "w-full bg-white text-center font-bold py-2 rounded border border-blue-200 focus:ring-2 focus:ring-blue-400 focus:outline-none transition-all";

            const examClass = examDisabled
                ? "w-full bg-slate-100 text-slate-400 text-center font-bold py-2 rounded border border-slate-200 cursor-not-allowed"
                : "w-full bg-white text-center font-bold py-2 rounded border border-purple-200 focus:ring-2 focus:ring-purple-400 focus:outline-none transition-all";

            const safeCleanId = (student.admNo || '').replace(/\//g, '');
            const safeCa = student.ca !== null && student.ca !== undefined && student.ca !== '' ? student.ca : '';
            const safeExam = student.exam !== null && student.exam !== undefined && student.exam !== '' ? student.exam : '';

            htmlBuffer += `
                <tr class="hover:bg-slate-50 transition-colors group border-b border-slate-100 ${rowStyle}">
                    <td class="py-3 px-4 text-center text-xs font-bold text-slate-400">${index + 1}</td>
                    <td class="py-3 px-4">
                        <div class="font-black text-slate-800 text-xs uppercase flex items-center">
                            ${DOMPurify.sanitize(student.name)}
                            ${badgeHtml}
                        </div>
                        <div class="text-[10px] font-mono text-slate-500">${DOMPurify.sanitize(student.admNo)}</div>
                        ${isAmendmentUnlocked ? `<div class="text-[9px] text-emerald-700 italic font-medium mt-0.5">Order Note: ${DOMPurify.sanitize(student.amendmentNotes)}</div>` : ''}
                    </td>
                    <td class="py-2 px-3 bg-blue-50/20">
                        <input type="number" min="0" max="40" data-type="ca" data-id="${student.admNo}" value="${safeCa}" 
                               onkeyup="window.calculateRowData(this)" onchange="window.calculateRowData(this)" placeholder="-" 
                               class="${caClass}" ${caDisabled ? 'disabled' : ''}>
                    </td>
                    <td class="py-2 px-3 bg-purple-50/20">
                        <input type="number" min="0" max="60" data-type="exam" data-id="${student.admNo}" value="${safeExam}" 
                               onkeyup="window.calculateRowData(this)" onchange="window.calculateRowData(this)" placeholder="-" 
                               class="${examClass}" ${examDisabled ? 'disabled' : ''}>
                    </td>
                    <td class="py-3 px-4 text-center font-black text-gussNavy text-sm" id="total-${safeCleanId}">${student.total}</td>
                    <td class="py-3 px-4 text-center font-black" id="grade-${safeCleanId}">${renderGradeBadge(student.grade, student.colorClass)}</td>
                    <td class="py-3 px-4 text-center text-xs font-bold uppercase text-slate-600" id="remark-${safeCleanId}">${student.remark}</td>
                </tr>
            `;
        });

        tbody.innerHTML = htmlBuffer;

        applyArchiveReadonlyState(); // Apply readonly state for historical archives

        const saveBtn = document.getElementById('saveGradesBtn');
        if (hasAnyUnlockedRow) {
            saveBtn.classList.remove('hidden');
            saveBtn.classList.add('flex');
        } else {
            saveBtn.classList.add('hidden');
            saveBtn.classList.remove('flex');
        }
    } catch (e) {
        console.error(e);
        Swal.fire('Database Error', 'Failed to retrieve academic roster from the server.', 'error');
    }
};

//   Lock UI for Historical Archives
window.applyArchiveReadonlyState = function () {
    const currentSession = sessionStorage.getItem('guss_selected_session');
    const currentTerm = sessionStorage.getItem('guss_selected_term');
    const liveSession = sessionStorage.getItem('guss_live_session');
    const liveTerm = sessionStorage.getItem('guss_live_term');

    const isHistorical = (currentSession !== liveSession || currentTerm !== liveTerm);

    const saveBtn = document.getElementById('saveGradesBtn');
    const inputs = document.querySelectorAll('#gradingTableBody input');
    const statusText = document.getElementById('sheetStatusText');

    if (isHistorical) {
        if (saveBtn) saveBtn.classList.add('hidden');
        inputs.forEach(input => {
            input.disabled = true;
            input.classList.add('bg-slate-100', 'cursor-not-allowed', 'opacity-60');
        });

        if (statusText && !statusText.innerHTML.includes('HISTORICAL ARCHIVE')) {
            statusText.innerHTML = `<span class="text-red-500 font-bold"><i class="fa-solid fa-lock"></i> HISTORICAL ARCHIVE: Grading is disabled for past terms.</span>`;
        }
    } else {
        inputs.forEach(input => {
            input.disabled = false;
            input.classList.remove('bg-slate-100', 'cursor-not-allowed', 'opacity-60');
        });
    }
}

// ASYNCHRONOUS ZERO-TRUST PREVIEW CALCULATOR
window.calculateRowData = async function (inputElement) {
    if (inputElement.disabled) return;

    const studentId = inputElement.getAttribute('data-id').replace(/\//g, '');
    const type = inputElement.getAttribute('data-type');
    const row = inputElement.closest('tr');

    let val = parseFloat(inputElement.value);
    if (isNaN(val) || val < 0) { inputElement.value = ''; val = 0; }
    if (type === 'ca' && val > 40) { inputElement.value = 40; val = 40; }
    if (type === 'exam' && val > 60) { inputElement.value = 60; val = 60; }

    const caInputVal = parseFloat(row.querySelector('input[data-type="ca"]').value);
    const examInputVal = parseFloat(row.querySelector('input[data-type="exam"]').value);

    let isOverwrite = false;

    if (inputElement.value !== inputElement.defaultValue) {
        if (inputElement.defaultValue !== '') isOverwrite = true;

        inputElement.classList.add('bg-yellow-50', 'border-yellow-400', 'text-yellow-900');
        inputElement.classList.remove('bg-white', 'border-blue-200', 'border-purple-200');

        inputElement.setAttribute('data-modified', 'true');
        if (isOverwrite) inputElement.setAttribute('data-overwrite', 'true');
        else inputElement.removeAttribute('data-overwrite');
    } else {
        inputElement.classList.remove('bg-yellow-50', 'border-yellow-400', 'text-yellow-900');
        inputElement.classList.add('bg-white');
        if (type === 'ca') inputElement.classList.add('border-blue-200');
        if (type === 'exam') inputElement.classList.add('border-purple-200');

        inputElement.removeAttribute('data-modified');
        inputElement.removeAttribute('data-overwrite');
    }

    if (isNaN(caInputVal) && isNaN(examInputVal)) {
        document.getElementById(`total-${studentId}`).textContent = '-';
        document.getElementById(`grade-${studentId}`).innerHTML = renderGradeBadge('-', 'bg-slate-200 text-slate-700');
        document.getElementById(`remark-${studentId}`).textContent = '-';
        return;
    }

    document.getElementById(`grade-${studentId}`).innerHTML = `<i class="fa-solid fa-spinner fa-spin text-slate-300"></i>`;

    clearTimeout(window[`calcTimer_${studentId}`]);
    window[`calcTimer_${studentId}`] = setTimeout(async () => {
        try {
            //   Using ApiGateway
            const data = await ApiGateway.get(`/academics/grades/calculate?ca=${caInputVal || 0}&exam=${examInputVal || 0}`);
            if (data) {
                document.getElementById(`total-${studentId}`).textContent = data.total;
                document.getElementById(`grade-${studentId}`).innerHTML = renderGradeBadge(data.grade, data.colorClass);
                document.getElementById(`remark-${studentId}`).textContent = data.remark;
            }
        } catch (e) {
            console.error("Calculation Error:", e);
        }
    }, 300);
};

function renderGradeBadge(grade, colorClass) {
    if (grade === '-' || !grade) return '-';
    const safeColor = colorClass || 'bg-slate-200 text-slate-700 border-slate-300';
    return `<span class="px-2 py-0.5 rounded border ${safeColor}">${grade}</span>`;
}

// ================= ZERO-TRUST GRADING SYNC ENGINE =================
window.saveGradesToCloud = async function () {
    const selectedClass = document.getElementById('classSelector').value;
    const selectedSubject = document.getElementById('subjectSelector').value;

    if (!selectedClass || !selectedSubject) {
        return Swal.fire('Validation Error', 'Class or Subject matrix is missing.', 'error');
    }

    const hasOverwrites = document.querySelector('input[data-overwrite="true"]') !== null;
    if (hasOverwrites) {
        const conf = await Swal.fire({
            title: 'Overwrite Warning',
            text: 'You are about to commit changes that will OVERWRITE previously saved grades. Are you sure you want to proceed?',
            icon: 'warning',
            showCancelButton: true,
            confirmButtonColor: '#d97706',
            confirmButtonText: 'Yes, Overwrite Grades'
        });
        if (!conf.isConfirmed) return;
    }

    const btn = document.getElementById('saveGradesBtn');
    const ogText = btn.innerHTML;
    btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin mr-2"></i> Syncing to Vault...`;
    btn.disabled = true;

    try {
        const rows = document.getElementById('gradingTableBody').querySelectorAll('tr');
        let gradePayloads = [];

        for (let row of rows) {
            const caInput = row.querySelector('input[data-type="ca"]');
            const examInput = row.querySelector('input[data-type="exam"]');

            if (caInput && examInput && (!caInput.disabled || !examInput.disabled)) {
                const rawId = caInput.getAttribute('data-id');
                let caVal = parseFloat(caInput.value);
                let examVal = parseFloat(examInput.value);

                if (!isNaN(caVal) || !isNaN(examVal)) {
                    gradePayloads.push({
                        studentAdmNo: rawId,
                        caScore: isNaN(caVal) ? null : caVal,
                        examScore: isNaN(examVal) ? null : examVal
                    });
                }
            }
        }

        if (gradePayloads.length === 0) {
            Swal.fire('No Data', 'No grade entries detected for transmission.', 'info');
            btn.innerHTML = ogText;
            btn.disabled = false;
            return;
        }

        //   Pass the active Time Machine session to the backend
        const activeContext = SessionManager.getCurrentContextString();

        await ApiGateway.post('/academics/grades/submit-batch', {
            targetClass: selectedClass,
            subject: selectedSubject,
            session: activeContext,
            grades: gradePayloads
        });

        Swal.fire('Grades Transmitted', `Success: Raw scores for ${DOMPurify.sanitize(selectedSubject)} securely transmitted to the Relational Database.`, 'success');

        document.querySelectorAll('input[data-modified="true"]').forEach(input => {
            input.defaultValue = input.value;
            input.removeAttribute('data-modified');
            input.removeAttribute('data-overwrite');
            input.classList.remove('bg-yellow-50', 'border-yellow-400', 'text-yellow-900');
            input.classList.add('bg-white');
            if (input.getAttribute('data-type') === 'ca') input.classList.add('border-blue-200');
            if (input.getAttribute('data-type') === 'exam') input.classList.add('border-purple-200');
        });
    } catch (error) {
        console.error("Grading Sync Error:", error);
        Swal.fire('Security Exception', error.message || 'Failed to process grading data.', 'error');
    } finally {
        btn.innerHTML = ogText;
        btn.disabled = false;
    }
};

// ==========================================
// FLOATING ROLE SWITCHER
// ==========================================
window.initializeRoleSwitcher = async function () {
    const staffId = sessionStorage.getItem('guss_staff_id');
    if (!staffId) return;

    const portalMap = {
        "ROLE_DIRECTOR": { title: "Executive Director Node", url: "director_terminal.html", icon: "fa-user-tie" },
        "DIRECTOR": { title: "Executive Director Node", url: "director_terminal.html", icon: "fa-user-tie" },
        "ROLE_DEPUTY_DIR_ACADEMICS": { title: "DD Academics Console", url: "dd_academics.html", icon: "fa-book-open" },
        "DEPUTY_DIR_ACADEMICS": { title: "DD Academics Console", url: "dd_academics.html", icon: "fa-book-open" },
        "ROLE_DEPUTY_DIR_ADMIN": { title: "DD Admin Console", url: "dd_admin.html", icon: "fa-briefcase" },
        "DEPUTY_DIR_ADMIN": { title: "DD Admin Console", url: "dd_admin.html", icon: "fa-briefcase" },
        "ICT_ADMIN": { title: "ICT & Central Registry", url: "ict_registry.html", icon: "fa-network-wired" },
        "ROLE_ICT_ADMIN": { title: "ICT & Central Registry", url: "ict_registry.html", icon: "fa-network-wired" },
        "WEB_ADMIN": { title: "Web Admin Command Center", url: "web_admin.html", icon: "fa-globe" },
        "ROLE_BURSAR": { title: "Central Bursary", url: "bursary.html", icon: "fa-vault" },
        "BURSAR": { title: "Central Bursary", url: "bursary.html", icon: "fa-vault" },
        "ADMISSIONS_OFFICER": { title: "Admissions Console", url: "admission_officer.html", icon: "fa-id-card-clip" },
        "ROLE_ADMISSIONS_OFFICER": { title: "Admissions Console", url: "admission_officer.html", icon: "fa-id-card-clip" },
        "CHIEF_EXAMINER": { title: "Chief Examiner", url: "chief_examiner.html", icon: "fa-scale-balanced" },
        "CSO": { title: "Chief Security Officer", url: "cso_terminal.html", icon: "fa-shield-halved" },
        "FORM_MASTER": { title: "Form Master Portal", url: "form_master.html", icon: "fa-users-rectangle" },
        "SUBJECT_TEACHER": { title: "Subject Teacher Terminal", url: "teacher_grading.html", icon: "fa-chalkboard-user" },
        "HOUSE_WARDEN": { title: "House Warden Portal", url: "house_master.html", icon: "fa-building-user" },
    };

    let myPortals = [portalMap["SUBJECT_TEACHER"]];

    try {
        const assignedRoles = await ApiGateway.get(`/bridge/staff-portals?staffId=${encodeURIComponent(staffId)}`);
        if (assignedRoles) {
            assignedRoles.forEach(roleKey => {
                let normalized = roleKey.toUpperCase().replace("GUSS_STATUTORY_", "").replace("GUSS_", "");
                if (portalMap[normalized]) myPortals.push(portalMap[normalized]);
                if (portalMap["ROLE_" + normalized]) myPortals.push(portalMap["ROLE_" + normalized]);
            });
        }

        const opRoles = await ApiGateway.get(`/ict/operational/staff?staffId=${encodeURIComponent(staffId)}`).catch(() => []);
        if (opRoles) {
            opRoles.forEach(roleObj => {
                if (portalMap[roleObj.type]) myPortals.push(portalMap[roleObj.type]);
            });
        }
    } catch (e) {
        console.warn("Could not fetch relational portals.");
    }

    myPortals.push({ title: "Staff Command Center", url: "staff_portal.html", icon: "fa-id-badge" });
    myPortals = [...new Map(myPortals.map(item => [item.url, item])).values()];

    if (myPortals.length > 1) window.deployFloatingSwitcherUI(myPortals);
};

window.deployFloatingSwitcherUI = function (portals) {
    let container = document.getElementById('enterpriseRoleSwitcher');
    if (!container) {
        container = document.createElement('div');
        container.id = 'enterpriseRoleSwitcher';
        container.className = "fixed bottom-8 right-8 z-[200] no-print select-none";
        document.body.appendChild(container);
    }

    let menuHtml = `
        <div id="roleSwitcherMenu" class="hidden absolute bottom-full right-0 mb-4 w-72 bg-white border border-slate-200 shadow-2xl rounded-2xl p-2 flex flex-col gap-1 origin-bottom-right transition-all">
            <div class="px-3 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-100 mb-1 flex items-center gap-2">
                <i class="fa-solid fa-shuffle"></i> Switch Active Portal
            </div>
    `;

    portals.forEach(p => {
        const isActive = window.location.href.includes(p.url);
        menuHtml += `
            <a href="${p.url}" class="flex items-center gap-3 px-3 py-3 rounded-xl text-xs font-bold transition-all ${isActive ? 'bg-gussNavy text-white shadow-md' : 'text-slate-600 hover:bg-slate-50 hover:text-gussNavy border border-transparent hover:border-slate-200'}">
                <div class="w-8 h-8 rounded-full flex items-center justify-center ${isActive ? 'bg-slate-700 text-white' : 'bg-slate-100 text-slate-500'}">
                    <i class="fa-solid ${p.icon}"></i>
                </div>
                ${p.title}
                ${isActive ? '<i class="fa-solid fa-circle-check ml-auto text-emerald-300"></i>' : ''}
            </a>
        `;
    });

    menuHtml += `</div>
        <button id="roleSwitcherDragHandle" class="bg-gussNavy hover:bg-black text-white px-5 py-4 rounded-full shadow-2xl flex items-center gap-3 font-black text-xs uppercase tracking-widest border-2 border-slate-700 transition-all group">
            <i class="fa-solid fa-layer-group text-gussGold group-hover:rotate-12 transition-transform"></i> My Portals
        </button>
    `;

    container.innerHTML = menuHtml;

    const handle = document.getElementById('roleSwitcherDragHandle');
    const menu = document.getElementById('roleSwitcherMenu');

    let isDragging = false, isHoldTriggered = false, holdTimeout = null;
    let currentX = 0, currentY = 0, initialX = 0, initialY = 0, xOffset = 0, yOffset = 0;

    function dragStart(e) {
        if (e.target === handle || handle.contains(e.target)) {
            if (e.type === "touchstart") {
                initialX = e.touches[0].clientX - xOffset;
                initialY = e.touches[0].clientY - yOffset;
            } else {
                initialX = e.clientX - xOffset;
                initialY = e.clientY - yOffset;
            }
            isHoldTriggered = false;
            holdTimeout = setTimeout(() => {
                isHoldTriggered = true;
                handle.classList.add('scale-110', 'ring-4', 'ring-gussGold/50', 'cursor-grabbing');
            }, 300);
        }
    }

    function drag(e) {
        if (isHoldTriggered) {
            isDragging = true;
            e.preventDefault();
            if (e.type === "touchmove") {
                currentX = e.touches[0].clientX - initialX;
                currentY = e.touches[0].clientY - initialY;
            } else {
                currentX = e.clientX - initialX;
                currentY = e.clientY - initialY;
            }
            xOffset = currentX;
            yOffset = currentY;
            container.style.transform = `translate3d(${currentX}px, ${currentY}px, 0)`;
            menu.classList.add('hidden');
        }
    }

    function dragEnd(e) {
        clearTimeout(holdTimeout);
        handle.classList.remove('scale-110', 'ring-4', 'ring-gussGold/50', 'cursor-grabbing');
        if (!isHoldTriggered && !isDragging) {
            if (e.target === handle || handle.contains(e.target)) {
                menu.classList.toggle('hidden');
            }
        }
        if (isDragging) { initialX = currentX; initialY = currentY; }
        isDragging = false;
        isHoldTriggered = false;
    }

    document.addEventListener("touchstart", dragStart, { passive: false });
    document.addEventListener("touchend", dragEnd, false);
    document.addEventListener("touchmove", drag, { passive: false });
    document.addEventListener("mousedown", dragStart, false);
    document.addEventListener("mouseup", dragEnd, false);
    document.addEventListener("mousemove", drag, false);
};