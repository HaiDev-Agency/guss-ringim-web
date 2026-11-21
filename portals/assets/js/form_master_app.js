// =====================================================================
// G.U.S.S. RINGIM — FORM MASTER CONTROLLER
// ENTERPRISE HARDENED SPECIFICATION
// =====================================================================
import { ENV } from './core_config.js';
import { ApiGateway } from './api_gateway.js';
import { SessionManager } from './session_manager.js';
import { CoreUI } from './core_ui.js';

window.resolveMediaUrl = function (url) {
    if (!url) return '';
    if (url.startsWith('http') || url.startsWith('data:')) return url;
    let cleanUrl = url.replace(/^\/+/, '');
    if (!cleanUrl.startsWith('uploads/')) cleanUrl = 'uploads/' + cleanUrl;
    return `${ENV.API_BASE_URL}/${cleanUrl}`;
};

// ==========================================
// 1. GLOBAL VARIABLES & IDENTITY
// ==========================================
let activeStaffId = sessionStorage.getItem('guss_staff_id');
let activeStaffName = sessionStorage.getItem('guss_user_name') || "Valued Staff";
let currentlyEvaluatingId = null;
let RAM_VAULT = {};
let currentClassRoster = [];

// ==========================================
// 100% RELATIONAL STATE SYNCHRONIZATION 
// ==========================================
async function syncPostgresToLocal() {
    try {
        const epochRes = await ApiGateway.get('/director/epoch/current').catch(() => null);
        if (epochRes) {
            RAM_VAULT['current_epoch'] = epochRes;
        }
    } catch (error) { console.error("Critical Cloud Sync Error:", error); }
}

window.onload = async function () {
    // 1. Boot Global UI Components (Role Switcher & Network Monitor)
    CoreUI.init();

    // 2. Boot Time Machine Header Dropdown
    await SessionManager.initHeaderDropdown();

    // 3. Hydrate Terminal Data
    await syncPostgresToLocal();
    resolveFormMasterIdentity();
    enforceFormMasterAllocations();
    evaluateTemporalLock();
};

//  LISTEN FOR TIME TRAVEL
window.addEventListener('gussTimeMachineChanged', () => {
    if (document.getElementById('fmClassSelector').value) {
        window.initializeFormMasterDashboard();
    }
});

function resolveFormMasterIdentity() {
    if (!activeStaffId) {
        document.getElementById('activeFormMasterNameDisplay').textContent = "UNAUTHORIZED ACCESS";
        Swal.fire('Authentication Error', 'Identity resolution failed. Please log in again.', 'error').then(() => {
            window.location.href = 'staff_login.html';
        });
        return;
    }
    document.getElementById('activeFormMasterNameDisplay').textContent = DOMPurify.sanitize(activeStaffName);
}

// ================= DYNAMIC WORKLOAD (RELATIONAL BACKEND) =================
async function enforceFormMasterAllocations() {
    if (!activeStaffId) return;
    const classSelect = document.getElementById('fmClassSelector');
    if (!classSelect) return;

    try {
        const activeContext = SessionManager.getCurrentContextString();
        const myClasses = await ApiGateway.get(`/academics/form-master/my-class?session=${encodeURIComponent(activeContext)}`);

        const uniqueClasses = [...new Set(myClasses || [])];

        if (uniqueClasses.length === 0) {
            classSelect.innerHTML = '<option value="">No assigned class in this session</option>';
            return;
        }

        let html = '<option value="">Select Assigned Class...</option>';
        uniqueClasses.forEach(cls => {
            html += `<option value="${DOMPurify.sanitize(cls)}">${DOMPurify.sanitize(cls)}</option>`;
        });
        classSelect.innerHTML = html;

        //   Auto-select the first class and trigger the dashboard load
        if (uniqueClasses.length > 0) {
            classSelect.value = uniqueClasses[0];
            window.initializeFormMasterDashboard();
        }

    } catch (e) {
        classSelect.innerHTML = '<option value="">No classes assigned in this epoch</option>';
    }
}

// ================= THE AUDIT MATRIX (SERVER-SIDE NATIVE) =================
window.loadTeacherAuditMatrix = async function () {
    const selectedClassSelector = document.getElementById('fmClassSelector');
    if (!selectedClassSelector) return;
    const selectedClass = selectedClassSelector.value;
    const auditBody = document.getElementById('auditMatrixBody');

    if (!selectedClass) { auditBody.innerHTML = ''; return; }

    auditBody.innerHTML = `<tr><td colspan="5" class="py-12 text-center text-slate-400 font-bold text-xs"><i class="fa-solid fa-spinner fa-spin text-3xl mb-3 opacity-20 block"></i> Syncing granular grading progress with PostgreSQL...</td></tr>`;

    try {
        const activeContext = SessionManager.getCurrentContextString();
        const data = await ApiGateway.get(`/academics/form-master/audit?className=${encodeURIComponent(selectedClass)}&session=${encodeURIComponent(activeContext)}`);

        //   Strict null-checks to prevent silent TypeErrors and endless spinners
        if (!data || !data.audit || data.audit.length === 0 || data.totalStudents === 0) {
            auditBody.innerHTML = `<tr><td colspan="5" class="p-8 text-center text-slate-400 font-bold"><i class="fa-solid fa-folder-open text-3xl mb-2 block text-slate-300"></i> No registered subjects or students found for this class.</td></tr>`;
            return;
        }

        let htmlBuffer = '';
        const totalClassSize = data.totalStudents;

        data.audit.forEach((record, index) => {
            let badgeColor = record.status === "Submitted" ? "bg-emerald-100 text-emerald-800 border border-emerald-200" : (record.status === "In Progress" ? "bg-blue-100 text-blue-800 border border-blue-200" : "bg-slate-100 text-slate-600");
            let icon = record.status === "Submitted" ? "fa-check-double" : (record.status === "In Progress" ? "fa-spinner fa-spin" : "fa-clock");
            let barColor = record.progress === 100 ? "bg-emerald-500" : (record.progress > 0 ? "bg-blue-500" : "bg-slate-300");

            const detailsId = `audit-details-${index}`;

            //   Ensure missingCA and missingExam are arrays before mapping
            const missingCA = Array.isArray(record.missingCA) ? record.missingCA : [];
            const missingExam = Array.isArray(record.missingExam) ? record.missingExam : [];

            htmlBuffer += `
                <tr class="hover:bg-slate-50 transition-colors cursor-pointer group border-b border-slate-100" onclick="window.toggleAuditDetails('${detailsId}', this)">
                    <td class="py-4 px-4 font-black text-xs text-slate-800 uppercase flex items-center gap-2"><i class="fa-solid fa-chevron-right text-slate-300 group-hover:text-gussGreen transition-transform" id="icon-${detailsId}"></i> ${DOMPurify.sanitize(record.subject)}</td>
                    <td class="py-4 px-4 text-xs font-bold text-slate-600"><i class="fa-regular fa-user mr-1 text-slate-400"></i> ${DOMPurify.sanitize(record.teacher)}</td>
                    <td class="py-4 px-4 text-xs font-mono font-bold text-blue-600"><i class="fa-solid fa-phone mr-1"></i> ${DOMPurify.sanitize(record.phone)}</td>
                    <td class="py-4 px-4 text-center"><div class="flex items-center gap-2"><div class="w-full bg-slate-200 rounded-full h-1.5"><div class="${barColor} h-1.5 rounded-full" style="width: ${record.progress}%"></div></div><span class="text-[10px] font-black text-slate-500 w-8 text-right">${record.progress}%</span></div></td>
                    <td class="py-4 px-4 text-center"><span class="px-2 py-1 rounded text-[9px] font-black uppercase tracking-widest ${badgeColor}"><i class="fa-solid ${icon} mr-1"></i> ${record.status}</span></td>
                </tr>
            `;

            let pendingHtml = (missingCA.length === 0 && missingExam.length === 0)
                ? `<div class="flex items-center h-full"><span class="text-emerald-600 font-bold mt-2"><i class="fa-solid fa-check mr-1"></i> All student scripts natively marked.</span></div>`
                : `<div class="grid grid-cols-2 gap-2">
                    ${missingCA.length > 0 ? `<div class="pr-2"><span class="inline-block px-2 py-0.5 bg-red-50 text-red-700 border border-red-200 text-[8px] font-black uppercase tracking-widest rounded mb-1.5"><i class="fa-solid fa-triangle-exclamation mr-1"></i> Missing C.A. Scripts</span><ul class="list-disc pl-4 text-slate-600 text-[10px] font-medium space-y-0.5">${missingCA.map(n => `<li>${DOMPurify.sanitize(n)}</li>`).join('')}</ul></div>` : '<div></div>'}
                    ${missingExam.length > 0 ? `<div class="pl-2 border-l border-slate-100"><span class="inline-block px-2 py-0.5 bg-orange-50 text-orange-700 border border-orange-200 text-[8px] font-black uppercase tracking-widest rounded mb-1.5"><i class="fa-solid fa-triangle-exclamation mr-1"></i> Missing Exam Scripts</span><ul class="list-disc pl-4 text-slate-600 text-[10px] font-medium space-y-0.5">${missingExam.map(n => `<li>${DOMPurify.sanitize(n)}</li>`).join('')}</ul></div>` : '<div></div>'}
                   </div>`;

            htmlBuffer += `
                <tr id="${detailsId}" class="hidden bg-slate-50/80 shadow-inner border-b border-slate-200">
                    <td colspan="5" class="p-0">
                        <div class="p-5 border-l-4 border-gussNavy ml-4 my-2 rounded-r-xl bg-white shadow-sm flex flex-col md:flex-row gap-8">
                            <div class="flex-1 space-y-3">
                                <h5 class="text-[10px] font-black uppercase tracking-widest text-slate-500 border-b border-slate-100 pb-1">Relational Marking Audit</h5>
                                <div class="grid grid-cols-2 gap-4">
                                    <div class="bg-blue-50 border border-blue-100 p-2 rounded-lg text-center">
                                        <span class="block text-[9px] font-bold text-blue-800 uppercase mb-1">C.A. Scripts Natively Committed</span>
                                        <span class="text-xl font-black text-blue-900">${record.caCompleted}<span class="text-xs text-blue-400 font-bold"> / ${totalClassSize}</span></span>
                                    </div>
                                    <div class="bg-purple-50 border border-purple-100 p-2 rounded-lg text-center">
                                        <span class="block text-[9px] font-bold text-purple-800 uppercase mb-1">Exam Scripts Natively Committed</span>
                                        <span class="text-xl font-black text-purple-900">${record.examCompleted}<span class="text-xs text-purple-400 font-bold"> / ${totalClassSize}</span></span>
                                    </div>
                                </div>
                            </div>
                            <div class="flex-1 space-y-2">
                                <h5 class="text-[10px] font-black uppercase tracking-widest text-slate-500 border-b border-slate-100 pb-1">Pending Evaluation Breakdown</h5>
                                <div class="h-24 overflow-y-auto pr-2">${pendingHtml}</div>
                            </div>
                        </div>
                    </td>
                </tr>
            `;
        });
        auditBody.innerHTML = htmlBuffer;
    } catch (e) {
        auditBody.innerHTML = `<tr><td colspan="5" class="py-12 text-center text-red-400 font-bold text-xs"><i class="fa-solid fa-triangle-exclamation text-3xl mb-3 opacity-20 block"></i> Relational Connection Error.</td></tr>`;
    }
}

window.toggleAuditDetails = function (detailsId, rowElement) {
    const el = document.getElementById(detailsId);
    const icon = document.getElementById(`icon-${detailsId}`);
    if (el.classList.contains('hidden')) {
        el.classList.remove('hidden'); rowElement.classList.add('bg-slate-50'); icon.classList.add('rotate-90');
    } else {
        el.classList.add('hidden'); rowElement.classList.remove('bg-slate-50'); icon.classList.remove('rotate-90');
    }
}

// ================= PASTORAL EVALUATION MODULE (NATIVE) =================
function evaluateTemporalLock() {
    const banner = document.getElementById('extensionNotificationBanner');
    const reasonText = document.getElementById('extensionReasonText');
    const bannerIcon = document.getElementById('bannerIcon');
    const bannerTitle = document.getElementById('bannerTitle');
    const timerDisplay = document.getElementById('gradingTimerDisplay'); //   Grab the header badge

    const epoch = RAM_VAULT['current_epoch'] || {};
    const globalLockString = epoch.globalDeadline || `${new Date().getFullYear()}-12-31`;
    const globalReason = epoch.timelineNote || "Standard grading timeline active.";
    const temporalState = epoch.temporalState || "COMMENCED";
    const caStatus = epoch.caStatus || 'OPEN';
    const examStatus = epoch.examStatus || 'OPEN';

    // 1. Update the Main Page Banner
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
        } else if (temporalState === "SQUEEZED") {
            displayTitle = "URGENT: Deadline Squeezed";
            displayColor = "bg-red-50 border-red-400 text-red-800";
            iconColor = "text-red-500";
        }

        reasonText.innerHTML = `<div class="mb-2">${phaseNotice}</div><strong>${displayTitle}:</strong> ${DOMPurify.sanitize(globalReason)}`;

        banner.className = `${displayColor} border-l-4 p-4 rounded-r-xl shadow-sm animate-fade-in flex flex-col sm:flex-row items-start sm:items-center gap-4 mb-6`;
        if (bannerIcon) bannerIcon.className = `${iconColor} text-2xl mt-0.5`;
        if (bannerTitle) bannerTitle.className = "text-xs font-black uppercase tracking-widest mb-1";
    }

    // 2.   Update the Top Header Timer Badge
    if (timerDisplay) {
        if (!epoch.globalDeadline) {
            timerDisplay.innerHTML = `<i class="fa-solid fa-infinity text-blue-400"></i> Open Timeline`;
            timerDisplay.className = "hidden sm:flex items-center gap-2 bg-slate-800 border border-slate-700 text-blue-300 px-3 py-1 rounded-md text-[10px] shadow-inner";
        } else {
            const distance = new Date(epoch.globalDeadline + "T23:59:59").getTime() - new Date().getTime();
            if (distance < 0) {
                timerDisplay.innerHTML = `<i class="fa-solid fa-lock text-red-400"></i> SYSTEM LOCKED`;
                timerDisplay.className = "hidden sm:flex items-center gap-2 bg-slate-900/80 text-red-400 px-3 py-0.5 rounded-full border border-red-800/50 text-[10px]";
            } else {
                const days = Math.floor(distance / (1000 * 60 * 60 * 24));
                timerDisplay.innerHTML = `<i class="fa-solid fa-lock-open text-emerald-400"></i> ${days} Days Remaining`;
                timerDisplay.className = "hidden sm:flex items-center gap-2 bg-emerald-900/40 text-emerald-200 px-3 py-0.5 rounded-full border border-emerald-800/50 text-[10px]";
            }
        }
    }
}

window.switchTab = function (tabId) {
    const btnAudit = document.getElementById('tabBtnAudit');
    const btnEval = document.getElementById('tabBtnEval');
    const contentAudit = document.getElementById('tabContentAudit');
    const contentEval = document.getElementById('tabContentEval');

    if (!btnAudit || !btnEval || !contentAudit || !contentEval) return;

    btnAudit.className = "flex-1 sm:flex-none px-6 py-2 rounded-lg text-xs font-black uppercase tracking-wider transition-all text-slate-500 hover:text-gussNavy";
    btnEval.className = "flex-1 sm:flex-none px-6 py-2 rounded-lg text-xs font-black uppercase tracking-wider transition-all text-slate-500 hover:text-gussNavy";
    contentAudit.classList.add('hidden');
    contentEval.classList.add('hidden');

    if (tabId === 'audit') {
        btnAudit.className = "flex-1 sm:flex-none px-6 py-2 rounded-lg text-xs font-black uppercase tracking-wider transition-all bg-white shadow-sm text-gussNavy border border-slate-200";
        contentAudit.classList.remove('hidden');
        window.loadTeacherAuditMatrix();
    } else {
        btnEval.className = "flex-1 sm:flex-none px-6 py-2 rounded-lg text-xs font-black uppercase tracking-wider transition-all bg-white shadow-sm text-gussNavy border border-slate-200";
        contentEval.classList.remove('hidden');
    }
}

window.initializeFormMasterDashboard = function () {
    evaluateTemporalLock();
    window.loadTeacherAuditMatrix();
    window.loadFormMasterRoster();
}

window.loadFormMasterRoster = async function () {
    const selectedClassSelector = document.getElementById('fmClassSelector');
    if (!selectedClassSelector) return;
    const selectedClass = selectedClassSelector.value;
    const rosterList = document.getElementById('fmRosterList');

    if (!rosterList || !selectedClass) return;

    rosterList.innerHTML = `<div class="p-4 text-center text-slate-400 font-bold text-xs"><i class="fa-solid fa-spinner fa-spin"></i> Fetching Roster...</div>`;

    document.getElementById('noStudentPrompt')?.classList.remove('hidden');
    document.getElementById('evaluationFormBlock')?.classList.add('hidden');
    currentlyEvaluatingId = null;

    try {
        const activeContext = SessionManager.getCurrentContextString();
        const students = await ApiGateway.get(`/academics/form-master/roster?className=${encodeURIComponent(selectedClass)}&session=${encodeURIComponent(activeContext)}`);

        currentClassRoster = students;

        if (students.length === 0) {
            rosterList.innerHTML = '<div class="p-4 text-center text-slate-400 text-xs font-bold border border-slate-100 rounded-xl bg-slate-50">No students allocated to this class.</div>';
            return;
        }

        let htmlBuffer = '';

        students.forEach(student => {
            const isEvaluated = student.isEvaluated
                ? '<i class="fa-solid fa-circle-check text-emerald-500"></i>'
                : '<i class="fa-regular fa-circle text-slate-300"></i>';

            const safeAdmNo = DOMPurify.sanitize(student.admNo || '');

            htmlBuffer += `
                <div onclick="window.activateEvaluationMode('${safeAdmNo}')" 
                     class="flex justify-between items-center p-3 bg-white border border-slate-100 rounded-xl hover:border-purple-200 hover:shadow-md cursor-pointer transition-all group">
                    <div class="flex items-center gap-3">
                        <img src="${window.resolveMediaUrl(DOMPurify.sanitize(student.photoUrl || 'https://ui-avatars.com/api/?name=Student'))}" class="w-8 h-8 rounded-lg object-cover border border-slate-200 shrink-0 bg-slate-100">
                        <div>
                            <h5 class="text-[11px] font-black text-slate-800 uppercase tracking-wide group-hover:text-gussNavy transition-colors flex items-center">${DOMPurify.sanitize(student.name)}</h5>
                            <p class="text-[9px] font-mono text-slate-500 mt-0.5">${safeAdmNo}</p>
                        </div>
                    </div>
                    <div class="text-xs">${isEvaluated}</div>
                </div>
            `;
        });

        rosterList.innerHTML = htmlBuffer;
    } catch (e) {
        rosterList.innerHTML = '<div class="p-4 text-center text-red-400 text-xs font-bold">Network connection failed.</div>';
    }
};

window.filterFmRoster = function () {
    const inputEl = document.getElementById('fmSearchInput');
    const rosterList = document.getElementById('fmRosterList');
    if (!inputEl || !rosterList) return;

    const query = inputEl.value.toLowerCase();
    Array.from(rosterList.children).forEach(item => {
        item.style.display = item.innerText.toLowerCase().includes(query) ? 'flex' : 'none';
    });
}

window.activateEvaluationMode = function (admNo) {
    const student = currentClassRoster.find(s => s.admNo === admNo);
    if (!student) return;
    currentlyEvaluatingId = student.admNo;
    document.getElementById('noStudentPrompt')?.classList.add('hidden');
    document.getElementById('evaluationFormBlock')?.classList.remove('hidden');
    document.getElementById('evaluationFormBlock')?.classList.add('flex');
    document.getElementById('evalStudentName').textContent = DOMPurify.sanitize(student.name);
    document.getElementById('evalStudentId').textContent = DOMPurify.sanitize(student.admNo);

    const savedData = student.evalData || {};
    document.getElementById('evalDaysOpened').value = savedData.daysOpened ?? '';
    document.getElementById('evalDaysPresent').value = savedData.daysPresent ?? '';

    ['affPunctuality', 'affPoliteness', 'affNeatness', 'psyHandwriting', 'psySports', 'psyVerbal'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = savedData[id] ? String(savedData[id]) : '0';
    });
    document.getElementById('evalRemark').value = savedData.remark || '';

    if (typeof applyLocksToForm === 'function') applyLocksToForm();
};

function applyLocksToForm() {
    const isHistorical = SessionManager.isHistoricalArchiveMode();

    const epoch = RAM_VAULT['current_epoch'] || {};
    const globalLockString = epoch.globalDeadline || `${new Date().getFullYear()}-12-31`;
    const isTimeLocked = new Date(globalLockString + "T23:59:59").getTime() - new Date().getTime() < 0;

    const shouldLock = isHistorical || isTimeLocked;

    const bannerContainer = document.getElementById('evaluationFormBlock');
    let warningBanner = document.getElementById('historicalFmWarning');

    if (isHistorical) {
        if (!warningBanner && bannerContainer) {
            warningBanner = document.createElement('div');
            warningBanner.id = 'historicalFmWarning';
            warningBanner.className = 'bg-red-50 border-l-4 border-red-500 p-4 mb-6 rounded-r-xl shadow-sm w-full animate-fade-in';
            warningBanner.innerHTML = `
                <h3 class="text-red-800 font-black uppercase tracking-widest text-xs"><i class="fa-solid fa-lock mr-2"></i> HISTORICAL ARCHIVE</h3>
                <p class="text-red-700 text-[10px] mt-1 font-bold">Pastoral evaluation is disabled for past terms. You are in read-only mode.</p>
            `;
            bannerContainer.prepend(warningBanner);
        }
    } else {
        if (warningBanner) warningBanner.remove();
    }

    const inputIds = ['evalDaysOpened', 'evalDaysPresent', 'affPunctuality', 'affPoliteness', 'affNeatness', 'psyHandwriting', 'psySports', 'psyVerbal', 'evalRemark'];
    inputIds.forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            if (shouldLock) {
                el.disabled = true;
                el.classList.add('bg-slate-100', 'cursor-not-allowed', 'opacity-60');
            } else {
                el.disabled = false;
                el.classList.remove('bg-slate-100', 'cursor-not-allowed', 'opacity-60');
            }
        }
    });

    const saveBtn = document.getElementById('saveEvalBtn');
    if (saveBtn) {
        if (shouldLock) saveBtn.classList.add('hidden');
        else saveBtn.classList.remove('hidden');
    }
}

// ================= ZERO-TRUST PASTORAL SYNC =================
window.saveEvaluationToCloud = async function () {
    if (!currentlyEvaluatingId) return;

    //   Strict Client-Side Validation
    const daysOpenedStr = document.getElementById('evalDaysOpened').value;
    const daysPresentStr = document.getElementById('evalDaysPresent').value;

    if (!daysOpenedStr || !daysPresentStr) {
        return Swal.fire('Validation Error', 'Days Opened and Days Present are mandatory fields.', 'error');
    }

    const daysOpened = parseInt(daysOpenedStr);
    const daysPresent = parseInt(daysPresentStr);

    if (daysPresent > daysOpened) {
        return Swal.fire('Validation Error', 'Days Present cannot exceed Days Opened.', 'error');
    }

    const authRes = await Swal.fire({
        title: 'Zero-Trust Authorization',
        html: `You are about to commit the official pastoral evaluation for this student.<br><br>Enter Admin Password to execute:`,
        input: 'password',
        inputAttributes: { autocapitalize: 'off', autocorrect: 'off' },
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#005A36',
        confirmButtonText: 'Authorize Evaluation'
    });

    if (!authRes.isConfirmed || !authRes.value) return;

    const btn = document.getElementById('saveEvalBtn');
    const ogText = btn.innerHTML;
    btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin mr-2"></i> Saving...`;
    btn.disabled = true;

    try {
        const getIntVal = (id) => parseInt(document.getElementById(id).value) || 0;
        const activeContext = SessionManager.getCurrentContextString();

        const evalPayload = {
            studentAdmNo: currentlyEvaluatingId,
            session: activeContext,
            daysOpened: daysOpened,
            daysPresent: daysPresent,
            punctuality: getIntVal('affPunctuality'),
            politeness: getIntVal('affPoliteness'),
            neatness: getIntVal('affNeatness'),
            handwriting: getIntVal('psyHandwriting'),
            sports: getIntVal('psySports'),
            verbal: getIntVal('psyVerbal'),
            remark: document.getElementById('evalRemark')?.value.trim() || "A good performance. Keep it up.",
            adminPassword: authRes.value
        };

        await ApiGateway.post('/academics/form-master/evaluate', evalPayload);
        Swal.fire('Evaluation Saved', 'Success: Pastoral Evaluation securely locked and synced.', 'success');
        window.loadFormMasterRoster();
    } catch (error) {
        Swal.fire('Critical Error', error.message || 'Failed to push evaluation.', 'error');
    } finally {
        btn.innerHTML = ogText;
        btn.disabled = false;
    }
}

// ================= ZERO-TRUST LEAVE ENGINE =================
window.openLeaveModal = function () {
    const modal = document.getElementById('leaveModal');
    if (modal) {
        modal.classList.remove('hidden');
        //   Fetch history immediately when modal opens
        window.fetchLeaveHistory();
    }
}

window.closeLeaveModal = function () {
    const modal = document.getElementById('leaveModal');
    if (modal) modal.classList.add('hidden');
}

window.submitLeaveRequest = async function (e) {
    e.preventDefault();

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

    const btn = e.target.querySelector('button[type="submit"]');
    const ogText = btn.innerHTML;
    if (btn) {
        btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin mr-1"></i> Transmitting...`;
        btn.disabled = true;
    }

    try {
        await ApiGateway.post('/ict/operations/leave/request', {
            type: type,
            startDate: start,
            endDate: end,
            notes: notes
        });

        Swal.fire('Request Dispatched', `Success: Your ${type} Leave request has been securely transmitted directly to the DD Administration database.`, 'success');
        e.target.reset();
        window.fetchLeaveHistory();
    } catch (err) {
        Swal.fire('Transmission Failed', err.message || 'CRITICAL ERROR: Failed to securely transmit leave request.', 'error');
    } finally {
        if (btn) {
            btn.innerHTML = ogText;
            btn.disabled = false;
        }
    }
}

window.toggleLeaveTab = function (tab) {
    if (tab === 'request') {
        document.getElementById('tabLeaveRequest').className = "pb-3 text-xs font-black uppercase tracking-widest text-orange-600 border-b-2 border-orange-600 transition-colors";
        document.getElementById('tabLeaveHistory').className = "pb-3 text-xs font-black uppercase tracking-widest text-slate-400 border-b-2 border-transparent hover:text-slate-600 transition-colors";
        document.getElementById('leaveRequestForm').classList.replace('hidden', 'block');
        document.getElementById('leaveHistoryView').classList.replace('flex', 'hidden');
    } else {
        document.getElementById('tabLeaveHistory').className = "pb-3 text-xs font-black uppercase tracking-widest text-orange-600 border-b-2 border-orange-600 transition-colors";
        document.getElementById('tabLeaveRequest').className = "pb-3 text-xs font-black uppercase tracking-widest text-slate-400 border-b-2 border-transparent hover:text-slate-600 transition-colors";
        document.getElementById('leaveHistoryView').classList.replace('hidden', 'flex');
        document.getElementById('leaveRequestForm').classList.replace('block', 'hidden');
        //   Fetch history when tab is clicked
        window.fetchLeaveHistory();
    }
}

window.fetchLeaveHistory = async function () {
    const container = document.getElementById('leaveHistoryContent');
    if (!container) return;

    container.innerHTML = `<div class="text-center py-8 text-slate-400 font-bold text-xs"><i class="fa-solid fa-circle-notch fa-spin text-3xl mb-3 block"></i> Fetching History...</div>`;

    try {
        const history = await ApiGateway.get('/ict/operations/leave/history');

        if (!history || history.length === 0) {
            container.innerHTML = `<div class="text-center py-8 text-slate-400 font-bold text-xs"><i class="fa-solid fa-folder-open text-3xl mb-2 opacity-30 block"></i> No previous leave requests found.</div>`;
            return;
        }

        let html = '';
        history.forEach(req => {
            let badgeClass = req.status === 'APPROVED' ? 'bg-emerald-100 text-emerald-700 border-emerald-200' : (req.status === 'REJECTED' ? 'bg-red-100 text-red-700 border-red-200' : 'bg-amber-100 text-amber-700 border-amber-200');

            //   Allow revocation of PENDING requests
            let revokeBtn = '';
            if (req.status === 'PENDING') {
                revokeBtn = `<button onclick="window.revokeLeaveRequest('${req.id}')" class="mt-3 w-full bg-red-50 hover:bg-red-100 text-red-600 border border-red-200 py-2 rounded-lg text-[9px] font-black uppercase tracking-widest transition-colors"><i class="fa-solid fa-trash-can mr-1"></i> Revoke Request</button>`;
            }

            html += `
                <div class="border border-slate-200 rounded-xl p-4 bg-slate-50 relative shadow-sm text-left animate-fade-in">
                    <span class="absolute top-4 right-4 px-2 py-0.5 rounded text-[9px] font-black uppercase border ${badgeClass}">${DOMPurify.sanitize(req.status)}</span>
                    <h4 class="text-xs font-black text-slate-800 uppercase mb-1">${DOMPurify.sanitize(req.leaveType)} Leave</h4>
                    <p class="text-[10px] font-bold text-slate-500 mb-2">${DOMPurify.sanitize(req.startDate)} to ${DOMPurify.sanitize(req.endDate)}</p>
                    <p class="text-xs text-slate-600 bg-white p-2 rounded border border-slate-100 italic">"${DOMPurify.sanitize(req.handoverNotes)}"</p>
                    ${revokeBtn}
                </div>
            `;
        });
        container.innerHTML = html;
    } catch (e) {
        container.innerHTML = `<div class="text-center py-8 text-red-500 font-bold text-xs"><i class="fa-solid fa-triangle-exclamation mr-1"></i> Failed to load history from vault.</div>`;
    }
}

window.revokeLeaveRequest = async function (leaveId) {
    const res = await Swal.fire({
        title: 'Revoke Request?',
        text: 'Are you sure you want to permanently delete this pending leave request?',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#ef4444',
        confirmButtonText: 'Yes, Revoke'
    });

    if (!res.isConfirmed) return;

    try {
        await ApiGateway.delete(`/ict/operations/leave/revoke/${leaveId}`);
        Swal.fire('Revoked', 'Leave request successfully cancelled.', 'success');
        window.fetchLeaveHistory();
    } catch (error) {
        Swal.fire('Error', error.message || 'Failed to revoke request.', 'error');
    }
}

// ================= PROFILE & SIGNATURE MANAGEMENT =================
window.openFormMasterProfileSettings = async function () {
    const preview = document.getElementById('fmSignaturePreview');
    const input = document.getElementById('fmSignatureInput');
    const modal = document.getElementById('formMasterProfileModal');

    let mySig = "";
    if (activeStaffId) {
        try {
            const prof = await ApiGateway.get(`/ict/staff/profile?id=${encodeURIComponent(activeStaffId)}`);
            if (prof) {
                mySig = prof.signatureUrl || "";
            }
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
    if (input) input.value = '';
    if (modal) modal.classList.remove('hidden');
}