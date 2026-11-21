// =========================================================================
// G.U.S.S. RINOBA — ENTERPRISE ALUMNI AUTHENTICATION GATEWAY
// Location: portals/assets/js/alumni_auth_app.js
// =========================================================================
import { ApiGateway } from './api_gateway.js';

document.addEventListener('DOMContentLoaded', () => {
    const select = document.getElementById('classSet');
    if (select) {
        const currentYear = new Date().getFullYear();
        select.innerHTML = '<option value="">Select Year...</option>';
        for (let year = currentYear; year >= 1980; year--) {
            select.innerHTML += `<option value="Class of ${year}">Class of ${year}</option>`;
        }
    }

    const regForm = document.getElementById('registrationForm');
    if (regForm) {
        regForm.addEventListener('submit', executeRegistrationProtocol);
    }

    const loginForm = document.getElementById('loginForm');
    if (loginForm) {
        loginForm.addEventListener('submit', executeLoginProtocol);
    }

    const forgotPassLink = document.getElementById('forgotPasswordLink');
    if (forgotPassLink) {
        forgotPassLink.addEventListener('click', (e) => {
            e.preventDefault();
            executeTwoStagePasswordReset();
        });
    }
});

window.nextStep = function (currentStep) {
    const currentPanel = document.getElementById(`step-${currentStep}`);
    const inputs = currentPanel.querySelectorAll('input[required], select[required], textarea[required]');

    for (let i = 0; i < inputs.length; i++) {
        if (!inputs[i].checkValidity()) {
            inputs[i].reportValidity();
            return;
        }
    }

    document.getElementById(`step-${currentStep}`).classList.remove('active');
    document.getElementById(`step-${currentStep + 1}`).classList.add('active');

    const prevInd = document.getElementById(`indicator-${currentStep}`);
    const nextInd = document.getElementById(`indicator-${currentStep + 1}`);

    if (prevInd) {
        prevInd.classList.remove('opacity-100');
        prevInd.classList.add('opacity-50');
        prevInd.querySelector('div').className = "w-8 h-8 rounded-full bg-white/20 border border-white/30 text-white flex items-center justify-center font-black text-xs shrink-0";
    }
    if (nextInd) {
        nextInd.classList.remove('opacity-50');
        nextInd.classList.add('opacity-100');
        nextInd.querySelector('div').className = "w-8 h-8 rounded-full bg-rinobaGold text-slate-900 flex items-center justify-center font-black text-xs shrink-0 shadow-md";
    }
};

window.prevStep = function (currentStep) {
    document.getElementById(`step-${currentStep}`).classList.remove('active');
    document.getElementById(`step-${currentStep - 1}`).classList.add('active');

    const currInd = document.getElementById(`indicator-${currentStep}`);
    const prevInd = document.getElementById(`indicator-${currentStep - 1}`);

    if (currInd) {
        currInd.classList.remove('opacity-100');
        currInd.classList.add('opacity-50');
        currInd.querySelector('div').className = "w-8 h-8 rounded-full bg-white/20 border border-white/30 text-white flex items-center justify-center font-black text-xs shrink-0";
    }
    if (prevInd) {
        prevInd.classList.remove('opacity-50');
        prevInd.classList.add('opacity-100');
        prevInd.querySelector('div').className = "w-8 h-8 rounded-full bg-rinobaGold text-slate-900 flex items-center justify-center font-black text-xs shrink-0 shadow-md";
    }
};

async function executeRegistrationProtocol(e) {
    e.preventDefault();
    const form = e.target;
    const btn = form.querySelector('button[type="submit"]');
    const originalText = btn.innerHTML;

    btn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin mr-2"></i> Registering...';
    btn.disabled = true;

    const fileInput = document.getElementById('regPhoto');
    const photoFile = fileInput ? fileInput.files[0] : null;

    if (!photoFile) {
        Swal.fire('Validation Error', 'A passport photograph is mandatory for the institutional alumni directory.', 'error');
        btn.innerHTML = originalText;
        btn.disabled = false;
        return;
    }

    if (photoFile.size > 5 * 1024 * 1024) {
        Swal.fire('File Too Large', 'The uploaded photograph exceeds the 5MB enterprise upload ceiling.', 'warning');
        btn.innerHTML = originalText;
        btn.disabled = false;
        return;
    }

    let nickname = "", classGraduated = "", hostel = "", prefecture = "", qualification = "", profession = "", jobTitle = "", phoneNumber = "";
    const inputs = form.querySelectorAll('input');
    inputs.forEach(inp => {
        if (inp.placeholder === "Optional") nickname = inp.value.trim();
        if (inp.placeholder === "e.g. SSS 3 Science B") classGraduated = inp.value.trim();
        if (inp.placeholder === "e.g. Aminu Yahaya House") hostel = inp.value.trim();
        if (inp.placeholder === "e.g. Health Prefect, House Captain") prefecture = inp.value.trim();
        if (inp.placeholder === "e.g. B.Sc Computer Science, MBBS") qualification = inp.value.trim();
        if (inp.placeholder === "e.g. Tech & Software") profession = inp.value.trim();
        if (inp.placeholder === "e.g. CEO, HaiDev Agency") jobTitle = inp.value.trim();
        if (inp.type === "tel") phoneNumber = inp.value.trim();
    });

    const payload = {
        fullName: document.getElementById('regFullName').value.trim(),
        nickname: document.getElementById('regNickname').value.trim(),
        classSet: document.getElementById('classSet').value,
        classGraduated: document.getElementById('regClassGraduated').value.trim(),
        hostel: document.getElementById('regHostel').value.trim(),
        prefecture: document.getElementById('regPrefecture').value.trim(),
        qualification: document.getElementById('regQualification').value.trim(),
        profession: document.getElementById('regProfession').value.trim(),
        jobTitle: document.getElementById('regJobTitle').value.trim(),
        stateOfResidence: document.getElementById('regState').value.trim(),
        phoneNumber: document.getElementById('regPhone').value.trim(),
        emailAddress: document.getElementById('regEmail').value.trim(),
        testimonial: document.getElementById('regTestimonial').value.trim(),
        admNo: document.getElementById('regAdmNo')?.value.trim() || null,
        inviteCode: document.getElementById('regInviteCode')?.value.trim() || null
    };

    const formData = new FormData();
    formData.append("data", JSON.stringify(payload));
    formData.append("photo", photoFile);

    const proofFile = document.getElementById('regProof')?.files[0];
    if (proofFile) {
        formData.append("proof", proofFile);
    }

    try {
        const response = await ApiGateway.postFormData('/alumni/register', formData);

        if (response && response.rinobaId) {
            document.getElementById('genId').innerText = response.rinobaId;
            document.getElementById('genPass').innerText = response.tempPassword;

            const modal = document.getElementById('credentialModal');
            const content = document.getElementById('modalContent');
            if (response.verificationStatus === 'PENDING_VERIFICATION' && modal) {
                const sub = modal.querySelector('p');
                if (sub) sub.innerHTML = 'Your profile is <strong>PENDING VERIFICATION</strong>. Save these temporary login credentials. Your permanent RINOBA ID will be emailed once 2 classmates, your Set Coordinator, or Secretariat confirms your identity.';
            }
            if (modal && content) {
                modal.classList.remove('hidden');
                setTimeout(() => content.classList.remove('scale-95', 'opacity-0'), 50);
            }
        }
    } catch (error) {
        Swal.fire('Registration Failed', error.message || "The database rejected the registration payload.", 'error');
    } finally {
        btn.innerHTML = originalText;
        btn.disabled = false;
    }
}

async function executeLoginProtocol(e) {
    e.preventDefault();

    const inputId = document.getElementById('alumniId').value.trim();
    const inputPass = document.getElementById('password').value.trim();
    const submitBtn = this.querySelector('button[type="submit"]');

    const originalText = submitBtn.innerHTML;
    submitBtn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin mr-2"></i> Authenticating...';
    submitBtn.disabled = true;

    try {
        const data = await ApiGateway.post('/alumni/login', {
            id: inputId,
            password: inputPass
        });

        if (data) {
            sessionStorage.setItem('guss_access_token', data.token);
            sessionStorage.setItem('rinoba_session', JSON.stringify(data.userProfile));
            sessionStorage.setItem('guss_user_role', 'ROLE_ALUMNUS');

            submitBtn.innerHTML = '<i class="fa-solid fa-check mr-2"></i> Access Granted';
            submitBtn.className = "w-full bg-emerald-600 text-white py-4 rounded-xl text-xs font-black uppercase tracking-widest shadow-lg";

            setTimeout(() => {
                window.location.replace("alumni_dashboard.html");
            }, 500);
        }
    } catch (error) {
        Swal.fire('Authentication Failed', error.message || "Invalid RINOBA Registration ID or Password.", 'error');
        submitBtn.innerHTML = originalText;
        submitBtn.disabled = false;
    }
}

async function executeTwoStagePasswordReset() {
    const { value: identifier } = await Swal.fire({
        title: 'RINOBA Account Recovery',
        text: 'Enter your registered RINOBA ID (e.g. RINOBA/2018/045) or your official email address.',
        input: 'text',
        inputPlaceholder: 'RINOBA ID or Registered Email',
        showCancelButton: true,
        confirmButtonColor: '#1E3A8A',
        confirmButtonText: '<i class="fa-solid fa-paper-plane mr-2"></i> Dispatch Recovery Challenge',
        inputValidator: (val) => {
            if (!val || !val.trim()) return 'An identification parameter is required.';
        }
    });

    if (!identifier) return;

    try {
        Swal.fire({
            title: 'Processing Challenge...',
            text: 'Verifying identity records and compiling cryptographic token...',
            allowOutsideClick: false,
            didOpen: () => Swal.showLoading()
        });

        await ApiGateway.post('/alumni/forgot-password', { identifier: identifier.trim() });

        const { value: resetData } = await Swal.fire({
            title: 'Complete Password Reset',
            html: `
                <p class="text-xs text-slate-500 mb-4 leading-relaxed">
                    If this profile is verified, a <b>15-minute challenge token</b> was just dispatched to your email. Enter the token below alongside your new password.
                </p>
                <div class="space-y-3 text-left">
                    <label class="block text-[9px] font-black uppercase text-slate-500">Security Token</label>
                    <input id="swalResetToken" class="w-full p-3 font-mono border border-slate-300 rounded-xl text-xs tracking-wider" placeholder="Paste 64-character token from email">
                    <label class="block text-[9px] font-black uppercase text-slate-500 mt-2">New Password (Min. 8 characters)</label>
                    <input id="swalNewPassword" type="password" class="w-full p-3 border border-slate-300 rounded-xl text-xs" placeholder="••••••••">
                    <label class="block text-[9px] font-black uppercase text-slate-500 mt-2">Confirm Password</label>
                    <input id="swalConfirmPassword" type="password" class="w-full p-3 border border-slate-300 rounded-xl text-xs" placeholder="••••••••">
                </div>
            `,
            focusConfirm: false,
            showCancelButton: true,
            confirmButtonColor: '#005A36',
            confirmButtonText: '<i class="fa-solid fa-lock mr-2"></i> Commit New Password',
            preConfirm: () => {
                const token = document.getElementById('swalResetToken').value.trim();
                const pass1 = document.getElementById('swalNewPassword').value;
                const pass2 = document.getElementById('swalConfirmPassword').value;

                if (!token) {
                    Swal.showValidationMessage('The challenge token is mandatory.');
                    return false;
                }
                if (!pass1 || pass1.length < 8) {
                    Swal.showValidationMessage('Password must be at least 8 characters long.');
                    return false;
                }
                if (pass1 !== pass2) {
                    Swal.showValidationMessage('Passwords do not match.');
                    return false;
                }
                return { token, newPassword: pass1 };
            }
        });

        if (resetData) {
            Swal.fire({ title: 'Encrypting Credentials...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
            await ApiGateway.post('/alumni/reset-password', resetData);
            Swal.fire('Password Secured', 'Your credentials have been rotated in the PostgreSQL vault. Please sign in with your new password.', 'success');
        }
    } catch (err) {
        Swal.fire('Recovery Aborted', err.message || 'An error occurred during account recovery.', 'error');
    }
}