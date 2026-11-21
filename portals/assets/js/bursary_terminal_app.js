// ==========================================
// 0. ENVIRONMENT CONFIGURATION & HELPERS
// ==========================================
import { ENV, getAuthHeaders, getMultipartAuthHeaders } from './core_config.js';



// ==========================================
// 1. GLOBAL VARIABLES & INITIALIZATION
// ==========================================
let activeArchiveView = 'LIVE';
let activeBursarId = null;
let activeBursarName = "Loading...";

const roleNames = {
    "DIRECTOR": "School Director (Provost)",
    "DEPUTY_DIR_ACADEMICS": "Deputy Director (Academics)",
    "DEPUTY_DIR_ADMIN": "Deputy Director (Admin)",
    "CHIEF_EXAMINER": "Chief Examiner",
    "ASST_CHIEF_EXAMINER": "Asst. Chief Examiner",
    "BURSAR": "Central Bursar",
    "ASST_BURSAR": "Assistant Bursar",
    "ADMISSIONS_DIRECTOR": "Admissions Director",
    "ICT_ADMIN": "ICT & Central Registry Admin",
    "CSO": "Chief Security Officer",
    "HOD_SCIENCE": "H.O.D (Science)",
    "HOD_ARTS": "H.O.D (Arts & Commercial)"
};

async function syncConfigFromCloud() {
    try {
        // A. Fetch Global Configs (Fee Schedules, Term Payments, Gateways, Announcements)
        const configRes = await fetch(`${ENV.API_BASE_URL}/api/config/all`, {
            method: 'GET',
            headers: window.getAuthHeaders()
        });
        if (configRes.ok) {
            const configs = await configRes.json();
            Object.keys(configs).forEach(k => localStorage.setItem(k, configs[k]));
        }

        // B. Fetch Master Student Dossiers
        const stdRes = await fetch(`${ENV.API_BASE_URL}/api/bridge/all-lightweight`, {
            method: 'GET',
            headers: window.getAuthHeaders()
        });
        if (stdRes.ok) {
            const stdDb = await stdRes.json();
            localStorage.setItem('guss_pending_applications', JSON.stringify(stdDb));
        }
    } catch (e) {
        console.error("Failed to sync cloud configurations:", e);
    }
}

window.onload = async function () {
    await syncConfigFromCloud();
    simulateLoginEnvironment();
    syncAcademicSession();
    evaluateFinancialDeadline();
    initializeFinancialControls();
    initializeTimeMachine();
    seedDefaultBursaryData();
    checkMultiRoleAccess();
    checkForNotifications();
    switchTab('schedules');
};

window.addEventListener('storage', function (e) {
    if (e.key === 'guss_academic_session') syncAcademicSession();
    if (e.key === 'guss_payment_deadline' || e.key === 'guss_payment_gateway_status') {
        evaluateFinancialDeadline();
        initializeFinancialControls();
    }
    if (e.key && e.key.startsWith('guss_')) {
        checkForNotifications();
    }
    if (e.key === 'guss_global_sync_pulse') {
        syncConfigFromCloud().then(() => {
            renderAuditLedger();
            renderDefaultersMatrix();
        });
    }
});

// ================= DYNAMIC AUTHENTICATION =================
function simulateLoginEnvironment() {
    const delegations = JSON.parse(localStorage.getItem('guss_delegations')) || {};

    // Check for Bursar or Asst Bursar
    const activeDelegation = delegations['BURSAR'] || delegations['ROLE_BURSAR'] || delegations['ASST_BURSAR'];

    if (activeDelegation) {
        activeBursarId = activeDelegation.staffId;
        activeBursarName = activeDelegation.name;

        const nameDisplay = document.getElementById('activeBursarNameDisplay');
        if (nameDisplay) nameDisplay.textContent = activeBursarName;
    } else {
        const nameDisplay = document.getElementById('activeBursarNameDisplay');
        if (nameDisplay) nameDisplay.textContent = "UNAUTHORIZED ACCESS";
        Swal.fire('Security Halt', 'No Central Bursar appointed in the system. The Director must delegate this role first.', 'error').then(() => {
            window.location.href = 'staff_login.html';
        });
    }
}

function syncAcademicSession() {
    const display = document.getElementById('academicSessionDisplay');
    if (display) display.textContent = localStorage.getItem('guss_academic_session') || "2026/2027 SESSION | 1ST TERM";
}

/* =========================================================
   CORE LOGIC & HELPERS
   ========================================================= */
function getDynamicRoster() {
    const pendingDB = JSON.parse(localStorage.getItem('guss_pending_applications')) || [];
    return pendingDB.filter(app => app.status === 'ADMITTED');
}

function getStudentFeeScope(student) {
    if (student.trackMode === 'Exchange Scheme') return "EXCHANGE SCHEME";

    let classStr = student.assignedClass || "";
    if (classStr === 'Pending Qualifying Exams' || classStr === 'Unassigned') {
        classStr = student.targetLevel || "";
    }

    const levelOrClass = classStr.toUpperCase();

    if (levelOrClass.includes('JSS')) return "JUNIOR SECONDARY";
    if (levelOrClass.includes('SSS')) {
        if (levelOrClass.includes('SCIENCE') || levelOrClass.includes('E') || levelOrClass.includes('F') || levelOrClass.includes('G')) {
            return "SENIOR SECONDARY (SCIENCE)";
        }
        return "SENIOR SECONDARY (ARTS/COMMERCIAL)";
    }
    return "JUNIOR SECONDARY";
}

function seedDefaultBursaryData() {
    let schedules = JSON.parse(localStorage.getItem('guss_bursary_schedules'));
    if (!schedules || schedules.length === 0) {
        schedules = [
            { scope: "JUNIOR SECONDARY", tuition: 0, boarding: 12000, pta: 2000, medical: 1500, total: 15500 },
            { scope: "SENIOR SECONDARY (SCIENCE)", tuition: 0, boarding: 15000, pta: 2000, medical: 1500, total: 18500 },
            { scope: "SENIOR SECONDARY (ARTS/COMMERCIAL)", tuition: 0, boarding: 15000, pta: 2000, medical: 1500, total: 18500 },
            { scope: "EXCHANGE SCHEME", tuition: 0, boarding: 0, pta: 1000, medical: 0, total: 1000 }
        ];
        localStorage.setItem('guss_bursary_schedules', JSON.stringify(schedules));
    }
}

window.switchTab = function (tabId) {
    ['schedules', 'ledger', 'enforcement'].forEach(id => {
        const btn = document.getElementById(`tabBtn${id.charAt(0).toUpperCase() + id.slice(1)}`);
        const content = document.getElementById(`tabContent${id.charAt(0).toUpperCase() + id.slice(1)}`);
        if (!btn || !content) return;

        if (id === tabId) {
            btn.className = "flex-1 whitespace-nowrap lg:flex-none px-6 py-3 rounded-xl text-xs font-black uppercase tracking-widest transition-all bg-white shadow text-gussNavy border border-slate-200";
            content.classList.remove('hidden');
            content.classList.add('flex');
        } else {
            btn.className = "flex-1 whitespace-nowrap lg:flex-none px-6 py-3 rounded-xl text-xs font-black uppercase tracking-widest transition-all text-slate-500 hover:text-gussNavy";
            content.classList.add('hidden');
            content.classList.remove('flex');
        }
    });

    if (tabId === 'schedules') renderFeeSchedules();
    if (tabId === 'ledger') renderAuditLedger();
    if (tabId === 'enforcement') renderDefaultersMatrix();
}

/* =========================================================
   FINANCIAL CONTROLS & TIMERS
   ========================================================= */
function initializeFinancialControls() {
    const gatewayStatus = localStorage.getItem('guss_payment_gateway_status') || 'OPEN';
    const toggleEl = document.getElementById('paymentGatewayToggle');
    if (toggleEl) toggleEl.checked = gatewayStatus === 'OPEN';

    const deadline = localStorage.getItem('guss_payment_deadline') || "";
    const inputEl = document.getElementById('financeDeadlineInput');
    if (inputEl) inputEl.value = deadline;
}

function evaluateFinancialDeadline() {
    const timerDisplay = document.getElementById('gradingTimerDisplay');
    if (!timerDisplay) return;

    const gatewayStatus = localStorage.getItem('guss_payment_gateway_status') || 'OPEN';

    if (gatewayStatus === 'CLOSED') {
        timerDisplay.innerHTML = `<i class="fa-solid fa-lock text-red-400"></i> GATEWAY CLOSED`;
        timerDisplay.className = "hidden sm:flex items-center gap-2 bg-slate-900/80 text-red-400 px-3 py-0.5 rounded-full border border-red-800/50 text-[10px] shadow-inner ml-4";
        return;
    }

    const deadlineStr = localStorage.getItem('guss_payment_deadline');
    if (!deadlineStr) {
        timerDisplay.innerHTML = `<i class="fa-solid fa-infinity text-blue-400"></i> Open Timeline`;
        timerDisplay.className = "hidden sm:flex items-center gap-2 bg-slate-800 border border-slate-700 text-blue-300 px-3 py-1 rounded-md text-[10px] shadow-inner ml-4";
        return;
    }

    const distance = new Date(deadlineStr + "T23:59:59").getTime() - new Date().getTime();
    if (distance < 0) {
        timerDisplay.innerHTML = `<i class="fa-solid fa-lock text-red-400"></i> DEADLINE PASSED`;
        timerDisplay.className = "hidden sm:flex items-center gap-2 bg-slate-900/80 text-red-400 px-3 py-0.5 rounded-full border border-red-800/50 text-[10px] shadow-inner ml-4";
    } else {
        const days = Math.floor(distance / (1000 * 60 * 60 * 24));
        timerDisplay.innerHTML = `<i class="fa-solid fa-clock text-amber-400"></i> ${days} Days Remaining`;
        timerDisplay.className = "hidden sm:flex items-center gap-2 bg-amber-900/40 text-amber-200 px-3 py-0.5 rounded-full border border-amber-800/50 text-[10px] shadow-inner ml-4";
    }
}

async function togglePaymentGateway() {
    const isChecked = document.getElementById('paymentGatewayToggle').checked;
    const statusText = isChecked ? 'OPEN' : 'CLOSED';

    const res = await Swal.fire({
        title: 'Payment Gateway',
        text: `You are about to switch the Remita Portal to ${statusText}.`,
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#005A36',
        confirmButtonText: 'Yes, Confirm'
    });

    if (res.isConfirmed) {
        await fetch(`${ENV.API_BASE_URL}/api/config/save`, {
            method: 'POST',
            headers: window.getAuthHeaders(),
            body: JSON.stringify({ 'guss_payment_gateway_status': statusText })
        }).catch(e => console.error("Gateway status sync warning:", e));

        localStorage.setItem('guss_payment_gateway_status', statusText);
        evaluateFinancialDeadline();
        Swal.fire('Updated', `Remita Payment Gateway is now ${statusText} for all students.`, 'success');
    } else {
        document.getElementById('paymentGatewayToggle').checked = !isChecked;
    }
}

async function setFinancialDeadline() {
    const date = document.getElementById('financeDeadlineInput').value;
    if (!date) return Swal.fire('Validation Error', "Please select a valid deadline date.", 'error');

    await fetch(`${ENV.API_BASE_URL}/api/config/save`, {
        method: 'POST',
        headers: window.getAuthHeaders(),
        body: JSON.stringify({ 'guss_payment_deadline': date })
    }).catch(e => console.error("Payment deadline sync warning:", e));

    localStorage.setItem('guss_payment_deadline', date);
    evaluateFinancialDeadline();
    Swal.fire('Enforced', "Financial deadline enforced globally.", 'success');
}

function pushBursaryAnnouncement() {
    const input = document.getElementById('bursaryBroadcastInput');
    const text = input.value.trim();
    if (!text) return Swal.fire('Validation Error', "Please enter an announcement to broadcast.", 'warning');

    let announcements = JSON.parse(localStorage.getItem('guss_system_announcements')) || [];
    announcements.unshift(`[BURSARY] ${text}`);
    if (announcements.length > 4) announcements.pop();

    localStorage.setItem('guss_system_announcements', JSON.stringify(announcements));
    input.value = '';
    Swal.fire('Broadcast Live', "Financial notice successfully transmitted to all Student Portals.", 'success');
}

/* =========================================================
   TAB 1: FEE SCHEDULES (SECTIONAL)
   ========================================================= */
async function saveFeeSchedule() {
    const scope = document.getElementById('scheduleScope').value;
    const tuition = parseFloat(document.getElementById('feeTuition').value) || 0;
    const boarding = parseFloat(document.getElementById('feeBoarding').value) || 0;
    const pta = parseFloat(document.getElementById('feePTA').value) || 0;
    const medical = parseFloat(document.getElementById('feeMedical').value) || 0;

    const total = tuition + boarding + pta + medical;

    let schedules = JSON.parse(localStorage.getItem('guss_bursary_schedules')) || [];
    const existingIdx = schedules.findIndex(s => s.scope === scope);

    const payload = { scope, tuition, boarding, pta, medical, total };
    if (existingIdx > -1) schedules[existingIdx] = payload; else schedules.push(payload);

    await fetch(`${ENV.API_BASE_URL}/api/config/save`, {
        method: 'POST',
        headers: window.getAuthHeaders(),
        body: JSON.stringify({ 'guss_bursary_schedules': JSON.stringify(schedules) })
    }).catch(e => console.error("Fee schedule cloud save warning:", e));

    localStorage.setItem('guss_bursary_schedules', JSON.stringify(schedules));
    Swal.fire('Deployed', `${scope} fee template successfully deployed to central registry.`, 'success');

    document.getElementById('newTemplateForm').classList.add('hidden');
    renderFeeSchedules();
}

function renderFeeSchedules() {
    const schedules = JSON.parse(localStorage.getItem('guss_bursary_schedules')) || [];
    const grid = document.getElementById('schedulesGrid');
    if (!grid) return;

    grid.innerHTML = '';

    if (schedules.length === 0) {
        grid.innerHTML = `<div class="col-span-2 text-center py-8 text-slate-400 font-bold text-xs"><i class="fa-solid fa-file-invoice block text-3xl mb-3 opacity-30"></i> No billing templates configured.</div>`;
        return;
    }

    schedules.forEach((sch) => {
        grid.innerHTML += `
            <div class="border border-slate-200 rounded-2xl p-5 hover:shadow-md transition-shadow bg-slate-50 relative overflow-hidden">
                <div class="absolute top-0 right-0 bg-emerald-500 text-white text-[9px] font-black uppercase tracking-widest px-3 py-1 rounded-bl-lg">Active</div>
                <h3 class="font-black text-slate-800 uppercase tracking-wide text-sm mb-4 pr-12"><i class="fa-solid fa-layer-group text-slate-400 mr-1"></i> ${DOMPurify.sanitize(sch.scope)}</h3>
                <div class="space-y-2 mb-4 border-b border-slate-200 pb-4">
                    <div class="flex justify-between text-xs font-medium"><span class="text-slate-500">Tuition Fee</span><span class="font-mono text-slate-800">₦${sch.tuition.toLocaleString()}</span></div>
                    <div class="flex justify-between text-xs font-medium"><span class="text-slate-500">Boarding Maintenance</span><span class="font-mono text-slate-800">₦${sch.boarding.toLocaleString()}</span></div>
                    <div class="flex justify-between text-xs font-medium"><span class="text-slate-500">PTA Levy</span><span class="font-mono text-slate-800">₦${sch.pta.toLocaleString()}</span></div>
                    <div class="flex justify-between text-xs font-medium"><span class="text-slate-500">Medical Levy</span><span class="font-mono text-slate-800">₦${sch.medical.toLocaleString()}</span></div>
                </div>
                <div class="flex justify-between items-center">
                    <span class="text-[10px] font-black uppercase tracking-widest text-slate-400">Total Grand Sum</span>
                    <span class="text-lg font-black text-gussGreen font-mono">₦${sch.total.toLocaleString()}</span>
                </div>
            </div>
        `;
    });
}

/* =========================================================
   TAB 2: VERIFICATION AUDIT LEDGER
   ========================================================= */
function renderAuditLedger() {
    const students = getDynamicRoster();
    const ledgerBody = document.getElementById('ledgerBody');
    if (!ledgerBody) return;

    const paymentRecords = JSON.parse(localStorage.getItem('guss_term_payments')) || {};
    const schedules = JSON.parse(localStorage.getItem('guss_bursary_schedules')) || [];

    ledgerBody.innerHTML = '';
    let pendingCount = 0;

    students.forEach(student => {
        const record = paymentRecords[student.admNo];
        if (!record) return;

        let targetScope = getStudentFeeScope(student);
        let expectedSch = schedules.find(s => s.scope === targetScope);
        let expectedAmount = expectedSch ? expectedSch.total : 0;

        let isVerified = record.status === 'VERIFIED';
        if (!isVerified) pendingCount++;

        let statusBadge = isVerified
            ? `<span class="bg-emerald-100 text-emerald-800 px-2 py-1 rounded text-[9px] font-black uppercase tracking-widest border border-emerald-200"><i class="fa-solid fa-check-double mr-1"></i> Verified</span>`
            : `<span class="bg-amber-100 text-amber-800 px-2 py-1 rounded text-[9px] font-black uppercase tracking-widest border border-amber-200"><i class="fa-solid fa-spinner fa-spin mr-1"></i> Pending Verif.</span>`;

        let actionBtn = isVerified
            ? `<span class="text-[10px] text-slate-400 font-bold uppercase tracking-widest"><i class="fa-solid fa-lock"></i> Secured</span>`
            : `<button onclick="verifyStudentPayment('${DOMPurify.sanitize(student.admNo)}')" class="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-[9px] font-black uppercase tracking-wider transition-colors shadow-sm"><i class="fa-solid fa-check"></i> Verify Drop</button>`;

        ledgerBody.innerHTML += `
            <tr class="hover:bg-slate-50 transition-colors ledger-row">
                <td class="py-3 px-4">
                    <div class="font-black text-slate-800 text-xs uppercase">${DOMPurify.sanitize(student.name)}</div>
                    <div class="text-[9px] font-mono text-slate-500 student-id-search">${DOMPurify.sanitize(student.admNo)}</div>
                </td>
                <td class="py-3 px-4 text-xs font-bold text-slate-600">${DOMPurify.sanitize(targetScope)}</td>
                <td class="py-3 px-4 font-mono font-bold text-blue-700 text-xs rrr-search">${DOMPurify.sanitize(record.rrr)}</td>
                <td class="py-3 px-4 font-mono font-black text-gussNavy">₦${expectedAmount.toLocaleString()}</td>
                <td class="py-3 px-4 text-center">${statusBadge}</td>
                <td class="py-3 px-4 text-right">${actionBtn}</td>
            </tr>
        `;
    });

    if (ledgerBody.innerHTML === '') {
        ledgerBody.innerHTML = `<tr><td colspan="6" class="py-12 text-center text-slate-400 font-bold text-xs"><i class="fa-solid fa-inbox text-3xl mb-3 opacity-30 block"></i> No payments have been initiated by students.</td></tr>`;
    }

    const verifyBadge = document.getElementById('pendingVerificationCount');
    if (verifyBadge) verifyBadge.textContent = `${pendingCount} Student(s)`;

    calculateTotalRevenue();
}

function filterLedger() {
    const query = document.getElementById('ledgerSearchInput').value.toLowerCase();
    document.querySelectorAll('.ledger-row').forEach(row => {
        const idText = row.querySelector('.student-id-search').innerText.toLowerCase();
        const rrrText = row.querySelector('.rrr-search').innerText.toLowerCase();
        row.style.display = (idText.includes(query) || rrrText.includes(query)) ? '' : 'none';
    });
}

async function verifyStudentPayment(admNo) {
    const res = await Swal.fire({
        title: 'Verify Payment',
        text: `Verify bank drop for ${admNo}? This action officially clears the student's financial obligation.`,
        icon: 'question',
        showCancelButton: true,
        confirmButtonColor: '#2563eb',
        confirmButtonText: 'Yes, Verify'
    });

    if (!res.isConfirmed) return;

    let paymentRecords = JSON.parse(localStorage.getItem('guss_term_payments')) || {};
    if (paymentRecords[admNo]) {
        paymentRecords[admNo].status = 'VERIFIED';

        await fetch(`${ENV.API_BASE_URL}/api/config/save`, {
            method: 'POST',
            headers: window.getAuthHeaders(),
            body: JSON.stringify({ 'guss_term_payments': JSON.stringify(paymentRecords) })
        }).catch(e => console.error("Payment verification sync warning:", e));

        localStorage.setItem('guss_term_payments', JSON.stringify(paymentRecords));
    }

    Swal.fire('Verified', `Payment verification successful for ${admNo}.`, 'success');
    renderAuditLedger();
    renderDefaultersMatrix();
    liftFinancialPenaltyIfPaid(admNo);
}

function calculateTotalRevenue() {
    const students = getDynamicRoster();
    const paymentRecords = JSON.parse(localStorage.getItem('guss_term_payments')) || {};
    const schedules = JSON.parse(localStorage.getItem('guss_bursary_schedules')) || [];

    let totalRev = 0;

    students.forEach(student => {
        const record = paymentRecords[student.admNo];
        if (record && record.status === 'VERIFIED') {
            let targetScope = getStudentFeeScope(student);
            let expectedSch = schedules.find(s => s.scope === targetScope);
            if (expectedSch) totalRev += expectedSch.total;
        }
    });

    const revMetrics = document.getElementById('totalRevenueMetrics');
    if (revMetrics) revMetrics.textContent = `₦${totalRev.toLocaleString()}`;
}

/* =========================================================
   TAB 3: DEFAULTERS MATRIX & CHIEF EXAMINER SYNC
   ========================================================= */
function renderDefaultersMatrix() {
    const students = getDynamicRoster();
    const defaultersBody = document.getElementById('defaultersBody');
    if (!defaultersBody) return;

    const paymentRecords = JSON.parse(localStorage.getItem('guss_term_payments')) || {};
    const schedules = JSON.parse(localStorage.getItem('guss_bursary_schedules')) || [];

    defaultersBody.innerHTML = '';
    let defaulterCount = 0;

    students.forEach(student => {
        const record = paymentRecords[student.admNo];
        if (!record || record.status !== 'VERIFIED') {
            defaulterCount++;

            let targetScope = getStudentFeeScope(student);
            let expectedSch = schedules.find(s => s.scope === targetScope);
            let expectedAmount = expectedSch ? expectedSch.total : 0;

            const configKey = `guss_config_${(student.assignedClass || "Unassigned").replace(/\s/g, '')}`;
            const config = JSON.parse(localStorage.getItem(configKey)) || {};
            const isEnforced = config.withheldStudents && config.withheldStudents.find(s => s.id === student.admNo);

            let statusBadge = isEnforced
                ? `<span class="bg-red-100 text-red-800 px-2 py-1 rounded text-[9px] font-black uppercase tracking-widest border border-red-200"><i class="fa-solid fa-lock mr-1"></i> Result Withheld</span>`
                : `<span class="bg-slate-100 text-slate-500 px-2 py-1 rounded text-[9px] font-black uppercase tracking-widest border border-slate-200"><i class="fa-solid fa-unlock mr-1"></i> No Penalty Active</span>`;

            let actionBtn = isEnforced
                ? `<span class="text-[10px] text-red-400 font-bold uppercase tracking-widest"><i class="fa-solid fa-shield-halved"></i> Enforced</span>`
                : `<button onclick="enforceDefaulterPenalty('${DOMPurify.sanitize(student.admNo)}', '${DOMPurify.sanitize(student.assignedClass || "Unassigned")}')" class="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg text-[9px] font-black uppercase tracking-wider transition-colors shadow-sm"><i class="fa-solid fa-gavel mr-1"></i> Enforce Withhold</button>`;

            defaultersBody.innerHTML += `
                <tr class="hover:bg-red-50/50 transition-colors">
                    <td class="py-3 px-4">
                        <div class="font-black text-slate-800 text-xs uppercase">${DOMPurify.sanitize(student.name)}</div>
                        <div class="text-[9px] font-mono text-slate-500">${DOMPurify.sanitize(student.admNo)}</div>
                    </td>
                    <td class="py-3 px-4 text-xs font-bold text-slate-600">${DOMPurify.sanitize(student.assignedClass || 'Unassigned')}</td>
                    <td class="py-3 px-4 font-mono font-black text-red-700">₦${expectedAmount.toLocaleString()}</td>
                    <td class="py-3 px-4 text-center">${statusBadge}</td>
                    <td class="py-3 px-4 text-right">${actionBtn}</td>
                </tr>
            `;
        }
    });

    if (defaulterCount === 0) {
        defaultersBody.innerHTML = `<tr><td colspan="5" class="py-12 text-center text-emerald-600 font-bold text-xs"><i class="fa-solid fa-shield-check text-3xl mb-3 opacity-50 block"></i> All students have cleared their financial obligations.</td></tr>`;
    }
}

async function enforceDefaulterPenalty(admNo, className) {
    if (!className || className === 'Unassigned') return Swal.fire('Error', 'Student has no assigned class to attach config to.', 'error');

    const res = await Swal.fire({
        title: 'Enforce Arrears Penalty',
        text: `Are you sure you want to enforce a penalty on ${admNo}? This will instantly flag them in the Chief Examiner's registry.`,
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#ef4444',
        confirmButtonText: 'Yes, Enforce'
    });

    if (!res.isConfirmed) return;

    const configKey = `guss_config_${className.replace(/\s/g, '')}`;
    let config = JSON.parse(localStorage.getItem(configKey)) || { withholdClass: false, withheldStudents: [], studentDeadlines: {} };
    if (!config.withheldStudents) config.withheldStudents = [];

    const idx = config.withheldStudents.findIndex(s => s.id === admNo);
    if (idx === -1) {
        config.withheldStudents.push({ id: admNo, reason: "Bursary Hold: Outstanding Arrears" });

        await fetch(`${ENV.API_BASE_URL}/api/config/save`, {
            method: 'POST',
            headers: window.getAuthHeaders(),
            body: JSON.stringify({ [configKey]: JSON.stringify(config) })
        }).catch(e => console.error("Defaulter penalty sync warning:", e));

        localStorage.setItem(configKey, JSON.stringify(config));
        Swal.fire('Enforced', `Defaulter ${admNo} has been legally flagged!`, 'success');
    }
    renderDefaultersMatrix();
}

async function liftFinancialPenaltyIfPaid(admNo) {
    const students = getDynamicRoster();
    const student = students.find(s => s.admNo === admNo);
    if (!student || !student.assignedClass || student.assignedClass === 'Unassigned') return;

    const configKey = `guss_config_${student.assignedClass.replace(/\s/g, '')}`;
    let config = JSON.parse(localStorage.getItem(configKey));

    if (config && config.withheldStudents) {
        const initialLen = config.withheldStudents.length;
        config.withheldStudents = config.withheldStudents.filter(s => !(s.id === admNo && s.reason.includes("Bursary Hold")));

        if (config.withheldStudents.length < initialLen) {
            await fetch(`${ENV.API_BASE_URL}/api/config/save`, {
                method: 'POST',
                headers: window.getAuthHeaders(),
                body: JSON.stringify({ [configKey]: JSON.stringify(config) })
            }).catch(e => console.error("Penalty lift sync warning:", e));

            localStorage.setItem(configKey, JSON.stringify(config));
        }
    }
}

// ================= IAM APP SWITCHER, COMMS & LEAVE =================
function checkMultiRoleAccess() {
    if (!activeBursarId) return;

    let roles = [];
    const allocDB = JSON.parse(localStorage.getItem('guss_teacher_allocations')) || {};
    const fmDB = JSON.parse(localStorage.getItem('guss_form_masters')) || {};
    const delegations = JSON.parse(localStorage.getItem('guss_delegations')) || {};

    let isTeacher = false;
    Object.values(allocDB).forEach(cls => { if (Array.isArray(cls) && cls.some(a => a.staffId === activeBursarId)) isTeacher = true; });
    if (isTeacher) roles.push({ name: "Teacher Portal", url: "teacher_grading.html", icon: "fa-chalkboard-user" });

    let isFormMaster = Object.values(fmDB).some(fm => fm.staffId === activeBursarId);
    if (isFormMaster) roles.push({ name: "Form Master Portal", url: "form_master.html", icon: "fa-users-rectangle" });

    if (delegations['CHIEF_EXAMINER'] && delegations['CHIEF_EXAMINER'].staffId === activeBursarId) {
        roles.push({ name: "Chief Examiner Portal", url: "chief_examiner.html", icon: "fa-scale-balanced" });
    }

    if (roles.length > 0) {
        const switcher = document.getElementById('multiRoleSwitcher');
        if (switcher) switcher.classList.remove('hidden');

        const dropdown = document.getElementById('appSwitcherDropdown');
        if (dropdown) {
            dropdown.innerHTML = '';
            roles.forEach(role => {
                dropdown.innerHTML += `
                    <a href="${role.url}" class="block px-4 py-2 text-xs font-bold text-slate-700 hover:bg-purple-50 hover:text-purple-700 transition-colors uppercase tracking-widest">
                        <i class="fa-solid ${role.icon} mr-2"></i> ${role.name}
                    </a>`;
            });
        }
    }
}

function toggleAppSwitcher() {
    const dd = document.getElementById('appSwitcherDropdown');
    if (dd) dd.classList.toggle('hidden');
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

// ================= TIME MACHINE LOGIC =================
async function executeTermArchiving() {
    const currentSession = localStorage.getItem('guss_academic_session') || "2026/2027 SESSION | 1ST TERM";

    const res = await Swal.fire({
        title: 'Archive Financial Ledger',
        text: `CRITICAL: You are about to permanently archive all Financial Records and Payment Receipts for ${currentSession}. This will reset the ledger for the new term. Proceed?`,
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#0f172a',
        confirmButtonText: 'Yes, Archive'
    });

    if (res.isConfirmed) {
        const archivePayload = {
            sessionName: currentSession,
            timestamp: new Date().toISOString(),
            dataDump: {}
        };

        const keysToWipe = ['guss_term_payments'];
        keysToWipe.forEach(key => {
            archivePayload.dataDump[key] = localStorage.getItem(key);
            localStorage.removeItem(key);
        });

        const archiveId = `guss_archive_fin_${new Date().getTime()}`;
        localStorage.setItem(archiveId, JSON.stringify(archivePayload));

        Swal.fire('Archived', `Success: Financial records for ${currentSession} have been archived.`, 'success').then(() => {
            window.location.reload();
        });
    }
}

let tmArchives = {};
let tmSelectedSession = null;

document.addEventListener('click', (e) => {
    if (!e.target.closest('#timeMachineWidget')) {
        document.getElementById('tmSessionDropdown')?.classList.add('hidden');
        document.getElementById('tmTermDropdown')?.classList.add('hidden');
    }
});

function toggleTmDropdown(dropdownId) {
    const target = document.getElementById(dropdownId);
    if (!target) return;
    if (dropdownId === 'tmSessionDropdown') document.getElementById('tmTermDropdown').classList.add('hidden');
    else document.getElementById('tmSessionDropdown').classList.add('hidden');
    target.classList.toggle('hidden');
}

function initializeTimeMachine() {
    tmArchives = {};
    Object.keys(localStorage).forEach(key => {
        if (key.startsWith('guss_archive_fin_')) {
            const data = JSON.parse(localStorage.getItem(key)) || {};
            const sessionStr = data.sessionName || "Unknown Financial Archive";
            const parts = sessionStr.split(' | ');
            const sessionYear = parts[0] ? parts[0].trim() : sessionStr;
            const termName = parts[1] ? parts[1].trim() : "Archived Record";

            if (!tmArchives[sessionYear]) tmArchives[sessionYear] = [];
            tmArchives[sessionYear].push({ key: key, term: termName });
        }
    });
    renderTmSessionMenu();
    activateLiveSession();
}

function renderTmSessionMenu() {
    const menu = document.getElementById('tmSessionDropdown');
    if (!menu) return;
    menu.innerHTML = '';
    const sessions = Object.keys(tmArchives).sort().reverse();
    if (sessions.length === 0) {
        menu.innerHTML = `<div class="px-4 py-3 text-[10px] text-slate-400 font-bold text-center">No Archives Found</div>`;
        return;
    }
    sessions.forEach(session => {
        const isSelected = tmSelectedSession === session;
        const btn = document.createElement('button');
        btn.className = `w-full text-left px-4 py-2.5 text-[11px] font-black tracking-wide transition-colors flex justify-between items-center ${isSelected ? 'bg-emerald-50 text-emerald-700' : 'text-slate-700 hover:bg-slate-50'}`;
        btn.innerHTML = `<span>${DOMPurify.sanitize(session)}</span> ${isSelected ? '<i class="fa-solid fa-check text-emerald-500"></i>' : ''}`;
        btn.onclick = () => { selectTmSession(session); toggleTmDropdown('tmSessionDropdown'); };
        menu.appendChild(btn);
    });
}

function selectTmSession(sessionYear) {
    tmSelectedSession = sessionYear;
    document.getElementById('tmSessionText').textContent = sessionYear;
    document.getElementById('tmSessionText').classList.add('text-white');
    const liveBtn = document.getElementById('tmLiveBtn');
    if (liveBtn) {
        liveBtn.className = "bg-slate-800 text-slate-400 hover:text-white hover:bg-slate-700 px-3 py-1.5 rounded-md text-[10px] font-black uppercase tracking-widest transition-colors flex items-center gap-1.5";
        liveBtn.innerHTML = `<i class="fa-solid fa-satellite-dish mr-1"></i> Live`;
    }
    const termTrigger = document.getElementById('tmTermTriggerBtn');
    if (termTrigger) {
        termTrigger.disabled = false;
        termTrigger.className = "text-slate-200 hover:text-white hover:bg-slate-800 px-3 py-1.5 rounded-md text-[10px] font-black uppercase tracking-widest transition-colors flex items-center gap-2 cursor-pointer border border-emerald-500/30 bg-emerald-900/20";
    }
    document.getElementById('tmTermText').textContent = "Select Term";
    renderTmTermMenu();
}

function renderTmTermMenu() {
    const menu = document.getElementById('tmTermDropdown');
    menu.innerHTML = '';
    const terms = tmArchives[tmSelectedSession] || [];
    terms.forEach(termObj => {
        const isSelected = activeArchiveView === termObj.key;
        const btn = document.createElement('button');
        btn.className = `w-full text-left px-4 py-2.5 text-[11px] font-black tracking-wide transition-colors flex justify-between items-center ${isSelected ? 'bg-emerald-50 text-emerald-700' : 'text-slate-700 hover:bg-slate-50'}`;
        btn.innerHTML = `<span>${DOMPurify.sanitize(termObj.term)}</span> ${isSelected ? '<i class="fa-solid fa-check text-emerald-500"></i>' : ''}`;
        btn.onclick = () => { engageTimeMachine(termObj.key, termObj.term); toggleTmDropdown('tmTermDropdown'); };
        menu.appendChild(btn);
    });
}

function engageTimeMachine(archiveKey, termName) {
    activeArchiveView = archiveKey;
    document.getElementById('tmTermText').textContent = termName;
    document.getElementById('tmTermText').classList.add('text-emerald-400');
    renderTmSessionMenu();
    renderTmTermMenu();
    document.getElementById('academicSessionDisplay').innerHTML = `<i class="fa-solid fa-lock mr-1"></i> ARCHIVE VIEW ACTIVE`;
    document.getElementById('academicSessionDisplay').className = "text-emerald-400 hidden lg:inline border-l border-slate-700 pl-4";
    applyArchiveReadonlyState(true);
}

function activateLiveSession() {
    activeArchiveView = 'LIVE';
    tmSelectedSession = null;
    document.getElementById('tmSessionText').textContent = "Select Session";
    document.getElementById('tmSessionText').classList.remove('text-white');
    document.getElementById('tmTermText').textContent = "Term";
    document.getElementById('tmTermText').classList.remove('text-emerald-400');
    const liveBtn = document.getElementById('tmLiveBtn');
    if (liveBtn) {
        liveBtn.className = "bg-gussNavy text-gussGold px-3 py-1.5 rounded-md text-[10px] font-black uppercase tracking-widest shadow-sm border border-slate-600 transition-colors flex items-center gap-1.5";
        liveBtn.innerHTML = `<span class="relative flex h-2 w-2 mr-1"><span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span><span class="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span></span>Live`;
    }
    const termTrigger = document.getElementById('tmTermTriggerBtn');
    if (termTrigger) {
        termTrigger.disabled = true;
        termTrigger.className = "text-slate-600 px-3 py-1.5 rounded-md text-[10px] font-black uppercase tracking-widest transition-colors flex items-center gap-2 cursor-not-allowed";
    }

    const display = document.getElementById('academicSessionDisplay');
    if (display) display.textContent = localStorage.getItem('guss_academic_session') || "2026/2027 SESSION | 1ST TERM";
    if (display) display.className = "text-gussGold hidden lg:inline border-l border-slate-700 pl-3";

    renderTmSessionMenu();
    applyArchiveReadonlyState(false);
}

function applyArchiveReadonlyState(isArchived) {
    const mainContent = document.querySelector('main');
    if (!mainContent) return;
    const inputs = mainContent.querySelectorAll('input, select, button:not([id^="tabBtn"])');
    if (isArchived) {
        mainContent.classList.add('grayscale', 'opacity-90');
        inputs.forEach(el => {
            if (!el.disabled) { el.setAttribute('data-archived-disabled', 'true'); el.disabled = true; el.classList.add('opacity-50', 'cursor-not-allowed'); }
        });
    } else {
        mainContent.classList.remove('grayscale', 'opacity-90');
        inputs.forEach(el => {
            if (el.hasAttribute('data-archived-disabled')) { el.disabled = false; el.classList.remove('opacity-50', 'cursor-not-allowed'); el.removeAttribute('data-archived-disabled'); }
        });
    }
}

// =====================================================================
//  ENTERPRISE CROSS-PORTAL NAVIGATION ENGINE (V2: ALL ROLES)
// =====================================================================
document.addEventListener('DOMContentLoaded', () => {
    setTimeout(initializeRoleSwitcher, 1000);
});

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
    let myPortals = [];

    // Lock in the active portal
    if (window.location.pathname.includes('admission_officer.html')) myPortals.push(portalMap["ADMISSIONS_OFFICER"]);
    else if (window.location.pathname.includes('director_terminal.html')) myPortals.push(portalMap["DIRECTOR"]);
    else if (window.location.pathname.includes('ict_registry.html')) myPortals.push(portalMap["ICT_ADMIN"]);

    // Fetch relational roles from the bridge!
    try {
        // Fetch Statutory Roles
        const statRes = await fetch(`${ENV.API_BASE_URL}/api/bridge/staff-portals?staffId=${encodeURIComponent(staffId)}`, { headers: typeof window.getAuthHeaders === 'function' ? window.getAuthHeaders() : getAuthHeaders() });
        if (statRes.ok) {
            const assignedRoles = await statRes.json();
            assignedRoles.forEach(roleKey => {
                let normalized = roleKey.toUpperCase().replace("GUSS_STATUTORY_", "").replace("GUSS_", "");
                if (portalMap[normalized]) myPortals.push(portalMap[normalized]);
                if (portalMap["ROLE_" + normalized]) myPortals.push(portalMap["ROLE_" + normalized]);
            });
        }

        // Fetch Operational Roles (Teacher, Form Master, Warden)
        const opRes = await fetch(`${ENV.API_BASE_URL}/api/ict/operational/staff?staffId=${encodeURIComponent(staffId)}`, { headers: typeof window.getAuthHeaders === 'function' ? window.getAuthHeaders() : getAuthHeaders() });
        if (opRes.ok) {
            const opRoles = await opRes.json();
            opRoles.forEach(roleObj => {
                if (portalMap[roleObj.type]) myPortals.push(portalMap[roleObj.type]);
            });
        }
    } catch (e) {
        console.warn("Could not fetch relational portals.");
    }

    myPortals.push({ title: "Staff Command Center", url: "staff_portal.html", icon: "fa-id-badge" });
    myPortals = [...new Map(myPortals.map(item => [item.url, item])).values()];

    if (myPortals.length > 1) deployFloatingSwitcherUI(myPortals);
}

function deployFloatingSwitcherUI(portals) {
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
            <a href="${p.url}" class="flex items-center gap-3 px-3 py-3 rounded-xl text-xs font-bold transition-all ${isActive ? 'bg-gussGreen text-white shadow-md' : 'text-slate-600 hover:bg-slate-50 hover:text-gussNavy border border-transparent hover:border-slate-200'}">
                <div class="w-8 h-8 rounded-full flex items-center justify-center ${isActive ? 'bg-emerald-500 text-white' : 'bg-slate-100 text-slate-500'}">
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

    //  HOLD-TO-DRAG LOGIC
    const handle = document.getElementById('roleSwitcherDragHandle');
    const menu = document.getElementById('roleSwitcherMenu');

    let isDragging = false;
    let isHoldTriggered = false;
    let holdTimeout = null;

    let currentX = 0, currentY = 0, initialX = 0, initialY = 0;
    let xOffset = 0, yOffset = 0;

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

            // Wait 300ms before allowing a drag
            holdTimeout = setTimeout(() => {
                isHoldTriggered = true;
                // Visual cue that the button is now draggable
                handle.classList.add('scale-110', 'ring-4', 'ring-gussGold/50', 'cursor-grabbing');
            }, 300);
        }
    }

    function drag(e) {
        if (isHoldTriggered) {
            isDragging = true;
            e.preventDefault(); // Stop screen scrolling while dragging

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
            menu.classList.add('hidden'); // Ensure menu hides while dragging
        }
    }

    function dragEnd(e) {
        // Clear the timeout if the user released early (a normal click)
        clearTimeout(holdTimeout);

        // Remove visual drag cues
        handle.classList.remove('scale-110', 'ring-4', 'ring-gussGold/50', 'cursor-grabbing');

        if (!isHoldTriggered && !isDragging) {
            // It was a quick tap/click, toggle the menu!
            if (e.target === handle || handle.contains(e.target)) {
                menu.classList.toggle('hidden');
            }
        }

        if (isDragging) {
            initialX = currentX;
            initialY = currentY;
        }

        isDragging = false;
        isHoldTriggered = false;
    }

    // Attach Event Listeners
    document.addEventListener("touchstart", dragStart, { passive: false });
    document.addEventListener("touchend", dragEnd, false);
    document.addEventListener("touchmove", drag, { passive: false });

    document.addEventListener("mousedown", dragStart, false);
    document.addEventListener("mouseup", dragEnd, false);
    document.addEventListener("mousemove", drag, false);
}