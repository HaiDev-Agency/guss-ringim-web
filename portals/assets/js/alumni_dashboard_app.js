// =========================================================================
// G.U.S.S. RINOBA — ALUMNI COMMAND DASHBOARD (ENTERPRISE EDITION)
// =========================================================================
import { ENV } from './core_config.js';
import { ApiGateway } from './api_gateway.js';

// 1. GLOBAL VARIABLES & IDENTITY
let currentUser = JSON.parse(sessionStorage.getItem('rinoba_session')) || null;
let networkThreads = [];
let currentThreadId = null;
let timerInterval = null;

// =========================================================================
// 2. MAIN APPLICATION LAUNCHER
// =========================================================================
document.addEventListener('DOMContentLoaded', async () => {
    if (!currentUser) {
        window.location.replace("alumni_login.html");
        return;
    }

    const isVerified = currentUser.verificationStatus === 'VERIFIED';

    if (!isVerified) {
        const banner = document.getElementById('pendingVerificationBanner');
        const refLbl = document.getElementById('pendingRefLabel');
        if (banner) banner.classList.remove('hidden');
        if (refLbl) refLbl.textContent = currentUser.id;
    } else {
        try {
            const directory = await ApiGateway.get('/alumni/directory');
            const liveAlumniCountEl = document.getElementById('liveAlumniCount');
            if (liveAlumniCountEl && directory) {
                liveAlumniCountEl.innerText = directory.length.toLocaleString();
            }
            if (currentUser.isSetCoordinator) initSetCoordinatorTools();
        } catch (e) { console.warn("Failed to fetch directory count."); }
        loadClassmateVouchQueue();
    }

    try {
        const [summary, ranks, categories] = await Promise.all([
            ApiGateway.get('/alumni/donations/summary').catch(() => null),
            ApiGateway.get('/eleco/ranks').catch(() => []),
            ApiGateway.get('/alumni/donations/categories').catch(() => [])
        ]);

        const liveEndowmentEl = document.getElementById('liveEndowment');
        if (liveEndowmentEl && summary) {
            liveEndowmentEl.innerText = '₦' + Number(summary.totalCleared || 0).toLocaleString();
        }

        const decRoleEl = document.getElementById('decRole');
        if (decRoleEl && Array.isArray(ranks) && ranks.length > 0) {
            decRoleEl.innerHTML = ranks.map(r =>
                `<option value="${DOMPurify.sanitize(r.title)}">${DOMPurify.sanitize(r.title)}</option>`
            ).join('');
        }

        const donationPurposeEl = document.getElementById('donationPurpose');
        if (donationPurposeEl && Array.isArray(categories) && categories.length > 0) {
            donationPurposeEl.innerHTML = categories.map(c =>
                `<option value="${DOMPurify.sanitize(c.name)}">${DOMPurify.sanitize(c.name)}</option>`
            ).join('');
        }
    } catch (e) { console.warn("Failed to hydrate dynamic alumni metadata."); }

    // Handle Paystack redirect verification if ?reference= is present in URL
    const urlParams = new URLSearchParams(window.location.search);
    const payRef = urlParams.get('reference') || urlParams.get('trxref');
    if (payRef) {
        try {
            const verified = await ApiGateway.get(`/alumni/donations/verify/${encodeURIComponent(payRef)}`);
            window.history.replaceState({}, document.title, window.location.pathname);
            Swal.fire('Donation Verified', `Thank you! ₦${Number(verified.amount).toLocaleString()} cleared (Ref: ${verified.txId}).`, 'success');
        } catch (err) {
            Swal.fire('Verification Pending', err.message || 'Could not verify payment immediately.', 'warning');
        }
    }

    // FIRST LOGIN MANDATORY PASSWORD ROTATION
    if (currentUser.isFirstLogin) {
        const modal = document.getElementById('firstLoginModal');
        const content = document.getElementById('firstLoginContent');
        if (modal) {
            modal.classList.add('modal-active');
            setTimeout(() => { if (content) content.classList.remove('scale-95'); }, 10);
        }

        const passForm = document.getElementById('firstPasswordForm');
        if (passForm) {
            passForm.addEventListener('submit', async function (e) {
                e.preventDefault();

                const newPass = document.getElementById('setupNewPass').value;
                const confirmPass = document.getElementById('setupConfirmPass').value;

                if (!newPass || newPass.length < 8) {
                    return Swal.fire('Validation Error', 'Password must be at least 8 characters long.', 'warning');
                }
                if (newPass !== confirmPass) {
                    return Swal.fire('Mismatch', 'The two passwords you entered do not match.', 'warning');
                }

                const btn = this.querySelector('button[type="submit"]');
                const ogText = btn.innerHTML;
                btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin mr-2"></i> Securing...';
                btn.disabled = true;

                try {
                    await ApiGateway.post('/alumni/profile/activate-password', { newPassword: newPass });

                    currentUser.isFirstLogin = false;
                    sessionStorage.setItem('rinoba_session', JSON.stringify(currentUser));

                    this.reset();
                    if (content) content.classList.add('scale-95');
                    setTimeout(() => { if (modal) modal.classList.remove('modal-active'); }, 300);

                    Swal.fire('Account Secured', 'Your permanent password has been saved to the PostgreSQL vault.', 'success');
                } catch (err) {
                    Swal.fire('Activation Failed', err.message || 'Failed to update password.', 'error');
                    btn.innerHTML = ogText;
                    btn.disabled = false;
                }
            });
        }
    }

    // LOAD PROFILE DATA INTO UI
    hydrateProfileUI();

    // Initialize Modules
    renderConnections();
    renderThreads();
    renderUserLedger();
    initSmartNotifications();
    renderElecoPhase();

    setInterval(initSmartNotifications, 30000);
});

function hydrateProfileUI() {
    if (document.getElementById('dashUserId')) document.getElementById('dashUserId').innerText = DOMPurify.sanitize(currentUser.id);
    if (document.getElementById('dashUserName')) document.getElementById('dashUserName').innerText = DOMPurify.sanitize(currentUser.name);
    if (document.getElementById('dashUserRole')) document.getElementById('dashUserRole').innerText = DOMPurify.sanitize(currentUser.role || "Alumnus");
    if (document.getElementById('dashUserSet')) document.getElementById('dashUserSet').innerText = DOMPurify.sanitize(currentUser.set);

    if (document.getElementById('profName')) document.getElementById('profName').value = currentUser.name || "";
    if (document.getElementById('profNick')) document.getElementById('profNick').value = currentUser.nickname || "";
    if (document.getElementById('profSet')) document.getElementById('profSet').value = currentUser.set || "";
    if (document.getElementById('profClass')) document.getElementById('profClass').value = currentUser.gradClass || "";
    if (document.getElementById('profHostel')) document.getElementById('profHostel').value = currentUser.hostel || "";
    if (document.getElementById('profPrefecture')) document.getElementById('profPrefecture').value = currentUser.prefecture || "";
    if (document.getElementById('profQual')) document.getElementById('profQual').value = currentUser.qualification || "";
    if (document.getElementById('profJob')) document.getElementById('profJob').value = currentUser.profession || "";
    if (document.getElementById('profRole')) document.getElementById('profRole').value = currentUser.role || "";
    if (document.getElementById('profState')) document.getElementById('profState').value = currentUser.state || "";
    if (document.getElementById('profPhone')) document.getElementById('profPhone').value = currentUser.phone || "";
    if (document.getElementById('profEmail')) document.getElementById('profEmail').value = currentUser.email || "";
    if (document.getElementById('profQuote')) document.getElementById('profQuote').value = currentUser.quote || "";

    if (currentUser.photo) {
        const safePhoto = DOMPurify.sanitize(currentUser.photo);
        if (document.getElementById('profileImagePreview')) document.getElementById('profileImagePreview').src = safePhoto;
        if (document.getElementById('dashUserAvatar')) document.getElementById('dashUserAvatar').src = safePhoto;
    }

    if (document.getElementById('dashUserId')) {
        document.getElementById('dashUserId').innerHTML = DOMPurify.sanitize(currentUser.id) +
            (currentUser.isSetCoordinator ? ' <span class="ml-2 bg-amber-100 text-amber-800 border border-amber-300 px-2 py-0.5 rounded text-[8px] font-black uppercase">Set Coordinator</span>' : '');
    }
}

async function loadClassmateVouchQueue() {
    const panel = document.getElementById('classmateVouchPanel');
    const grid = document.getElementById('classmateVouchGrid');
    const countEl = document.getElementById('vouchQueueCount');
    if (!panel || !grid) return;

    try {
        const list = await ApiGateway.get('/alumni/vetting/classmates');
        if (!list || list.length === 0) {
            panel.classList.add('hidden');
            return;
        }
        panel.classList.remove('hidden');
        if (countEl) countEl.textContent = `${list.length} Pending`;

        const isCoord = Boolean(currentUser.isSetCoordinator);
        grid.innerHTML = list.map(c => {
            const img = c.photoUrl || `https://ui-avatars.com/api/?name=${encodeURIComponent(c.name)}&background=1E3A8A&color=fff`;
            const proofHtml = c.proofDocumentUrl ? `<a href="${DOMPurify.sanitize(c.proofDocumentUrl)}" target="_blank" class="text-[9px] text-blue-600 font-bold underline block mt-0.5">View Uploaded Proof</a>` : '';
            const actionHtml = c.alreadyVouched
                ? `<span class="text-[10px] font-black uppercase text-emerald-600"><i class="fa-solid fa-check-double mr-1"></i> Vouched (${c.vouchCount}/2)</span>`
                : `<div class="flex gap-1.5">
                    <button onclick="window.vouchForClassmate('${DOMPurify.sanitize(c.id)}', '${DOMPurify.sanitize(c.name.replace(/'/g, "\\'"))}')" class="bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest shadow-sm">${isCoord ? 'Verify Now' : 'Confirm'}</button>
                    ${isCoord ? `<button onclick="window.rejectClassmate('${DOMPurify.sanitize(c.id)}', '${DOMPurify.sanitize(c.name.replace(/'/g, "\\'"))}')" class="bg-red-500 hover:bg-red-600 text-white px-3 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest shadow-sm">Decline</button>` : ''}
                   </div>`;

            return `
            <div class="p-4 border border-slate-200 rounded-2xl bg-slate-50 flex items-center justify-between gap-3">
                <div class="flex items-center gap-3 min-w-0">
                    <img src="${DOMPurify.sanitize(img)}" class="w-12 h-12 rounded-full object-cover border-2 border-white shadow-sm shrink-0">
                    <div class="min-w-0">
                        <p class="text-xs font-black text-slate-800 uppercase truncate">${DOMPurify.sanitize(c.name)}</p>
                        <p class="text-[10px] text-slate-500 font-bold truncate">${c.nickname ? `"${DOMPurify.sanitize(c.nickname)}" • ` : ''}${DOMPurify.sanitize(c.gradClass)} • ${DOMPurify.sanitize(c.hostel)}</p>
                        <p class="text-[9px] font-mono text-rinobaBlue mt-0.5">${isCoord ? '1-Click Set Rep Authority' : `Vouches: ${c.vouchCount}/2`}</p>
                        ${proofHtml}
                    </div>
                </div>
                <div class="shrink-0">${actionHtml}</div>
            </div>`;
        }).join('');
    } catch (e) {
        panel.classList.add('hidden');
    }
}

window.rejectClassmate = async function (candidateId, candidateName) {
    const { value: reason, isConfirmed } = await Swal.fire({
        title: `Decline ${candidateName}`,
        input: 'text',
        inputLabel: 'Reason (sent to registrant)',
        showCancelButton: true,
        confirmButtonColor: '#ef4444'
    });
    if (!isConfirmed || !reason?.trim()) return;
    try {
        await ApiGateway.post(`/alumni/vetting/reject/${encodeURIComponent(candidateId)}`, { reason: reason.trim() });
        Swal.fire('Declined', 'Registration rejected.', 'success');
        loadClassmateVouchQueue();
    } catch (err) {
        Swal.fire('Error', err.message, 'error');
    }
};

async function initSetCoordinatorTools() {
    const panel = document.getElementById('setCoordinatorPanel');
    const lbl = document.getElementById('coordSetLabel');
    const form = document.getElementById('coordInviteForm');
    if (!panel) return;
    panel.classList.remove('hidden');
    if (lbl) lbl.textContent = currentUser.set;
    await loadCoordinatorInvites();

    if (form && !form.dataset.bound) {
        form.dataset.bound = 'true';
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            const maxUses = parseInt(document.getElementById('coordInviteUses').value, 10) || 25;
            try {
                const created = await ApiGateway.post('/alumni/coordinator/invites', { maxUses });
                await loadCoordinatorInvites();
                Swal.fire('Invite Code Generated', `Share with verified classmates: ${created.code}`, 'success');
            } catch (err) { Swal.fire('Error', err.message, 'error'); }
        });
    }
}

async function loadCoordinatorInvites() {
    const listEl = document.getElementById('coordInvitesList');
    if (!listEl) return;
    try {
        const codes = await ApiGateway.get('/alumni/coordinator/invites');
        if (!codes || codes.length === 0) {
            listEl.innerHTML = '<p class="text-slate-400">No active invite codes for your set.</p>';
            return;
        }
        listEl.innerHTML = codes.map(c => `
            <div class="p-3 bg-slate-800 border border-slate-700 rounded-xl flex justify-between items-center">
                <div><span class="font-mono font-black text-rinobaGold">${DOMPurify.sanitize(c.code)}</span> <span class="text-slate-400 text-[10px]">(${c.usesCount}/${c.maxUses})</span></div>
                <button onclick="window.revokeCoordinatorInvite('${DOMPurify.sanitize(c.id)}')" class="text-red-400 hover:text-red-300 text-[10px] font-black uppercase">Revoke</button>
            </div>`).join('');
    } catch (e) { }
}

window.revokeCoordinatorInvite = async function (id) {
    try {
        await ApiGateway.post(`/alumni/coordinator/invites/${encodeURIComponent(id)}/deactivate`, {});
        await loadCoordinatorInvites();
    } catch (err) { Swal.fire('Error', err.message, 'error'); }
};

window.vouchForClassmate = async function (candidateId, candidateName) {
    const res = await Swal.fire({
        title: 'Confirm Classmate Identity',
        text: `Do you personally recognize ${candidateName} as a genuine alumnus from your Class Set?`,
        icon: 'question',
        showCancelButton: true,
        confirmButtonColor: '#059669',
        confirmButtonText: 'Yes, Confirm & Vouch'
    });
    if (!res.isConfirmed) return;

    try {
        const result = await ApiGateway.post(`/alumni/vetting/vouch/${encodeURIComponent(candidateId)}`, {});
        Swal.fire(
            result.promoted ? 'Member Verified!' : 'Vouch Recorded',
            result.promoted
                ? `${candidateName} is now verified and has been issued ID: ${result.officialId}.`
                : `Your vouch (${result.vouchCount}/2) has been recorded.`,
            'success'
        );
        loadClassmateVouchQueue();
    } catch (err) {
        Swal.fire('Action Denied', err.message, 'error');
    }
};

// =========================================================================
// 3. TAB NAVIGATION & SIDEBAR LOGIC
// =========================================================================
document.querySelectorAll('.nav-btn, .action-btn').forEach(btn => {
    btn.addEventListener('click', function (e) {
        e.preventDefault();
        document.querySelectorAll('aside nav button').forEach(b => {
            b.classList.remove('bg-rinobaBlue', 'text-white');
            b.classList.add('hover:bg-slate-800', 'hover:text-white');
        });

        const targetId = this.getAttribute('data-target');
        const matchingSidebarBtn = document.querySelector(`aside nav button[data-target="${targetId}"]`);
        if (matchingSidebarBtn) {
            matchingSidebarBtn.classList.remove('hover:bg-slate-800', 'hover:text-white');
            matchingSidebarBtn.classList.add('bg-rinobaBlue', 'text-white');
        }

        document.querySelectorAll('.tab-content').forEach(tab => tab.classList.remove('active'));
        const targetTab = document.getElementById(targetId);
        if (targetTab) targetTab.classList.add('active');

        const sidebar = document.getElementById('sidebar');
        const overlay = document.getElementById('sidebarOverlay');
        if (sidebar && !sidebar.classList.contains('hidden') && window.innerWidth < 1024) {
            sidebar.classList.add('-translate-x-full');
            overlay.classList.add('hidden');
            setTimeout(() => { sidebar.classList.add('hidden'); sidebar.classList.remove('flex'); }, 300);
        }
        document.querySelector('main').scrollTo({ top: 0, behavior: 'smooth' });
    });
});

document.getElementById('openSidebar')?.addEventListener('click', () => {
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebarOverlay');
    sidebar.classList.remove('hidden', '-translate-x-full');
    sidebar.classList.add('flex');
    overlay.classList.remove('hidden');
});

const closeMobileSidebar = () => {
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebarOverlay');
    sidebar.classList.add('-translate-x-full');
    overlay.classList.add('hidden');
    setTimeout(() => { sidebar.classList.add('hidden'); sidebar.classList.remove('flex'); }, 300);
};
document.getElementById('closeSidebar')?.addEventListener('click', closeMobileSidebar);
document.getElementById('sidebarOverlay')?.addEventListener('click', closeMobileSidebar);

// =========================================================================
// 4. SMART NOTIFICATIONS ENGINE (WIRED TO API)
// =========================================================================
async function initSmartNotifications() {
    const list = document.getElementById('notifList');
    const ticker = document.getElementById('liveTicker');
    const badge = document.getElementById('notifBadge');
    if (!list || !ticker) return;

    list.innerHTML = '';

    try {
        const res = await ApiGateway.get('/alumni/notifications');
        const items = res?.notifications || [];
        const unread = Number(res?.unreadCount || 0);

        if (badge) badge.classList.toggle('hidden', unread === 0);

        if (items.length === 0) {
            list.innerHTML = '<p class="text-xs text-slate-500 text-center py-6">No notifications yet.</p>';
            ticker.innerText = 'All caught up. No unread alerts.';
            return;
        }

        ticker.innerText = items[0].title + ': ' + items[0].message;

        list.innerHTML = items.map(n => {
            let borderCls = 'border-slate-200 bg-white';
            let pillCls = 'bg-blue-50 text-rinobaBlue';
            if (n.severity === 'SUCCESS') { borderCls = 'border-emerald-200 bg-emerald-50/40'; pillCls = 'bg-emerald-100 text-emerald-700'; }
            if (n.severity === 'WARNING') { borderCls = 'border-amber-200 bg-amber-50/40'; pillCls = 'bg-amber-100 text-amber-800'; }
            if (n.severity === 'DANGER') { borderCls = 'border-red-200 bg-red-50/50'; pillCls = 'bg-red-100 text-red-700'; }

            return `
            <div class="p-4 border ${borderCls} rounded-xl shadow-sm relative">
                ${!n.read ? '<span class="absolute top-3 right-3 w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse"></span>' : ''}
                <div class="flex items-center gap-2 mb-1.5">
                    <span class="${pillCls} px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-widest">${DOMPurify.sanitize(n.category)}</span>
                    <span class="text-[8px] font-bold text-slate-400">${DOMPurify.sanitize(n.timestamp)}</span>
                </div>
                <h5 class="text-xs font-black text-slate-800 uppercase">${DOMPurify.sanitize(n.title)}</h5>
                <p class="text-xs text-slate-600 mt-1 leading-relaxed">${DOMPurify.sanitize(n.message)}</p>
            </div>`;
        }).join('');
    } catch (e) {
        console.error("Notification Sync Failed:", e);
    }
}

window.openNotifications = async function () {
    const modal = document.getElementById('notifModal');
    if (modal) {
        modal.classList.add('modal-active');
        setTimeout(() => { document.getElementById('notifContent').classList.remove('scale-95', 'opacity-0'); }, 10);
    }
    try {
        await ApiGateway.post('/alumni/notifications/mark-read', {});
        const badge = document.getElementById('notifBadge');
        if (badge) badge.classList.add('hidden');
    } catch (e) { }
};

window.closeNotifications = function () {
    const content = document.getElementById('notifContent');
    if (content) content.classList.add('scale-95', 'opacity-0');
    setTimeout(() => {
        const modal = document.getElementById('notifModal');
        if (modal) modal.classList.remove('modal-active');
    }, 300);
}

// =========================================================================
// 5. PROFILE UPDATE ENGINE (REAL API INTEGRATION)
// =========================================================================
const imgInput = document.getElementById('profileImageInput');
if (imgInput) {
    imgInput.addEventListener('change', function (e) {
        const file = e.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = function (evt) { document.getElementById('profileImagePreview').src = evt.target.result; }
            reader.readAsDataURL(file);
        }
    });
}

const profForm = document.getElementById('profileUpdateForm');
if (profForm) {
    profForm.addEventListener('submit', async function (e) {
        e.preventDefault();
        const btn = document.getElementById('btnUpdateProfile');
        const originalText = btn.innerHTML;
        btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin mr-2"></i> Saving...';
        btn.disabled = true;

        const payload = {
            fullName: document.getElementById('profName').value.trim(),
            nickname: document.getElementById('profNick').value.trim(),
            classGraduated: document.getElementById('profClass').value.trim(),
            hostel: document.getElementById('profHostel').value.trim(),
            prefecture: document.getElementById('profPrefecture').value.trim(),
            qualification: document.getElementById('profQual').value.trim(),
            profession: document.getElementById('profJob').value.trim(),
            jobTitle: document.getElementById('profRole').value.trim(),
            stateOfResidence: document.getElementById('profState').value.trim(),
            phoneNumber: document.getElementById('profPhone').value.trim(),
            emailAddress: document.getElementById('profEmail').value.trim(),
            testimonial: document.getElementById('profQuote').value.trim()
        };

        const formData = new FormData();
        formData.append('data', new Blob([JSON.stringify(payload)], { type: 'application/json' }));

        const photoFile = document.getElementById('profileImageInput')?.files[0];
        if (photoFile) {
            formData.append('photo', photoFile);
        }

        try {
            const updatedProfile = await ApiGateway.putFormData('/alumni/profile/update', formData);
            currentUser = { ...currentUser, ...updatedProfile };
            sessionStorage.setItem('rinoba_session', JSON.stringify(currentUser));
            hydrateProfileUI();

            btn.innerHTML = '<i class="fa-solid fa-check mr-2"></i> Update Successful';
            btn.classList.replace('bg-rinobaBlue', 'bg-emerald-600');
            setTimeout(() => {
                btn.innerHTML = originalText;
                btn.classList.replace('bg-emerald-600', 'bg-rinobaBlue');
                btn.disabled = false;
            }, 2000);
        } catch (error) {
            Swal.fire('Update Failed', error.message, 'error');
            btn.innerHTML = originalText;
            btn.disabled = false;
        }
    });
}

// =========================================================================
// 5. PASSWORD CHANGE ENGINE (REAL API INTEGRATION)
// =========================================================================
const passForm = document.getElementById('passwordChangeForm');
if (passForm) {
    passForm.addEventListener('submit', async function (e) {
        e.preventDefault();
        const currPass = document.getElementById('secCurrentPass').value;
        const newPass = document.getElementById('secNewPass').value;

        const btn = document.getElementById('btnChangePass');
        const originalText = btn.innerHTML;
        btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin mr-2"></i> Updating...';
        btn.disabled = true;

        try {
            await ApiGateway.post('/alumni/profile/change-password', {
                currentPassword: currPass,
                newPassword: newPass
            });
            Swal.fire('Success', "Password securely changed in the database.", 'success');
            this.reset();
        } catch (error) {
            Swal.fire('Error', error.message, 'error');
        } finally {
            btn.innerHTML = originalText;
            btn.disabled = false;
        }
    });
}

// =========================================================================
// 6. THE DYNAMIC ELECO ENGINE (REAL API INTEGRATION)
// =========================================================================
let cachedCandidates = []; // Temporary RAM cache for modal viewing

async function renderElecoPhase() {
    const phaseCircles = document.querySelectorAll('.eleco-circle');
    const phaseTexts = document.querySelectorAll('.eleco-text');
    const phaseLine = document.getElementById('elecoPhaseLine');
    const statusPill = document.getElementById('elecoStatusPill');
    const titleText = document.getElementById('elecoTitle');
    const descText = document.getElementById('elecoDesc');
    const actionBtn = document.getElementById('elecoActionBtn');
    const timerContainer = document.getElementById('elecoTimerContainer');

    if (!phaseLine || !statusPill) return;

    phaseCircles.forEach(circle => {
        circle.className = "eleco-circle w-12 h-12 rounded-full bg-slate-200 text-slate-400 flex items-center justify-center font-black text-lg mx-auto shadow-md border-4 border-white transition-colors duration-300";
        circle.parentElement.classList.add('opacity-50');
    });
    phaseTexts.forEach(text => { text.className = "eleco-text text-[10px] font-black uppercase tracking-widest mt-2 text-slate-500 transition-colors duration-300"; });

    try {
        //  Fetch real-time status from PostgreSQL
        const [cycle, myStatus] = await Promise.all([
            ApiGateway.get('/eleco/status'),
            ApiGateway.get('/eleco/my-status')
        ]);

        if (!cycle) return;

        const activePhase = cycle.currentPhase.toString();
        const deadline = cycle.deadline;
        const myCandidacy = myStatus.candidacy;
        const hasVoted = myStatus.hasVoted;

        if (deadline) {
            timerContainer.classList.remove('hidden');
            if (timerInterval) clearInterval(timerInterval);

            timerInterval = setInterval(() => {
                const now = new Date().getTime();
                const target = new Date(deadline).getTime();
                const distance = target - now;

                if (distance < 0) {
                    clearInterval(timerInterval);
                    document.getElementById('elecoCountdown').innerText = "DEADLINE PASSED";
                } else {
                    const days = Math.floor(distance / (1000 * 60 * 60 * 24));
                    const hours = Math.floor((distance % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
                    const minutes = Math.floor((distance % (1000 * 60 * 60)) / (1000 * 60));
                    const seconds = Math.floor((distance % (1000 * 60)) / 1000);
                    document.getElementById('elecoCountdown').innerText = `${days}d ${hours}h ${minutes}m ${seconds}s`;
                }
            }, 1000);
        }

        const buildCandidacyPill = (cand) => {
            if (!cand || !cand.status) return '';
            const st = cand.status.toUpperCase();
            if (st === 'APPROVED') {
                return `<div class="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest bg-emerald-100 text-emerald-800 border border-emerald-300 shadow-sm"><i class="fa-solid fa-circle-check text-emerald-600"></i> Intent Status: Approved (${DOMPurify.sanitize(cand.role)})</div>`;
            }
            if (st === 'REJECTED') {
                const reasonNote = cand.reason ? `<p class="text-xs text-red-700 font-medium mt-2">Reason: ${DOMPurify.sanitize(cand.reason)}</p>` : '';
                return `<div class="inline-block px-5 py-2.5 rounded-xl bg-red-100 text-red-800 border border-red-300 shadow-sm"><span class="inline-flex items-center gap-2 text-xs font-black uppercase tracking-widest"><i class="fa-solid fa-circle-xmark text-red-600"></i> Intent Status: Rejected (${DOMPurify.sanitize(cand.role)})</span>${reasonNote}</div>`;
            }
            return `<div class="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest bg-amber-100 text-amber-800 border border-amber-300 shadow-sm animate-pulse"><i class="fa-solid fa-clock text-amber-600"></i> Intent Status: Pending Vetting (${DOMPurify.sanitize(cand.role)})</div>`;
        };

        let existingBadge = document.getElementById('elecoPersonalStatusBadge');
        if (!existingBadge) {
            existingBadge = document.createElement('div');
            existingBadge.id = 'elecoPersonalStatusBadge';
            existingBadge.className = 'mb-5';
            actionBtn.parentNode.insertBefore(existingBadge, actionBtn);
        }
        existingBadge.innerHTML = '';

        if (activePhase === '1') {
            phaseLine.style.width = '15%';
            phaseCircles[0].className = "eleco-circle w-12 h-12 rounded-full bg-rinobaBlue text-white flex items-center justify-center font-black text-lg mx-auto shadow-md border-4 border-white";
            phaseCircles[0].parentElement.classList.remove('opacity-50');
            phaseTexts[0].classList.replace('text-slate-500', 'text-rinobaBlue');

            statusPill.innerText = "Phase 1: Declarations Open";
            statusPill.className = "inline-block bg-amber-100 text-amber-800 px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest mb-4 border border-amber-200";
            titleText.innerText = "Submit Your Intent";
            descText.innerText = "The Electoral Committee is accepting official dossiers and credentials for moderation.";

            if (myCandidacy) {
                existingBadge.innerHTML = buildCandidacyPill(myCandidacy);
                actionBtn.classList.add('hidden');
                actionBtn.onclick = null;
            } else {
                actionBtn.classList.remove('hidden');
                actionBtn.innerHTML = '<i class="fa-solid fa-file-signature mr-2"></i> Declare Intent';
                actionBtn.className = "bg-rinobaGold hover:bg-yellow-400 text-slate-900 px-8 py-3 rounded-xl text-xs font-black uppercase tracking-widest shadow-md transition-colors cursor-pointer";
                actionBtn.onclick = executeElecoAction;
            }
        }
        else if (activePhase === '2') {
            phaseLine.style.width = '50%';
            phaseCircles[0].className = "eleco-circle w-12 h-12 rounded-full bg-rinobaBlue text-white flex items-center justify-center font-black text-lg mx-auto shadow-md border-4 border-white";
            phaseCircles[1].className = "eleco-circle w-12 h-12 rounded-full bg-rinobaBlue text-white flex items-center justify-center font-black text-lg mx-auto shadow-md border-4 border-white";
            phaseCircles[0].parentElement.classList.remove('opacity-50');
            phaseCircles[1].parentElement.classList.remove('opacity-50');
            phaseTexts[0].classList.replace('text-slate-500', 'text-rinobaBlue');
            phaseTexts[1].classList.replace('text-slate-500', 'text-rinobaBlue');

            statusPill.innerText = "Phase 2: Campaigns Active";
            statusPill.className = "inline-block bg-blue-100 text-rinobaBlue px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest mb-4 border border-blue-200";
            titleText.innerText = "Review the Candidates";
            descText.innerText = "ELECO has approved the official manifestos. Review the candidates before the digital ballot opens.";

            if (myCandidacy) existingBadge.innerHTML = buildCandidacyPill(myCandidacy);

            actionBtn.classList.remove('hidden');
            actionBtn.innerHTML = '<i class="fa-solid fa-users-viewfinder mr-2"></i> View Manifestos';
            actionBtn.className = "bg-slate-900 hover:bg-black text-white px-8 py-3 rounded-xl text-xs font-black uppercase tracking-widest shadow-md transition-colors cursor-pointer";
            actionBtn.onclick = executeElecoAction;
        }
        else if (activePhase === '3') {
            phaseLine.style.width = '100%';
            phaseCircles.forEach(circle => {
                circle.className = "eleco-circle w-12 h-12 rounded-full bg-emerald-500 text-white flex items-center justify-center font-black text-lg mx-auto shadow-md border-4 border-white";
                circle.parentElement.classList.remove('opacity-50');
            });
            phaseTexts.forEach(text => { text.classList.replace('text-slate-500', 'text-emerald-600'); });

            statusPill.innerText = "Phase 3: Live Voting Open";
            statusPill.className = "inline-block bg-emerald-100 text-emerald-700 px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest mb-4 border border-emerald-200";
            titleText.innerText = "Cast Your Digital Ballot";
            descText.innerText = "Voting is strictly monitored and anonymous. You may only cast your ballot once.";

            const candBadge = myCandidacy ? buildCandidacyPill(myCandidacy) : '';

            if (hasVoted) {
                existingBadge.innerHTML = candBadge + `<div class="mt-2 inline-flex items-center gap-2 px-6 py-3 rounded-xl text-xs font-black uppercase tracking-widest bg-emerald-100 text-emerald-800 border border-emerald-300 shadow-sm"><i class="fa-solid fa-check-double text-emerald-600"></i> Ballot Cast &amp; Sealed</div>`;
                actionBtn.classList.add('hidden');
                actionBtn.onclick = null;
            } else {
                existingBadge.innerHTML = candBadge + `<div class="mt-2 inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest bg-amber-100 text-amber-800 border border-amber-200"><i class="fa-solid fa-hourglass-half"></i> Ballot Status: Not Yet Voted</div>`;
                actionBtn.classList.remove('hidden');
                actionBtn.innerHTML = '<i class="fa-solid fa-check-to-slot mr-2"></i> Enter Voting Booth';
                actionBtn.className = "bg-emerald-600 hover:bg-emerald-700 text-white px-8 py-3 rounded-xl text-xs font-black uppercase tracking-widest shadow-md transition-colors cursor-pointer";
                actionBtn.onclick = executeElecoAction;
            }
        }
    } catch (e) {
        console.error("Failed to render ELECO phase", e);
    }
}

window.executeElecoAction = async function () {
    if (currentUser.verificationStatus !== 'VERIFIED') {
        return Swal.fire('Verification Required', 'ELECO participation unlocks once your RINOBA membership is verified.', 'info');
    }

    try {
        const cycle = await ApiGateway.get('/eleco/status');
        const activePhase = cycle.currentPhase.toString();

        const deadlineText = document.getElementById('elecoCountdown').innerText;
        if (deadlineText === "DEADLINE PASSED") {
            Swal.fire('Deadline Elapsed', "The deadline for this phase has elapsed. Please wait for ELECO to announce the next phase.", 'warning');
            return;
        }

        if (activePhase === '1') {
            const modal = document.getElementById('elecoDeclarationModal');
            modal.classList.add('modal-active');
            setTimeout(() => { document.getElementById('elecoDeclarationContent').classList.remove('scale-95', 'opacity-0'); }, 10);
        }
        else if (activePhase === '2') {
            const grid = document.getElementById('candidatesGrid');
            grid.innerHTML = `<div class="col-span-full py-8 text-center text-slate-500 font-bold text-xs"><i class="fa-solid fa-spinner fa-spin mr-2"></i> Fetching Candidates...</div>`;

            const modal = document.getElementById('elecoCandidatesModal');
            modal.classList.add('modal-active');
            setTimeout(() => { document.getElementById('elecoCandidatesContent').classList.remove('scale-95', 'opacity-0'); }, 10);

            const approved = await ApiGateway.get('/eleco/candidates');
            cachedCandidates = approved; // Cache for dossier viewing

            if (!approved || approved.length === 0) {
                grid.innerHTML = `<div class="col-span-full py-8 text-center text-slate-500 font-bold text-xs">ELECO has not approved any candidates yet. Check back shortly.</div>`;
            } else {
                grid.innerHTML = '';
                approved.forEach(c => {
                    grid.innerHTML += `
                    <div class="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
                        <div class="flex items-center gap-4 mb-4 border-b border-slate-100 pb-4">
                            <img src="${DOMPurify.sanitize(c.image || 'https://ui-avatars.com/api/?name=C&background=1E3A8A&color=fff')}" class="w-12 h-12 rounded-full object-cover border-2 border-slate-200">
                            <div>
                                <h4 class="text-sm font-black text-slate-800 uppercase">${DOMPurify.sanitize(c.name)}</h4>
                                <span class="text-[9px] font-bold text-rinobaBlue uppercase tracking-widest block mt-0.5">${DOMPurify.sanitize(c.role)}</span>
                            </div>
                        </div>
                        <p class="text-xs text-slate-600 italic mb-4 font-bold">"${DOMPurify.sanitize(c.slogan)}"</p>
                        <button onclick="openDossierModal('${DOMPurify.sanitize(c.id)}')" class="w-full bg-slate-100 hover:bg-rinobaBlue hover:text-white text-rinobaBlue py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-colors"><i class="fa-solid fa-eye mr-1"></i> Read Action Plan</button>
                    </div>`;
                });
            }
        }
        else if (activePhase === '3') {
            const form = document.getElementById('votingBallotForm');
            form.innerHTML = `<p class="text-center text-slate-500 font-bold text-xs"><i class="fa-solid fa-spinner fa-spin mr-2"></i> Preparing Ballot...</p>`;

            const modal = document.getElementById('elecoVotingModal');
            modal.classList.add('modal-active');
            setTimeout(() => { document.getElementById('elecoVotingContent').classList.remove('scale-95', 'opacity-0'); }, 10);

            const approved = await ApiGateway.get('/eleco/candidates');

            if (!approved || approved.length === 0) {
                form.innerHTML = `<p class="text-center text-slate-500 font-bold text-xs">No approved candidates on ballot.</p>`;
                document.getElementById('btnSubmitVotes').classList.add('hidden');
            } else {
                document.getElementById('btnSubmitVotes').classList.remove('hidden');
                form.innerHTML = '';

                const roles = [...new Set(approved.map(c => c.role))];
                roles.forEach(role => {
                    let roleHtml = `
                    <div class="bg-slate-50 border border-slate-200 rounded-2xl p-6 shadow-sm">
                        <h4 class="text-xs font-black uppercase tracking-widest text-slate-500 mb-4 border-b border-slate-200 pb-2">${DOMPurify.sanitize(role)}</h4>
                        <div class="space-y-3">`;

                    const roleCandidates = approved.filter(c => c.role === role);
                    roleCandidates.forEach(c => {
                        roleHtml += `
                        <label class="flex items-center gap-4 p-4 bg-white border border-slate-200 rounded-xl cursor-pointer hover:border-emerald-500 hover:shadow-md transition-all">
                            <input type="radio" name="vote_${role.replace(/\s+/g, '')}" value="${DOMPurify.sanitize(c.id)}" data-portfolio="${DOMPurify.sanitize(role)}" class="w-5 h-5 text-emerald-600 focus:ring-emerald-500">
                            <img src="${DOMPurify.sanitize(c.image || 'https://ui-avatars.com/api/?name=C&background=1E3A8A&color=fff')}" class="w-10 h-10 rounded-full object-cover shadow-sm">
                            <span class="font-black text-slate-800 text-sm uppercase">${DOMPurify.sanitize(c.name)}</span>
                        </label>`;
                    });
                    roleHtml += `</div></div>`;
                    form.innerHTML += roleHtml;
                });
            }
        }
    } catch (e) {
        Swal.fire('Error', 'Failed to communicate with ELECO server.', 'error');
    }
}

// Opens the Public Dossier (Hides sensitive Credentials)
window.openDossierModal = function (id) {
    const c = cachedCandidates.find(x => x.id === id);
    if (!c) return;

    document.getElementById('pubManImg').src = DOMPurify.sanitize(c.image || 'https://ui-avatars.com/api/?name=C&background=1E3A8A&color=fff');
    document.getElementById('pubManName').innerText = DOMPurify.sanitize(c.name);
    document.getElementById('pubManRole').innerText = DOMPurify.sanitize(c.role);

    document.getElementById('pubManText').innerHTML = `
        <div class="mb-4">
            <h4 class="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1">Campaign Slogan</h4>
            <p class="text-sm text-slate-800 font-medium italic">"${DOMPurify.sanitize(c.slogan)}"</p>
        </div>
        <div class="mb-4">
            <h4 class="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1">Academic & Professional Pedigree</h4>
            <p class="text-sm text-slate-700 leading-relaxed">${DOMPurify.sanitize(c.pedigree)}</p>
        </div>
        <div class="mb-4">
            <h4 class="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1">Core Action Plan</h4>
            <p class="text-sm text-slate-700 leading-relaxed">${DOMPurify.sanitize(c.actionPlan)}</p>
        </div>
    `;

    const modal = document.getElementById('alumniDossierModal');
    modal.classList.remove('hidden');
    setTimeout(() => { document.getElementById('alumniDossierContent').classList.remove('scale-95', 'opacity-0'); }, 10);
}

window.closeDossierModal = function () {
    document.getElementById('alumniDossierContent').classList.add('scale-95', 'opacity-0');
    setTimeout(() => { document.getElementById('alumniDossierModal').classList.add('hidden'); }, 300);
}

// Phase 1 Submission (Structured Form)
const decForm = document.getElementById('declarationForm');
if (decForm) {
    decForm.addEventListener('submit', async function (e) {
        e.preventDefault();

        const btn = this.querySelector('button[type="submit"]');
        const ogText = btn.innerHTML;
        btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin mr-2"></i> Submitting...';
        btn.disabled = true;

        const role = document.getElementById('decRole').value;
        const slogan = document.getElementById('decSlogan').value;
        const pedigree = document.getElementById('decPedigree').value;
        const actionPlan = document.getElementById('decActionPlan').value;
        const credFile = document.getElementById('decCredentials').files[0];

        const payload = {
            portfolio: role,
            slogan: slogan,
            pedigree: pedigree,
            actionPlan: actionPlan
        };

        const formData = new FormData();
        formData.append("data", new Blob([JSON.stringify(payload)], { type: "application/json" }));
        formData.append("credentials", credFile);

        try {
            //  REAL API CALL: Streams credentials to B2 and saves declaration
            await ApiGateway.postFormData('/eleco/declare', formData);

            closeElecoModals();
            this.reset();
            renderElecoPhase();
            Swal.fire('Submitted', "Declaration submitted securely to ELECO. You will be notified via Smart Updates once moderation is complete.", 'success');
        } catch (error) {
            Swal.fire('Submission Failed', error.message, 'error');
        } finally {
            btn.innerHTML = ogText;
            btn.disabled = false;
        }
    });
}

// Phase 3 Submission (Voting)
window.submitVotes = async function () {
    const res = await Swal.fire({
        title: 'Cast Ballot?',
        text: 'Are you ready to cast your official ballot? This action is irreversible.',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#10b981',
        confirmButtonText: 'Yes, Submit Votes'
    });

    if (!res.isConfirmed) return;

    const btn = document.getElementById('btnSubmitVotes');
    const ogText = btn.innerHTML;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin mr-2"></i> Casting Ballot...';
    btn.disabled = true;

    let votesArray = [];
    const radios = document.querySelectorAll('#votingBallotForm input[type="radio"]:checked');

    radios.forEach(radio => {
        votesArray.push({
            candidateId: radio.value,
            portfolio: radio.getAttribute('data-portfolio')
        });
    });

    if (votesArray.length === 0) {
        Swal.fire('Ballot Error', "Please select at least one candidate to cast your ballot.", 'warning');
        btn.innerHTML = ogText;
        btn.disabled = false;
        return;
    }

    try {
        //  REAL API CALL: Casts anonymous votes directly into PostgreSQL
        await ApiGateway.post('/eleco/vote', votesArray);

        closeElecoModals();
        renderElecoPhase();
        Swal.fire('Voted', "Your votes have been securely recorded in the digital ballot box in the Cloud Vault. Thank you.", 'success');
    } catch (error) {
        Swal.fire('Voting Failed', error.message, 'error');
    } finally {
        btn.innerHTML = ogText;
        btn.disabled = false;
    }
};

window.closeElecoModals = function () {
    const ids = ['elecoDeclarationContent', 'elecoCandidatesContent', 'elecoVotingContent'];
    ids.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.classList.add('scale-95', 'opacity-0');
    });
    setTimeout(() => {
        if (document.getElementById('elecoDeclarationModal')) document.getElementById('elecoDeclarationModal').classList.remove('modal-active');
        if (document.getElementById('elecoCandidatesModal')) document.getElementById('elecoCandidatesModal').classList.remove('modal-active');
        if (document.getElementById('elecoVotingModal')) document.getElementById('elecoVotingModal').classList.remove('modal-active');
    }, 300);
}

// =========================================================================
// 7. CONNECTIONS ENGINE (REAL API INTEGRATION)
// =========================================================================
async function renderConnections() {
    const recContainer = document.getElementById('receivedRequestsContainer');
    const sentContainer = document.getElementById('sentRequestsContainer');
    if (!recContainer || !sentContainer) return;

    if (currentUser.verificationStatus !== 'VERIFIED') {
        recContainer.innerHTML = '<p class="text-xs text-amber-700 font-bold">Locked until profile verification is completed.</p>';
        sentContainer.innerHTML = '<p class="text-xs text-amber-700 font-bold">Locked until profile verification is completed.</p>';
        return;
    }

    try {
        const data = await ApiGateway.get('/alumni/connect/my-requests');
        const received = data.received || [];
        const sent = data.sent || [];

        recContainer.innerHTML = '';
        if (received.length === 0) {
            recContainer.innerHTML = '<p class="text-xs text-slate-400">No pending requests.</p>';
        } else {
            received.forEach(req => {
                if (req.status === 'PENDING') {
                    recContainer.innerHTML += `
                    <div class="flex items-center justify-between p-3 bg-blue-50 border border-blue-100 rounded-xl mb-3">
                        <div><p class="text-sm font-bold text-rinobaBlue">${DOMPurify.sanitize(req.fromName)}</p><p class="text-[9px] uppercase tracking-widest text-slate-500">Requested Access</p></div>
                        <div class="flex gap-2">
                            <button onclick="updateRequest('${DOMPurify.sanitize(req.reqId)}', 'APPROVED')" class="bg-emerald-500 text-white w-8 h-8 rounded-full hover:bg-emerald-600"><i class="fa-solid fa-check"></i></button>
                            <button onclick="updateRequest('${DOMPurify.sanitize(req.reqId)}', 'DECLINED')" class="bg-red-500 text-white w-8 h-8 rounded-full hover:bg-red-600"><i class="fa-solid fa-xmark"></i></button>
                        </div>
                    </div>`;
                }
            });
        }

        sentContainer.innerHTML = '';
        if (sent.length === 0) {
            sentContainer.innerHTML = '<p class="text-xs text-slate-400">You have not sent any requests.</p>';
        } else {
            sent.forEach(req => {
                let statusUi = '';
                if (req.status === 'PENDING') statusUi = `<button onclick="abortRequest('${DOMPurify.sanitize(req.reqId)}')" class="text-[9px] font-bold text-red-400 underline">Abort</button>`;
                if (req.status === 'APPROVED') statusUi = `<div class="text-xs font-mono text-emerald-600 font-bold">${DOMPurify.sanitize(req.targetEmail)}<br>${DOMPurify.sanitize(req.targetPhone)}</div>`;
                if (req.status === 'DECLINED') statusUi = `<span class="text-[10px] text-red-500 font-bold uppercase">Declined</span>`;

                sentContainer.innerHTML += `
                <div class="flex items-center justify-between p-3 bg-white border border-slate-200 rounded-xl mb-3">
                    <div><p class="text-sm font-bold text-slate-800">${DOMPurify.sanitize(req.toName)}</p><p class="text-[9px] uppercase tracking-widest text-slate-400">Status: ${DOMPurify.sanitize(req.status)}</p></div>
                    <div class="text-right">${statusUi}</div>
                </div>`;
            });
        }
    } catch (e) {
        console.error("Failed to load connections", e);
    }
}

window.updateRequest = async function (reqId, status) {
    try {
        await ApiGateway.post('/alumni/connect/action', { requestId: reqId, action: status });
        renderConnections();
    } catch (e) {
        Swal.fire('Error', e.message, 'error');
    }
}

window.abortRequest = async function (reqId) {
    try {
        await ApiGateway.delete(`/alumni/connect/request/${reqId}`);
        renderConnections();
    } catch (e) {
        Swal.fire('Error', e.message, 'error');
    }
}

// =========================================================================
// 8. NETWORK HUB (Forum) (REAL API INTEGRATION)
// =========================================================================
async function renderThreads() {
    const container = document.getElementById('threadsContainer');
    if (!container) return;

    container.innerHTML = '<p class="text-xs text-slate-400 text-center py-4"><i class="fa-solid fa-spinner fa-spin mr-2"></i> Loading Network Hub...</p>';

    if (currentUser.verificationStatus !== 'VERIFIED') {
        container.innerHTML = '<p class="text-xs text-amber-700 bg-amber-50 border border-amber-200 p-4 rounded-xl text-center font-bold">Network Hub unlocks once your RINOBA profile is verified.</p>';
        return;
    }

    try {
        networkThreads = await ApiGateway.get('/network/threads');
        container.innerHTML = '';

        if (!networkThreads || networkThreads.length === 0) {
            container.innerHTML = '<p class="text-xs text-slate-400 text-center py-4">No threads published yet.</p>';
            return;
        }

        networkThreads.forEach(t => {
            const safeImage = window.resolveMediaUrl ? window.resolveMediaUrl(t.image) : (t.image || 'https://ui-avatars.com/api/?name=A&background=1E3A8A&color=fff');
            container.innerHTML += `
            <div class="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm hover:border-rinobaBlue transition-colors cursor-pointer mb-4" onclick="openThreadDetail('${DOMPurify.sanitize(t.id)}')">
                <div class="flex items-start gap-4">
                    <div class="w-10 h-10 rounded-full overflow-hidden shrink-0 border border-slate-200"><img src="${DOMPurify.sanitize(safeImage)}" class="w-full h-full object-cover"></div>
                    <div class="flex-1">
                        <span class="bg-blue-50 text-rinobaBlue border border-blue-100 px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-widest mr-2">${DOMPurify.sanitize(t.tag)}</span>
                        <h4 class="text-base font-black text-slate-800 mt-1">${DOMPurify.sanitize(t.title)}</h4>
                        <p class="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-1">Posted by ${DOMPurify.sanitize(t.author)} • ${DOMPurify.sanitize(t.time)}</p>
                        <p class="text-sm text-slate-600 mt-2 line-clamp-1">${DOMPurify.sanitize(t.body)}</p>
                        <div class="mt-3 text-[10px] font-black uppercase tracking-widest text-rinobaBlue"><i class="fa-regular fa-comment mr-1"></i> ${t.repliesCount} Replies</div>
                    </div>
                </div>
            </div>`;
        });
    } catch (e) {
        container.innerHTML = '<p class="text-xs text-red-500 text-center py-4">Failed to load Network Hub.</p>';
    }
}

window.openThreadDetail = async function (id) {
    const thread = networkThreads.find(t => t.id === id);
    if (!thread) return;
    currentThreadId = id;

    const safeImage = window.resolveMediaUrl ? window.resolveMediaUrl(thread.image) : (thread.image || 'https://ui-avatars.com/api/?name=A&background=1E3A8A&color=fff');

    document.getElementById('activeThreadTag').innerText = thread.tag;
    document.getElementById('activeThreadTitle').innerText = thread.title;
    document.getElementById('activeThreadAuthor').innerText = thread.author;
    document.getElementById('activeThreadTime').innerText = "Posted " + thread.time;
    document.getElementById('activeThreadBody').innerText = thread.body;
    document.getElementById('activeThreadImg').src = safeImage;

    const repliesContainer = document.getElementById('repliesContainer');
    repliesContainer.innerHTML = '<p class="text-xs text-slate-400 text-center py-4"><i class="fa-solid fa-spinner fa-spin mr-2"></i> Loading replies...</p>';

    document.getElementById('threadListView').classList.add('hidden');
    document.getElementById('threadDetailView').classList.remove('hidden');

    try {
        const replies = await ApiGateway.get(`/network/threads/${id}/replies`);
        repliesContainer.innerHTML = '';

        if (!replies || replies.length === 0) {
            repliesContainer.innerHTML = '<p class="text-xs text-slate-400 text-center py-4">No replies yet. Be the first to respond.</p>';
            return;
        }

        replies.forEach(r => {
            const safeReplyImage = window.resolveMediaUrl ? window.resolveMediaUrl(r.image) : (r.image || 'https://ui-avatars.com/api/?name=A&background=1E3A8A&color=fff');
            repliesContainer.innerHTML += `
            <div class="flex gap-4 mb-4">
                <img src="${DOMPurify.sanitize(safeReplyImage)}" class="w-10 h-10 rounded-full border border-slate-300 object-cover shrink-0">
                <div class="bg-white p-5 rounded-2xl border border-slate-200 w-full shadow-sm">
                    <div class="flex justify-between items-center mb-2">
                        <h4 class="text-xs font-black text-rinobaBlue">${DOMPurify.sanitize(r.author)}</h4>
                        <span class="text-[8px] text-slate-400 font-bold uppercase tracking-widest">${DOMPurify.sanitize(r.time)}</span>
                    </div>
                    <p class="text-sm text-slate-600">${DOMPurify.sanitize(r.text)}</p>
                </div>
            </div>`;
        });
    } catch (e) {
        repliesContainer.innerHTML = '<p class="text-xs text-red-500 text-center py-4">Failed to load replies.</p>';
    }
}

window.closeThreadDetail = function () {
    document.getElementById('threadDetailView').classList.add('hidden');
    document.getElementById('threadListView').classList.remove('hidden');
    currentThreadId = null;
}

window.submitReply = async function () {
    const input = document.getElementById('replyInput');
    if (!input.value.trim() || !currentThreadId) return;

    try {
        await ApiGateway.post('/network/replies/add', {
            threadId: currentThreadId,
            content: input.value.trim()
        });

        input.value = '';
        // Re-fetch replies to show the new one
        openThreadDetail(currentThreadId);
    } catch (e) {
        Swal.fire('Error', e.message || 'Failed to post reply.', 'error');
    }
};

window.openNewThreadModal = function () { document.getElementById('newThreadModal').classList.add('modal-active'); }
window.closeNewThreadModal = function () { document.getElementById('newThreadModal').classList.remove('modal-active'); }

window.submitNewThread = async function () {
    const title = document.getElementById('threadTitle').value;
    const body = document.getElementById('threadBody').value;
    const category = document.getElementById('threadCategory')?.value || 'GENERAL';
    if (!title || !body) return;

    try {
        await ApiGateway.post('/network/threads/create', {
            title: title.trim(),
            content: body.trim(),
            category: category
        });

        closeNewThreadModal();
        document.getElementById('threadTitle').value = '';
        document.getElementById('threadBody').value = '';
        renderThreads();
        Swal.fire('Success', 'Thread published to Network Hub.', 'success');
    } catch (e) {
        Swal.fire('Error', e.message || 'Failed to create thread.', 'error');
    }
};

window.toggleExpandAlumniText = function (elementId, btnEl) {
    const el = document.getElementById(elementId);
    if (!el) return;
    const expanded = el.getAttribute('data-expanded') === 'true';
    const fullText = decodeURIComponent(el.getAttribute('data-full'));
    if (expanded) {
        el.textContent = fullText.substring(0, 160) + '...';
        el.setAttribute('data-expanded', 'false');
        btnEl.innerText = 'Read More';
    } else {
        el.textContent = fullText;
        el.setAttribute('data-expanded', 'true');
        btnEl.innerText = 'Show Less';
    }
};

// =========================================================================
// 9. FINANCIAL LEDGER (REAL API INTEGRATION)
// =========================================================================
window.logoutUser = function () {
    //   Route through the secure logout function if available
    if (typeof window.executeSystemLogout === 'function') {
        window.executeSystemLogout();
    } else {
        sessionStorage.clear();
        localStorage.removeItem('rinoba_session');
        window.location.href = "alumni_login.html";
    }
}

window.openDonationModal = function () {
    const modal = document.getElementById('donationModal');
    if (modal) {
        modal.classList.add('modal-active');
        setTimeout(() => { document.getElementById('donationContent').classList.remove('scale-95'); }, 10);
    }
}
window.closeDonationModal = function () {
    const content = document.getElementById('donationContent');
    if (content) content.classList.add('scale-95');
    setTimeout(() => {
        const modal = document.getElementById('donationModal');
        if (modal) modal.classList.remove('modal-active');
    }, 200);
}

window.processDonation = async function () {
    const amt = document.getElementById('donationAmount').value;
    const purpose = document.getElementById('donationPurpose').value;
    if (!amt || Number(amt) < 1000) return Swal.fire('Error', "Minimum donation is ₦1,000", 'error');
    if (!purpose) return Swal.fire('Error', "Please select an endowment project.", 'error');

    Swal.fire({ title: 'Initializing Secure Gateway...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });

    try {
        const initRes = await ApiGateway.post('/alumni/donations/initialize', {
            amount: parseFloat(amt),
            purpose: purpose
        });

        Swal.close();

        if (typeof PaystackPop !== 'undefined' && initRes.publicKey) {
            const handler = PaystackPop.setup({
                key: initRes.publicKey,
                email: initRes.email,
                amount: initRes.amountKobo,
                currency: 'NGN',
                ref: initRes.reference,
                onClose: () => {
                    renderUserLedger();
                    Swal.fire('Checkout Closed', 'Payment was cancelled before completion.', 'info');
                },
                callback: async (response) => {
                    Swal.fire({ title: 'Verifying Settlement...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
                    try {
                        const verified = await ApiGateway.get(`/alumni/donations/verify/${encodeURIComponent(response.reference)}`);
                        await renderUserLedger();
                        const summary = await ApiGateway.get('/alumni/donations/summary').catch(() => null);
                        if (summary && document.getElementById('liveEndowment')) {
                            document.getElementById('liveEndowment').innerText = '₦' + Number(summary.totalCleared || 0).toLocaleString();
                        }
                        closeDonationModal();
                        document.getElementById('donationAmount').value = '';
                        Swal.fire('Endowment Cleared', `Thank you! ₦${Number(verified.amount).toLocaleString()} verified. Ref: ${verified.txId}`, 'success');
                    } catch (err) {
                        Swal.fire('Verification Failed', err.message || 'Could not verify transaction.', 'error');
                    }
                }
            });
            handler.openIframe();
        } else if (initRes.authorizationUrl) {
            window.location.href = initRes.authorizationUrl;
        } else {
            throw new Error("Paystack gateway configuration unavailable.");
        }
    } catch (e) {
        Swal.fire('Gateway Error', e.message || "Failed to initialize Paystack transaction.", 'error');
    }
};

async function renderUserLedger() {
    const tbody = document.getElementById('donationLedgerBody');
    if (!tbody) return;

    tbody.innerHTML = '<tr><td colspan="5" class="text-center py-8 text-slate-400"><i class="fa-solid fa-spinner fa-spin text-2xl mb-2"></i><br>Syncing Ledger...</td></tr>';

    try {
        const myDonations = await ApiGateway.get('/alumni/donations/my');
        let totalDonated = 0;
        tbody.innerHTML = '';

        if (!myDonations || myDonations.length === 0) {
            tbody.innerHTML = `<tr><td colspan="5" class="px-6 py-8 text-center text-slate-400 font-bold">No contributions found.</td></tr>`;
        } else {
            myDonations.forEach(d => {
                if (d.status === 'CLEARED') totalDonated += Number(d.amount);
                let badge = `<span class="bg-amber-100 text-amber-700 px-2 py-1 rounded text-[9px] font-black uppercase">Pending</span>`;
                if (d.status === 'CLEARED') badge = `<span class="bg-emerald-100 text-emerald-600 px-2 py-1 rounded text-[9px] font-black uppercase"><i class="fa-solid fa-check"></i> Cleared</span>`;
                if (d.status === 'FAILED') badge = `<span class="bg-red-100 text-red-600 px-2 py-1 rounded text-[9px] font-black uppercase"><i class="fa-solid fa-xmark"></i> Failed</span>`;

                tbody.innerHTML += `
                <tr class="border-b border-slate-100 hover:bg-slate-50 transition-colors">
                    <td class="px-6 py-4 font-mono text-[11px] font-bold text-rinobaBlue">${DOMPurify.sanitize(d.txId)}</td>
                    <td class="px-6 py-4 text-[10px] uppercase tracking-widest font-bold text-slate-400">${DOMPurify.sanitize(d.date)}</td>
                    <td class="px-6 py-4 font-bold text-slate-800">${DOMPurify.sanitize(d.purpose)}</td>
                    <td class="px-6 py-4 text-emerald-600 font-black">₦${Number(d.amount).toLocaleString()}</td>
                    <td class="px-6 py-4 text-center">${badge}</td>
                </tr>`;
            });
        }

        const totalDisplay = document.getElementById('myTotalDonations');
        if (totalDisplay) totalDisplay.innerText = `Cleared: ₦${totalDonated.toLocaleString()}`;
    } catch (e) {
        tbody.innerHTML = `<tr><td colspan="5" class="px-6 py-8 text-center text-red-500 font-bold">Failed to load ledger from database.</td></tr>`;
    }
}