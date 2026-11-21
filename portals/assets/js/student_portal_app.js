// ==========================================
// 1. SESSION SECURITY & IDLE TIMEOUT ENGINE
// ==========================================
import { ENV, getAuthHeaders, getMultipartAuthHeaders } from './core_config.js';
import { ApiGateway } from './api_gateway.js';

const IDLE_TIMEOUT_MINUTES = 10;
let idleTime = 0;

function resetIdleTimer() { idleTime = 0; }

['mousemove', 'keydown', 'scroll', 'click', 'touchstart'].forEach(evt =>
    document.addEventListener(evt, resetIdleTimer, true)
);

setInterval(async () => {
    idleTime++;
    if (idleTime >= IDLE_TIMEOUT_MINUTES) {
        await Swal.fire('Security Halt', 'Session expired due to inactivity. You have been logged out.', 'warning');
        logoutStudent(true);
    }
    if (!sessionStorage.getItem('guss_access_token')) {
        logoutStudent(true);
    }
}, 60000);

// Global JWT Header Injector
window.getAuthHeaders = function () {
    const token = sessionStorage.getItem('guss_access_token');
    if (token && token !== 'null') {
        return {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + token
        };
    }
    return { 'Content-Type': 'application/json' };
};

window.resolveMediaUrl = function (url) {
    if (!url) return '';
    if (url.startsWith('http') || url.startsWith('data:')) return url;
    let cleanUrl = url.replace(/^\/+/, '');
    if (!cleanUrl.startsWith('uploads/')) cleanUrl = 'uploads/' + cleanUrl;
    return ENV.API_BASE_URL + '/' + cleanUrl;
};

// ==========================================
// 2. GLOBAL VARIABLES & INITIALIZATION
// ==========================================
let activeStudent = null;
let activeStudentNIN = null;

//  GLOBAL SESSION HYDRATOR FOR STUDENT PORTAL
window.syncAcademicSession = async function () {
    try {
        // Uses ApiGateway to fetch the live epoch from the backend
        const data = await ApiGateway.get('/director/epoch/current');
        if (data && data.label) {
            const badge = document.getElementById('badge-term');
            if (badge) badge.textContent = data.label;

            const vaultTerm = document.getElementById('vault-active-term-text');
            if (vaultTerm) vaultTerm.textContent = data.label;
        }
    } catch (e) {
        console.warn("Could not fetch live academic session:", e);
    }
};

async function syncConfigFromCloud() {
    try {
        const configs = await ApiGateway.get('/config/all');
        if (configs) {
            Object.keys(configs).forEach(k => {
                if (!k.startsWith('guss_grades_') && !k.startsWith('guss_eval_')) {
                    localStorage.setItem(k, configs[k]);
                }
            });
        }
    } catch (e) {
        console.error("Config Sync Error:", e);
    }
}

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

window.onload = async function () {
    await syncConfigFromCloud();
    await window.syncAcademicSession();
    checkSession();
    initNetworkScanner();
};

// ================= SECURE AUTHENTICATION PIPELINE =================
document.getElementById('studentLoginForm')?.addEventListener('submit', async function (e) {
    e.preventDefault();

    const identifierInput = document.getElementById('loginAdmNo').value.trim();
    const passInput = document.getElementById('loginPassword').value;

    const btn = e.target.querySelector('button[type="submit"]');
    const originalText = btn.innerHTML;
    btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin mr-2"></i> Authenticating...`;
    btn.disabled = true;

    try {
        //   Point to the dedicated student login endpoint
        const data = await ApiGateway.post('/auth/student-login', {
            admNo: identifierInput,
            password: passInput
        });

        if (data) {
            sessionStorage.setItem('guss_access_token', data.token);
            sessionStorage.setItem('guss_student_session_nin', data.nin);
            sessionStorage.setItem('guss_user_role', data.role);

            // Trigger password change modal if required
            if (data.requiresPasswordChange) {
                sessionStorage.setItem('guss_requires_setup', 'true');
            }

            loadStudentData(data.nin);
        }
    } catch (error) {
        Swal.fire('Authentication Failed', error.message || "Invalid Admission Number or Password.", 'error');
    } finally {
        btn.innerHTML = originalText;
        btn.disabled = false;
    }
});

window.logoutStudent = async function (force = false) {
    if (!force) {
        const res = await Swal.fire({
            title: 'System Logout',
            text: 'Securely close your intranet session?',
            icon: 'question',
            showCancelButton: true,
            confirmButtonColor: '#005A36',
            confirmButtonText: 'Yes, Sign Out'
        });
        if (!res.isConfirmed) return;
    }

    sessionStorage.removeItem('guss_student_session_nin');
    sessionStorage.removeItem('guss_access_token');
    sessionStorage.removeItem('guss_user_role');

    activeStudent = null;
    activeStudentNIN = null;

    const loginForm = document.getElementById('studentLoginForm');
    if (loginForm) loginForm.reset();

    document.getElementById('portal-workspace').classList.add('hidden');
    document.getElementById('login-firewall').classList.remove('hidden');
}

function checkSession() {
    const loggedInNIN = sessionStorage.getItem('guss_student_session_nin');
    const token = sessionStorage.getItem('guss_access_token');

    if (loggedInNIN && token) {
        loadStudentData(loggedInNIN);
    } else {
        document.getElementById('portal-workspace').classList.add('hidden');
        document.getElementById('login-firewall').classList.remove('hidden');
    }
}

// ================= SECURE DATA LOADING =================
async function loadStudentData(nin) {
    try {
        //  STRICT API GATEWAY INTEGRATION
        const studentData = await ApiGateway.get(`/application/${nin}`);

        if (studentData) {
            activeStudent = studentData;
            activeStudentNIN = nin;

            if (activeStudent.status !== 'ADMITTED') {
                await Swal.fire('Security Hold', 'Your admission has not been fully processed or has been revoked. Contact administration.', 'error');
                window.logoutStudent(true);
                return;
            }

            document.getElementById('login-firewall').classList.add('hidden');
            document.getElementById('portal-workspace').classList.remove('hidden');

            populateDashboardUI();
        }
    } catch (error) {
        console.error("Data Load Error:", error);
        if (error.message.includes("Clearance Denied") || error.message.includes("expired")) {
            await Swal.fire('Session Expired', 'Session Expired or Unauthorized. Please log in again.', 'error');
            window.logoutStudent(true);
        } else {
            Swal.fire('System Error', 'Failed to load secure dossier.', 'error');
        }
    }
}

function populateDashboardUI() {
    try {
        const safeName = activeStudent.name || activeStudent.fullName || "Student";
        document.getElementById('top-student-name').textContent = safeName.split(' ')[0];

        //   Include 'recentPassportUrl' (the exact key returned by ApplicationController)
        const rawPhoto = activeStudent.recentPassportUrl || activeStudent.photoUrl || activeStudent.uploadPassport;
        const safePhoto = window.resolveMediaUrl(rawPhoto);

        if (safePhoto) {
            document.getElementById('top-student-photo').src = safePhoto;
            document.getElementById('dash-photo').src = safePhoto;
        }

        window.syncAcademicSession();
        loadInternalBroadcast();
    } catch (e) { console.error("Header Error:", e); }

    try {
        const safePhoto = window.resolveMediaUrl(activeStudent.recentPassportUrl || activeStudent.photoUrl || activeStudent.uploadPassport);
        if (safePhoto) document.getElementById('dash-photo').src = safePhoto;

        document.getElementById('dash-name').textContent = activeStudent.name || activeStudent.fullName || "N/A";
        document.getElementById('dash-pathway').textContent = activeStudent.trackMode || activeStudent.pathway || "N/A";
        document.getElementById('dash-admNo').textContent = activeStudent.admNo || "PENDING";
        document.getElementById('dash-nin').textContent = activeStudent.nin || "N/A";

        let classStr = activeStudent.assignedClass || "Unassigned";
        if (classStr.includes('SSS')) {
            let dept = (classStr.includes('E') || classStr.includes('F') || classStr.includes('G')) ? "Science Department" : "Arts / Commercial";
            document.getElementById('dash-class').innerHTML = `${DOMPurify.sanitize(classStr)} <br><span class="text-[9px] text-slate-500 uppercase tracking-widest font-bold">${DOMPurify.sanitize(dept)}</span>`;
        } else {
            document.getElementById('dash-class').textContent = classStr;
        }

        document.getElementById('dash-hostel').textContent = activeStudent.assignedHostel || "Unassigned";

        //  RELATIONAL BINDING: Read directly from PostgreSQL-backed student response
        const formMasterName = activeStudent.formMasterName || "Pending Appointment";
        const formMasterPhone = activeStudent.formMasterPhone || "---";
        const houseWardenName = activeStudent.houseWardenName || "Pending Appointment";
        const houseWardenPhone = activeStudent.houseWardenPhone || "---";

        document.getElementById('dash-form-master').textContent = formMasterName;
        document.getElementById('dash-form-phone').textContent = formMasterPhone;
        document.getElementById('dash-house-master').textContent = houseWardenName;
        document.getElementById('dash-house-phone').textContent = houseWardenPhone;
    } catch (e) { console.error("Overview Error:", e); }

    try {
        const navClearance = document.getElementById('nav-clearance');
        if (navClearance) {
            const targetLvl = activeStudent.targetLevel || activeStudent.assignedClass || "";
            if (targetLvl.includes('3')) {
                navClearance.classList.remove('hidden');
                navClearance.classList.add('flex');
            } else {
                navClearance.classList.add('hidden');
                navClearance.classList.remove('flex');
            }
        }
    } catch (e) { console.error("Clearance Error:", e); }

    try {
        document.getElementById('prof-name').value = activeStudent.name || activeStudent.fullName || "Data Not Provided";
        document.getElementById('prof-dob').value = activeStudent.dob || "Data Not Provided";
        document.getElementById('prof-state').value = activeStudent.state || activeStudent.stateOfOrigin || "Data Not Provided";
        document.getElementById('prof-lga').value = activeStudent.lga || "Data Not Provided";

        //  PROPER RELATIONAL MAPPING FOR GUARDIANS / NOK
        if (activeStudent.guardians && activeStudent.guardians.length > 0) {
            const primary = activeStudent.guardians.find(g => g.isPrimaryContact) || activeStudent.guardians[0];
            document.getElementById('prof-address').value = primary.residentialAddress || activeStudent.address || "";
            document.getElementById('prof-nok-name').value = primary.fullName || "";
            document.getElementById('prof-nok-phone').value = primary.phoneNumber || "";
        } else {
            document.getElementById('prof-address').value = activeStudent.address || "";
        }

        //  PROPER RELATIONAL MAPPING FOR MEDICAL PROFILE
        if (activeStudent.medicalProfile) {
            const med = activeStudent.medicalProfile;
            document.getElementById('prof-med-allergies').value = med.medicalAllergies || "None";
            document.getElementById('prof-routine-meds').value = med.routineMeds || "None";

            let dis = 'None';
            if (med.hasDisability) {
                dis = med.disabilityCategories && med.disabilityCategories.length > 0 ? med.disabilityCategories.join(', ') : 'Yes';
                if (med.disabilityDetails) dis += ` (${med.disabilityDetails})`;
            }
            document.getElementById('prof-disability').value = dis;
        }
    } catch (e) { console.error("Profile Fill Error:", e); }

    switchPortalTab('overview');
    switchProfileTab('personal');
    window.loadInternalBroadcast();
}

//  NEW HELPER: Standardizes Base64 strings for the Java Jasper Engine
function cleanBase64String(rawString) {
    if (!rawString) return "";
    return rawString.includes("base64,") ? rawString.split("base64,")[1] : rawString;
}

// ================= RESULTS & RESTRICTIONS ENGINE (MOHEST SECURED) =================
window.viewTermResult = async function () {
    if (!activeStudent || !activeStudent.assignedClass) return;

    const btn = window.event.currentTarget;
    const ogText = btn.innerHTML;
    btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin mr-1"></i> Verifying Clearance...`;
    btn.disabled = true;

    try {
        const isGlobalPub = RAM_VAULT['guss_global_publish_status'] === 'published';
        if (!isGlobalPub) {
            Swal.fire('Access Denied', 'Results have not yet been published by the Chief Examiner.', 'warning');
            return;
        }

        btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin mr-1"></i> Generating PDF...`;

        //   Backend handles all calculations natively now. Just send admNo.
        const payload = { admNo: activeStudent.admNo };

        const pdfReq = await fetch(`${ENV.API_BASE_URL}/api/academics/chief/reports/generate`, {
            method: 'POST',
            headers: window.getAuthHeaders(),
            body: JSON.stringify(payload)
        });

        if (pdfReq.ok) {
            const blob = await pdfReq.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `Termly_Report_${activeStudent.admNo.replace(/\//g, '_')}.pdf`;
            a.click();
            window.URL.revokeObjectURL(url);
        } else {
            Swal.fire('Generation Error', 'Failed to generate PDF. Ensure grades have been submitted.', 'error');
        }
    } catch (error) {
        Swal.fire('System Error', 'Could not verify your clearance status with the Central Server.', 'error');
    } finally {
        btn.innerHTML = ogText;
        btn.disabled = false;
    }
}

window.printStudentAdmissionLetter = async function () {
    const btn = window.event.currentTarget;
    const ogText = btn.innerHTML;
    btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin mr-2"></i> Downloading...`;
    btn.disabled = true;

    const adminProfile = JSON.parse(localStorage.getItem('guss_admin_profile')) || { name: "Admissions Officer", phone: "08065951832", signature: null };

    try {
        const payload = {
            letterData: {
                refNo: "GUSSR/ADM/2026/" + activeStudentNIN.substring(Math.max(0, activeStudentNIN.length - 4)),
                date: new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }),
                admNo: activeStudent.admNo || "GUSSR/PENDING",
                fullName: (activeStudent.name || activeStudent.fullName || "APPLICANT").toUpperCase(),
                firstName: (activeStudent.name || activeStudent.fullName || "Applicant").split(" ")[0],
                addressLine1: activeStudent.address || "Permanent Address",
                addressLine2: (activeStudent.lga || "") + " LGA, " + (activeStudent.state || activeStudent.stateOfOrigin || ""),
                admittedClass: activeStudent.assignedClass || "Class Pending",
                academicSession: "2026/2027 SESSION",
                hostel: activeStudent.assignedHostel || "Hostel Pending",

                officerName: adminProfile.name,
                officerPhone: adminProfile.phone
            },
            studentPhotoBase64: activeStudent.recentPassportUrl || activeStudent.uploadPassport || activeStudent.photoUrl || null,
            signatureBase64: cleanBase64String(adminProfile.signature)
        };

        //  RAW FETCH RETAINED FOR BLOB HANDLING
        const pdfReq = await fetch(`${ENV.API_BASE_URL}/api/reports/admission-letter`, {
            method: 'POST',
            headers: window.getAuthHeaders(),
            body: JSON.stringify(payload)
        });

        if (pdfReq.ok) {
            const blob = await pdfReq.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `Official_Admission_Letter_${activeStudentNIN}.pdf`;
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            a.remove();
        } else {
            Swal.fire('Generation Error', 'Server failed to generate the PDF template.', 'error');
        }
    } catch (error) {
        Swal.fire('Network Error', 'Could not connect to the PDF Report Engine.', 'error');
    }

    btn.innerHTML = ogText;
    btn.disabled = false;
}

// ================= PROFILE UPDATES =================
window.saveMutableProfileData = async function () {
    const res = await Swal.fire({
        title: 'Commit Updates?',
        text: 'Are you sure you want to update your administrative record?',
        icon: 'question',
        showCancelButton: true,
        confirmButtonColor: '#005A36',
        confirmButtonText: 'Yes, Save'
    });

    if (!res.isConfirmed) return;

    activeStudent.address = document.getElementById('prof-address').value;
    activeStudent.nok1Name = document.getElementById('prof-nok-name').value;
    activeStudent.nok1Phone = document.getElementById('prof-nok-phone').value;
    activeStudent.medAllergies = document.getElementById('prof-med-allergies').value;
    activeStudent.routineMeds = document.getElementById('prof-routine-meds').value;
    activeStudent.disabilityDetails = document.getElementById('prof-disability').value;

    try {
        //  STRICT API GATEWAY INTEGRATION
        await ApiGateway.post('/bridge/save', activeStudent);
        Swal.fire('Success', "Profile synchronized successfully with the Central Database.", 'success');
    } catch (error) {
        if (error.message.includes("Clearance Denied") || error.message.includes("expired")) {
            await Swal.fire('Session Expired', "Session Expired. Please log in again.", 'error');
            window.logoutStudent(true);
        } else {
            Swal.fire('Database Error', error.message || "Could not save profile updates.", 'error');
        }
    }
}

// ================= PROFILE PASSWORD UPDATE =================
window.updateStudentPassword = async function () {
    const currentPass = document.getElementById('sec-current-pass').value.trim();
    const newPass = document.getElementById('sec-new-pass').value.trim();
    const confirmPass = document.getElementById('sec-confirm-pass').value.trim();

    if (!currentPass || !newPass || !confirmPass) {
        return Swal.fire('Validation Error', "Please fill out all password fields.", 'warning');
    }

    if (newPass.length < 6) {
        return Swal.fire('Security Rule', "New password must be at least 6 characters long.", 'warning');
    }

    if (newPass !== confirmPass) {
        return Swal.fire('Mismatch Error', "New Password and Confirm Password do not match.", 'warning');
    }

    const btn = event.currentTarget;
    const ogText = btn.innerHTML;
    btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin mr-2"></i> Securing Account...`;
    btn.disabled = true;

    try {
        //  STRICT API GATEWAY INTEGRATION
        const data = await ApiGateway.post('/auth/update-password', {
            nin: activeStudentNIN,
            currentPassword: currentPass,
            newPassword: newPass
        });

        Swal.fire('Success', data.message || "Password updated successfully.", 'success');
        document.getElementById('sec-current-pass').value = '';
        document.getElementById('sec-new-pass').value = '';
        document.getElementById('sec-confirm-pass').value = '';
    } catch (error) {
        console.error("Password Update Error:", error);
        Swal.fire('Update Failed', error.message || "Failed to update password.", 'error');
    } finally {
        btn.innerHTML = ogText;
        btn.disabled = false;
    }
}

// ================= UI NAVIGATION =================
let isSidebarMinimized = false;

window.toggleDesktopSidebar = function () {
    const sidebar = document.getElementById('sidebar');
    const textElements = document.querySelectorAll('.sidebar-text');
    isSidebarMinimized = !isSidebarMinimized;
    if (isSidebarMinimized) {
        sidebar.classList.remove('w-72'); sidebar.classList.add('w-20');
        textElements.forEach(el => el.classList.add('hidden'));
    } else {
        sidebar.classList.remove('w-20'); sidebar.classList.add('w-72');
        textElements.forEach(el => el.classList.remove('hidden'));
    }
}

window.toggleSidebar = function () {
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebar-overlay');
    if (sidebar.classList.contains('-translate-x-full')) {
        sidebar.classList.remove('-translate-x-full');
        overlay.classList.remove('hidden'); setTimeout(() => overlay.classList.remove('opacity-0'), 10);
    } else {
        sidebar.classList.add('-translate-x-full');
        overlay.classList.add('opacity-0'); setTimeout(() => overlay.classList.add('hidden'), 300);
    }
}

window.switchPortalTab = function (viewId) {
    document.querySelectorAll('.portal-view').forEach(el => { el.classList.remove('block'); el.classList.add('hidden'); });
    document.getElementById('view-' + viewId).classList.remove('hidden'); document.getElementById('view-' + viewId).classList.add('block');
    document.querySelectorAll('.nav-btn').forEach(btn => {
        btn.classList.remove('bg-emerald-500/10', 'text-emerald-400', 'border', 'border-emerald-500/20');
        btn.classList.add('text-slate-400');
    });

    const activeBtn = document.getElementById('nav-' + viewId);
    if (activeBtn) {
        activeBtn.classList.remove('text-slate-400');
        activeBtn.classList.add('bg-emerald-500/10', 'text-emerald-400', 'border', 'border-emerald-500/20');
    }

    const titles = {
        'overview': 'Overview Board',
        'vault': 'Documents Vault',
        'ledger': 'Financial Ledger',
        'clearance': 'Clearance Tracker',
        'profile': 'My Profile'
    };
    const titleEl = document.getElementById('topbar-title');
    if (titleEl && titles[viewId]) titleEl.textContent = titles[viewId];

    if (window.innerWidth < 1024 && !document.getElementById('sidebar').classList.contains('-translate-x-full')) { window.toggleSidebar(); }
}

window.switchProfileTab = function (tabId) {
    document.querySelectorAll('.profile-sub-view').forEach(el => { el.classList.remove('block'); el.classList.add('hidden'); });
    document.getElementById('pview-' + tabId).classList.remove('hidden'); document.getElementById('pview-' + tabId).classList.add('block');
    document.querySelectorAll('.profile-tab-btn').forEach(btn => {
        btn.classList.remove('border-gussGreen', 'text-gussGreen'); btn.classList.add('border-transparent', 'text-slate-400');
    });
    const activeTab = document.getElementById('ptab-' + tabId);
    if (activeTab) {
        activeTab.classList.remove('border-transparent', 'text-slate-400'); activeTab.classList.add('border-gussGreen', 'text-gussGreen');
    }
}

// ================= RELATIONAL NOTIFICATION ENGINE =================
window.checkForNotifications = function () {
    try {
        const raw = RAM_VAULT['guss_system_announcements'];
        let announcements = [];
        if (raw) {
            announcements = typeof raw === 'string' ? JSON.parse(raw) : raw;
            if (!Array.isArray(announcements)) announcements = [announcements];
        }
        const badge = document.getElementById('notifBadge');
        if (badge) {
            if (announcements.length > 0) badge.classList.remove('hidden');
            else badge.classList.add('hidden');
        }
    } catch (e) { }
};

//   Advanced Notification Engine with Search, Dates, and Read More
window.openNotificationsModal = function () {
    const modal = document.getElementById('notifModal');
    if (!modal) return;

    modal.classList.remove('hidden');
    setTimeout(() => {
        modal.classList.remove('opacity-0');
        document.getElementById('notifContent')?.classList.remove('scale-95');
    }, 10);

    window.renderStudentNotifications();
}

window.renderStudentNotifications = function (searchQuery = '', dateQuery = '') {
    const body = document.getElementById('notifBody');
    if (!body) return;

    let announcements = [];
    try {
        const raw = localStorage.getItem('guss_system_announcements');
        if (raw) {
            announcements = typeof raw === 'string' ? JSON.parse(raw) : raw;
            if (!Array.isArray(announcements)) announcements = [announcements];
        }
    } catch (e) { console.error("Failed to parse announcements", e); }

    // Inject Sticky Search UI
    let htmlBuffer = `
        <div class="sticky top-0 bg-slate-50 z-10 pb-4 mb-2 border-b border-slate-200">
            <div class="flex gap-2">
                <div class="relative flex-1">
                    <i class="fa-solid fa-magnifying-glass absolute left-3 top-2.5 text-slate-400 text-xs"></i>
                    <input type="text" id="notifSearch" value="${searchQuery}" onkeyup="window.filterNotifications()" placeholder="Search messages or sender..." class="w-full bg-white border border-slate-300 rounded-lg pl-8 pr-3 py-2 text-xs font-medium focus:outline-none focus:border-blue-500 shadow-sm">
                </div>
                <input type="date" id="notifDate" value="${dateQuery}" onchange="window.filterNotifications()" class="bg-white border border-slate-300 rounded-lg px-2 py-2 text-[10px] font-bold text-slate-600 focus:outline-none w-32 shadow-sm">
            </div>
        </div>
    `;

    let filtered = announcements;
    if (searchQuery) {
        const q = searchQuery.toLowerCase();
        filtered = filtered.filter(a => {
            const text = typeof a === 'string' ? a : a.text;
            const source = typeof a === 'string' ? 'Administration' : a.source;
            return text.toLowerCase().includes(q) || source.toLowerCase().includes(q);
        });
    }
    if (dateQuery) {
        filtered = filtered.filter(a => {
            if (typeof a === 'string') return false; // Legacy strings have no date
            return a.date && a.date.startsWith(dateQuery);
        });
    }

    if (filtered.length === 0) {
        htmlBuffer += `<div class="text-center py-8 text-slate-400 font-bold text-xs"><i class="fa-regular fa-bell-slash text-3xl mb-3 opacity-30 block"></i> No administrative broadcasts found.</div>`;
        body.innerHTML = htmlBuffer;
        return;
    }

    filtered.forEach((msg, idx) => {
        let text = typeof msg === 'string' ? msg : msg.text;
        let source = typeof msg === 'string' ? 'Central Administration' : msg.source;
        let dateStr = typeof msg === 'string' ? 'Legacy Broadcast' : new Date(msg.date).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' });

        const isLong = text.length > 150;
        const shortText = isLong ? text.substring(0, 150) + '...' : text;
        const textId = `notif-text-${idx}`;

        htmlBuffer += `
            <div class="bg-white border border-slate-200 p-4 rounded-xl shadow-sm relative mb-3 hover:border-blue-300 transition-colors">
                <div class="flex justify-between items-start mb-2 border-b border-slate-100 pb-2">
                    <div class="flex items-center gap-2">
                        <div class="w-6 h-6 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-[10px]"><i class="fa-solid fa-bullhorn"></i></div>
                        <div>
                            <h4 class="text-[10px] font-black uppercase tracking-widest text-slate-800">${DOMPurify.sanitize(source)}</h4>
                            <p class="text-[8px] font-mono text-slate-400">${DOMPurify.sanitize(dateStr)}</p>
                        </div>
                    </div>
                </div>
                <div class="text-xs font-medium leading-relaxed text-slate-600" id="${textId}" data-full="${encodeURIComponent(text)}" data-short="${encodeURIComponent(shortText)}">
                    ${DOMPurify.sanitize(shortText)}
                </div>
                ${isLong ? `<button onclick="window.toggleReadMore('${textId}', this)" class="text-[9px] font-black uppercase tracking-widest text-blue-600 hover:text-blue-800 mt-2">Read More <i class="fa-solid fa-chevron-down"></i></button>` : ''}
            </div>
        `;
    });
    body.innerHTML = htmlBuffer;
}

window.filterNotifications = function () {
    const q = document.getElementById('notifSearch')?.value || '';
    const d = document.getElementById('notifDate')?.value || '';
    window.renderStudentNotifications(q, d);
}

window.toggleReadMore = function (textId, btn) {
    const el = document.getElementById(textId);
    if (!el) return;
    const isExpanded = btn.innerText.includes('LESS');
    if (isExpanded) {
        el.innerHTML = DOMPurify.sanitize(decodeURIComponent(el.getAttribute('data-short')));
        btn.innerHTML = 'Read More <i class="fa-solid fa-chevron-down"></i>';
    } else {
        el.innerHTML = DOMPurify.sanitize(decodeURIComponent(el.getAttribute('data-full')));
        btn.innerHTML = 'Show Less <i class="fa-solid fa-chevron-up"></i>';
    }
}

window.loadInternalBroadcast = function () {
    let announcements = [];
    try {
        const raw = localStorage.getItem('guss_system_announcements');
        if (raw) {
            const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
            // Extract just the text for the marquee ticker
            announcements = (Array.isArray(parsed) ? parsed : [parsed]).map(a => typeof a === 'string' ? a : a.text);
        }
    } catch (e) { }

    if (announcements.length === 0) {
        announcements = ["[REGISTRY] Welcome to the G.U.S.S Ringim Portal. Ensure your profile data is accurate."];
    }

    const banner = document.getElementById('studentBroadcastBanner');
    const ticker = document.getElementById('broadcastTickerText');
    if (banner && ticker) {
        banner.classList.remove('hidden');
        ticker.innerHTML = DOMPurify.sanitize(announcements.join('&nbsp;&nbsp;&nbsp;&nbsp; | &nbsp;&nbsp;&nbsp;&nbsp;'));
    }
}

window.closeNotificationsModal = function () {
    const modal = document.getElementById('notifModal');
    const content = document.getElementById('notifContent');
    if (!modal || !content) return;
    modal.classList.add('opacity-0');
    content.classList.add('scale-95');
    setTimeout(() => { modal.classList.add('hidden'); }, 300);
};

function getStudentFeeScope(student) {
    if (student.trackMode === 'Exchange Scheme') return "EXCHANGE SCHEME";
    let classStr = student.assignedClass || "";
    if (classStr === 'Pending Qualifying Exams' || classStr === 'Unassigned') classStr = student.targetLevel || "";
    const levelOrClass = classStr.toUpperCase();
    if (levelOrClass.includes('JSS')) return "JUNIOR SECONDARY";
    if (levelOrClass.includes('SSS')) {
        if (levelOrClass.includes('SCIENCE') || levelOrClass.includes('E') || levelOrClass.includes('F') || levelOrClass.includes('G')) return "SENIOR SECONDARY (SCIENCE)";
        return "SENIOR SECONDARY (ARTS/COMMERCIAL)";
    }
    return "JUNIOR SECONDARY";
}

window.loadPaymentInitiators = function () {
    const grid = document.getElementById('paymentInitiatorGrid');
    if (!grid) return;
    grid.innerHTML = '';
    const schedules = JSON.parse(localStorage.getItem('guss_bursary_schedules')) || [];
    const scope = getStudentFeeScope(activeStudent);
    const scopeSchedule = schedules.find(s => s.scope === scope);
    const termFee = scopeSchedule ? scopeSchedule.total : 15500;
    const gatewaysStatus = localStorage.getItem('guss_payment_gateway_status') || 'OPEN';
    const isGatewayClosed = gatewaysStatus === 'CLOSED';
    const btnClass = isGatewayClosed ? "bg-slate-300 text-slate-500 cursor-not-allowed" : "bg-emerald-600 hover:bg-emerald-700 text-white";
    const paymentOptions = [
        { title: "Termly Registration Fee", amount: termFee, icon: "fa-school", desc: "Mandatory Session Dues" },
        { title: "ID Card Replacement", amount: 1500, icon: "fa-id-card", desc: "For lost or damaged IDs" },
        { title: "Academic Transcript", amount: 5000, icon: "fa-award", desc: "Official Certified Copy" },
        { title: "Administrative Fine", amount: 2000, icon: "fa-gavel", desc: "Disciplinary Penalty Clearance" }
    ];
    paymentOptions.forEach(opt => {
        grid.innerHTML += `
            <div class="bg-slate-50 border border-slate-200 rounded-xl p-4 flex flex-col justify-between h-full group hover:border-emerald-300 hover:shadow-md transition-all">
                <div class="flex items-start justify-between mb-4"><div class="w-10 h-10 rounded-full bg-white text-emerald-600 flex items-center justify-center text-lg shadow-sm border border-slate-100"><i class="fa-solid ${opt.icon}"></i></div><span class="text-sm font-black text-gussNavy font-mono">₦${opt.amount.toLocaleString()}</span></div>
                <div><h4 class="text-[10px] font-black uppercase tracking-widest text-slate-700">${DOMPurify.sanitize(opt.title)}</h4><p class="text-[9px] text-slate-500 font-medium mb-3 mt-0.5">${DOMPurify.sanitize(opt.desc)}</p><button onclick="window.initiateRemitaPayment('${DOMPurify.sanitize(opt.title)}', ${opt.amount})" ${isGatewayClosed ? 'disabled' : ''} class="w-full py-2 rounded-lg text-[9px] font-black uppercase tracking-widest transition-colors shadow-sm ${btnClass}">${isGatewayClosed ? '<i class="fa-solid fa-lock mr-1"></i> Gateway Closed' : 'Initiate Payment'}</button></div>
            </div>`;
    });
}

window.initiateRemitaPayment = async function (type, amount) {
    if (localStorage.getItem('guss_payment_gateway_status') === 'CLOSED') {
        return Swal.fire('Gateway Closed', "The Remita Payment Gateway is currently CLOSED by the Central Bursar.", 'error');
    }

    const res = await Swal.fire({
        title: 'Initiate Payment',
        text: `Initiate payment for ${type} (₦${amount.toLocaleString()}) via Remita gateway?`,
        icon: 'question',
        showCancelButton: true,
        confirmButtonColor: '#10b981',
        confirmButtonText: 'Yes, Proceed'
    });

    if (!res.isConfirmed) return;

    const rrr = "RRR-" + Math.floor(Math.random() * 9000000000) + 1000000000;
    const dateStr = new Date().toLocaleDateString('en-NG');

    try {
        if (type === 'Termly Registration Fee') {
            let records = JSON.parse(localStorage.getItem('guss_term_payments')) || {};
            records[activeStudent.admNo] = { rrr: rrr, status: 'PENDING', amount: amount, date: dateStr };

            //  STRICT API GATEWAY INTEGRATION
            await ApiGateway.post('/config/save', { 'guss_term_payments': JSON.stringify(records) });
            localStorage.setItem('guss_term_payments', JSON.stringify(records));
        } else {
            let anc = JSON.parse(localStorage.getItem('guss_ancillary_payments')) || [];
            anc.push({ admNo: activeStudent.admNo, rrr: rrr, type: type, amount: amount, status: 'VERIFIED', date: dateStr });

            //  STRICT API GATEWAY INTEGRATION
            await ApiGateway.post('/config/save', { 'guss_ancillary_payments': JSON.stringify(anc) });
            localStorage.setItem('guss_ancillary_payments', JSON.stringify(anc));
        }

        Swal.fire('Payment Initiated', `Remita RRR Generated: ${rrr}.\n\nYou are being redirected to the secure gateway...\n\n(Simulated: Payment initiated and logged)`, 'success');
        window.loadLedgerTable();
    } catch (e) {
        Swal.fire('Network Error', 'Failed to sync payment initiation with the server.', 'error');
    }
}

window.loadLedgerTable = function () {
    const tbody = document.getElementById('ledgerTableBody');
    if (!tbody) return;
    tbody.innerHTML = '';
    let hasHistory = false;
    const termRecords = JSON.parse(localStorage.getItem('guss_term_payments')) || {};
    const myTermRecord = termRecords[activeStudent.admNo];
    if (myTermRecord) {
        hasHistory = true;
        const isVerified = myTermRecord.status === 'VERIFIED';
        const badge = isVerified ? `<span class="bg-emerald-100 text-emerald-700 px-2 py-1 rounded text-[9px] font-black uppercase tracking-wider"><i class="fa-solid fa-check"></i> Paid</span>` : `<span class="bg-amber-100 text-amber-700 px-2 py-1 rounded text-[9px] font-black uppercase tracking-wider"><i class="fa-solid fa-spinner fa-spin"></i> Pending Audit</span>`;
        const actionBtn = isVerified ? `<button class="bg-slate-100 hover:bg-slate-200 text-slate-600 px-3 py-1.5 rounded border border-slate-300 text-[9px] font-bold uppercase transition-colors"><i class="fa-solid fa-download"></i> Receipt</button>` : `<button class="bg-slate-100 text-slate-400 px-3 py-1.5 rounded border border-slate-200 text-[9px] font-bold uppercase cursor-not-allowed">Locked</button>`;
        tbody.innerHTML += `<tr class="hover:bg-slate-50 transition-colors border-b border-slate-100"><td class="p-4"><p class="font-bold text-slate-800">Termly Registration Fee</p><p class="text-[9px] text-slate-400 uppercase tracking-widest mt-0.5">${DOMPurify.sanitize(myTermRecord.date)}</p></td><td class="p-4 font-mono font-bold text-slate-600">${DOMPurify.sanitize(myTermRecord.rrr)}</td><td class="p-4 font-black">₦${myTermRecord.amount.toLocaleString()}</td><td class="p-4">${badge}</td><td class="p-4 text-right">${actionBtn}</td></tr>`;
    }
    const ancRecords = JSON.parse(localStorage.getItem('guss_ancillary_payments')) || [];
    const myAncRecords = ancRecords.filter(r => r.admNo === activeStudent.admNo).reverse();
    myAncRecords.forEach(rec => {
        hasHistory = true;
        tbody.innerHTML += `<tr class="hover:bg-slate-50 transition-colors border-b border-slate-100"><td class="p-4"><p class="font-bold text-slate-800">${DOMPurify.sanitize(rec.type)}</p><p class="text-[9px] text-slate-400 uppercase tracking-widest mt-0.5">${DOMPurify.sanitize(rec.date)}</p></td><td class="p-4 font-mono font-bold text-slate-600">${DOMPurify.sanitize(rec.rrr)}</td><td class="p-4 font-black">₦${rec.amount.toLocaleString()}</td><td class="p-4"><span class="bg-emerald-100 text-emerald-700 px-2 py-1 rounded text-[9px] font-black uppercase tracking-wider"><i class="fa-solid fa-check"></i> Paid</span></td><td class="p-4 text-right"><button class="bg-slate-100 hover:bg-slate-200 text-slate-600 px-3 py-1.5 rounded border border-slate-300 text-[9px] font-bold uppercase transition-colors"><i class="fa-solid fa-download"></i> Receipt</button></td></tr>`;
    });
    if (!hasHistory) tbody.innerHTML = `<tr><td colspan="5" class="py-12 text-center text-slate-400 font-bold text-xs"><i class="fa-solid fa-receipt text-3xl mb-3 opacity-30 block"></i> No transaction history found.</td></tr>`;
}