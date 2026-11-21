import { ApiGateway } from './api_gateway.js';

export const PORTAL_ROUTING_MATRIX = {
    'ROLE_DIRECTOR': 'director_terminal.html',
    'ROLE_DEPUTY_DIR_ACADEMICS': 'dd_academics.html',
    'ROLE_DEPUTY_DIR_ADMIN': 'dd_admin.html',
    'ROLE_ICT_ADMIN': 'ict_registry.html',
    'ROLE_ADMISSIONS_OFFICER': 'admission_officer.html',
    'ROLE_BURSAR': 'bursary_terminal.html',
    'ROLE_CHIEF_EXAMINER': 'chief_examiner.html',
    'ROLE_WEB_ADMIN': 'web_admin.html',
    'ROLE_CSO': 'cso_terminal.html',
    'ROLE_LIBRARY_MASTER': 'library_terminal.html',
    'ROLE_OFFICIAL': 'staff_portal.html',
    'ROLE_STAFF': 'staff_portal.html'
};

(async function enforceStrictSecurity() {
    const currentPage = window.location.pathname.toLowerCase();

    if (currentPage.includes('staff_login.html') || currentPage.includes('alumni_login.html') || currentPage.includes('alumni_registration.html') || currentPage.includes('index.html') || currentPage.endsWith('/')) {
        return;
    }

    const token = sessionStorage.getItem('guss_access_token');
    const userRole = sessionStorage.getItem('guss_user_role');
    const staffId = sessionStorage.getItem('guss_staff_id');

    const restrictedPortals = [
        'staff_portal.html', 'admission_officer.html', 'director_terminal.html',
        'teacher_grading.html', 'ict_registry.html', 'web_admin.html',
        'chief_examiner.html', 'dd_academics.html', 'dd_admin.html',
        'bursary_terminal.html', 'form_master.html', 'house_master.html',
        'cso_terminal.html', 'alumni_dashboard.html'
    ];

    const isRestrictedPage = restrictedPortals.some(page => currentPage.includes(page));

    if (!token || !userRole) {
        if (isRestrictedPage) {
            performLogout();
        }
        return;
    }

    const accessMatrix = {
        'director_terminal.html': ['ROLE_DIRECTOR'],
        'dd_academics.html': ['ROLE_DEPUTY_DIR_ACADEMICS'],
        'dd_admin.html': ['ROLE_DEPUTY_DIR_ADMIN'],
        'ict_registry.html': ['ROLE_ICT_ADMIN'],
        'admission_officer.html': ['ROLE_ADMISSIONS_OFFICER'],
        'bursary_terminal.html': ['ROLE_BURSAR'],
        'chief_examiner.html': ['ROLE_CHIEF_EXAMINER'],
        'cso_terminal.html': ['ROLE_CSO'],
        'web_admin.html': ['ROLE_WEB_ADMIN', 'ROLE_DIRECTOR', 'ROLE_ICT_ADMIN'],
        'alumni_dashboard.html': ['ROLE_ALUMNUS']
    };

    let requiredRoles = [];
    for (let page in accessMatrix) {
        if (currentPage.includes(page)) {
            requiredRoles = accessMatrix[page];
            break;
        }
    }

    if (requiredRoles.length === 0) return;

    if (requiredRoles.includes(userRole)) return;

    if (userRole === 'ROLE_ALUMNUS') {
        performLogout();
        return;
    }

    if (staffId) {
        try {
            const assignedRoles = await ApiGateway.get(`/bridge/staff-portals?staffId=${encodeURIComponent(staffId)}`);
            if (assignedRoles && Array.isArray(assignedRoles)) {
                const hasDelegation = assignedRoles.some(role => {
                    let norm = role.toUpperCase().replace("GUSS_STATUTORY_", "").replace("GUSS_", "");
                    if (!norm.startsWith("ROLE_")) norm = "ROLE_" + norm;
                    return requiredRoles.includes(norm);
                });
                if (hasDelegation) return;
            }
        } catch (e) {
            console.error("Delegation Verification Failed:", e);
        }
    }

    alert("CLEARANCE DENIED: You lack the statutory or delegated clearance required for this terminal.");
    window.location.replace('staff_portal.html');
})();

window.addEventListener('pageshow', function (event) {
    const currentPage = window.location.pathname.toLowerCase();
    if (currentPage.includes('staff_login.html') || currentPage.includes('alumni_login.html')) return;

    const token = sessionStorage.getItem('guss_access_token');
    if (!token) {
        performLogout();
    } else if (event.persisted) {
        window.location.reload();
    }
});

window.executeSystemLogout = async function () {
    if (typeof Swal !== 'undefined') {
        const res = await Swal.fire({
            title: 'System Exit',
            text: 'Are you sure you want to terminate your active session?',
            icon: 'warning',
            showCancelButton: true,
            confirmButtonColor: '#ef4444',
            confirmButtonText: 'Yes, Terminate'
        });
        if (res.isConfirmed) {
            performLogout();
        }
    } else {
        if (confirm("SYSTEM EXIT: Are you sure you want to terminate your active session?")) {
            performLogout();
        }
    }
};

function performLogout() {
    const isAlumni = sessionStorage.getItem('guss_user_role') === 'ROLE_ALUMNUS'
        || window.location.pathname.toLowerCase().includes('alumni_');
    sessionStorage.clear();
    document.documentElement.innerHTML = '<body style="background:#0b1120;"></body>';

    if (isAlumni) {
        window.location.replace('alumni_login.html');
    } else {
        window.location.replace('staff_login.html');
    }
}

const IDLE_TIMEOUT_MINUTES = 15;
let idleTime = 0;

function resetIdleTimer() { idleTime = 0; }
['mousemove', 'keydown', 'scroll', 'click', 'touchstart'].forEach(evt =>
    document.addEventListener(evt, resetIdleTimer, true)
);

setInterval(() => {
    idleTime++;
    const currentPage = window.location.pathname.toLowerCase();
    if (currentPage.includes('staff_login.html') || currentPage.includes('alumni_login.html')) return;

    if (idleTime >= IDLE_TIMEOUT_MINUTES) {
        alert("SECURITY HALT: Session expired due to inactivity. You have been logged out.");
        performLogout();
    }
}, 60000);

document.addEventListener('DOMContentLoaded', () => {
    const requiresSetup = sessionStorage.getItem('guss_requires_setup') === 'true';
    if (requiresSetup) {
        const setupModal = document.getElementById('staffFirstLoginModal');
        const setupContent = document.getElementById('staffFirstLoginContent');
        const setupForm = document.getElementById('staffFirstPasswordForm');

        if (setupModal && setupForm) {
            setupModal.classList.remove('hidden');
            setupModal.classList.add('flex');
            if (setupContent) setTimeout(() => setupContent.classList.remove('scale-95', 'opacity-0'), 50);

            setupForm.addEventListener('submit', async function (e) {
                e.preventDefault();
                const currentPass = document.getElementById('act-current-pass').value;
                const pass1 = document.getElementById('setupNewStaffPass').value;
                const pass2 = document.getElementById('confirmNewStaffPass').value;
                const btn = document.getElementById('btnSaveNewPass');

                if (!currentPass) return Swal.fire('Validation Error', "Please enter your current temporary password.", 'error');
                if (pass1 !== pass2) return Swal.fire('Mismatch', "Passwords do not match.", 'warning');
                if (pass1.length < 8) return Swal.fire('Security Rule', "Password must be at least 8 characters long.", 'warning');

                const originalHtml = btn.innerHTML;
                btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin mr-2"></i> Encrypting...`;
                btn.disabled = true;

                try {
                    await ApiGateway.post('/auth/activate-account', {
                        nin: sessionStorage.getItem('guss_staff_id'),
                        oldPassword: currentPass,
                        newPassword: pass1
                    });

                    sessionStorage.removeItem('guss_requires_setup');
                    btn.innerHTML = `<i class="fa-solid fa-check mr-2"></i> Secured`;
                    btn.className = "w-full bg-emerald-500 text-white py-4 rounded-xl text-xs font-black uppercase tracking-widest";

                    setTimeout(() => {
                        if (setupContent) setupContent.classList.add('scale-95', 'opacity-0');
                        setTimeout(() => { setupModal.classList.add('hidden'); window.location.reload(); }, 300);
                    }, 800);
                } catch (error) {
                    Swal.fire('Security Exception', error.message || "Current password provided is incorrect.", 'error');
                    btn.innerHTML = originalHtml;
                    btn.disabled = false;
                }
            });
        }
    }
});