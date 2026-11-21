/* Save as: portals/assets/js/alumni_registration_app.js */

import { ENV, getAuthHeaders, getMultipartAuthHeaders } from './core_config.js';

let uploadedImageBase64 = "https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?auto=format&fit=crop&q=80&w=200";

document.addEventListener('DOMContentLoaded', () => {
    const select = document.getElementById('classSet');
    if (select) {
        const currentYear = new Date().getFullYear();
        select.innerHTML = '<option value="">Select Year...</option>';
        for (let year = currentYear; year >= 1980; year--) {
            select.innerHTML += `<option value="${year}">Class of ${year}</option>`;
        }
    }

    const fileInput = document.querySelector('input[type="file"]');
    if (fileInput) {
        fileInput.addEventListener('change', function (e) {
            const file = e.target.files[0];
            if (file) {
                const reader = new FileReader();
                reader.onload = function (readerEvent) {
                    uploadedImageBase64 = readerEvent.target.result;
                };
                reader.readAsDataURL(file);
            }
        });
    }
});

function nextStep(currentStep) {
    const currentPanel = document.getElementById(`step-${currentStep}`);
    const inputs = currentPanel.querySelectorAll('input[required], select[required], textarea[required]');

    let allValid = true;
    for (let i = 0; i < inputs.length; i++) {
        if (!inputs[i].checkValidity()) {
            inputs[i].reportValidity();
            allValid = false;
            break;
        }
    }
    if (!allValid) return;

    document.getElementById(`step-${currentStep}`).classList.remove('active');
    document.getElementById(`step-${currentStep + 1}`).classList.add('active');

    const prevInd = document.getElementById(`indicator-${currentStep}`);
    const nextInd = document.getElementById(`indicator-${currentStep + 1}`);

    if (prevInd) {
        prevInd.classList.remove('opacity-100'); prevInd.classList.add('opacity-50');
        prevInd.querySelector('div').classList.remove('bg-rinobaGold', 'text-slate-900', 'border-0');
        prevInd.querySelector('div').classList.add('bg-white/20', 'text-white', 'border', 'border-white/30');
    }
    if (nextInd) {
        nextInd.classList.remove('opacity-50'); nextInd.classList.add('opacity-100');
        nextInd.querySelector('div').classList.add('bg-rinobaGold', 'text-slate-900');
        nextInd.querySelector('div').classList.remove('bg-white/20', 'text-white', 'border', 'border-white/30');
    }
}

function prevStep(currentStep) {
    document.getElementById(`step-${currentStep}`).classList.remove('active');
    document.getElementById(`step-${currentStep - 1}`).classList.add('active');

    const currInd = document.getElementById(`indicator-${currentStep}`);
    const prevInd = document.getElementById(`indicator-${currentStep - 1}`);

    if (currInd) {
        currInd.classList.remove('opacity-100'); currInd.classList.add('opacity-50');
        currInd.querySelector('div').classList.remove('bg-rinobaGold', 'text-slate-900');
        currInd.querySelector('div').classList.add('bg-white/20', 'text-white', 'border', 'border-white/30');
    }
    if (prevInd) {
        prevInd.classList.remove('opacity-50'); prevInd.classList.add('opacity-100');
        prevInd.querySelector('div').classList.add('bg-rinobaGold', 'text-slate-900', 'border-0');
        prevInd.querySelector('div').classList.remove('bg-white/20', 'text-white', 'border', 'border-white/30');
    }
}

const regForm = document.getElementById('registrationForm');
if (regForm) {
    regForm.addEventListener('submit', async function (e) {
        e.preventDefault();
        const btn = this.querySelector('button[type="submit"]');
        btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Generating...';
        btn.disabled = true;

        const name = this.querySelector('input[placeholder="Surname First"]').value;
        const set = document.getElementById('classSet').value;
        const email = document.getElementById('regEmail').value;
        const state = this.querySelector('input[placeholder="e.g. Kano, Abuja"]').value;

        const inputs = this.querySelectorAll('input');
        let nickname = "", gradClass = "", hostel = "", prefecture = "N/A", qual = "", profession = "", jobTitle = "", phone = "";
        inputs.forEach(inp => {
            if (inp.placeholder === "Optional") nickname = inp.value;
            if (inp.placeholder === "e.g. SSS 3 Science B") gradClass = inp.value;
            if (inp.placeholder === "e.g. Aminu Yahaya House") hostel = inp.value;
            if (inp.placeholder === "e.g. Health Prefect, House Captain" && inp.value !== "") prefecture = inp.value;
            if (inp.placeholder === "e.g. B.Sc Computer Science, MBBS") qual = inp.value;
            if (inp.placeholder === "e.g. Tech & Software") profession = inp.value;
            if (inp.placeholder === "e.g. CEO, HaiDev Agency") jobTitle = inp.value;
            if (inp.type === "tel") phone = inp.value;
        });
        const quote = this.querySelector('textarea').value;

        let globalUsers = JSON.parse(localStorage.getItem('rinoba_users_db')) || [];

        let randomNum, generatedId;
        let isUnique = false;
        while (!isUnique) {
            randomNum = Math.floor(100 + Math.random() * 900);
            generatedId = `RINOBA/${set}/${randomNum}`;
            const exists = globalUsers.find(u => u.id === generatedId);
            if (!exists) isUnique = true;
        }

        const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
        let genPass = '';
        for (let i = 0; i < 8; i++) genPass += chars.charAt(Math.floor(Math.random() * chars.length));

        const newUser = {
            id: generatedId,
            password: genPass,
            email: email,
            name: name,
            nickname: nickname,
            set: `Class of ${set}`,
            gradClass: gradClass,
            hostel: hostel,
            prefecture: prefecture,
            qualification: qual,
            profession: profession,
            role: jobTitle,
            state: state,
            phone: phone,
            quote: quote,
            image: uploadedImageBase64,
            isFirstLogin: true,
        };

        globalUsers.unshift(newUser);

        try {
            const response = await fetch(`${ENV.API_BASE_URL}/api/auth/alumni-register`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(newUser)
            });

            if (response.ok) {
                document.getElementById('genId').innerText = generatedId;
                document.getElementById('genPass').innerText = genPass;

                document.getElementById('credentialModal').classList.remove('hidden');
                setTimeout(() => { document.getElementById('modalContent').classList.remove('scale-95', 'opacity-0'); }, 50);
            } else {
                Swal.fire('Registration Failed', "Registration rejected by the server. Please try again.", 'error');
            }
        } catch (error) {
            console.error("Registration Network Error:", error);
            Swal.fire('Connection Error', "Unable to reach the registration server.", 'error');
        } finally {
            btn.innerHTML = 'Generate Credentials';
            btn.disabled = false;
        }
    });
}