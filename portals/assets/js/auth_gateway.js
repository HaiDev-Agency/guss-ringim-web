import { ApiGateway } from './api_gateway.js';
import { PORTAL_ROUTING_MATRIX } from './security_guard.js';

document.addEventListener('DOMContentLoaded', () => {
    // Ensure all previous session data is annihilated on arrival at the gateway
    sessionStorage.clear();

    const loginForm = document.getElementById('staffGatewayForm');
    if (loginForm) {
        loginForm.addEventListener('submit', executeLoginProtocol);
    }

    const recoveryForm = document.getElementById('emergencyRecoveryForm');
    if (recoveryForm) {
        recoveryForm.addEventListener('submit', executeEmergencyRecovery);
    }
});

async function executeLoginProtocol(e) {
    e.preventDefault();

    const staffIdInput = document.getElementById('staffIdInput').value.trim().toUpperCase();
    const passwordInput = document.getElementById('staffPasswordInput').value;
    const loginBtn = document.getElementById('staffLoginBtn');
    const originalBtnContent = loginBtn.innerHTML;

    loginBtn.innerHTML = `<i class="fa-solid fa-circle-notch fa-spin"></i> <span>Authenticating...</span>`;
    loginBtn.disabled = true;

    try {
        //   Using ApiGateway instead of raw fetch
        const data = await ApiGateway.post('/auth/staff-login', {
            nin: staffIdInput,
            password: passwordInput
        });

        // 1. Establish Secure Local Session
        sessionStorage.setItem('guss_access_token', data.token);
        sessionStorage.setItem('guss_staff_id', data.staffId);
        sessionStorage.setItem('guss_user_name', data.fullName);
        sessionStorage.setItem('guss_photo_url', data.photoUrl || "");
        sessionStorage.setItem('guss_email', data.email || "");
        sessionStorage.setItem('guss_staff_type', data.staffType || "Official");

        // Absolute Trust in Backend Role Assignment
        sessionStorage.setItem('guss_user_role', data.role);

        if (data.requiresPasswordChange) {
            sessionStorage.setItem('guss_requires_setup', 'true');
        }

        // 2. Strict Unconditional Routing Matrix
        const targetPortal = PORTAL_ROUTING_MATRIX[data.role] || 'staff_portal.html';
        window.location.replace(targetPortal);

    } catch (error) {
        console.error("Gateway Error:", error);
        Swal.fire('Authentication Failed', error.message || "Invalid institutional ID or Access Key.", 'error');
        loginBtn.innerHTML = originalBtnContent;
        loginBtn.disabled = false;
    }
}

async function executeEmergencyRecovery(e) {
    e.preventDefault();
    const btn = document.getElementById('btnExecuteRecovery');
    const originalText = btn.innerHTML;
    btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> <span>Decrypting Vault...</span>`;
    btn.disabled = true;

    const payload = {
        staffId: document.getElementById('recStaffId').value.trim(),
        vaultKey: document.getElementById('recVaultKey').value.trim(),
        fullName: document.getElementById('recFullName').value.trim(),
        personalPhone: document.getElementById('recPhone').value.trim(),
        personalEmail: document.getElementById('recEmail').value.trim(),
        nokName: document.getElementById('recNok').value.trim(),
        bloodGroup: document.getElementById('recBlood').value
    };

    try {
        //   Using ApiGateway instead of raw fetch
        const data = await ApiGateway.post('/auth/emergency-recovery', payload);

        document.getElementById('emergencyRecoveryForm').classList.add('hidden');
        document.getElementById('recoverySuccessState').classList.remove('hidden');
        document.getElementById('newTempKeyDisplay').textContent = data.tempPassword;

    } catch (error) {
        Swal.fire("Verification Failed", error.message || "Identity mismatch or invalid Vault Key.", "error");
        btn.innerHTML = originalText;
        btn.disabled = false;
    }
}