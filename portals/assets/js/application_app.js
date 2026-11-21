import { ENV } from './core_config.js';
import { ApiGateway } from './api_gateway.js';

const SECURITY_QUESTIONS = [
    "What is the name of the town where you were born?",
    "What was the name of your first pet?",
    "What is your mother's maiden name?",
    "What was the name of your primary school?",
    "What is the name of your favorite childhood friend?",
    "What is the name of the street you grew up on?",
    "What is your favorite traditional food?",
    "What was your childhood nickname?",
    "In what city or town did your parents meet?",
    "What is the name of your favorite teacher?"
];

let DB_CLASSES = [];
let PORTAL_STATE = {
    activeIntakeSession: `${new Date().getFullYear()}/${new Date().getFullYear() + 1}`,
    portalState: 'CLOSED',
    deadline: '',
    deadlinePassed: false,
    applicationBroadcast: '',
    admissionListReleased: false
};

let activeSessionUserNin = null;
let verifiedRecoveryNinKey = null;
let formIsDirtyStateFlag = false;
let countdownInterval = null;
let currentApplicationTrack = "Standard Intake";

// Authoritative map of newly selected files (supports both compressed images & raw PDFs)
const stagedFilesMap = new Map();
const previewMediaMetaMap = new Map();

function populateSecurityQuestions() {
    const questionSelect = document.getElementById('regQuestion1');
    if (!questionSelect) return;

    questionSelect.innerHTML = '<option value="" disabled selected>Select a security recovery question...</option>';
    SECURITY_QUESTIONS.forEach(q => {
        const opt = document.createElement('option');
        opt.value = q;
        opt.textContent = q;
        questionSelect.appendChild(opt);
    });
}

window.onload = async function () {
    await syncConfigFromCloud();
    await window.fetchRelationalInfrastructure();

    const token = sessionStorage.getItem('guss_access_token');
    if (token) {
        try {
            const jwtPayload = JSON.parse(atob(token.split('.')[1]));
            const role = jwtPayload.role || (Array.isArray(jwtPayload.roles) ? jwtPayload.roles[0] : '');
            if (role === 'ROLE_APPLICANT' || role === 'ROLE_STUDENT') {
                activeSessionUserNin = jwtPayload.sub;
            }
        } catch (e) {
            sessionStorage.removeItem('guss_access_token');
        }
    }

    checkGlobalPortalStatus();
    populateStateSelectDropdownFromAPI();
    populateSecurityQuestions();
    initAccessGateWorkspaceListeners();
    initFormKeystrokeDirtyMonitors();
    initMasterApplicationFormSubmitTrigger();

    if (activeSessionUserNin) {
        await evaluateActiveSessionState();
    } else {
        await evaluateActiveSessionState();
    }

    updateCountdownTimer();
    countdownInterval = setInterval(updateCountdownTimer, 1000);
};

window.fetchRelationalInfrastructure = async function () {
    try {
        const data = await ApiGateway.get('/dd/academics/classes');
        if (Array.isArray(data)) DB_CLASSES = data;
    } catch (e) {
        console.error("Failed to load relational infrastructure:", e);
    }
};

async function syncConfigFromCloud() {
    try {
        const status = await ApiGateway.get('/public/portal-status');
        if (status) {
            PORTAL_STATE = {
                activeIntakeSession: status.activeIntakeSession || PORTAL_STATE.activeIntakeSession,
                portalState: status.portalState || 'CLOSED',
                deadline: status.deadline || '',
                deadlinePassed: Boolean(status.deadlinePassed),
                applicationBroadcast: status.applicationBroadcast || status.publicSiteBanner || '',
                admissionListReleased: Boolean(status.admissionListReleased)
            };
            sessionStorage.setItem('guss_active_intake_session', PORTAL_STATE.activeIntakeSession);
        }
    } catch (e) {
        console.error("Failed to sync public portal status:", e);
    }
}

function updateCountdownTimer() {
    const timerUI = document.getElementById('countdownTimerDisplay');
    const timerText = document.getElementById('timerText');
    const deadlineStr = PORTAL_STATE.deadline;

    if (!deadlineStr) {
        if (timerUI) timerUI.classList.add('hidden');
        return;
    }

    const deadline = new Date(deadlineStr).getTime();
    const now = Date.now();
    const distance = deadline - now;

    if (timerUI) {
        timerUI.classList.remove('hidden');
        timerUI.classList.add('flex');
    }

    if (distance <= 0) {
        if (timerText) timerText.textContent = "DEADLINE PASSED";
        if (PORTAL_STATE.portalState !== 'CLOSED') {
            PORTAL_STATE.portalState = 'CLOSED';
            PORTAL_STATE.deadlinePassed = true;
            checkGlobalPortalStatus();
        }
        return;
    }

    const days = Math.floor(distance / (1000 * 60 * 60 * 24));
    const hours = Math.floor((distance % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const mins = Math.floor((distance % (1000 * 60 * 60)) / (1000 * 60));
    const secs = Math.floor((distance % (1000 * 60)) / 1000);

    if (timerText) timerText.textContent = `${days}d ${hours}h ${mins}m ${secs}s`;
}

window.checkGlobalPortalStatus = function () {
    const activeIntakeSession = PORTAL_STATE.activeIntakeSession;
    const portalState = PORTAL_STATE.portalState;
    const broadcastMsg = PORTAL_STATE.applicationBroadcast;

    document.querySelectorAll('.application-target-display, #heroSessionDisplay, #headerSessionDisplay')
        .forEach(el => { el.textContent = activeIntakeSession; });

    const broadcastBanner = document.getElementById('globalBroadcastBanner');
    const broadcastText = document.getElementById('broadcastMessageText');
    const btnAdmissionList = document.getElementById('btnBannerAdmissionList');

    if (broadcastBanner && broadcastText) {
        if (broadcastMsg || PORTAL_STATE.admissionListReleased) {
            broadcastText.textContent = broadcastMsg
                ? broadcastMsg.replace(/<[^>]*>/g, '').trim()
                : `Admissions update for ${activeIntakeSession}.`;
            broadcastBanner.classList.remove('hidden');
            if (btnAdmissionList) {
                btnAdmissionList.classList.toggle('hidden', !PORTAL_STATE.admissionListReleased);
            }
        } else {
            broadcastBanner.classList.add('hidden');
        }
    }

    const closedCard = document.getElementById('portalClosedCard');
    const accountCard = document.getElementById('accountGatewayCard');
    const statusIndicator = document.getElementById('gatewayStatusIndicator');
    const registerTab = document.getElementById('gateTabRegister');

    if (portalState === 'CLOSED') {
        if (closedCard) {
            closedCard.classList.remove('hidden');
            const closedText = document.getElementById('closedSessionText');
            if (closedText) closedText.textContent = activeIntakeSession;
        }
        if (accountCard) accountCard.classList.remove('hidden');
        if (registerTab) registerTab.classList.add('hidden');

        window.toggleGatewayInterface('login');

        if (statusIndicator) {
            statusIndicator.innerHTML = `<i class="fa-solid fa-lock mr-1"></i> GATEWAY OFFLINE`;
            statusIndicator.className = "uppercase text-[10px] text-red-400";
        }
    } else {
        if (closedCard) closedCard.classList.add('hidden');
        if (accountCard) accountCard.classList.remove('hidden');
        if (registerTab) registerTab.classList.remove('hidden');

        if (statusIndicator) {
            statusIndicator.innerHTML = `<i class="fa-solid fa-globe mr-1"></i> GATEWAY ONLINE`;
            statusIndicator.className = "uppercase text-[10px] text-emerald-400";
        }
    }
};

function populateStateSelectDropdownFromAPI() {
    const dropdown = document.getElementById('formStateSelect');
    if (!dropdown) return;
    const stateKeys = typeof northernGeopoliticalApi !== 'undefined'
        ? Object.keys(northernGeopoliticalApi)
        : ["Jigawa", "Kano", "Kaduna", "Katsina"];
    stateKeys.forEach(st => {
        const opt = document.createElement('option');
        opt.value = st;
        opt.textContent = st;
        dropdown.appendChild(opt);
    });
}

window.runRegionalLgaDropdownSyncEngine = function () {
    const state = document.getElementById('formStateSelect').value;
    const lgaDropdown = document.getElementById('formLgaSelect');
    if (!lgaDropdown) return;
    lgaDropdown.innerHTML = '<option value="">Select LGA</option>';
    if (!state) return;

    if (typeof northernGeopoliticalApi !== 'undefined' && northernGeopoliticalApi[state]) {
        northernGeopoliticalApi[state].forEach(lga => {
            const opt = document.createElement('option');
            opt.value = lga;
            opt.textContent = lga;
            lgaDropdown.appendChild(opt);
        });
    }
};

function initFormKeystrokeDirtyMonitors() {
    const form = document.getElementById('comprehensiveApplicationForm');
    if (!form) return;
    form.querySelectorAll('input, select, textarea').forEach(el => {
        el.addEventListener('input', () => {
            if (el.id !== 'formModeOfEntry' && el.id !== 'formTargetLevel') formIsDirtyStateFlag = true;
        });
    });
}

function applyDynamicRequirements(trackMode) {
    const optionalIds = ['formReligion', 'formBloodGroup', 'formGenotype', 'formDisabilityDetails', 'formMedAllergies', 'formFoodAllergies', 'formSurgicalHistory', 'formRoutineMedications', 'formNeurologicalLogs', 'parentOccupation', 'parentEmail'];

    optionalIds.forEach(id => {
        const el = document.getElementById(id);
        if (!el) return;
        const label = el.closest('div')?.querySelector('label');
        const exchAst = label ? label.querySelector('.exch-req') : null;

        if (trackMode === 'Exchange Scheme') {
            el.required = true;
            if (exchAst) exchAst.classList.remove('hidden');
        } else {
            el.required = false;
            if (exchAst) exchAst.classList.add('hidden');
        }
    });
}

window.executePathwayTrackSelection = async function (selectedTrackMode) {
    const form = document.getElementById('comprehensiveApplicationForm');
    if (form.classList.contains('read-only-mode')) return;

    if (selectedTrackMode === 'Exchange Scheme') {
        const stateInput = document.getElementById('formStateSelect').value;
        if (stateInput === 'Jigawa' || stateInput === 'Kano') {
            Swal.fire('Exclusion Rule', "Candidates claiming origin from host states (Jigawa and Kano) are excluded from the Exchange Scheme quotas. Apply under Standard Direct Intake.", 'warning');
            return;
        }
    }

    if (formIsDirtyStateFlag && currentApplicationTrack !== "" && currentApplicationTrack !== selectedTrackMode) {
        const res = await Swal.fire({
            title: 'Change Admission Pathway?',
            text: "Switching pathways now will wipe current form inputs for a fresh track. Proceed?",
            icon: 'warning',
            showCancelButton: true,
            confirmButtonColor: '#005A36',
            confirmButtonText: 'Yes, Switch Pathway'
        });
        if (!res.isConfirmed) return;

        form.reset();
        stagedFilesMap.clear();
        previewMediaMetaMap.clear();
        formIsDirtyStateFlag = false;

        document.querySelectorAll('.preview-media-node').forEach(node => node.classList.add('hidden'));
        document.querySelectorAll('.icon-media-node').forEach(node => node.classList.remove('hidden'));
        document.querySelectorAll('[id^="wrapper-"]').forEach(w => {
            w.style.borderColor = '';
            w.style.backgroundColor = '';
            w.dataset.hasUpload = 'false';
        });

        document.querySelectorAll('[id^="chk-"]').forEach(li => {
            const icon = li.querySelector('i');
            if (icon) icon.className = "fa-solid fa-square-check text-slate-600 text-[15px] transition-all";
            li.className = "flex items-center gap-3 text-slate-400 transition-all";
        });
    }

    currentApplicationTrack = selectedTrackMode;
    form.dataset.currentTrack = selectedTrackMode;

    const masterContainer = document.getElementById('masterWorkspaceContainer');
    const chkWidget = document.getElementById('sidebarChecklistWidget');
    const cardStd = document.getElementById('pathCard-standard');
    const cardExch = document.getElementById('pathCard-exchange');

    if (masterContainer) masterContainer.classList.add('dashboard-active');
    if (chkWidget) { chkWidget.classList.remove('hidden', 'opacity-0'); chkWidget.classList.add('flex', 'opacity-100'); }

    if (cardStd && cardExch) {
        if (selectedTrackMode === 'Standard Intake') {
            cardStd.classList.add('border-gussGreen', 'opacity-100', 'ring-2', 'ring-emerald-100');
            cardStd.classList.remove('border-slate-200', 'opacity-50', 'scale-95');
            cardExch.classList.add('border-slate-200', 'opacity-50', 'scale-[0.97]');
            cardExch.classList.remove('border-gussGold', 'opacity-100', 'ring-2', 'ring-yellow-50', 'scale-95');
        } else {
            cardExch.classList.add('border-gussGold', 'opacity-100', 'ring-2', 'ring-yellow-50');
            cardExch.classList.remove('border-slate-200', 'opacity-50', 'scale-95');
            cardStd.classList.add('border-slate-200', 'opacity-50', 'scale-[0.97]');
            cardStd.classList.remove('border-gussGreen', 'opacity-100', 'ring-2', 'ring-emerald-100', 'scale-95');
        }
    }

    configurePathwayFormFieldsDisplay(selectedTrackMode);
    applyDynamicRequirements(selectedTrackMode);
};

function configurePathwayFormFieldsDisplay(trackMode) {
    const modeSelect = document.getElementById('formModeOfEntry');
    const exchWrap = document.getElementById('wrapper-exchange');
    const medWrap = document.getElementById('wrapper-medical');
    const chkExch = document.getElementById('chk-exchange');
    const chkMed = document.getElementById('chk-medical');

    if (trackMode === 'Standard Intake') {
        if (!document.getElementById('comprehensiveApplicationForm').classList.contains('read-only-mode')) modeSelect.disabled = false;
        if (exchWrap) { exchWrap.classList.add('hidden'); exchWrap.classList.remove('flex'); }
        if (medWrap) { medWrap.classList.add('hidden'); medWrap.classList.remove('flex'); }
        if (chkExch) chkExch.classList.replace('flex', 'hidden');
        if (chkMed) chkMed.classList.replace('flex', 'hidden');
    } else {
        if (!document.getElementById('comprehensiveApplicationForm').classList.contains('read-only-mode')) modeSelect.disabled = false;
        if (exchWrap) { exchWrap.classList.remove('hidden'); exchWrap.classList.add('flex'); }
        if (medWrap) { medWrap.classList.remove('hidden'); medWrap.classList.add('flex'); }
        if (chkExch) chkExch.classList.replace('hidden', 'flex');
        if (chkMed) chkMed.classList.replace('hidden', 'flex');
    }
    window.runEntryPathwayOptionsFilterEngine();
}

window.runEntryPathwayOptionsFilterEngine = function () {
    const mode = document.getElementById('formModeOfEntry').value;
    const dropdown = document.getElementById('formTargetLevel');
    const transferBlock = document.getElementById('conditionalTransferBlock');
    const formerSchool = document.getElementById('formFormerSchool');
    const transferUpload = document.getElementById('wrapper-transfer');
    const chkTransfer = document.getElementById('chk-transfer');

    if (!dropdown || !transferBlock) return;

    const currentVal = dropdown.value;
    dropdown.innerHTML = '';

    let uniqueLevels = [];
    if (DB_CLASSES && DB_CLASSES.length > 0) {
        uniqueLevels = [...new Set(DB_CLASSES.map(c => c.level))]
            .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));
    } else {
        uniqueLevels = ['JSS 1', 'JSS 2', 'JSS 3', 'SSS 1', 'SSS 2', 'SSS 3'];
    }

    if (mode === 'Fresh Intake') {
        transferBlock.classList.replace('flex', 'hidden');
        if (transferUpload) transferUpload.classList.replace('flex', 'hidden');
        if (formerSchool) formerSchool.required = false;
        if (chkTransfer) chkTransfer.classList.replace('flex', 'hidden');

        uniqueLevels.filter(l => l.includes('1')).forEach(lvl => {
            const opt = document.createElement('option');
            opt.value = lvl;
            opt.textContent = `${lvl} (Fresh Boarding Intake)`;
            dropdown.appendChild(opt);
        });
    } else {
        transferBlock.classList.replace('hidden', 'flex');
        if (transferUpload) transferUpload.classList.replace('hidden', 'flex');
        if (formerSchool) formerSchool.required = true;
        if (chkTransfer) chkTransfer.classList.replace('hidden', 'flex');

        uniqueLevels.forEach(lvl => {
            const opt = document.createElement('option');
            opt.value = lvl;
            opt.textContent = `${lvl} Transfer Placement`;
            dropdown.appendChild(opt);
        });
    }

    if (dropdown.querySelector(`option[value="${currentVal}"]`)) {
        dropdown.value = currentVal;
    }

    evaluateTargetClassRules();
};

function evaluateTargetClassRules() {
    const target = document.getElementById('formTargetLevel').value;
    const jsceAst = document.getElementById('lbl-jsce-ast');
    const jsceChk = document.getElementById('chk-jsce');

    if (target && target.startsWith('SSS')) {
        if (jsceAst) jsceAst.classList.remove('hidden');
        if (jsceChk) jsceChk.classList.replace('hidden', 'flex');
    } else {
        if (jsceAst) jsceAst.classList.add('hidden');
        if (jsceChk) jsceChk.classList.replace('flex', 'hidden');
    }
}

document.getElementById('formTargetLevel').addEventListener('change', evaluateTargetClassRules);

window.copyApplicantAddressToNOK = function (targetIndex) {
    const mainAddress = document.getElementById('formAddress').value.trim();
    if (!mainAddress) {
        Swal.fire('Missing Information', 'Please provide your permanent residential address first.', 'warning');
        return;
    }
    const inputField = targetIndex === 1 ? document.getElementById('nok1Address') : document.getElementById('nok2Address');
    if (inputField) inputField.value = mainAddress;
};

function updateChecklistUI(wrapperId, isActive) {
    const chkId = wrapperId.replace('wrapper-', 'chk-');
    const li = document.getElementById(chkId);
    if (li) {
        const icon = li.querySelector('i');
        if (isActive) {
            icon.className = "fa-solid fa-square-check text-emerald-500 text-[15px] animate-pulse";
            li.className = "flex items-center gap-3 text-emerald-300 transition-all";
        } else {
            icon.className = "fa-solid fa-square-check text-slate-600 text-[15px] transition-all";
            li.className = "flex items-center gap-3 text-slate-400 transition-all";
        }
    }
}

const WRAPPER_FORM_FIELD_MAP = {
    'wrapper-passport': 'uploadPassport',
    'wrapper-nin': 'uploadNIN',
    'wrapper-birth': 'uploadBirth',
    'wrapper-indigene': 'uploadIndigene',
    'wrapper-primary': 'uploadPrimary',
    'wrapper-jsce': 'uploadJSCE',
    'wrapper-signature': 'uploadSignature',
    'wrapper-transfer': 'uploadTransfer',
    'wrapper-exchange': 'uploadExchange',
    'wrapper-medical': 'uploadMedical'
};

function renderPreviewBoxForWrapper(wrapper, previewSrc, isPdf) {
    const previewBox = wrapper.querySelector('.preview-media-node');
    const imgElement = previewBox.querySelector('img');
    const standardIcon = wrapper.querySelector('.icon-media-node');

    let pdfBadge = previewBox.querySelector('.pdf-preview-badge');
    if (!pdfBadge) {
        pdfBadge = document.createElement('div');
        pdfBadge.className = 'pdf-preview-badge hidden w-full h-full flex flex-col items-center justify-center bg-red-50 text-red-600';
        pdfBadge.innerHTML = '<i class="fa-solid fa-file-pdf text-2xl"></i><span class="text-[8px] font-black mt-1">PDF READY</span>';
        previewBox.appendChild(pdfBadge);
    }

    if (isPdf) {
        imgElement.classList.add('hidden');
        imgElement.removeAttribute('src');
        pdfBadge.classList.remove('hidden');
    } else {
        pdfBadge.classList.add('hidden');
        imgElement.classList.remove('hidden');
        imgElement.src = previewSrc;
    }

    previewMediaMetaMap.set(wrapper.id, { url: previewSrc, isPdf });
    wrapper.dataset.hasUpload = 'true';

    standardIcon.classList.add('hidden');
    previewBox.classList.remove('hidden');
    wrapper.style.borderColor = 'var(--guss-green)';
    wrapper.style.backgroundColor = '#ecfdf5';
    wrapper.classList.remove('border-red-400', 'border-red-500', 'bg-red-50', 'ring-2', 'ring-red-200');
    updateChecklistUI(wrapper.id, true);
}

window.processLocalUploadPreviewOverwrite = function (inputNode, wrapperCardId) {
    const wrapper = document.getElementById(wrapperCardId);
    const formKey = WRAPPER_FORM_FIELD_MAP[wrapperCardId];
    if (!wrapper || !formKey || !inputNode.files || !inputNode.files[0]) return;

    const file = inputNode.files[0];
    const maxSizeInBytes = 2 * 1024 * 1024;
    if (file.size > maxSizeInBytes) {
        Swal.fire('SECURITY HALT', "File size exceeds the 2MB limit.", 'error');
        inputNode.value = '';
        return;
    }

    const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
    if (isPdf) {
        const allowPdf = inputNode.accept.toLowerCase().includes('.pdf');
        if (!allowPdf) {
            Swal.fire('Invalid File Type', 'Only JPEG/PNG images are permitted for this upload.', 'error');
            inputNode.value = '';
            return;
        }
        stagedFilesMap.set(formKey, file);
        const objectUrl = URL.createObjectURL(file);
        renderPreviewBoxForWrapper(wrapper, objectUrl, true);
        formIsDirtyStateFlag = true;
        return;
    }

    const reader = new FileReader();
    reader.onload = function (e) {
        const img = new Image();
        img.onload = function () {
            const canvas = document.createElement('canvas');
            const MAX_DIM = 1600;
            let width = img.width;
            let height = img.height;

            if (width > height) {
                if (width > MAX_DIM) { height *= MAX_DIM / width; width = MAX_DIM; }
            } else {
                if (height > MAX_DIM) { width *= MAX_DIM / height; height = MAX_DIM; }
            }

            canvas.width = width;
            canvas.height = height;
            canvas.getContext('2d').drawImage(img, 0, 0, width, height);

            canvas.toBlob((blob) => {
                if (!blob) return;
                const compressedFile = new File([blob], `${formKey}.jpg`, { type: 'image/jpeg' });
                stagedFilesMap.set(formKey, compressedFile);
                const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
                renderPreviewBoxForWrapper(wrapper, dataUrl, false);
                formIsDirtyStateFlag = true;
            }, 'image/jpeg', 0.85);
        };
        img.onerror = function () {
            Swal.fire('Corrupt File', 'Unable to decode selected image file.', 'error');
            inputNode.value = '';
        };
        img.src = e.target.result;
    };
    reader.readAsDataURL(file);
};

window.openUploadLightbox = function (wrapperCardId) {
    const meta = previewMediaMetaMap.get(wrapperCardId);
    const wrapper = document.getElementById(wrapperCardId);
    const imgEl = document.getElementById('lightboxImage');
    const pdfFrame = document.getElementById('lightboxPdfFrame');
    const modal = document.getElementById('lightboxModal');

    const src = meta?.url || wrapper?.querySelector('img')?.getAttribute('src') || '';
    if (!src) return;

    const isPdf = meta?.isPdf || src.toLowerCase().includes('.pdf');
    if (isPdf) {
        imgEl.classList.add('hidden');
        pdfFrame.classList.remove('hidden');
        pdfFrame.src = src;
    } else {
        pdfFrame.classList.add('hidden');
        pdfFrame.src = '';
        imgEl.classList.remove('hidden');
        imgEl.src = src;
    }

    modal.classList.remove('hidden');
    setTimeout(() => modal.classList.remove('opacity-0'), 10);
};

window.closeLightbox = function () {
    const modal = document.getElementById('lightboxModal');
    const pdfFrame = document.getElementById('lightboxPdfFrame');
    modal.classList.add('opacity-0');
    setTimeout(() => {
        modal.classList.add('hidden');
        if (pdfFrame) pdfFrame.src = '';
    }, 300);
};

window.triggerDisabilityFieldsToggle = function (state) {
    const block = document.getElementById('whoDisabilityBlock');
    if (state === 'has_disability') {
        block.classList.remove('hidden');
        block.classList.add('block');
    } else {
        block.classList.remove('block');
        block.classList.add('hidden');
        document.querySelectorAll('.who-cb').forEach(cb => cb.checked = false);
        document.getElementById('formDisabilityDetails').value = '';
    }
};

window.toggleGatewayInterface = function (mode) {
    const loginForm = document.getElementById('applicantLoginForm');
    const registerForm = document.getElementById('applicantRegisterForm');
    const recoveryCard = document.getElementById('passwordRecoveryCard');
    const gatewayCard = document.getElementById('accountGatewayCard');
    const tabLogin = document.getElementById('gateTabLogin');
    const tabRegister = document.getElementById('gateTabRegister');

    if (mode === 'recovery') {
        gatewayCard.classList.add('hidden');
        recoveryCard.classList.remove('hidden');
        return;
    }

    recoveryCard.classList.add('hidden');
    gatewayCard.classList.remove('hidden');

    if (mode === 'login') {
        loginForm.classList.remove('hidden');
        loginForm.classList.add('block');
        registerForm.classList.remove('block');
        registerForm.classList.add('hidden');

        tabLogin.classList.add('text-gussGreen', 'border-gussGreen');
        tabLogin.classList.remove('text-slate-400', 'border-transparent');
        tabRegister.classList.remove('text-gussGreen', 'border-gussGreen');
        tabRegister.classList.add('text-slate-400', 'border-transparent');
    } else if (mode === 'register') {
        registerForm.classList.remove('hidden');
        registerForm.classList.add('block');
        loginForm.classList.remove('block');
        loginForm.classList.add('hidden');

        tabRegister.classList.add('text-gussGreen', 'border-gussGreen');
        tabRegister.classList.remove('text-slate-400', 'border-transparent');
        tabLogin.classList.remove('text-gussGreen', 'border-gussGreen');
        tabLogin.classList.add('text-slate-400', 'border-transparent');
    }
};

function initAccessGateWorkspaceListeners() {
    document.getElementById('applicantRegisterForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const nin = document.getElementById('regNIN').value.trim();
        const dob = document.getElementById('regDOB').value;

        if (!/^\d{11}$/.test(nin)) {
            Swal.fire('Validation Error', "NIN must be exactly 11 numeric digits.", 'error');
            return;
        }
        if (!dob) {
            Swal.fire('Validation Error', "Please enter your Date of Birth to verify against NIMC.", 'error');
            return;
        }

        const btn = document.getElementById('btnRegisterAccount');
        const originalText = btn.innerHTML;
        btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Authenticating Identity...`;
        btn.disabled = true;

        try {
            const payload = {
                nin,
                dob,
                password: document.getElementById('regPassword').value,
                securityQuestion: document.getElementById('regQuestion1').value,
                securityAnswer: document.getElementById('regAnswer1').value.trim()
            };

            const data = await ApiGateway.post('/auth/register', payload);
            if (data) {
                activeSessionUserNin = data.nin;
                sessionStorage.setItem('guss_access_token', data.token);
                sessionStorage.setItem('guss_user_role', 'ROLE_APPLICANT');

                const fullNameEl = document.getElementById('formFullName');
                const dobEl = document.getElementById('formDOB');

                if (fullNameEl) {
                    const last = data.lastName || '';
                    const first = data.firstName || '';
                    const middle = data.middleName || '';
                    fullNameEl.value = `${last} ${first} ${middle}`.replace(/\s+/g, ' ').trim();
                    fullNameEl.readOnly = true;
                    fullNameEl.classList.add('bg-emerald-50', 'text-emerald-900');
                }
                if (dobEl) {
                    dobEl.value = data.dob || dob;
                    dobEl.readOnly = true;
                    dobEl.classList.add('bg-emerald-50', 'text-emerald-900');
                }

                Swal.fire('Account Created', "Identity Authenticated via NIMC Registry. Account initialized successfully!", 'success');
                await evaluateActiveSessionState();
            }
        } catch (error) {
            Swal.fire('Registration Failed', error.message || "A network error occurred.", 'error');
        } finally {
            btn.innerHTML = originalText;
            btn.disabled = false;
        }
    });

    document.getElementById('applicantLoginForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const nin = document.getElementById('loginNIN').value.trim();
        const pass = document.getElementById('loginPassword').value;

        const btn = e.target.querySelector('button[type="submit"]');
        const originalText = btn.innerHTML;
        btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Authenticating...`;
        btn.disabled = true;

        try {
            const data = await ApiGateway.post('/auth/login', { nin, password: pass });
            if (data) {
                activeSessionUserNin = data.nin;
                sessionStorage.setItem('guss_access_token', data.token);
                sessionStorage.setItem('guss_user_role', 'ROLE_APPLICANT');
                await evaluateActiveSessionState();
            }
        } catch (error) {
            Swal.fire('Authentication Failed', error.message || "Ensure your details are correct.", 'error');
        } finally {
            btn.innerHTML = originalText;
            btn.disabled = false;
        }
    });
}

window.executeRecoveryIdentityCheckStage1 = async function () {
    const nin = document.getElementById('recNIN').value.trim();
    if (!/^\d{11}$/.test(nin)) return Swal.fire('Error', 'Please enter a valid 11-digit NIN.', 'error');

    const btn = window.event ? window.event.currentTarget : null;
    let ogText = "";
    if (btn) { ogText = btn.innerHTML; btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Locating...`; btn.disabled = true; }

    try {
        const data = await ApiGateway.get(`/auth/verify-identity/${encodeURIComponent(nin)}`);
        if (data && data.question) {
            verifiedRecoveryNinKey = nin;
            document.getElementById('recQuestionLabel').innerHTML =
                `SECURITY RECOVERY QUESTION CHECK: <span class="text-gussGreen">"${DOMPurify.sanitize(data.question)}"</span>`;
            document.getElementById('recoveryStage1').classList.add('hidden');
            document.getElementById('recoveryStage2').classList.remove('hidden');
        }
    } catch (e) {
        verifiedRecoveryNinKey = null;
        Swal.fire('Not Found', e.message || 'Identity not found in the registry.', 'error');
    } finally {
        if (btn) { btn.innerHTML = ogText; btn.disabled = false; }
    }
};

document.getElementById('passwordRecoveryForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!verifiedRecoveryNinKey) return;

    const ans = document.getElementById('recAnswerInput').value.trim().toLowerCase();
    const newPass = document.getElementById('recNewPassword').value;

    try {
        const data = await ApiGateway.post('/auth/recover', {
            nin: verifiedRecoveryNinKey,
            securityAnswer: ans,
            newPassword: newPass
        });

        if (data) {
            Swal.fire('Success', data.message || 'Password recovered successfully.', 'success');
            verifiedRecoveryNinKey = null;
            document.getElementById('passwordRecoveryForm').reset();
            document.getElementById('recoveryStage2').classList.add('hidden');
            document.getElementById('recoveryStage1').classList.remove('hidden');
            window.toggleGatewayInterface('login');
        }
    } catch (error) {
        Swal.fire('Challenge Failed', error.message || "Incorrect answer provided.", 'error');
    }
});

async function evaluateActiveSessionState() {
    const gatewayDesk = document.getElementById('gatewayDesk');
    const masterContainer = document.getElementById('masterWorkspaceContainer');
    const controls = document.getElementById('sessionControlBlock');

    if (!activeSessionUserNin) {
        if (gatewayDesk) {
            gatewayDesk.classList.remove('hidden');
            gatewayDesk.classList.add('grid');
        }
        if (masterContainer) {
            masterContainer.classList.add('hidden');
            masterContainer.classList.remove('grid', 'lg:grid');
        }
        if (controls) {
            controls.classList.remove('flex');
            controls.classList.add('hidden');
        }
        return;
    }

    if (controls) { controls.classList.remove('hidden'); controls.classList.add('flex'); }
    if (gatewayDesk) { gatewayDesk.classList.add('hidden'); gatewayDesk.classList.remove('grid'); }
    if (masterContainer) {
        masterContainer.classList.remove('hidden');
        masterContainer.classList.add('grid', 'lg:grid');
    }

    try {
        const activeIntake = PORTAL_STATE.activeIntakeSession;
        const endpoint = activeIntake
            ? `/application/${encodeURIComponent(activeSessionUserNin)}?session=${encodeURIComponent(activeIntake)}`
            : `/application/${encodeURIComponent(activeSessionUserNin)}`;

        const dbData = await ApiGateway.get(endpoint);
        if (dbData) {
            window.currentApplicantDossier = dbData;
            if (dbData.modeOfEntry || dbData.trackMode) {
                const isExchange = dbData.trackMode === 'Exchange Scheme';
                await window.executePathwayTrackSelection(isExchange ? 'Exchange Scheme' : 'Standard Intake');
            }

            if (dbData.status === 'RETURNED_FOR_CORRECTION') {
                const banner = document.getElementById('correctionBanner');
                if (banner) {
                    banner.classList.remove('hidden');
                    const noteText = dbData.officerNotes || "Please review your application for required corrections.";
                    banner.querySelector('p').innerHTML = `The Admission Officer has unlocked specific fields in your form. Please fix the highlighted items below and re-transmit your dossier.<br><br><span class="block bg-red-100 p-3 rounded-lg border border-red-300 text-red-900 font-mono mt-3 shadow-inner"><b>OFFICER NOTE:</b> ${DOMPurify.sanitize(noteText)}</span>`;
                }

                const rejectedFields = Array.isArray(dbData.rejectedFields) ? dbData.rejectedFields : [];
                loadPersistedDraftStateParameters(dbData);
                applyPartialFormLock(rejectedFields);
            } else if (['AWAITING_VERIFICATION', 'POOLED', 'PROVISIONALLY_POOLED', 'ADMITTED', 'REJECTED', 'REVOKED_QUARANTINED'].includes(dbData.status)) {
                loadCompletedApplicationReadOnly(dbData);
                renderTrackingStatusLayout(dbData);
            } else if (dbData.status === 'DRAFT') {
                loadPersistedDraftStateParameters(dbData);
            }
        }
    } catch (error) {
        if (!String(error.message).includes('No application found') && !String(error.message).includes('404')) {
            console.error("[Session State Error]:", error);
        }
    }
}

function buildLivePayload(targetStatus) {
    const selectedDisabilities = [];
    document.querySelectorAll('.who-cb:checked').forEach(cb => selectedDisabilities.push(cb.value));

    const textData = {
        nin: activeSessionUserNin,
        sessionApplied: PORTAL_STATE.activeIntakeSession,
        status: targetStatus,
        name: document.getElementById('formFullName').value.trim(),
        dob: document.getElementById('formDOB').value,
        religion: document.getElementById('formReligion').value,
        mode: document.getElementById('formModeOfEntry').value,
        targetLevel: document.getElementById('formTargetLevel').value,
        formerSchool: document.getElementById('formFormerSchool').value.trim(),
        state: document.getElementById('formStateSelect').value,
        lga: document.getElementById('formLgaSelect').value,
        address: document.getElementById('formAddress').value.trim(),
        blood: document.getElementById('formBloodGroup').value,
        genotype: document.getElementById('formGenotype').value,
        disabilityRadio: document.querySelector('input[name="disabilityRadio"]:checked')?.value,
        disabilityCats: selectedDisabilities,
        disabilityDetails: document.getElementById('formDisabilityDetails').value.trim(),
        medAllergies: document.getElementById('formMedAllergies').value.trim(),
        foodAllergies: document.getElementById('formFoodAllergies').value.trim(),
        surgeries: document.getElementById('formSurgicalHistory').value.trim(),
        routineMeds: document.getElementById('formRoutineMedications').value.trim(),
        respiratory: document.getElementById('formRespiratoryProfile').value,
        neurological: document.getElementById('formNeurologicalLogs').value.trim(),
        nok1Name: document.getElementById('nok1Name').value.trim(),
        nok1Phone: document.getElementById('nok1Phone').value.trim(),
        nok1Relation: document.getElementById('nok1Relation').value,
        nok1Address: document.getElementById('nok1Address').value.trim(),
        parentName: document.getElementById('parentName').value.trim(),
        parentPhone: document.getElementById('parentPhone').value.trim(),
        parentRelation: document.getElementById('parentRelation').value,
        parentOccupation: document.getElementById('parentOccupation').value.trim(),
        parentEmail: document.getElementById('parentEmail').value.trim(),
        nok2Address: document.getElementById('nok2Address').value.trim(),
        trackMode: currentApplicationTrack
    };

    const formData = new FormData();
    formData.append("data", JSON.stringify(textData));

    stagedFilesMap.forEach((file, formKey) => {
        formData.append(formKey, file, file.name);
    });

    return formData;
}

window.persistActiveFormDraftState = async function (manualTrigger) {
    if (!activeSessionUserNin) return;

    const draftPayload = buildLivePayload("DRAFT");
    try {
        const data = await ApiGateway.postFormData('/application/save', draftPayload);
        if (data) {
            formIsDirtyStateFlag = false;
            if (manualTrigger) {
                Swal.fire('Draft Saved', "Progress saved to the secure database! You can sign out safely and resume later.", 'success');
            }
        }
    } catch (error) {
        if (manualTrigger) Swal.fire('Connection Error', error.message || "Could not reach the server to save draft.", 'error');
    }
};

function loadPersistedDraftStateParameters(data) {
    if (!data) return;
    const safeVal = (val) => (val && typeof val === 'string' && val.toUpperCase().includes('PENDING')) ? '' : (val || '');

    document.getElementById('formFullName').value = safeVal(data.name || data.fullName);
    document.getElementById('formDOB').value = (data.dob && data.dob !== '2000-01-01') ? data.dob : '';

    const relEl = document.getElementById('formReligion');
    if (relEl && data.religion) {
        const cleanRel = data.religion.trim().toLowerCase();
        const matchedOpt = Array.from(relEl.options).find(opt => opt.value.toLowerCase() === cleanRel);
        relEl.value = matchedOpt ? matchedOpt.value : data.religion;
    }

    document.getElementById('formModeOfEntry').value = data.modeOfEntry || 'Fresh Intake';
    window.runEntryPathwayOptionsFilterEngine();

    const targetDropdown = document.getElementById('formTargetLevel');
    const safeTarget = data.targetLevel || 'JSS 1';
    if (targetDropdown.querySelector(`option[value="${safeTarget}"]`)) targetDropdown.value = safeTarget;

    document.getElementById('formFormerSchool').value = safeVal(data.formerSchool);

    const stateEl = document.getElementById('formStateSelect');
    if (stateEl && data.state && !data.state.toUpperCase().includes('PENDING')) {
        stateEl.value = data.state;
        window.runRegionalLgaDropdownSyncEngine();
    }

    const lgaEl = document.getElementById('formLgaSelect');
    if (lgaEl && data.lga && !data.lga.toUpperCase().includes('PENDING')) lgaEl.value = data.lga;

    document.getElementById('formAddress').value = safeVal(data.address);

    if (data.medicalProfile) {
        document.getElementById('formBloodGroup').value = data.medicalProfile.bloodGroup || '';
        document.getElementById('formGenotype').value = data.medicalProfile.genotype || '';

        if (data.medicalProfile.hasDisability) {
            document.querySelector('input[name="disabilityRadio"][value="has_disability"]').checked = true;
            window.triggerDisabilityFieldsToggle('has_disability');
            document.getElementById('formDisabilityDetails').value = data.medicalProfile.disabilityDetails || '';
            document.querySelectorAll('.who-cb').forEach(cb => {
                if (data.medicalProfile.disabilityCategories?.includes(cb.value)) cb.checked = true;
            });
        }

        document.getElementById('formMedAllergies').value = data.medicalProfile.medicalAllergies || '';
        document.getElementById('formFoodAllergies').value = data.medicalProfile.foodAllergies || '';
        document.getElementById('formSurgicalHistory').value = data.medicalProfile.surgeries || '';
        document.getElementById('formRoutineMedications').value = data.medicalProfile.routineMeds || '';
        document.getElementById('formRespiratoryProfile').value = data.medicalProfile.respiratoryHistory || 'No History';
        document.getElementById('formNeurologicalLogs').value = data.medicalProfile.neurologicalHistory || '';
    }

    if (data.guardians && data.guardians.length > 0) {
        const primary = data.guardians.find(g => g.isPrimaryContact) || data.guardians[0];
        const secondary = data.guardians.find(g => !g.isPrimaryContact);

        document.getElementById('parentName').value = safeVal(primary.fullName);
        document.getElementById('parentPhone').value = safeVal(primary.phoneNumber);
        document.getElementById('parentRelation').value = safeVal(primary.relationship);
        document.getElementById('parentOccupation').value = safeVal(primary.occupation);
        document.getElementById('parentEmail').value = safeVal(primary.emailAddress);
        document.getElementById('nok2Address').value = safeVal(primary.residentialAddress);

        if (secondary) {
            document.getElementById('nok1Name').value = safeVal(secondary.fullName);
            document.getElementById('nok1Phone').value = safeVal(secondary.phoneNumber);
            document.getElementById('nok1Relation').value = safeVal(secondary.relationship);
            document.getElementById('nok1Address').value = safeVal(secondary.residentialAddress);
        }
    }

    const setImg = (id, src) => {
        if (!src) return;
        const wrapper = document.getElementById(id);
        if (!wrapper) return;
        const resolvedUrl = (src.startsWith('http') || src.startsWith('data:'))
            ? src
            : ENV.API_BASE_URL + (src.startsWith('/') ? '' : '/') + src;
        const isPdf = resolvedUrl.toLowerCase().endsWith('.pdf');
        renderPreviewBoxForWrapper(wrapper, resolvedUrl, isPdf);
    };

    setImg('wrapper-passport', data.recentPassportUrl);
    setImg('wrapper-nin', data.uploadNinSlip);
    setImg('wrapper-birth', data.uploadBirthCert);
    setImg('wrapper-indigene', data.uploadIndigeneCert);
    setImg('wrapper-primary', data.uploadPrimaryCert);
    setImg('wrapper-jsce', data.uploadJsceCert);
    setImg('wrapper-signature', data.uploadSignature);
    setImg('wrapper-transfer', data.uploadTransferLetter);
    setImg('wrapper-exchange', data.uploadExchangeLetter);
    setImg('wrapper-medical', data.uploadMedicalCert);
}

function loadCompletedApplicationReadOnly(data) {
    loadPersistedDraftStateParameters(data);

    const form = document.getElementById('comprehensiveApplicationForm');
    form.classList.add('read-only-mode');

    form.querySelectorAll('.app-input').forEach(input => {
        input.disabled = true;
        input.classList.add('cursor-not-allowed', 'opacity-80', 'bg-slate-100');
    });

    document.querySelectorAll('.btn-select-pathway').forEach(btn => btn.classList.add('hidden'));
    document.querySelectorAll('input[type="file"]').forEach(fi => fi.classList.add('hidden'));

    document.querySelectorAll('.btn-view-file').forEach(btn => {
        const wrapper = btn.closest('div[id^="wrapper-"]');
        if (wrapper && wrapper.dataset.hasUpload === 'true') {
            btn.classList.remove('hidden');
        }
    });

    document.getElementById('btnTransmitApplication').classList.add('hidden');
    document.getElementById('btnSaveDraft').classList.add('hidden');
    document.getElementById('readOnlyBanner').classList.remove('hidden');
    document.getElementById('statusTrackingSection').classList.remove('hidden');

    disableLockedWrapperClicks();
}

function validateVisibleRequiredFields() {
    const form = document.getElementById('comprehensiveApplicationForm');
    const track = form.dataset.currentTrack;
    const target = document.getElementById('formTargetLevel').value;
    const mode = document.getElementById('formModeOfEntry').value;

    const standardRequired = ['formFullName', 'formDOB', 'formModeOfEntry', 'formTargetLevel', 'formStateSelect', 'formLgaSelect', 'formAddress', 'nok1Name', 'nok1Phone', 'nok1Relation', 'nok1Address', 'parentName', 'parentPhone', 'parentRelation', 'nok2Address'];
    const exchangeRequired = ['formReligion', 'formBloodGroup', 'formGenotype', 'formMedAllergies', 'formFoodAllergies', 'formSurgicalHistory', 'formRoutineMedications', 'formNeurologicalLogs', 'parentOccupation', 'parentEmail'];

    let allValid = true;

    standardRequired.forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            const val = el.value.trim().toUpperCase();
            if (!val || val.includes('PENDING')) {
                allValid = false;
                el.classList.add('border-red-500', 'bg-red-50');
            } else {
                el.classList.remove('border-red-500', 'bg-red-50');
            }
        }
    });

    if (track === 'Exchange Scheme') {
        exchangeRequired.forEach(id => {
            const el = document.getElementById(id);
            if (el) {
                const val = el.value.trim().toUpperCase();
                if (!val || val.includes('PENDING')) {
                    allValid = false;
                    el.classList.add('border-red-500', 'bg-red-50');
                } else {
                    el.classList.remove('border-red-500', 'bg-red-50');
                }
            }
        });
    }

    const disabilityRadio = document.querySelector('input[name="disabilityRadio"]:checked');
    if (disabilityRadio && disabilityRadio.value === 'has_disability') {
        const dd = document.getElementById('formDisabilityDetails');
        if (dd && !dd.value.trim()) {
            allValid = false;
            dd.classList.add('border-red-500', 'bg-red-50');
        }
    }

    if (mode === 'Transfer Placement') {
        const sch = document.getElementById('formFormerSchool');
        if (sch && !sch.value.trim()) {
            allValid = false;
            sch.classList.add('border-red-500', 'bg-red-50');
        }
    }

    const reqUploads = ['wrapper-passport', 'wrapper-nin', 'wrapper-birth', 'wrapper-indigene', 'wrapper-primary', 'wrapper-signature'];
    if (target && target.startsWith('SSS')) reqUploads.push('wrapper-jsce');
    if (mode === 'Transfer Placement') reqUploads.push('wrapper-transfer');
    if (track === 'Exchange Scheme') {
        reqUploads.push('wrapper-exchange', 'wrapper-medical');
    }

    reqUploads.forEach(id => {
        const wrapper = document.getElementById(id);
        if (wrapper && !wrapper.classList.contains('hidden')) {
            if (wrapper.dataset.hasUpload !== 'true') {
                allValid = false;
                wrapper.classList.add('border-red-500', 'bg-red-50');
            } else {
                wrapper.classList.remove('border-red-500', 'bg-red-50');
            }
        }
    });

    return allValid;
}

function disableLockedWrapperClicks() {
    document.querySelectorAll('div[id^="wrapper-"]').forEach(wrapper => {
        const fileInput = wrapper.querySelector('input[type="file"]');
        if (!fileInput || fileInput.disabled) {
            wrapper.removeAttribute('onclick');
            wrapper.classList.remove('cursor-pointer');
        }
    });
}

function initMasterApplicationFormSubmitTrigger() {
    const form = document.getElementById('comprehensiveApplicationForm');
    if (!form) return;

    form.addEventListener('submit', async (e) => {
        e.preventDefault();

        const selectedState = document.getElementById('formStateSelect').value;
        const currentTrack = form.dataset.currentTrack;

        if (currentTrack === 'Exchange Scheme' && (selectedState === 'Jigawa' || selectedState === 'Kano')) {
            Swal.fire('Security Violation', "Sovereign Registry Exclusion Rule: Candidates from Jigawa or Kano are excluded from the Exchange Scheme quotas.", 'error');
            return;
        }

        if (!validateVisibleRequiredFields()) {
            Swal.fire('Validation Error', "Please complete all mandatory fields (*) and attach all required documents before transmitting.", 'error');
            return;
        }

        const confirmRes = await Swal.fire({
            title: 'Transmit Dossier?',
            text: "Once transmitted, your dossier is locked for Admissions Board screening.",
            icon: 'question',
            showCancelButton: true,
            confirmButtonColor: '#005A36',
            confirmButtonText: 'Yes, Transmit'
        });
        if (!confirmRes.isConfirmed) return;

        const finalPayload = buildLivePayload("AWAITING_VERIFICATION");
        const submitBtn = document.getElementById('btnTransmitApplication');
        const originalText = submitBtn.innerHTML;
        submitBtn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Transmitting to Database...`;
        submitBtn.disabled = true;

        try {
            const data = await ApiGateway.postFormData('/application/save', finalPayload);
            if (data) {
                stagedFilesMap.clear();
                formIsDirtyStateFlag = false;
                submitBtn.innerHTML = originalText;
                submitBtn.disabled = false;

                Swal.fire('Transmitted', "Your application dossier is now locked and awaiting evaluation by the Admissions Board.", 'success').then(() => {
                    document.getElementById('correctionBanner').classList.add('hidden');
                    evaluateActiveSessionState();
                    window.scrollTo(0, 0);
                });
            }
        } catch (error) {
            Swal.fire('Storage Exception', error.message || "The server rejected the payload. Please verify your inputs.", 'error');
            submitBtn.innerHTML = originalText;
            submitBtn.disabled = false;
        }
    });
}

function renderTrackingStatusLayout(record) {
    if (!record) return;
    const target = document.getElementById('statusTrackingSection');
    if (!target) return;

    let theme = "bg-yellow-50 text-yellow-900 border-2 border-yellow-200";
    let statusText = `
        <div class="space-y-4 font-sans text-left">
            <div class="flex items-center gap-3 font-black text-base text-yellow-800"><div class="w-8 h-8 rounded-full bg-yellow-100 flex items-center justify-center animate-pulse"><i class="fa-solid fa-clock"></i></div> DOSSIER UNDER EVALUATION</div>
            <div class="bg-white p-5 rounded-2xl border border-yellow-200/80 shadow-sm">
                <p class="text-xs text-slate-600 leading-relaxed font-medium">Your comprehensive application, medical profile, and credentials are currently being reviewed by the Admissions Board. Please check back later for status updates.</p>
            </div>
        </div>
    `;

    if (record.status === 'REJECTED') {
        theme = "bg-red-50 text-red-900 border-2 border-red-200";
        const safeNote = DOMPurify.sanitize(record.officerNotes || "Unspecified credentials mismatch.");
        statusText = `
            <div class="space-y-4 font-sans text-left">
                <div class="flex items-center gap-3 font-black text-base text-red-800"><div class="w-8 h-8 rounded-full bg-red-100 flex items-center justify-center"><i class="fa-solid fa-circle-xmark"></i></div> APPLICATION REJECTED</div>
                <div class="bg-white p-5 rounded-2xl border border-red-200/80 shadow-sm space-y-2">
                    <p class="text-xs text-slate-600 leading-relaxed font-medium">The Admissions Board has reviewed your dossier and declined your application.</p>
                    <div class="p-4 bg-red-100 text-red-800 rounded-xl border border-red-200 text-xs font-bold shadow-inner">Official Reason: <br><span class="font-medium mt-1 block text-slate-700">${safeNote}</span></div>
                </div>
            </div>
        `;
    }

    if (record.status === 'ADMITTED') {
        theme = "bg-emerald-50 text-emerald-900 border-2 border-emerald-200";
        const rawName = record.fullName || record.name || "Applicant";
        const surname = rawName.trim().split(/\s+/).pop();
        const capSurname = surname.charAt(0).toUpperCase() + surname.slice(1).toLowerCase();
        const birthYear = (record.dob || "2026").split("-")[0];
        const dynamicStudentPass = `${capSurname}@${birthYear}`;

        statusText = `
            <div class="space-y-4 font-sans text-left">
                <div class="flex items-center gap-3 font-black text-base text-emerald-800"><div class="w-8 h-8 rounded-full bg-emerald-100 flex items-center justify-center animate-bounce"><i class="fa-solid fa-circle-check"></i></div> PROVISIONAL SCREENING SUCCESSFUL</div>
                <div class="bg-white p-5 rounded-2xl border border-emerald-200/80 shadow-sm space-y-2">
                    <p class="text-xs font-black uppercase text-gussGreen border-b border-slate-100 pb-2 mb-3 flex items-center gap-2"><i class="fa-solid fa-id-card-clip text-emerald-500"></i> Permanent Intranet Student Credentials Assigned</p>
                    <p class="text-xs font-semibold flex items-center justify-between">Official Admission Number: <span class="text-emerald-700 font-black font-mono tracking-widest text-sm bg-emerald-50 px-3 py-1.5 rounded-lg border border-emerald-200 shadow-inner">${DOMPurify.sanitize(record.admNo || "GUSSR/PENDING")}</span></p>
                    <p class="text-xs font-semibold flex items-center justify-between mt-3 border-t border-slate-100 pt-3">Default Password: <span class="text-emerald-700 font-black font-mono tracking-widest text-sm bg-emerald-50 px-3 py-1.5 rounded-lg border border-emerald-200 shadow-inner">${DOMPurify.sanitize(dynamicStudentPass)}</span></p>
                    <p class="text-[10px] text-slate-400 mt-2 italic">Use these credentials to log into the Student Portal. You will be prompted to change your password upon your first login.</p>
                </div>
                <div class="p-5 bg-slate-900 text-slate-100 rounded-2xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4 shadow-inner">
                    <div class="text-xs">
                        <strong class="text-gussGold block uppercase mb-1"><i class="fa-solid fa-file-invoice"></i> Official Admission Letter Ready</strong>
                        <span class="text-[11px] text-slate-400">Your official admission letter and placement details have been generated.</span>
                    </div>
                    <button type="button" onclick="window.printApplicantAdmissionLetter('${DOMPurify.sanitize(record.nin)}')" class="bg-gussGreen text-white font-bold py-2.5 px-4 rounded-xl text-[10px] uppercase tracking-widest hover:bg-emerald-800 shadow-md transition-all w-full md:w-auto"><i class="fa-solid fa-print mr-1"></i> Print Letter</button>
                </div>
                <div class="pt-3">
                    <button onclick="window.location.href='student_portal.html'" class="w-full bg-blue-600 hover:bg-blue-700 text-white font-black py-4 rounded-xl text-xs uppercase tracking-widest transition-all shadow-lg flex justify-center items-center gap-3">
                        Proceed to Student Portal <i class="fa-solid fa-arrow-right-to-bracket text-sm"></i>
                    </button>
                </div>
            </div>
        `;
    }

    if (record.status === 'REVOKED_QUARANTINED') {
        theme = "bg-red-950 text-red-100 border-2 border-red-800";
        let cleanReason = "Administrative Sanction";
        if (record.officerNotes && record.officerNotes.includes('Reason:')) {
            const parts = record.officerNotes.split('Reason:');
            cleanReason = parts[parts.length - 1].split('|')[0].split('[')[0].trim();
        }
        statusText = `
            <div class="space-y-4 font-sans text-left">
                <div class="flex items-center gap-3 font-black text-base text-red-400">
                    <div class="w-8 h-8 rounded-full bg-red-900 text-red-300 flex items-center justify-center text-lg animate-pulse">
                        <i class="fa-solid fa-skull"></i>
                    </div> 
                    ADMISSION PRIVILEGES REVOKED & QUARANTINED
                </div>
                <div class="bg-black/40 p-5 rounded-2xl border border-red-800/80 shadow-inner space-y-3">
                    <p class="text-xs text-red-200 leading-relaxed font-medium">
                        By formal order of the Institutional Identity Tribunal, provisional admission previously offered under this identity has been permanently revoked and quarantined.
                    </p>
                    <div class="p-3.5 bg-red-900/40 text-red-300 rounded-xl border border-red-700 text-xs font-mono font-bold">
                        <i class="fa-solid fa-gavel mr-1.5 text-red-400"></i> Tribunal Order: ${DOMPurify.sanitize(cleanReason)}
                    </div>
                </div>
            </div>
        `;
    }

    target.innerHTML = `
        <div class="text-center space-y-1 mb-6">
            <h4 class="text-lg font-black text-gussNavy uppercase tracking-wide">Screening Monitoring Post</h4>
            <p class="text-xs text-slate-500 font-mono tracking-widest bg-slate-100 px-3 py-1 rounded-lg inline-block border border-slate-200">NIN Claim Parameter: ${DOMPurify.sanitize(record.nin)}</p>
        </div>
        <div class="rounded-3xl p-6 sm:p-8 ${theme} shadow-sm">${statusText}</div>
    `;
}

window.printApplicantAdmissionLetter = async function () {
    const btn = window.event ? window.event.currentTarget : null;
    let ogText = "";
    if (btn) {
        ogText = btn.innerHTML;
        btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin mr-2"></i> Downloading...`;
        btn.disabled = true;
    }

    try {
        const app = window.currentApplicantDossier || await ApiGateway.get(`/application/${encodeURIComponent(activeSessionUserNin)}`);
        if (!app || !app.admNo) throw new Error("Admission Number Not Found");

        if (app.status === 'REVOKED_QUARANTINED' || app.status === 'REJECTED') {
            return Swal.fire('Access Revoked', 'Admission for this identity has been officially revoked.', 'error');
        }

        const blob = await ApiGateway.postBlob('/reports/admission-letter', {
            admNo: app.admNo,
            nin: activeSessionUserNin
        });

        if (blob) {
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `Official_Admission_Letter_${activeSessionUserNin}.pdf`;
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            a.remove();
        }
    } catch (error) {
        Swal.fire('Network Error', error.message || "Could not connect to the PDF Report Engine.", 'error');
    } finally {
        if (btn) {
            btn.innerHTML = ogText;
            btn.disabled = false;
        }
    }
};

window.terminateSessionLogout = async function () {
    const res = await Swal.fire({
        title: 'Sign Out?',
        text: "Are you sure you want to sign out? Any unsaved changes will be drafted if possible.",
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#ef4444',
        confirmButtonText: 'Yes, Sign Out'
    });

    if (!res.isConfirmed) return;

    const form = document.getElementById('comprehensiveApplicationForm');
    if (form && !form.classList.contains('read-only-mode') && formIsDirtyStateFlag && activeSessionUserNin) {
        await window.persistActiveFormDraftState(false);
    }

    activeSessionUserNin = null;
    window.currentApplicantDossier = null;
    stagedFilesMap.clear();
    previewMediaMetaMap.clear();
    formIsDirtyStateFlag = false;

    sessionStorage.removeItem('guss_access_token');
    sessionStorage.removeItem('guss_user_role');
    sessionStorage.removeItem('guss_applicant_nin');

    document.getElementById('applicantLoginForm')?.reset();
    document.getElementById('applicantRegisterForm')?.reset();
    document.getElementById('passwordRecoveryForm')?.reset();

    const masterContainer = document.getElementById('masterWorkspaceContainer');
    if (masterContainer) {
        masterContainer.classList.add('hidden');
        masterContainer.classList.remove('grid', 'lg:grid', 'dashboard-active');
    }

    const trackingSec = document.getElementById('statusTrackingSection');
    if (trackingSec) { trackingSec.classList.add('hidden'); trackingSec.innerHTML = ''; }
    document.getElementById('readOnlyBanner')?.classList.add('hidden');
    document.getElementById('correctionBanner')?.classList.add('hidden');

    if (form) {
        form.reset();
        form.classList.remove('read-only-mode');
        form.querySelectorAll('.app-input, select, textarea').forEach(input => {
            input.disabled = false;
            input.readOnly = false;
            input.classList.remove('cursor-not-allowed', 'opacity-80', 'bg-slate-100', 'border-red-500', 'border-red-400', 'bg-red-50', 'ring-2', 'ring-red-200', 'bg-emerald-50', 'text-emerald-900');
        });

        document.querySelectorAll('.btn-view-file').forEach(btn => btn.classList.add('hidden'));
        document.querySelectorAll('.preview-media-node').forEach(node => node.classList.add('hidden'));
        document.querySelectorAll('.icon-media-node').forEach(node => node.classList.remove('hidden'));

        document.querySelectorAll('[id^="wrapper-"]').forEach(w => {
            w.style.borderColor = '';
            w.style.backgroundColor = '';
            w.dataset.hasUpload = 'false';
            w.classList.remove('border-red-400', 'border-red-500', 'bg-red-50', 'ring-2', 'ring-red-200');
            w.classList.add('border-slate-200', 'bg-slate-50');
            const fileInput = w.querySelector('input[type="file"]');
            if (fileInput) {
                fileInput.disabled = false;
                w.setAttribute('onclick', `document.getElementById('${fileInput.id}').click()`);
                w.classList.add('cursor-pointer');
            }
        });

        const submitBtn = document.getElementById('btnTransmitApplication');
        if (submitBtn) {
            submitBtn.classList.remove('hidden');
            submitBtn.disabled = false;
            submitBtn.innerHTML = `Transmit Comprehensive Screening Dossier <i class="fa-solid fa-paper-plane text-xs"></i>`;
        }
        document.getElementById('btnSaveDraft')?.classList.remove('hidden');
        document.querySelectorAll('.btn-select-pathway').forEach(btn => btn.classList.remove('hidden'));
    }

    window.toggleGatewayInterface('login');
    await evaluateActiveSessionState();
    checkGlobalPortalStatus();

    Swal.fire('Signed Out', "Session signed out securely.", 'success').then(() => window.scrollTo(0, 0));
};

function applyPartialFormLock(rejectedFields) {
    const form = document.getElementById('comprehensiveApplicationForm');

    form.querySelectorAll('.app-input, select, textarea').forEach(input => {
        input.disabled = true;
        input.classList.add('cursor-not-allowed', 'opacity-80', 'bg-slate-100');
    });
    document.querySelectorAll('.btn-select-pathway').forEach(btn => btn.classList.add('hidden'));

    document.querySelectorAll('input[type="file"]').forEach(fi => {
        fi.classList.add('hidden');
        fi.disabled = true;
    });

    const unlockTextFields = (fieldIds) => {
        fieldIds.forEach(id => {
            const el = document.getElementById(id);
            if (el) {
                el.disabled = false;
                el.classList.remove('cursor-not-allowed', 'opacity-80', 'bg-slate-100');
                el.classList.add('border-red-400', 'bg-red-50', 'ring-2', 'ring-red-200');
            }
        });
    };

    if (rejectedFields && rejectedFields.length > 0) {
        rejectedFields.forEach(id => {
            if (id.startsWith('wrapper-')) {
                const wrapper = document.getElementById(id);
                if (wrapper) {
                    const fileInput = wrapper.querySelector('input[type="file"]');
                    const standardIcon = wrapper.querySelector('.icon-media-node');
                    if (fileInput) { fileInput.disabled = false; fileInput.classList.remove('hidden'); }
                    wrapper.classList.add('border-red-400', 'bg-red-50', 'ring-2', 'ring-red-200');
                    wrapper.classList.remove('border-slate-200', 'bg-slate-50');
                    if (standardIcon) {
                        standardIcon.innerHTML = `<i class="fa-solid fa-triangle-exclamation text-red-500 text-3xl mb-2"></i><br><span class="text-red-600 font-black text-[10px]">REUPLOAD REQUIRED</span>`;
                    }
                }
            } else if (id === 'text-demographics') {
                unlockTextFields(['formFullName', 'formDOB', 'formReligion', 'formStateSelect', 'formLgaSelect', 'formAddress', 'formModeOfEntry', 'formTargetLevel', 'formFormerSchool']);
            } else if (id === 'text-medical') {
                unlockTextFields(['formBloodGroup', 'formGenotype', 'formDisabilityDetails', 'formMedAllergies', 'formFoodAllergies', 'formSurgicalHistory', 'formRoutineMedications', 'formRespiratoryProfile', 'formNeurologicalLogs']);
                document.querySelectorAll('input[name="disabilityRadio"], .who-cb').forEach(el => {
                    el.disabled = false;
                    el.classList.remove('cursor-not-allowed');
                });
            } else if (id === 'text-contacts') {
                unlockTextFields(['nok1Name', 'nok1Phone', 'nok1Relation', 'nok1Address', 'parentName', 'parentPhone', 'parentRelation', 'parentOccupation', 'parentEmail', 'nok2Address']);
            }
        });
    }

    const submitBtn = document.getElementById('btnTransmitApplication');
    if (submitBtn) {
        submitBtn.classList.remove('hidden');
        submitBtn.disabled = false;
    }
    document.getElementById('btnSaveDraft')?.classList.add('hidden');

    disableLockedWrapperClicks();
}

let publicSearchTimeout;

window.viewAdmissionList = function () {
    const modal = document.getElementById('admissionListModal');
    if (!modal) return;

    const sessionDisplay = document.getElementById('publicSessionDisplay');
    if (sessionDisplay) {
        sessionDisplay.textContent = `${PORTAL_STATE.activeIntakeSession} - INTAKE LIST`;
    }

    modal.classList.remove('hidden');
    setTimeout(() => {
        modal.classList.remove('opacity-0');
        modal.querySelector('#admissionListContent')?.classList.remove('scale-95');
    }, 10);

    const searchInput = document.getElementById('admListSearch');
    if (searchInput) searchInput.value = '';

    const tbody = document.getElementById('admListBody');
    if (tbody) {
        tbody.innerHTML = `
            <tr><td colspan="2" class="py-16 px-6 text-center">
                <div class="w-16 h-16 bg-slate-50 border border-slate-100 text-slate-300 rounded-full flex items-center justify-center text-2xl mx-auto mb-4 shadow-inner">
                    <i class="fa-solid fa-magnifying-glass"></i>
                </div>
                <p class="text-slate-600 font-black text-sm uppercase tracking-wide">Ready to Search</p>
                <p class="text-slate-400 text-xs mt-1 font-medium">Begin typing an applicant's name or ID above to check their status.</p>
            </td></tr>
        `;
    }
};

window.filterAdmList = function () {
    const query = document.getElementById('admListSearch').value.trim();
    const tbody = document.getElementById('admListBody');
    if (!tbody) return;

    if (query.length < 3) {
        tbody.innerHTML = `<tr><td colspan="2" class="p-6 text-center text-slate-400 text-xs">Please type at least 3 characters...</td></tr>`;
        return;
    }

    clearTimeout(publicSearchTimeout);
    tbody.innerHTML = `<tr><td colspan="2" class="p-6 text-center text-gussGreen text-xs font-bold"><i class="fa-solid fa-spinner fa-spin mr-2"></i> Querying Central Database...</td></tr>`;

    publicSearchTimeout = setTimeout(async () => {
        try {
            const data = await ApiGateway.get(`/public/admission-list?query=${encodeURIComponent(query)}`);
            if (data) {
                tbody.innerHTML = '';
                if (data.length === 0) {
                    tbody.innerHTML = `<tr><td colspan="2" class="p-6 text-center text-red-500 font-bold text-xs"><i class="fa-solid fa-circle-xmark mr-1"></i> No admitted records found matching "${DOMPurify.sanitize(query)}".</td></tr>`;
                    return;
                }
                data.forEach(student => {
                    const tr = document.createElement('tr');
                    tr.className = "hover:bg-slate-50 transition-colors";
                    tr.innerHTML = `
                        <td class="py-4 px-6">
                            <p class="font-black text-gussNavy uppercase text-xs">${DOMPurify.sanitize(student.name)}</p>
                            <p class="text-[9px] text-slate-400 font-mono mt-0.5">NIN: ${DOMPurify.sanitize(student.identity)} | <span class="text-amber-500 font-bold">AWAITING LOGIN</span></p>
                        </td>
                        <td class="py-4 px-6 text-center">
                            <span class="bg-emerald-100 text-emerald-700 px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest border border-emerald-200 shadow-sm"><i class="fa-solid fa-check-circle mr-1"></i> Admitted</span>
                        </td>
                    `;
                    tbody.appendChild(tr);
                });
            }
        } catch (error) {
            tbody.innerHTML = `<tr><td colspan="2" class="p-6 text-center text-red-500 text-xs font-bold">Network Error connecting to the server.</td></tr>`;
        }
    }, 600);
};

window.closeAdmissionList = function () {
    const modal = document.getElementById('admissionListModal');
    if (!modal) return;
    modal.querySelector('#admissionListContent')?.classList.add('scale-95');
    modal.classList.add('opacity-0');
    setTimeout(() => modal.classList.add('hidden'), 300);
};