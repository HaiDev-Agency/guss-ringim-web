// =====================================================================
// G.U.S.S. RINGIM — DEPUTY DIRECTOR (ACADEMICS) CONTROLLER
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
    return ENV.API_BASE_URL + '/' + cleanUrl;
};

window.base64ToBlob = function (base64Data, contentType = 'image/jpeg') {
    if (!base64Data || base64Data.startsWith('http') || base64Data.startsWith('/uploads')) return null;
    const sliceSize = 512;
    const parts = base64Data.split(',');
    if (parts.length < 2) return null;
    const byteCharacters = atob(parts[1]);
    const byteArrays = [];
    for (let offset = 0; offset < byteCharacters.length; offset += sliceSize) {
        const slice = byteCharacters.slice(offset, offset + sliceSize);
        const byteNumbers = new Array(slice.length);
        for (let i = 0; i < slice.length; i++) byteNumbers[i] = slice.charCodeAt(i);
        byteArrays.push(new Uint8Array(byteNumbers));
    }
    return new Blob(byteArrays, { type: contentType });
};

window.toTitleCase = function (str) {
    return str.toLowerCase().split(' ').map(word => {
        if (word.includes('.') || word.includes('(') || word.includes('-')) return word.toUpperCase();
        return word.charAt(0).toUpperCase() + word.slice(1);
    }).join(' ');
};

window.alphaSort = function (arr) {
    if (!Array.isArray(arr)) return [];
    return [...arr].sort((a, b) => String(a || '').localeCompare(String(b || ''), undefined, { numeric: true, sensitivity: 'base' }));
};

let currentDDStaffId = sessionStorage.getItem('guss_staff_id');
let activeDDProfile = {
    name: "Deputy Director (Academics)", staffId: currentDDStaffId, signatureUrl: null
};

let RAM_VAULT = {};
let RAM_STUDENT_REGISTRY = [];
let DB_CLASSES = [];
let DB_CURRICULUM = [];

window.parseVault = function (key) {
    const cloudConfigs = Object.keys(RAM_VAULT).length > 0 ? RAM_VAULT : (JSON.parse(sessionStorage.getItem('cloud_configs')) || {});
    let actualKey = key;
    if (key === 'cloud_statutory_board') actualKey = 'guss_statutory_board';

    let data = cloudConfigs[actualKey] || RAM_VAULT[actualKey] || sessionStorage.getItem(actualKey);
    if (!data) return null;
    try {
        let parsed = JSON.parse(data);
        if (typeof parsed === 'string') parsed = JSON.parse(parsed);
        return parsed;
    } catch (e) { return null; }
};

window.getStudentRegistrySafe = function () {
    if (Array.isArray(RAM_STUDENT_REGISTRY) && RAM_STUDENT_REGISTRY.length > 0) return RAM_STUDENT_REGISTRY;
    try {
        const stored = JSON.parse(sessionStorage.getItem('cloud_student_registry'));
        if (Array.isArray(stored)) return stored;
    } catch (e) { }
    return [];
};

window.normalizeStaffType = function (type) {
    if (!type) return "Unknown";
    const t = type.toUpperCase().trim();
    if (t === 'ACADEMIC' || (t.includes('ACADEMIC') && !t.includes('NON'))) return 'Academic';
    if (t === 'NON_ACADEMIC' || t === 'NON-ACADEMIC' || t.includes('NON')) return 'Non-Academic';
    if (t === 'TEACHING_PRACTICE' || t === 'TP') return 'TP';
    if (t === 'NYSC') return 'NYSC';
    return type;
};

// ================= BOOTSTRAP SEQUENCE =================
window.onload = async function () {
    // 1. Boot Global UI Components (Role Switcher & Network Monitor)
    CoreUI.init();

    // 2. Boot Time Machine Header Dropdown
    await SessionManager.initHeaderDropdown();

    // 3. Hydrate Terminal Data
    await window.syncPostgresToLocal();
    await window.fetchRelationalInfrastructure();
    window.resolveDDIdentity();
    window.attachSignatureModalListener();
    window.seedDropdowns();
    window.switchTab('omnisearch');

    // Attach Dynamic Typography Buttons
    const scrapClassBtn = document.querySelector('button[onclick="window.guiRemoveClass()"]');
    if (scrapClassBtn && !document.getElementById('btnEditClass')) {
        const editClassBtn = document.createElement('button');
        editClassBtn.id = 'btnEditClass';
        editClassBtn.className = "w-full bg-gussGold hover:bg-yellow-500 text-gussNavy font-black px-4 py-2.5 rounded-lg text-[9px] uppercase tracking-widest shadow-sm transition-colors flex items-center justify-center gap-2 mt-2";
        editClassBtn.innerHTML = '<i class="fa-solid fa-pen"></i> Edit Class';
        editClassBtn.onclick = window.guiEditClass;
        scrapClassBtn.parentNode.appendChild(editClassBtn);
    }

    const scrapSubBtn = document.querySelector('button[onclick="window.guiRemoveSubject()"]');
    if (scrapSubBtn && !document.getElementById('btnEditSubject')) {
        const editSubBtn = document.createElement('button');
        editSubBtn.id = 'btnEditSubject';
        editSubBtn.className = "w-full bg-gussGold hover:bg-yellow-500 text-gussNavy font-black px-4 py-2.5 rounded-lg text-[9px] uppercase tracking-widest shadow-sm transition-colors flex items-center justify-center gap-2 mt-2";
        editSubBtn.innerHTML = '<i class="fa-solid fa-pen"></i> Edit Subject';
        editSubBtn.onclick = window.guiEditSubject;
        scrapSubBtn.parentNode.appendChild(editSubBtn);
    }

    // Apply Archive UI Guard immediately
    window.applyArchiveReadonlyState();

    // Silent Background Poller for Stranded Classes
    setInterval(async () => {
        try {
            const stranded = await ApiGateway.get('/dd/academics/allocations/stranded');
            const tabBtn = document.getElementById('tabBtnSubstitutes');
            if (tabBtn) {
                if (stranded && stranded.length > 0) {
                    tabBtn.innerHTML = `<i class="fa-solid fa-people-arrows mr-1 text-amber-500"></i> Covers & Subs <span class="ml-2 bg-red-500 text-white px-1.5 py-0.5 rounded-full text-[9px] animate-pulse">${stranded.length}</span>`;
                } else {
                    tabBtn.innerHTML = `<i class="fa-solid fa-people-arrows mr-1 text-amber-500"></i> Covers & Subs`;
                }
            }
        } catch (e) { }
    }, 30000);
};

//  TIME TRAVEL LISTENER
window.addEventListener('gussTimeMachineChanged', () => {
    window.applyArchiveReadonlyState();
    if (!document.getElementById('tabContentAllocations').classList.contains('hidden')) {
        window.renderActiveAllocations();
        window.renderFormMasters();
    }
    if (!document.getElementById('tabContentSubstitutes').classList.contains('hidden')) {
        window.renderSubstituteMatrix();
    }
});

// =====================================================================
// TOTAL ARCHIVE IMMUTABILITY ENGINE
// =====================================================================
window.applyArchiveReadonlyState = function () {
    const isHistorical = SessionManager.isHistoricalArchiveMode();
    const mainContent = document.querySelector('main');
    if (!mainContent) return;

    const oldBanner = document.getElementById('ddAcademicsHistoricalBanner');
    if (oldBanner) oldBanner.remove();

    if (isHistorical) {
        const banner = document.createElement('div');
        banner.id = 'ddAcademicsHistoricalBanner';
        banner.className = 'bg-red-50 border-l-4 border-red-500 p-4 mb-6 rounded-r-xl shadow-sm w-full animate-fade-in';
        banner.innerHTML = `
            <h3 class="text-red-800 font-black uppercase tracking-widest text-xs"><i class="fa-solid fa-lock mr-2"></i> HISTORICAL ARCHIVE SEALED (READ-ONLY)</h3>
            <p class="text-red-700 text-[10px] mt-1 font-bold">You are viewing a past academic term. Structural modifications (Curriculum, Allocations, Transfers) are strictly disabled to preserve historical integrity.</p>
        `;
        mainContent.prepend(banner);

        // Disable input forms while leaving viewing dropdowns accessible
        const inputs = mainContent.querySelectorAll('input:not([id*="Search"]), select:not(#allocSetSelect):not(#allocArmSelect):not(#auditLevel):not(#auditArm), textarea');
        inputs.forEach(input => {
            input.setAttribute('data-archived-disabled', 'true');
            input.disabled = true;
            input.classList.add('opacity-50', 'cursor-not-allowed');
        });

        // Hide mutation buttons
        const actionButtons = mainContent.querySelectorAll('button:not([id^="tabBtn"]):not([onclick*="print"]):not([onclick*="openDossierModal"])');
        actionButtons.forEach(btn => {
            btn.setAttribute('data-archived-hidden', 'true');
            btn.classList.add('hidden');
        });
    } else {
        const disabledElements = mainContent.querySelectorAll('[data-archived-disabled="true"]');
        disabledElements.forEach(el => {
            el.disabled = false;
            el.classList.remove('opacity-50', 'cursor-not-allowed');
            el.removeAttribute('data-archived-disabled');
        });

        const hiddenButtons = mainContent.querySelectorAll('[data-archived-hidden="true"]');
        hiddenButtons.forEach(btn => {
            btn.classList.remove('hidden');
            btn.removeAttribute('data-archived-hidden');
        });
    }
};

window.fetchRelationalInfrastructure = async function () {
    try {
        const [clsRes, curRes] = await Promise.all([
            ApiGateway.get('/dd/academics/classes').catch(() => []),
            ApiGateway.get('/dd/academics/curriculum').catch(() => [])
        ]);
        DB_CLASSES = Array.isArray(clsRes) ? clsRes : [];
        DB_CURRICULUM = Array.isArray(curRes) ? curRes : [];
    } catch (e) {
        console.error("Failed to load relational infrastructure.", e);
    }
};

window.getUnifiedEntityList = function () {
    let students = window.getStudentRegistrySafe();
    let staff = JSON.parse(sessionStorage.getItem('cloud_staff_registry')) || [];
    if (!Array.isArray(students)) students = [];
    if (!Array.isArray(staff)) staff = [];
    let entities = [];

    students.filter(s => s.status === 'ADMITTED' || s.triageStatus === 'ADMITTED').forEach(s => {
        const name = s.name || s.fullName || 'Unknown Applicant';
        const admNo = s.admNo || "PENDING";
        const rawPhoto = s.photoUrl || s.uploadPassport || s.passportUrl;
        const photo = rawPhoto ? window.resolveMediaUrl(rawPhoto) : `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=0F172A&color=fff`;
        entities.push({ type: 'STUDENT', id: admNo, realNIN: s.nin, name: name, photo: photo, dob: s.dob, isLocked: s.isLocked || false, hasCustomPassword: s.hasCustomPassword || false, queryTarget: `${name.toLowerCase()} ${admNo.toLowerCase()} ${(s.nin || '').toLowerCase()}` });
    });

    staff.filter(s => s.id !== 'GUSS/STF/001' && !(s.name || '').toLowerCase().includes('root admin') && !(s.name || '').toLowerCase().includes('central ict')).forEach(s => {
        const activeId = s.id || s.staffId || s.trackingRef;
        const rawPhoto = s.photoUrl || s.uploadPassport || s.passportUrl;
        const photo = rawPhoto ? window.resolveMediaUrl(rawPhoto) : `https://ui-avatars.com/api/?name=${encodeURIComponent(s.name || s.fullName)}&background=0F172A&color=fff`;
        entities.push({ type: 'STAFF', id: activeId, realNIN: activeId, name: s.name || s.fullName, photo: photo, isLocked: s.isLocked || false, hasCustomPassword: s.hasCustomPassword || false, tempPassword: s.tempPassword || 'GUSSR-STAFF-TEMP', queryTarget: `${(s.name || s.fullName || '').toLowerCase()} ${(activeId || '').toLowerCase()}` });
    });
    return entities;
};

window.seedDropdowns = function () {
    const uniqueSets = window.alphaSort([...new Set(DB_CLASSES.map(c => c.level))]);
    let setHtml = '<option value="">Select Level...</option>';
    uniqueSets.forEach(s => setHtml += `<option value="${DOMPurify.sanitize(s)}">${DOMPurify.sanitize(s)}</option>`);

    if (document.getElementById('allocSetSelect')) document.getElementById('allocSetSelect').innerHTML = setHtml;
    if (document.getElementById('transferNewSet')) document.getElementById('transferNewSet').innerHTML = setHtml;
    if (document.getElementById('removeClassSet')) document.getElementById('removeClassSet').innerHTML = setHtml;

    const uniqueCategories = window.alphaSort([...new Set(DB_CURRICULUM.map(c => c.category))]);
    let catHtml = '<option value="">Select Category...</option>';
    uniqueCategories.forEach(c => catHtml += `<option value="${DOMPurify.sanitize(c)}">${DOMPurify.sanitize(c).replace(/_/g, ' ')}</option>`);
    if (document.getElementById('removeSubjectCategory')) document.getElementById('removeSubjectCategory').innerHTML = catHtml;

    const staffList = JSON.parse(sessionStorage.getItem('cloud_staff_registry')) || [];
    const statBoard = window.parseVault('guss_statutory_board') || {};
    const delegations = window.parseVault('cloud_delegations') || {};

    const activeStaff = staffList.filter(s => {
        const status = String(s.status || s.approvalStatus || '').toUpperCase().trim();
        const type = String(s.staffType || '').toUpperCase().trim();
        const name = String(s.name || s.fullName || '').toLowerCase();
        const isApproved = status === 'APPROVED' || status === 'ACTIVATED' || status === 'ON_LEAVE';
        const isAcad = type.includes('ACADEMIC') || type === 'NYSC' || type === 'TP';
        const isNotRoot = !name.includes('root admin') && type !== 'OFFICIAL' && s.id !== 'GUSS/STF/001' && !(s.name || '').toLowerCase().includes('central ict');
        return isApproved && isAcad && isNotRoot;
    });

    let staffHtml = '<option value="">Select Academic Staff...</option>';
    activeStaff.forEach(s => {
        let execRoles = [];
        Object.keys(statBoard).forEach(office => {
            if (statBoard[office] && statBoard[office].staffId === s.id) execRoles.push(office.replace('ROLE_', '').replace(/_/g, ' '));
        });
        Object.keys(delegations).forEach(k => {
            if (delegations[k].staffId === s.id) execRoles.push(k.replace(/_/g, ' '));
        });
        const isOnLeave = String(s.status || s.approvalStatus || '').toUpperCase().trim() === 'ON_LEAVE';
        let roleBadge = execRoles.length > 0 ? ` [★ ${execRoles.join(' / ')}]` : "";
        let leaveBadge = isOnLeave ? ` [✈️ ON LEAVE]` : "";
        staffHtml += `<option value="${s.id}" data-is-exec="${execRoles.length > 0 ? 'true' : 'false'}" data-is-on-leave="${isOnLeave}">${DOMPurify.sanitize(s.name)} (${DOMPurify.sanitize(s.staffType)})${roleBadge}${leaveBadge}</option>`;
    });

    ['allocStaffSelect', 'fmStaffSelect'].forEach(id => {
        if (document.getElementById(id)) document.getElementById(id).innerHTML = staffHtml;
    });

    let commsHtml = '<option value="">Select Target...</option><option value="ALL_ACADEMIC_STAFF" class="font-black text-blue-600 bg-blue-50"> MASS DISPATCH: ALL ACADEMIC STAFF</option>' + staffHtml;
    if (document.getElementById('commStaffSelect')) document.getElementById('commStaffSelect').innerHTML = commsHtml;
};

window.populateArms = function (targetId, setVal) {
    const target = document.getElementById(targetId);
    if (!setVal) {
        target.innerHTML = '<option value="">Arm...</option>';
        target.disabled = true;
        return;
    }
    const arms = window.alphaSort(DB_CLASSES.filter(c => c.level === setVal).map(c => c.arm));
    let html = '<option value="">Arm...</option>';
    arms.forEach(a => html += `<option value="${DOMPurify.sanitize(a)}">${DOMPurify.sanitize(a)}</option>`);
    target.innerHTML = html;
    target.disabled = false;
};

window.populateArmsForRemoval = function (setVal) { window.populateArms('removeClassArm', setVal); };

window.populateSubjectRemovalDropdown = function (category) {
    const subjectSelect = document.getElementById('removeSubjectSelect');
    if (!category) {
        subjectSelect.innerHTML = '<option value="">Select Category First...</option>';
        subjectSelect.disabled = true;
        return;
    }
    const subjects = window.alphaSort(DB_CURRICULUM.filter(c => c.category === category).map(c => c.name));
    let htmlBuffer = '<option value="">Select Subject...</option>';
    subjects.forEach(sub => htmlBuffer += `<option value="${DOMPurify.sanitize(sub)}">${DOMPurify.sanitize(sub)}</option>`);
    subjectSelect.innerHTML = htmlBuffer;
    subjectSelect.disabled = false;
};

window.populateEditSubjectDropdown = function (category) {
    const subjectSelect = document.getElementById('swal-edit-sub-select');
    if (!subjectSelect) return;
    if (!category) {
        subjectSelect.innerHTML = '<option value="">Select Category First...</option>';
        subjectSelect.disabled = true;
        return;
    }
    const subjects = window.alphaSort(DB_CURRICULUM.filter(c => c.category === category).map(c => c.name));
    let htmlBuffer = '<option value="">Select Subject...</option>';
    subjects.forEach(sub => htmlBuffer += `<option value="${DOMPurify.sanitize(sub)}">${DOMPurify.sanitize(sub)}</option>`);
    subjectSelect.innerHTML = htmlBuffer;
    subjectSelect.disabled = false;
};

window.guiAddClass = async function () {
    if (SessionManager.isHistoricalArchiveMode()) {
        return Swal.fire('Archive Lockout', 'Modifying class infrastructure is strictly prohibited in historical view.', 'error');
    }

    const uniqueSets = window.alphaSort([...new Set(DB_CLASSES.map(c => c.level))]);
    let optionsHtml = '<option value="__NEW__" class="font-bold text-blue-600">+ Create Brand New Class Level</option>';
    uniqueSets.forEach(s => optionsHtml += `<option value="${DOMPurify.sanitize(s)}">${DOMPurify.sanitize(s)}</option>`);

    const setRes = await Swal.fire({
        title: 'Create Class - Step 1',
        html: `
            <label class="text-xs font-bold text-slate-500 uppercase tracking-widest block mb-2">Select Existing or Create New Set</label>
            <select id="swal-class-select" class="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-3 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-gussGreen">
                ${optionsHtml}
            </select>
        `,
        showCancelButton: true, confirmButtonColor: '#005A36', preConfirm: () => document.getElementById('swal-class-select').value
    });

    if (!setRes.isConfirmed) return;
    let targetSet = setRes.value;

    if (targetSet === '__NEW__') {
        const newSetRes = await Swal.fire({
            title: 'New Class Level',
            text: 'Type the new level (e.g. JSS 1, SSS 3):',
            input: 'text', showCancelButton: true, confirmButtonColor: '#005A36',
            inputValidator: (value) => { if (!value.trim()) return 'You need to type a level name!' }
        });
        if (!newSetRes.isConfirmed) return;
        targetSet = newSetRes.value.trim().toUpperCase();
    }

    const armRes = await Swal.fire({
        title: 'Create Class - Step 2',
        text: `Enter the specific Arm/Branch to assign to ${targetSet} (e.g., A, B, Science):`,
        input: 'text', showCancelButton: true, confirmButtonColor: '#005A36',
        inputValidator: (value) => { if (!value.trim()) return 'You need to type an arm name!' }
    });

    if (!armRes.isConfirmed) return;
    const targetArm = armRes.value.trim().toUpperCase();

    const authRes = await Swal.fire({
        title: 'Zero-Trust Authorization',
        html: `Commissioning new academic class: <b>${targetSet} ${targetArm}</b>.<br><br>Enter Admin Password to execute:`,
        input: 'password', inputAttributes: { autocapitalize: 'off', autocorrect: 'off' },
        icon: 'warning', showCancelButton: true, confirmButtonColor: '#005A36'
    });

    if (!authRes.isConfirmed || !authRes.value) return;

    try {
        await ApiGateway.post('/dd/academics/classes/add', {
            targetLevel: targetSet,
            targetArm: targetArm,
            adminPassword: authRes.value
        });

        await window.fetchRelationalInfrastructure();
        Swal.fire('Success', `Class ${targetSet} ${targetArm} officially commissioned in PostgreSQL Vault.`, 'success');
        window.seedDropdowns();
    } catch (error) {
        Swal.fire('Error', error.message || "Failed to save.", 'error');
    }
};

window.executeRemoveClass = async function () {
    if (SessionManager.isHistoricalArchiveMode()) {
        return Swal.fire('Archive Lockout', 'Scrapping class infrastructure is strictly prohibited in historical view.', 'error');
    }

    const targetSet = document.getElementById('removeClassSet').value;
    const targetArm = document.getElementById('removeClassArm').value;
    if (!targetSet || !targetArm) return Swal.fire('Validation Error', 'Select both Set and Arm to delete.', 'error');

    const finalRes = await Swal.fire({
        title: 'Permanent Deletion', text: `Are you sure you want to permanently scrap ${targetSet} ${targetArm}?`,
        icon: 'warning', showCancelButton: true, confirmButtonColor: '#ef4444', confirmButtonText: 'Yes, Scrap Class'
    });
    if (!finalRes.isConfirmed) return;

    const authRes = await Swal.fire({
        title: 'Zero-Trust Authorization',
        html: `Scrapping academic class infrastructure.<br><br>Enter Admin Password to execute:`,
        input: 'password',
        inputAttributes: { autocapitalize: 'off', autocorrect: 'off' },
        icon: 'error',
        showCancelButton: true,
        confirmButtonColor: '#ef4444',
        confirmButtonText: 'Authorize Purge'
    });

    if (!authRes.isConfirmed || !authRes.value) return;

    try {
        await ApiGateway.post('/dd/academics/classes/remove', {
            targetLevel: targetSet,
            targetArm: targetArm,
            adminPassword: authRes.value
        });

        await window.fetchRelationalInfrastructure();
        Swal.fire('Success', `Class ${targetSet} ${targetArm} officially scrapped.`, 'success');
        document.getElementById('removeClassModal').classList.add('hidden');
        window.seedDropdowns();
    } catch (error) {
        Swal.fire('Error', error.message || "Failed to execute database purge.", 'error');
    }
};

window.guiRemoveClass = function () {
    document.getElementById('removeClassSet').value = '';
    document.getElementById('removeClassArm').innerHTML = '<option value="">Select Set First...</option>';
    document.getElementById('removeClassArm').disabled = true;
    document.getElementById('removeClassModal').classList.remove('hidden');
};

window.guiAddSubject = async function () {
    if (SessionManager.isHistoricalArchiveMode()) {
        return Swal.fire('Archive Lockout', 'Modifying curriculum subjects is strictly prohibited in historical view.', 'error');
    }

    const uniqueCategories = [...new Set(DB_CURRICULUM.map(c => c.category))];

    let optionsHtml = '<option value="__NEW__" class="font-bold text-blue-600">+ Create Brand New Department/Folder</option>';
    uniqueCategories.forEach(c => optionsHtml += `<option value="${DOMPurify.sanitize(c)}">${DOMPurify.sanitize(c).replace(/_/g, ' ')}</option>`);

    const catRes = await Swal.fire({
        title: 'Add Subject - Step 1',
        html: `
            <label class="text-xs font-bold text-slate-500 uppercase tracking-widest block mb-2">Select Target Department</label>
            <select id="swal-cat-select" class="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-3 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-gussGreen">
                ${optionsHtml}
            </select>
        `,
        showCancelButton: true,
        confirmButtonColor: '#005A36',
        preConfirm: () => document.getElementById('swal-cat-select').value
    });

    if (!catRes.isConfirmed) return;
    let category = catRes.value;

    if (category === '__NEW__') {
        const newCatRes = await Swal.fire({
            title: 'New Department Folder',
            text: 'Type the new generic category name (e.g. SCIENCES, LANGUAGES):',
            input: 'text',
            showCancelButton: true,
            confirmButtonColor: '#005A36',
            inputValidator: (value) => { if (!value.trim()) return 'You need to type a category!' }
        });
        if (!newCatRes.isConfirmed) return;
        category = newCatRes.value.trim().toUpperCase().replace(/\s+/g, '_');
    }

    const subRes = await Swal.fire({
        title: 'Add Subject - Step 2',
        text: `Enter the new subject to add to ${category.replace(/_/g, ' ')}:`,
        input: 'text',
        inputPlaceholder: 'e.g. Physics',
        showCancelButton: true,
        confirmButtonColor: '#005A36',
        inputValidator: (value) => { if (!value.trim()) return 'You need to type a subject!' }
    });

    if (!subRes.isConfirmed) return;
    const newSubject = window.toTitleCase(subRes.value.trim());

    const authRes = await Swal.fire({
        title: 'Zero-Trust Authorization',
        html: `Commissioning new subject: <b>${newSubject}</b>.<br><br>Enter Admin Password to execute:`,
        input: 'password',
        inputAttributes: { autocapitalize: 'off', autocorrect: 'off' },
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#005A36',
        confirmButtonText: 'Authorize Commissioning'
    });

    if (!authRes.isConfirmed || !authRes.value) return;

    try {
        await ApiGateway.post('/dd/academics/curriculum/add', {
            category: category,
            subject: newSubject,
            adminPassword: authRes.value
        });

        await window.fetchRelationalInfrastructure();
        Swal.fire('Success', `Subject '${newSubject}' successfully added to Relational Matrix.`, 'success');
        window.seedDropdowns();
        if (typeof window.renderActiveAllocations === 'function') window.renderActiveAllocations();
    } catch (error) {
        Swal.fire('Error', error.message || "Failed to save.", 'error');
    }
};

window.guiRemoveSubject = function () {
    document.getElementById('removeSubjectCategory').value = '';
    const subjectSelect = document.getElementById('removeSubjectSelect');
    subjectSelect.innerHTML = '<option value="">Select Category First...</option>';
    subjectSelect.disabled = true;
    document.getElementById('removeSubjectModal').classList.remove('hidden');
};

window.executeRemoveSubject = async function () {
    if (SessionManager.isHistoricalArchiveMode()) {
        return Swal.fire('Archive Lockout', 'Purging curriculum subjects is strictly prohibited in historical view.', 'error');
    }

    const category = document.getElementById('removeSubjectCategory').value;
    const targetSubject = document.getElementById('removeSubjectSelect').value;
    if (!category || !targetSubject) return Swal.fire('Validation Error', "Please select both a category and a subject.", 'error');

    const res = await Swal.fire({
        title: 'Permanent Deletion', text: `Permanently remove '${targetSubject}' from ${category}?`,
        icon: 'warning', showCancelButton: true, confirmButtonColor: '#ef4444', confirmButtonText: 'Yes, Remove'
    });
    if (!res.isConfirmed) return;

    const authRes = await Swal.fire({
        title: 'Zero-Trust Authorization',
        html: `Scrapping subject infrastructure.<br><br>Enter Admin Password to execute:`,
        input: 'password',
        inputAttributes: { autocapitalize: 'off', autocorrect: 'off' },
        icon: 'error',
        showCancelButton: true,
        confirmButtonColor: '#ef4444',
        confirmButtonText: 'Authorize Purge'
    });

    if (!authRes.isConfirmed || !authRes.value) return;

    try {
        await ApiGateway.post('/dd/academics/curriculum/remove', {
            category: category,
            subject: targetSubject,
            adminPassword: authRes.value
        });

        await window.fetchRelationalInfrastructure();
        Swal.fire('Success', `Subject successfully purged from the PostgreSQL DB.`, 'success');
        document.getElementById('removeSubjectModal').classList.add('hidden');
        window.seedDropdowns();
        if (typeof window.renderActiveAllocations === 'function') window.renderActiveAllocations();
    } catch (error) {
        Swal.fire('Error', error.message || "Failed to execute database purge.", 'error');
    }
};

window.guiRemoveCategory = async function () {
    if (SessionManager.isHistoricalArchiveMode()) {
        return Swal.fire('Archive Lockout', 'Purging curriculum categories is strictly prohibited in historical view.', 'error');
    }

    const uniqueCategories = window.alphaSort([...new Set(DB_CURRICULUM.map(c => c.category))]);
    if (uniqueCategories.length === 0) return Swal.fire('Empty', 'No categories exist in the database.', 'info');

    let optionsHtml = '';
    uniqueCategories.forEach(c => optionsHtml += `<option value="${DOMPurify.sanitize(c)}">${DOMPurify.sanitize(c).replace(/_/g, ' ')}</option>`);

    const catRes = await Swal.fire({
        title: 'Scrap Entire Category',
        html: `
            <label class="text-xs font-bold text-slate-500 uppercase tracking-widest block mb-2">Select Category to Destroy</label>
            <select id="swal-cat-del-select" class="swal2-select w-[80%] text-sm font-bold focus:outline-none focus:ring-2 focus:ring-red-500">${optionsHtml}</select>
        `,
        showCancelButton: true, confirmButtonColor: '#ef4444', confirmButtonText: '<i class="fa-solid fa-trash-can"></i> Scrap Category',
        preConfirm: () => document.getElementById('swal-cat-del-select').value
    });

    if (!catRes.isConfirmed) return;

    const confirm = await Swal.fire({
        title: 'CRITICAL WARNING', text: `This will permanently delete ALL subjects under ${catRes.value}. This action cannot be undone.`, icon: 'warning', showCancelButton: true, confirmButtonColor: '#ef4444'
    });
    if (!confirm.isConfirmed) return;

    const authRes = await Swal.fire({
        title: 'Zero-Trust Authorization',
        html: `Scrapping entire category infrastructure.<br><br>Enter Admin Password to execute:`,
        input: 'password', inputAttributes: { autocapitalize: 'off', autocorrect: 'off' },
        icon: 'error', showCancelButton: true, confirmButtonColor: '#ef4444'
    });

    if (!authRes.isConfirmed || !authRes.value) return;

    try {
        await ApiGateway.post('/dd/academics/curriculum/category/remove', {
            category: catRes.value,
            adminPassword: authRes.value
        });

        await window.fetchRelationalInfrastructure();
        window.seedDropdowns();
        Swal.fire('Scrapped', 'Category and all associated subjects have been purged from the database.', 'success');
    } catch (error) {
        Swal.fire('Error', error.message || 'Failed to execute database purge.', 'error');
    }
};

window.syncPostgresToLocal = async function () {
    try {
        const [confRes, staffRes, stdRes, boardRes, delRes] = await Promise.all([
            ApiGateway.get('/config/all').catch(() => null),
            ApiGateway.get('/ict/staff/all-lightweight').catch(() => null),
            ApiGateway.get('/bridge/all-lightweight').catch(() => null),
            ApiGateway.get('/ict/statutory/board').catch(() => null),
            ApiGateway.get('/director/delegations').catch(() => null)
        ]);

        if (confRes) {
            RAM_VAULT = confRes;
            const lightConfigs = {};
            Object.keys(confRes).forEach(k => { if (!k.startsWith('guss_grades_') && !k.startsWith('guss_eval_')) lightConfigs[k] = confRes[k]; });
            try {
                sessionStorage.setItem('cloud_configs', JSON.stringify(lightConfigs));
                Object.keys(lightConfigs).forEach(k => { if (!k.startsWith('guss_statutory_board') && !k.startsWith('guss_delegations')) localStorage.setItem(k, lightConfigs[k]); });
            } catch (e) { }
        }

        if (boardRes) {
            RAM_VAULT['guss_statutory_board'] = JSON.stringify(boardRes);
            sessionStorage.setItem('cloud_statutory_board', JSON.stringify(boardRes));
        }

        if (delRes) {
            RAM_VAULT['cloud_delegations'] = JSON.stringify(delRes);
            sessionStorage.setItem('cloud_delegations', JSON.stringify(delRes));
        }

        if (staffRes && Array.isArray(staffRes)) {
            const mappedRegistry = staffRes.map(staff => ({
                id: staff.staffId ? staff.staffId : staff.trackingRef, trackingRef: staff.trackingRef, name: staff.fullName || staff.name,
                staffType: window.normalizeStaffType(staff.staffType),
                qual: staff.qualification || staff.qual, phone: staff.phone, personalEmail: staff.personalEmail, email: staff.officialEmail || staff.email,
                address: staff.residentialAddress || staff.address, bloodGroup: staff.bloodGroup, nokName: staff.nokName, nokPhone: staff.nokPhone,
                endDate: staff.endDate, photoUrl: staff.photoUrl, signatureUrl: staff.signatureUrl, status: staff.status || staff.approvalStatus,
                approvalStatus: staff.approvalStatus || staff.status, isLocked: staff.isLocked === true || staff.isLocked === 'true',
                hasCustomPassword: staff.hasCustomPassword === true || staff.hasCustomPassword === 'true', tempPassword: staff.tempPassword || 'GUSSR-STAFF-TEMP', staffId: staff.staffId
            }));

            const ghostedRegistry = mappedRegistry.filter(s =>
                s.id !== 'GUSS/STF/001' && !(s.name || '').toLowerCase().includes('root admin')
            );

            try { sessionStorage.setItem('cloud_staff_registry', JSON.stringify(ghostedRegistry)); localStorage.setItem('guss_staff_registry', JSON.stringify(ghostedRegistry)); } catch (e) { }
        }

        if (stdRes && Array.isArray(stdRes)) {
            stdRes.forEach(s => { if (s.uploadSignature) s.signatureUrl = s.uploadSignature; });
            RAM_STUDENT_REGISTRY = stdRes;
            try { sessionStorage.setItem('cloud_student_registry', JSON.stringify(stdRes)); } catch (e) { }
        }
    } catch (error) { console.error("Critical Cloud Sync Error:", error); }
};

window.syncConfigFromCloud = window.syncPostgresToLocal;

window.executeOmniSearch = function () {
    const query = document.getElementById('omniSearchInput').value.toLowerCase().trim();
    const res = document.getElementById('omniSearchResults');
    res.innerHTML = '';
    if (query.length < 2) return;

    const entities = window.getUnifiedEntityList();
    let found = false;
    let matchCount = 0;
    const maxResults = 50;
    let htmlBuffer = "";

    for (let i = 0; i < entities.length; i++) {
        const ent = entities[i];
        if (ent.queryTarget.includes(query)) {
            found = true;
            if (matchCount < maxResults) {
                htmlBuffer += `
                <div onclick="window.openDossierModal('${ent.type}', '${ent.id}')" class="p-4 bg-white border border-slate-200 rounded-xl hover:border-amber-400 cursor-pointer flex justify-between items-center group transition-all shadow-sm">
                    <div class="flex items-center gap-4">
                        <img src="${DOMPurify.sanitize(ent.photo)}" class="w-10 h-10 rounded-lg object-cover bg-slate-100 border border-slate-200 shrink-0">
                        <div>
                            <span class="font-black text-slate-800 uppercase text-sm group-hover:text-amber-600 transition-colors">${DOMPurify.sanitize(ent.name)}</span><br>
                            <span class="text-[10px] font-mono text-slate-500 block mt-0.5">${DOMPurify.sanitize(ent.id)}</span>
                        </div>
                    </div>
                    <i class="fa-solid fa-address-card text-slate-200 group-hover:text-amber-500 text-lg"></i>
                </div>`;
            }
            matchCount++;
        }
    }

    if (!found) {
        res.innerHTML = `<div class="col-span-1 sm:col-span-2 lg:col-span-3 text-center text-xs text-slate-400 py-4 font-bold border border-dashed rounded-xl">No records found.</div>`;
    } else {
        if (matchCount > maxResults) {
            htmlBuffer += `<div class="col-span-1 sm:col-span-2 lg:col-span-3 p-3 text-center text-blue-500 font-bold text-[9px] uppercase bg-blue-50 rounded-xl mt-2">Showing top ${maxResults} matches out of ${matchCount}. Refine search.</div>`;
        }
        res.innerHTML = htmlBuffer;
    }
};

window.openDossierModal = async function (type, targetId) {
    const body = document.getElementById('dossierBody');
    if (!body) return;

    body.innerHTML = '<div class="py-24 text-center"><i class="fa-solid fa-circle-notch fa-spin text-4xl text-blue-500 mb-4 block"></i><p class="font-bold text-slate-500 uppercase tracking-widest text-xs">Decrypting Secure Dossier...</p></div>';

    const modal = document.getElementById('dossierModal');
    modal.classList.remove('hidden');
    setTimeout(() => {
        modal.classList.remove('opacity-0');
        const content = document.getElementById('dossierContent');
        if (content) content.classList.remove('scale-95');
    }, 10);

    if (type === 'STUDENT') {
        try {
            const pendingDB = window.getStudentRegistrySafe();
            const cacheRef = pendingDB.find(s => s.admNo === targetId || s.nin === targetId);
            if (!cacheRef) throw new Error("Student not found in registry.");

            const student = await ApiGateway.get(`/bridge/student?nin=${cacheRef.nin}`);
            const safePhoto = student.photoUrl || student.uploadPassport ? window.resolveMediaUrl(student.photoUrl || student.uploadPassport) : `https://ui-avatars.com/api/?name=${(student.name || 'Student').replace(/ /g, '+')}`;
            const safeSig = student.signatureUrl || student.uploadSignature ? window.resolveMediaUrl(student.signatureUrl || student.uploadSignature) : null;

            body.innerHTML = `
                <div class="flex flex-col md:flex-row gap-8 items-start">
                    <div class="flex flex-col items-center gap-4 w-full md:w-1/3 border-b md:border-b-0 md:border-r border-slate-200 pb-6 md:pb-0 md:pr-6 shrink-0">
                        <img src="${DOMPurify.sanitize(safePhoto)}" class="w-48 h-48 object-cover rounded-3xl shadow-md border border-slate-200">
                        <span class="bg-emerald-100 text-emerald-800 text-[10px] font-black uppercase tracking-widest px-3 py-1 rounded shadow-sm">Student Identity</span>
                        <div class="text-center w-full">
                            <p class="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Admission Number</p>
                            <p class="font-mono font-bold text-gussNavy bg-slate-100 py-2 rounded-lg border border-slate-200 text-lg">${DOMPurify.sanitize(student.admNo || "PENDING")}</p>
                        </div>
                        ${safeSig ? `<div class="mt-2 text-center w-full"><p class="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1 border-t border-slate-100 pt-3">Digital Signature</p><img src="${DOMPurify.sanitize(safeSig)}" class="h-12 object-contain mx-auto mix-blend-multiply opacity-80"></div>` : ''}
                    </div>
                    <div class="flex-1 w-full space-y-6">
                        <div>
                            <h2 class="text-2xl sm:text-3xl font-black text-gussNavy uppercase tracking-wide leading-tight">${DOMPurify.sanitize(student.name || student.fullName)}</h2>
                            <p class="text-xs text-slate-500 font-bold mt-1">Assigned Class: <span class="text-gussGreen">${DOMPurify.sanitize(student.assignedClass || "Unassigned")}</span> &nbsp;|&nbsp; Hostel: <span class="text-gussGold">${DOMPurify.sanitize(student.assignedHostel || "Day Student")}</span></p>
                        </div>
                        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-y-5 gap-x-6 bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
                            <div><p class="text-[9px] font-bold text-slate-400 uppercase tracking-widest">NIN Linked</p><p class="text-sm font-mono font-black text-slate-700">${DOMPurify.sanitize(student.nin || 'N/A')}</p></div>
                            <div><p class="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Date of Birth</p><p class="text-sm font-black text-slate-700">${DOMPurify.sanitize(student.dob || 'N/A')}</p></div>
                            <div><p class="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Gender</p><p class="text-sm font-black text-slate-700">${DOMPurify.sanitize(student.gender || 'N/A')}</p></div>
                            <div><p class="text-[9px] font-bold text-slate-400 uppercase tracking-widest">State of Origin</p><p class="text-sm font-black text-slate-700">${DOMPurify.sanitize(student.state || student.stateOfOrigin || 'N/A')}</p></div>
                            <div><p class="text-[9px] font-bold text-slate-400 uppercase tracking-widest">L.G.A</p><p class="text-sm font-black text-slate-700">${DOMPurify.sanitize(student.lga || 'N/A')}</p></div>
                            <div><p class="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Blood Group</p><p class="text-sm font-black text-red-600">${DOMPurify.sanitize(student.blood || 'Unknown')}</p></div>
                        </div>
                        <div class="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-4">
                            <div><p class="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Primary Contact / Phone</p><p class="text-sm font-mono font-black text-blue-600">${DOMPurify.sanitize(student.nok1Phone || 'N/A')}</p></div>
                            <div><p class="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Residential Address</p><p class="text-sm font-black text-slate-700">${DOMPurify.sanitize(student.address || 'N/A')}</p></div>
                        </div>
                        <div class="pt-2">
                            <h4 class="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2"><i class="fa-solid fa-file-medical text-red-400 mr-1"></i> Medical & Health Notes</h4>
                            <p class="text-xs font-bold text-slate-600 bg-red-50 p-4 rounded-xl border border-red-100 shadow-inner">Allergies: ${DOMPurify.sanitize(student.medAllergies || 'None declared')} &nbsp;|&nbsp; Disabilities: ${student.disabilityRadio === 'none' ? 'None' : 'Yes (Check Physical File)'}</p>
                        </div>
                    </div>
                </div>`;
        } catch (error) {
            body.innerHTML = `<div class="py-20 text-center text-red-500 font-bold"><i class="fa-solid fa-triangle-exclamation text-4xl mb-4 block"></i> Failed to decrypt student dossier. Network Error.</div>`;
        }
    } else if (type === 'STAFF') {
        try {
            const safeId = encodeURIComponent(targetId);
            const [staff, operationalRoles] = await Promise.all([
                ApiGateway.get(`/ict/staff/profile?id=${safeId}`),
                ApiGateway.get(`/ict/operational/staff?staffId=${safeId}`).catch(() => [])
            ]);

            body.innerHTML = window.buildStaffDossierHtml(staff, operationalRoles);
        } catch (error) {
            body.innerHTML = `<div class="py-20 text-center text-red-500 font-bold"><i class="fa-solid fa-triangle-exclamation text-4xl mb-4 block"></i> Failed to decrypt staff dossier. Network Error.</div>`;
        }
    }
};

window.buildStaffDossierHtml = function (staff, operationalRoles = []) {
    let rolesHtml = '';
    const staffIdCheck = staff.staffId || staff.trackingRef;

    const statBoard = (typeof window.parseVault === 'function') ? (window.parseVault('guss_statutory_board') || {}) : {};
    Object.entries(statBoard).forEach(([officeKey, data]) => {
        if (data.staffId && data.staffId.toUpperCase() === staffIdCheck.toUpperCase()) {
            let cleanTitle = officeKey.replace('ROLE_', '').replace(/_/g, ' ');
            if (officeKey === 'ROLE_DIRECTOR') cleanTitle = 'School Director';
            if (officeKey === 'ROLE_BURSAR') cleanTitle = 'Central Bursar';
            rolesHtml += `<span class="bg-gussGold text-gussNavy px-3 py-1 rounded text-[9px] font-black uppercase shadow-sm border border-yellow-600 mr-2 mb-2 inline-block"><i class="fa-solid fa-crown mr-1"></i> ${cleanTitle}</span>`;
        }
    });

    const delegations = (typeof window.parseVault === 'function') ? (window.parseVault('cloud_delegations') || {}) : {};
    Object.entries(delegations).forEach(([roleKey, data]) => {
        if (data.staffId && data.staffId.toUpperCase() === staffIdCheck.toUpperCase()) {
            rolesHtml += `<span class="bg-slate-800 text-white px-3 py-1 rounded text-[9px] font-black uppercase shadow-sm border border-slate-600 mr-2 mb-2 inline-block"><i class="fa-solid fa-shield-halved mr-1 text-blue-400"></i> ${roleKey.replace(/_/g, ' ')}</span>`;
        }
    });

    if (Array.isArray(operationalRoles)) {
        operationalRoles.forEach(op => {
            let icon = "fa-chalkboard-user";
            let colorClass = "text-blue-600 border-blue-600";
            if (op.type === 'HOUSE_WARDEN') { icon = "fa-building-user"; colorClass = "text-purple-600 border-purple-600 bg-purple-50"; }
            else if (op.type === 'FORM_MASTER') { icon = "fa-users-rectangle"; colorClass = "text-orange-600 border-orange-600 bg-orange-50"; }
            else if (op.type === 'SUBJECT_TEACHER') { colorClass = "text-blue-600 border-blue-600 bg-blue-50"; }

            rolesHtml += `<span class="${colorClass} border text-[9px] font-black uppercase tracking-widest px-2 py-1 rounded shadow-sm mr-2 mb-2 inline-block"><i class="fa-solid ${icon} mr-1"></i> ${DOMPurify.sanitize(op.title)}</span>`;
        });
    }

    if (rolesHtml === '') {
        rolesHtml = `<span class="text-[9px] font-bold text-slate-400 uppercase"><i class="fa-solid fa-user text-slate-300 mr-1"></i> Standard Faculty Clearance</span>`;
    }

    const safePhoto = staff.photoUrl || staff.uploadPassport ? window.resolveMediaUrl(staff.photoUrl || staff.uploadPassport) : `https://ui-avatars.com/api/?name=${(staff.fullName || staff.name).replace(/ /g, '+')}`;
    const safeSig = staff.signatureUrl || staff.uploadSignature ? window.resolveMediaUrl(staff.signatureUrl || staff.uploadSignature) : null;

    let transientHtml = "";
    if (staff.staffType === 'NYSC' || staff.staffType === 'TP') {
        let isExpired = false;
        if (staff.endDate) {
            const end = new Date(staff.endDate);
            if (end < new Date()) isExpired = true;
        }
        transientHtml = `<div class="${isExpired ? 'bg-red-50 border-red-200' : 'bg-orange-50 border-orange-200'} border p-3 rounded-xl mb-4 mt-4">
            <p class="text-[9px] font-black ${isExpired ? 'text-red-800' : 'text-orange-800'} uppercase tracking-widest">Transient Status: ${isExpired ? '<span class="text-red-600">EXPIRED</span>' : 'ACTIVE'}</p>
            <p class="text-xs font-bold ${isExpired ? 'text-red-900' : 'text-orange-900'} mt-1">Passing Out Date: ${DOMPurify.sanitize(staff.endDate)}</p>
        </div>`;
    }

    const displayAddress = staff.residentialAddress || staff.address || 'N/A';
    const displayQual = staff.qualification || staff.qual || 'N/A';

    return `<div class="flex flex-col md:flex-row gap-8 items-start">
        <div class="flex flex-col items-center gap-4 w-full md:w-1/3 border-b md:border-b-0 md:border-r border-slate-200 pb-6 md:pb-0 md:pr-6 shrink-0">
            <img src="${DOMPurify.sanitize(safePhoto)}" class="w-48 h-48 object-cover rounded-3xl shadow-md border border-slate-200">
            <span class="bg-blue-100 text-blue-800 text-[10px] font-black uppercase tracking-widest px-3 py-1 rounded shadow-sm">Staff Identity</span>
            <div class="text-center w-full">
                <p class="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Staff ID Number</p>
                <p class="font-mono font-bold text-gussNavy bg-slate-100 py-2 rounded-lg border border-slate-200 text-lg">${DOMPurify.sanitize(staff.staffId || staff.trackingRef)}</p>
            </div>
            ${safeSig ? `<div class="mt-2 text-center w-full"><p class="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1 border-t border-slate-100 pt-3">Digital Signature</p><img src="${DOMPurify.sanitize(safeSig)}" class="h-12 object-contain mx-auto mix-blend-multiply opacity-80"></div>` : ''}
        </div>
        <div class="flex-1 w-full space-y-6">
            <div>
                <h2 class="text-2xl sm:text-3xl font-black text-gussNavy uppercase tracking-wide leading-tight">${DOMPurify.sanitize(staff.fullName || staff.name)}</h2>
                <p class="text-xs text-slate-500 font-bold mt-1">Track Category: <span class="text-blue-600">${DOMPurify.sanitize(staff.staffType)}</span> &nbsp;|&nbsp; Status: <span class="${(staff.approvalStatus || staff.status) === 'APPROVED' ? 'text-emerald-600' : 'text-amber-500'} font-black">${DOMPurify.sanitize(staff.approvalStatus || staff.status)}</span></p>
                <div class="mt-4 border-t border-slate-200 pt-4">
                    <p class="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-2">Active Assignments & Clearances</p>
                    ${rolesHtml}
                </div>
            </div>
            ${transientHtml}
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-y-5 gap-x-6 bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
                <div><p class="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Qualification</p><p class="text-sm font-black text-slate-700">${DOMPurify.sanitize(displayQual)}</p></div>
                <div><p class="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Blood Group</p><p class="text-sm font-black text-red-600">${DOMPurify.sanitize(staff.bloodGroup || 'N/A')}</p></div>
                <div><p class="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Personal Phone / Email</p><p class="text-sm font-mono font-black text-slate-700">${DOMPurify.sanitize(staff.phone || 'N/A')}<br><span class="text-slate-400 text-xs">${DOMPurify.sanitize(staff.personalEmail || 'N/A')}</span></p></div>
                <div><p class="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Official Email</p><p class="text-sm font-mono font-black text-blue-600">${DOMPurify.sanitize(staff.officialEmail || staff.email || 'Awaiting Allocation')}</p></div>
                <div class="col-span-1 sm:col-span-2 border-t border-slate-100 pt-3"><p class="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Residential Address</p><p class="text-sm font-black text-slate-700">${DOMPurify.sanitize(displayAddress)}</p></div>
            </div>
        </div>
    </div>`;
};

window.closeDossierModal = function () {
    const modal = document.getElementById('dossierModal');
    const content = document.getElementById('dossierContent');
    if (!modal) return;
    modal.classList.add('opacity-0');
    if (content) content.classList.add('scale-95');
    setTimeout(() => { modal.classList.add('hidden'); }, 300);
};

window.renderApprovalsQueue = async function () {
    const tbody = document.getElementById('approvalsBody');
    if (!tbody) return;
    tbody.innerHTML = '<tr><td colspan="4" class="py-12 text-center text-slate-400 font-bold text-xs"><i class="fa-solid fa-circle-notch fa-spin text-3xl mb-3 block"></i> Fetching from Vault...</td></tr>';

    await window.syncPostgresToLocal();
    const staffList = JSON.parse(sessionStorage.getItem('cloud_staff_registry')) || [];
    const pendingStaff = staffList.filter(s => s.status === 'PENDING_APPROVAL' && (s.staffType === 'Academic' || s.staffType === 'NYSC' || s.staffType === 'TP'));

    if (pendingStaff.length === 0) {
        tbody.innerHTML = `<tr><td colspan="4" class="py-12 text-center text-slate-400 font-bold text-xs"><i class="fa-solid fa-check-double text-3xl mb-3 opacity-30 block"></i> Academic queue is empty.</td></tr>`;
        return;
    }

    const isHistorical = SessionManager.isHistoricalArchiveMode();
    let htmlBuffer = "";

    pendingStaff.slice(0, 100).forEach(staff => {
        const actionHtml = isHistorical
            ? `<span class="bg-slate-100 text-slate-400 border border-slate-200 px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-wider shadow-inner"><i class="fa-solid fa-lock"></i> Sealed</span>`
            : `
                <button onclick="window.approveAcademicStaff('${DOMPurify.sanitize(staff.trackingRef)}')" class="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg text-[9px] font-black uppercase tracking-wider transition-colors shadow-sm"><i class="fa-solid fa-check mr-1"></i> Approve</button>
                <button onclick="window.rejectStaffRequest('${DOMPurify.sanitize(staff.trackingRef)}')" class="bg-red-50 hover:bg-red-100 text-red-600 px-3 py-2 rounded-lg text-[9px] font-black uppercase tracking-wider transition-colors shadow-sm ml-2"><i class="fa-solid fa-xmark"></i></button>
            `;

        htmlBuffer += `
            <tr class="hover:bg-slate-50 transition-colors border-b border-slate-100">
                <td class="py-3 px-3 flex items-center gap-3">
                    <img src="${window.resolveMediaUrl(DOMPurify.sanitize(staff.photoUrl))}" class="w-8 h-8 rounded-lg object-cover bg-slate-100 border border-slate-200 shrink-0">
                    <div>
                        <div class="font-black text-slate-800 text-xs uppercase cursor-pointer hover:text-blue-600" onclick="window.openDossierModal('STAFF', '${DOMPurify.sanitize(staff.trackingRef)}')">${DOMPurify.sanitize(staff.name)}</div>
                        <div class="text-[9px] font-mono text-slate-500"><i class="fa-solid fa-lock text-amber-500 mr-1"></i> ${DOMPurify.sanitize(staff.trackingRef)}</div>
                    </div>
                </td>
                <td class="py-3 px-3">
                    <div class="text-[10px] font-black text-blue-600">${DOMPurify.sanitize(staff.staffType)}</div>
                    <div class="text-[9px] font-medium text-slate-500">${DOMPurify.sanitize(staff.qual || 'N/A')}</div>
                </td>
                <td class="py-3 px-3 text-right">
                    ${actionHtml}
                </td>
            </tr>`;
    });

    tbody.innerHTML = htmlBuffer;
};

window.approveAcademicStaff = async function (trackingRef) {
    if (SessionManager.isHistoricalArchiveMode()) {
        return Swal.fire('Archive Lockout', 'Approving academic staff is prohibited in historical view.', 'error');
    }

    const authRes = await Swal.fire({
        title: 'Zero-Trust Authorization',
        html: `Approve this academic staff member?<br>This will permanently generate their official credentials.<br><br>Enter Admin Password to execute:`,
        input: 'password',
        inputAttributes: { autocapitalize: 'off', autocorrect: 'off' },
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#10b981',
        confirmButtonText: 'Authorize Approval'
    });

    if (!authRes.isConfirmed || !authRes.value) return;

    try {
        const data = await ApiGateway.post('/dd/academics/staff/approve', {
            targetStaffId: trackingRef,
            adminPassword: authRes.value
        });

        Swal.fire('Approved!', `Generated ID: ${data.staffId}\nOfficial Email: ${data.officialEmail}`, 'success');
        window.renderApprovalsQueue();
        window.syncPostgresToLocal();
    } catch (error) {
        Swal.fire('Approval Failed', error.message || "Failed to approve.", 'error');
    }
};

window.rejectStaffRequest = async function (trackingRef) {
    if (SessionManager.isHistoricalArchiveMode()) {
        return Swal.fire('Archive Lockout', 'Rejecting academic staff is prohibited in historical view.', 'error');
    }

    const authRes = await Swal.fire({
        title: 'Zero-Trust Authorization',
        html: `Reject this onboarding request?<br>The profile will be permanently locked.<br><br>Enter Admin Password to execute:`,
        input: 'password',
        inputAttributes: { autocapitalize: 'off', autocorrect: 'off' },
        icon: 'error',
        showCancelButton: true,
        confirmButtonColor: '#ef4444',
        confirmButtonText: 'Authorize Rejection'
    });

    if (!authRes.isConfirmed || !authRes.value) return;

    try {
        await ApiGateway.post('/dd/academics/staff/reject', {
            targetStaffId: trackingRef,
            adminPassword: authRes.value
        });

        Swal.fire('Rejected', "Request has been sent back to the ICT Registry.", 'success');
        window.renderApprovalsQueue();
    } catch (error) {
        Swal.fire('Rejection Failed', error.message || "Failed to reject request.", 'error');
    }
};

// ================= TAB 3: SUBJECT & CLASS ALLOCATIONS =================
//  ENTERPRISE BULK MAPPER MATRIX (WITH LIVE AUDIT FIX)
window.guiMapSubjectToClasses = async function () {
    const uniqueSets = window.alphaSort([...new Set(DB_CLASSES.map(c => c.level))]);
    const uniqueArms = window.alphaSort([...new Set(DB_CLASSES.map(c => c.arm))]);
    const sortedCurriculum = DB_CURRICULUM.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));

    if (uniqueSets.length === 0 || sortedCurriculum.length === 0) return Swal.fire('Data Missing', 'Ensure classes and subjects exist first.', 'info');

    let levelCheckboxes = '';
    uniqueSets.forEach(s => levelCheckboxes += `<label class="flex items-center gap-3 py-1.5 cursor-pointer hover:bg-slate-100 px-2 rounded transition-colors"><input type="checkbox" class="swal-map-lvl w-4 h-4 text-gussGreen rounded border-slate-300" value="${DOMPurify.sanitize(s)}"> <span class="font-bold text-sm text-slate-700">${DOMPurify.sanitize(s)}</span></label>`);

    let subCheckboxes = '';
    sortedCurriculum.forEach(sub => {
        subCheckboxes += `<label class="flex items-center gap-3 py-1.5 border-b border-slate-100 last:border-0 cursor-pointer hover:bg-slate-100 px-2 rounded transition-colors"><input type="checkbox" class="swal-map-sub w-4 h-4 text-blue-600 rounded border-slate-300 shrink-0" value="${DOMPurify.sanitize(sub.id)}"> <span class="text-xs font-bold text-slate-700 leading-tight">${DOMPurify.sanitize(sub.name)} <br><span class="text-[9px] text-slate-400 font-black uppercase tracking-widest border border-slate-200 px-1 py-0.5 rounded inline-block mt-1">${DOMPurify.sanitize(sub.category)}</span></span></label>`;
    });

    let armCheckboxes = `<label class="flex items-center gap-3 font-black text-gussGold mb-3 pb-3 border-b border-slate-200 cursor-pointer hover:bg-yellow-50 px-2 rounded transition-colors"><input type="checkbox" class="w-4 h-4 text-gussGold rounded border-slate-300" onchange="document.querySelectorAll('.swal-map-arm').forEach(cb => cb.checked = this.checked)"> SELECT ALL ARMS (GENERALS)</label>`;
    uniqueArms.forEach(a => armCheckboxes += `<label class="flex items-center gap-3 py-1.5 cursor-pointer hover:bg-slate-100 px-2 rounded transition-colors"><input type="checkbox" class="swal-map-arm w-4 h-4 text-purple-600 rounded border-slate-300" value="${DOMPurify.sanitize(a)}"> <span class="font-bold text-sm text-slate-700">Arm ${DOMPurify.sanitize(a)}</span></label>`);

    let auditSetHtml = '<option value="">Select Level...</option>';
    uniqueSets.forEach(s => auditSetHtml += `<option value="${DOMPurify.sanitize(s)}">${DOMPurify.sanitize(s)}</option>`);

    const wizardRes = await Swal.fire({
        title: '<i class="fa-solid fa-network-wired text-gussGold mr-2"></i> Mass Curriculum Matrix',
        width: '1200px',
        html: `
            <div class="grid grid-cols-1 lg:grid-cols-4 gap-4 text-left p-2">
                <div class="bg-slate-50 border border-slate-200 rounded-xl flex flex-col h-[60vh] shadow-inner">
                    <div class="p-3 bg-slate-100 border-b border-slate-200 rounded-t-xl shrink-0 flex justify-between items-center">
                        <p class="text-[10px] font-black uppercase text-slate-600 tracking-widest"><i class="fa-solid fa-layer-group text-gussGreen mr-1"></i> 1. Target Levels</p>
                        <label class="text-[9px] font-black text-gussGreen flex items-center gap-1 cursor-pointer"><input type="checkbox" onchange="document.querySelectorAll('.swal-map-lvl').forEach(cb => cb.checked = this.checked)"> ALL</label>
                    </div>
                    <div class="p-3 flex-1 overflow-y-auto no-scrollbar flex flex-col gap-1">
                        ${levelCheckboxes}
                    </div>
                </div>

                <div class="bg-slate-50 border border-slate-200 rounded-xl flex flex-col h-[60vh] shadow-inner">
                    <div class="p-3 bg-slate-100 border-b border-slate-200 rounded-t-xl shrink-0 flex justify-between items-center">
                        <p class="text-[10px] font-black uppercase text-slate-600 tracking-widest"><i class="fa-solid fa-book text-blue-600 mr-1"></i> 2. Target Subjects</p>
                        <label class="text-[9px] font-black text-blue-600 flex items-center gap-1 cursor-pointer"><input type="checkbox" onchange="document.querySelectorAll('.swal-map-sub').forEach(cb => cb.checked = this.checked)"> ALL</label>
                    </div>
                    <div class="p-3 flex-1 overflow-y-auto no-scrollbar flex flex-col gap-1">
                        ${subCheckboxes}
                    </div>
                </div>

                <div class="bg-slate-50 border border-slate-200 rounded-xl flex flex-col h-[60vh] shadow-inner">
                    <div class="p-3 bg-slate-100 border-b border-slate-200 rounded-t-xl shrink-0">
                        <p class="text-[10px] font-black uppercase text-slate-600 tracking-widest"><i class="fa-solid fa-code-branch text-purple-600 mr-1"></i> 3. Target Arms</p>
                    </div>
                    <div class="p-3 flex-1 overflow-y-auto no-scrollbar flex flex-col gap-1">
                        ${armCheckboxes}
                    </div>
                </div>

                <div class="bg-indigo-50 border border-indigo-200 rounded-xl flex flex-col h-[60vh] shadow-sm">
                    <div class="p-3 bg-indigo-100 border-b border-indigo-200 rounded-t-xl shrink-0">
                        <p class="text-[10px] font-black uppercase text-indigo-800 tracking-widest"><i class="fa-solid fa-microscope text-indigo-500 mr-1"></i> Live Class Audit</p>
                    </div>
                    <div class="p-4 shrink-0 border-b border-indigo-100 flex flex-col gap-3 bg-white">
                        <select id="auditLevel" class="w-full text-xs p-2.5 border border-indigo-200 rounded-lg bg-indigo-50/50 font-bold focus:ring-2 focus:ring-indigo-400 outline-none" onchange="window.populateArms('auditArm', this.value); window.triggerLiveAudit();">${auditSetHtml}</select>
                        <select id="auditArm" class="w-full text-xs p-2.5 border border-indigo-200 rounded-lg bg-indigo-50/50 font-bold focus:ring-2 focus:ring-indigo-400 outline-none" onchange="window.triggerLiveAudit()" disabled>
                            <option value="">Select Level First...</option>
                        </select>
                    </div>
                    <div id="auditResults" class="p-4 flex-1 overflow-y-auto no-scrollbar text-center flex flex-col items-center justify-center bg-indigo-50/30">
                        <i class="fa-solid fa-clipboard-check text-4xl text-indigo-200 mb-3"></i>
                        <p class="text-[10px] font-bold text-indigo-400 uppercase tracking-widest">Select a class above to instantly verify mapped curriculum</p>
                    </div>
                </div>
            </div>
        `,
        showCancelButton: true, confirmButtonColor: '#005A36', confirmButtonText: '<i class="fa-solid fa-bolt mr-2"></i> Execute Batch Mapping',
        preConfirm: () => {
            const levels = Array.from(document.querySelectorAll('.swal-map-lvl:checked')).map(cb => cb.value);
            const subjects = Array.from(document.querySelectorAll('.swal-map-sub:checked')).map(cb => cb.value);
            const arms = Array.from(document.querySelectorAll('.swal-map-arm:checked')).map(cb => cb.value);

            if (levels.length === 0 || subjects.length === 0 || arms.length === 0) {
                Swal.showValidationMessage('You must select at least one Target Level, Subject, and Arm to execute the matrix.');
            }
            return { levels, subjects, arms };
        }
    });

    if (!wizardRes.isConfirmed) return;

    const authRes = await Swal.fire({
        title: 'Zero-Trust Authorization',
        html: `Executing explicit relational batch mapping.<br>Enter Admin Password to cross-map selections:`,
        input: 'password', inputAttributes: { autocapitalize: 'off', autocorrect: 'off' },
        icon: 'warning', showCancelButton: true, confirmButtonColor: '#005A36', confirmButtonText: 'Authorize Matrix'
    });

    if (!authRes.isConfirmed || !authRes.value) return;

    try {
        //  STRICT DTO ALIGNMENT: BulkMappingRequest
        await ApiGateway.post('/dd/academics/curriculum/mapping/assign-bulk', {
            targetLevels: wizardRes.value.levels,
            subjectIds: wizardRes.value.subjects,
            targetArms: wizardRes.value.arms,
            adminPassword: authRes.value
        });

        Swal.fire('Matrix Deployed', 'Subjects strictly mapped across specified infrastructure.', 'success');
        if (typeof window.renderActiveAllocations === 'function') window.renderActiveAllocations();
    } catch (error) {
        Swal.fire('Database Error', error.message || 'Matrix execution failed.', 'error');
    }
}

window.guiUnmapSubject = async function () {
    const uniqueSets = window.alphaSort([...new Set(DB_CLASSES.map(c => c.level))]);
    const uniqueArms = window.alphaSort([...new Set(DB_CLASSES.map(c => c.arm))]);
    const sortedCurriculum = DB_CURRICULUM.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));

    if (uniqueSets.length === 0 || sortedCurriculum.length === 0) {
        return Swal.fire('Data Missing', 'Ensure classes and subjects exist in the database first.', 'info');
    }

    // Column 1: Target Levels
    let levelCheckboxes = '';
    uniqueSets.forEach(s => {
        levelCheckboxes += `<label class="flex items-center gap-3 py-1.5 cursor-pointer hover:bg-rose-50 px-2 rounded transition-colors"><input type="checkbox" class="swal-unmap-lvl w-4 h-4 text-red-600 rounded border-slate-300" value="${DOMPurify.sanitize(s)}"> <span class="font-bold text-sm text-slate-700">${DOMPurify.sanitize(s)}</span></label>`;
    });

    // Column 2: Target Subjects
    let subCheckboxes = '';
    sortedCurriculum.forEach(sub => {
        subCheckboxes += `<label class="flex items-center gap-3 py-1.5 border-b border-slate-100 last:border-0 cursor-pointer hover:bg-rose-50 px-2 rounded transition-colors"><input type="checkbox" class="swal-unmap-sub w-4 h-4 text-red-600 rounded border-slate-300 shrink-0" value="${DOMPurify.sanitize(sub.id)}"> <span class="text-xs font-bold text-slate-700 leading-tight">${DOMPurify.sanitize(sub.name)} <br><span class="text-[9px] text-slate-400 font-black uppercase tracking-widest border border-slate-200 px-1 py-0.5 rounded inline-block mt-1">${DOMPurify.sanitize(sub.category)}</span></span></label>`;
    });

    // Column 3: Target Arms
    let armCheckboxes = `<label class="flex items-center gap-3 font-black text-rose-700 mb-3 pb-3 border-b border-slate-200 cursor-pointer hover:bg-rose-50 px-2 rounded transition-colors"><input type="checkbox" class="w-4 h-4 text-red-600 rounded border-slate-300" onchange="document.querySelectorAll('.swal-unmap-arm').forEach(cb => cb.checked = this.checked)"> SELECT ALL ARMS (GENERALS)</label>`;
    uniqueArms.forEach(a => {
        armCheckboxes += `<label class="flex items-center gap-3 py-1.5 cursor-pointer hover:bg-rose-50 px-2 rounded transition-colors"><input type="checkbox" class="swal-unmap-arm w-4 h-4 text-red-600 rounded border-slate-300" value="${DOMPurify.sanitize(a)}"> <span class="font-bold text-sm text-slate-700">Arm ${DOMPurify.sanitize(a)}</span></label>`;
    });

    const wizardRes = await Swal.fire({
        title: '<i class="fa-solid fa-link-slash text-red-600 mr-2"></i> Bulk Curriculum Decommissioning Matrix',
        width: '950px',
        html: `
            <p class="text-xs text-slate-500 mb-4 text-left">Select the Target Levels, Subjects, and Arms you wish to <b>sever</b>. All existing relational mappings matching this Cartesian intersection will be purged.</p>
            <div class="grid grid-cols-1 md:grid-cols-3 gap-4 text-left p-1">
                <!-- COL 1: LEVELS -->
                <div class="bg-slate-50 border border-slate-200 rounded-xl flex flex-col h-[55vh] shadow-inner">
                    <div class="p-3 bg-rose-50 border-b border-rose-100 rounded-t-xl shrink-0 flex justify-between items-center">
                        <p class="text-[10px] font-black uppercase text-rose-900 tracking-widest"><i class="fa-solid fa-layer-group text-red-500 mr-1"></i> 1. Target Levels</p>
                        <label class="text-[9px] font-black text-red-600 flex items-center gap-1 cursor-pointer"><input type="checkbox" onchange="document.querySelectorAll('.swal-unmap-lvl').forEach(cb => cb.checked = this.checked)"> ALL</label>
                    </div>
                    <div class="p-3 flex-1 overflow-y-auto no-scrollbar flex flex-col gap-1">
                        ${levelCheckboxes}
                    </div>
                </div>

                <!-- COL 2: SUBJECTS -->
                <div class="bg-slate-50 border border-slate-200 rounded-xl flex flex-col h-[55vh] shadow-inner">
                    <div class="p-3 bg-rose-50 border-b border-rose-100 rounded-t-xl shrink-0 flex justify-between items-center">
                        <p class="text-[10px] font-black uppercase text-rose-900 tracking-widest"><i class="fa-solid fa-book text-red-500 mr-1"></i> 2. Target Subjects</p>
                        <label class="text-[9px] font-black text-red-600 flex items-center gap-1 cursor-pointer"><input type="checkbox" onchange="document.querySelectorAll('.swal-unmap-sub').forEach(cb => cb.checked = this.checked)"> ALL</label>
                    </div>
                    <div class="p-3 flex-1 overflow-y-auto no-scrollbar flex flex-col gap-1">
                        ${subCheckboxes}
                    </div>
                </div>

                <!-- COL 3: ARMS -->
                <div class="bg-slate-50 border border-slate-200 rounded-xl flex flex-col h-[55vh] shadow-inner">
                    <div class="p-3 bg-rose-50 border-b border-rose-100 rounded-t-xl shrink-0">
                        <p class="text-[10px] font-black uppercase text-rose-900 tracking-widest"><i class="fa-solid fa-code-branch text-red-500 mr-1"></i> 3. Target Arms</p>
                    </div>
                    <div class="p-3 flex-1 overflow-y-auto no-scrollbar flex flex-col gap-1">
                        ${armCheckboxes}
                    </div>
                </div>
            </div>
        `,
        showCancelButton: true,
        confirmButtonColor: '#ef4444',
        confirmButtonText: '<i class="fa-solid fa-scissors mr-2"></i> Proceed to Authorize',
        preConfirm: () => {
            const levels = Array.from(document.querySelectorAll('.swal-unmap-lvl:checked')).map(cb => cb.value);
            const subjects = Array.from(document.querySelectorAll('.swal-unmap-sub:checked')).map(cb => cb.value);
            const arms = Array.from(document.querySelectorAll('.swal-unmap-arm:checked')).map(cb => cb.value);

            if (levels.length === 0 || subjects.length === 0 || arms.length === 0) {
                Swal.showValidationMessage('Select at least one Level, Subject, and Arm to define the severance matrix.');
            }
            return { levels, subjects, arms };
        }
    });

    if (!wizardRes.isConfirmed) return;

    // Zero-Trust Authorization Guard
    const authRes = await Swal.fire({
        title: 'Zero-Trust Authorization',
        html: `You are about to <b>permanently unmap</b> selected subjects across specified class arms.<br><br>Enter Admin Password to execute severance:`,
        input: 'password',
        inputAttributes: { autocapitalize: 'off', autocorrect: 'off' },
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#ef4444',
        confirmButtonText: 'Authorize Decommissioning'
    });

    if (!authRes.isConfirmed || !authRes.value) return;

    try {
        const result = await ApiGateway.post('/dd/academics/curriculum/mapping/remove-bulk', {
            targetLevels: wizardRes.value.levels,
            subjectIds: wizardRes.value.subjects,
            targetArms: wizardRes.value.arms,
            adminPassword: authRes.value
        });

        Swal.fire('Matrix Severed', result.message || 'Selected mappings successfully removed.', 'success');
        if (typeof window.renderActiveAllocations === 'function') window.renderActiveAllocations();
    } catch (error) {
        Swal.fire('Database Error', error.message || 'Failed to execute bulk severance.', 'error');
    }
};

//  LIVE CLASS AUDIT HELPER
window.triggerLiveAudit = async function () {
    const level = document.getElementById('auditLevel').value;
    const arm = document.getElementById('auditArm').value;
    const resDiv = document.getElementById('auditResults');

    if (!level || !arm) {
        resDiv.innerHTML = `<i class="fa-solid fa-clipboard-check text-4xl text-indigo-200 mb-3"></i><p class="text-[10px] font-bold text-indigo-400 uppercase tracking-widest">Select a class above to instantly verify mapped curriculum</p>`;
        resDiv.className = "p-4 flex-1 overflow-y-auto no-scrollbar text-center flex flex-col items-center justify-center bg-indigo-50/30";
        return;
    }

    resDiv.innerHTML = `<i class="fa-solid fa-circle-notch fa-spin text-3xl text-indigo-400 mb-3"></i><p class="text-[10px] font-black text-indigo-500 uppercase tracking-widest">Querying Relational Vault...</p>`;
    resDiv.className = "p-4 flex-1 overflow-y-auto no-scrollbar text-center flex flex-col items-center justify-center bg-indigo-50/30";

    try {
        //  STRICT API GATEWAY INTEGRATION
        const subjects = await ApiGateway.get(`/dd/academics/curriculum/mapping/class/${encodeURIComponent(level)}/${encodeURIComponent(arm)}`);

        if (subjects.length === 0) {
            resDiv.innerHTML = `<div class="w-full h-full flex flex-col items-center justify-center"><i class="fa-solid fa-folder-open text-4xl text-red-200 mb-3"></i><p class="text-[10px] font-black text-red-500 uppercase tracking-widest">0 Subjects Mapped</p><p class="text-[9px] text-red-400 mt-1 font-bold">This class has an empty curriculum.</p></div>`;
            return;
        }

        let subList = '';
        subjects.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' })).forEach(s => {
            subList += `<div class="text-left bg-white p-2.5 rounded-lg border border-indigo-100 mb-1.5 shadow-sm hover:border-indigo-300 transition-colors"><p class="text-xs font-black text-indigo-900 truncate leading-tight mb-0.5">${DOMPurify.sanitize(s.name)}</p><p class="text-[8px] text-slate-400 uppercase font-black tracking-widest truncate bg-slate-100 inline-block px-1.5 py-0.5 rounded">${DOMPurify.sanitize(s.category)}</p></div>`;
        });

        resDiv.innerHTML = `
            <div class="w-full flex justify-between items-center mb-3 pb-3 border-b border-indigo-200 sticky top-0 bg-indigo-50/90 backdrop-blur-sm z-10 pt-1">
                <span class="text-[10px] font-black text-indigo-900 uppercase tracking-widest">Mapped Subjects</span>
                <span class="bg-indigo-600 text-white text-[10px] font-black px-2.5 py-1 rounded-full shadow-sm">${subjects.length}</span>
            </div>
            <div class="w-full flex flex-col pb-4">
                ${subList}
            </div>
        `;
        resDiv.className = "p-4 flex-1 overflow-y-auto no-scrollbar flex flex-col justify-start bg-indigo-50/30";
    } catch (e) {
        resDiv.innerHTML = `<p class="text-xs font-bold text-red-500">Connection Error.</p>`;
    }
}


window.renderActiveAllocations = async function () {
    const setVal = document.getElementById('allocSetSelect').value;
    const armVal = document.getElementById('allocArmSelect').value;
    const targetClass = (setVal && armVal) ? `${setVal} ${armVal}` : "";

    if (document.getElementById('fmTargetClass')) {
        document.getElementById('fmTargetClass').value = targetClass || "No class selected";
    }

    const tbody = document.getElementById('activeAllocationsBody');
    const subjectSelect = document.getElementById('allocSubjectSelect');

    tbody.innerHTML = '';
    let subHtml = '<option value="">Select Subject...</option>';

    if (!targetClass) {
        tbody.innerHTML = `<tr><td colspan="3" class="py-8 text-center text-slate-400 font-bold text-xs">Select a complete class (Set & Arm) above to view matrix.</td></tr>`;
        subjectSelect.innerHTML = subHtml;
        return;
    }

    try {
        const mappedSubjects = await ApiGateway.get(`/dd/academics/curriculum/mapping/class/${encodeURIComponent(setVal)}/${encodeURIComponent(armVal)}`);

        if (!mappedSubjects || mappedSubjects.length === 0) {
            subHtml = '<option value="">No subjects mapped to this class yet...</option>';
        } else {
            mappedSubjects.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' })).forEach(sub => {
                subHtml += `<option value="${DOMPurify.sanitize(sub.id)}">${DOMPurify.sanitize(sub.name)}</option>`;
            });
        }
        subjectSelect.innerHTML = subHtml;

        const activeContext = SessionManager.getCurrentContextString();
        const classAllocations = await ApiGateway.get(`/dd/academics/allocations/class/${encodeURIComponent(setVal)}/${encodeURIComponent(armVal)}?session=${encodeURIComponent(activeContext)}`);
        const isHistorical = SessionManager.isHistoricalArchiveMode();

        if (!classAllocations || classAllocations.length === 0) {
            tbody.innerHTML = `<tr><td colspan="3" class="py-8 text-center text-slate-400 font-bold text-xs"><i class="fa-solid fa-chalkboard text-3xl mb-3 opacity-30 block"></i> No teachers assigned to this class yet.</td></tr>`;
            return;
        }

        let allocHtml = '';
        classAllocations.forEach((alloc) => {
            const deleteBtnHtml = isHistorical
                ? '<span class="text-slate-300 text-[10px] pr-2" title="Historical Record (Locked)"><i class="fa-solid fa-lock"></i></span>'
                : `<button onclick="window.removeTeacherAllocation('${DOMPurify.sanitize(alloc.id)}')" class="text-red-500 hover:bg-red-50 px-2 py-1 rounded text-[10px] font-black uppercase transition-colors"><i class="fa-solid fa-trash"></i></button>`;

            allocHtml += `
                <tr class="hover:bg-slate-50 transition-colors border-b border-slate-100">
                    <td class="py-3 px-3 font-black text-slate-800 uppercase text-xs">${DOMPurify.sanitize(alloc.subject)}</td>
                    <td class="py-3 px-3">
                        <div class="font-bold text-slate-700 text-xs cursor-pointer hover:text-blue-600" onclick="window.openDossierModal('STAFF', '${DOMPurify.sanitize(alloc.staffId)}')">${DOMPurify.sanitize(alloc.teacherName)}</div>
                        <div class="text-[9px] font-mono text-slate-500">${DOMPurify.sanitize(alloc.staffId)}</div>
                    </td>
                    <td class="py-3 px-3 text-right">
                        ${deleteBtnHtml}
                    </td>
                </tr>`;
        });
        tbody.innerHTML = allocHtml;
    } catch (e) {
        tbody.innerHTML = `<tr><td colspan="3" class="py-8 text-center text-red-500 font-bold text-xs">Failed to fetch relational allocations.</td></tr>`;
    }
};

window.assignSubjectTeacher = async function () {
    if (SessionManager.isHistoricalArchiveMode()) {
        return Swal.fire('Archive Lockout', 'Assigning subject teachers is strictly prohibited in historical view.', 'error');
    }

    const setVal = document.getElementById('allocSetSelect').value;
    const armVal = document.getElementById('allocArmSelect').value;
    const subjectId = document.getElementById('allocSubjectSelect').value;
    const staffSelectEl = document.getElementById('allocStaffSelect');
    const staffId = staffSelectEl.value;

    if (!setVal || !armVal || !subjectId || !staffId) return Swal.fire('Validation Error', "Please select a Class, Subject, and Staff Member.", 'error');

    const selectedOption = staffSelectEl.options[staffSelectEl.selectedIndex];
    const isExec = selectedOption.getAttribute('data-is-exec') === 'true';
    const isOnLeave = selectedOption.getAttribute('data-is-on-leave') === 'true';

    if (isOnLeave) {
        const confirmLeave = await Swal.fire({
            title: 'Staff is ON LEAVE',
            text: `This staff member is currently on official leave. Teaching duties require physical presence. Are you sure you want to assign them?`,
            icon: 'warning',
            showCancelButton: true,
            confirmButtonColor: '#f97316',
            confirmButtonText: 'Yes, Assign Anyway'
        });
        if (!confirmLeave.isConfirmed) return;
    }

    if (isExec) {
        const confirmExec = await Swal.fire({
            title: 'Executive Assignment',
            text: `You are about to assign an Executive/Statutory Officer to a standard classroom duty. Proceed?`,
            icon: 'warning',
            showCancelButton: true,
            confirmButtonColor: '#d97706',
            confirmButtonText: 'Yes, Proceed'
        });
        if (!confirmExec.isConfirmed) return;
    }

    const authRes = await Swal.fire({
        title: 'Zero-Trust Authorization',
        html: `Assigning teacher to <b>${setVal} ${armVal}</b>.<br>Enter Admin Password to execute:`,
        input: 'password',
        inputAttributes: { autocapitalize: 'off', autocorrect: 'off' },
        icon: 'info',
        showCancelButton: true,
        confirmButtonColor: '#005A36',
        confirmButtonText: 'Authorize'
    });

    if (!authRes.isConfirmed || !authRes.value) return;

    try {
        await ApiGateway.post('/dd/academics/allocations/assign', {
            targetLevel: setVal,
            targetArm: armVal,
            subjectId: subjectId,
            targetStaffId: staffId,
            adminPassword: authRes.value
        });

        Swal.fire('Allocated', `Teacher officially assigned to ${setVal} ${armVal}.`, 'success');
        window.renderActiveAllocations();
    } catch (error) {
        Swal.fire('Error', error.message || "Conflict Detected.", 'error');
    }
};

window.removeTeacherAllocation = async function (allocationId) {
    if (SessionManager.isHistoricalArchiveMode()) {
        return Swal.fire('Archive Lockout', 'Revoking subject allocations is prohibited in historical view.', 'error');
    }

    const res = await Swal.fire({
        title: 'Revoke Assignment?',
        text: 'Are you sure you want to revoke this subject assignment?',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#ef4444',
        confirmButtonText: 'Yes, Revoke'
    });

    if (!res.isConfirmed) return;

    const authRes = await Swal.fire({
        title: 'Zero-Trust Revocation',
        html: `Revoking Subject Teacher Assignment.<br><br>Enter Admin Password to execute:`,
        input: 'password',
        inputAttributes: { autocapitalize: 'off', autocorrect: 'off' },
        icon: 'error',
        showCancelButton: true,
        confirmButtonColor: '#ef4444',
        confirmButtonText: 'Authorize Revocation'
    });

    if (!authRes.isConfirmed || !authRes.value) return;

    try {
        await ApiGateway.post('/dd/academics/allocations/revoke', {
            allocationId: allocationId,
            adminPassword: authRes.value
        });

        window.renderActiveAllocations();
        Swal.fire('Revoked', 'Subject allocation removed successfully.', 'success');
    } catch (error) {
        Swal.fire('Error', error.message || 'Failed to remove allocation.', 'error');
    }
};

window.openFormMasterModal = function () {
    const setVal = document.getElementById('allocSetSelect').value;
    const armVal = document.getElementById('allocArmSelect').value;
    const targetClass = (setVal && armVal) ? `${setVal} ${armVal}` : "";

    if (!targetClass) return Swal.fire('Select Class', "Select a complete Set and Arm in the Subject Matrix first.", 'info');

    document.getElementById('fmTargetClass').value = targetClass;
    document.getElementById('fmModal').classList.remove('hidden');
};

window.saveFormMaster = async function () {
    if (SessionManager.isHistoricalArchiveMode()) {
        return Swal.fire('Archive Lockout', 'Appointing Form Masters is prohibited in historical view.', 'error');
    }

    const setVal = document.getElementById('allocSetSelect').value;
    const armVal = document.getElementById('allocArmSelect').value;
    const staffSelectEl = document.getElementById('fmStaffSelect');
    const staffId = staffSelectEl.value;

    if (!staffId) return Swal.fire('Validation Error', "Select a staff member.", 'error');

    const selectedOption = staffSelectEl.options[staffSelectEl.selectedIndex];
    const isExec = selectedOption.getAttribute('data-is-exec') === 'true';
    const isOnLeave = selectedOption.getAttribute('data-is-on-leave') === 'true';

    if (isOnLeave) {
        const confirmLeave = await Swal.fire({
            title: 'Staff is ON LEAVE',
            text: `This staff member is currently on leave. Form Master duties require physical presence. Proceed?`,
            icon: 'warning',
            showCancelButton: true,
            confirmButtonColor: '#f97316',
            confirmButtonText: 'Yes, Appoint Anyway'
        });
        if (!confirmLeave.isConfirmed) return;
    }

    if (isExec) {
        const confirmExec = await Swal.fire({
            title: 'Executive Assignment',
            text: `You are appointing an Executive Officer as Form Master. Proceed?`,
            icon: 'warning',
            showCancelButton: true,
            confirmButtonColor: '#ea580c',
            confirmButtonText: 'Yes, Proceed'
        });
        if (!confirmExec.isConfirmed) return;
    }

    const authRes = await Swal.fire({
        title: 'Zero-Trust Authorization',
        html: `Appointing Form Master for <b>${setVal} ${armVal}</b>.<br>Enter Admin Password to execute:`,
        input: 'password',
        inputAttributes: { autocapitalize: 'off', autocorrect: 'off' },
        icon: 'info',
        showCancelButton: true,
        confirmButtonColor: '#ea580c',
        confirmButtonText: 'Authorize'
    });

    if (!authRes.isConfirmed || !authRes.value) return;

    try {
        await ApiGateway.post('/dd/academics/form-masters/assign', {
            targetLevel: setVal,
            targetArm: armVal,
            targetStaffId: staffId,
            adminPassword: authRes.value
        });

        Swal.fire('Appointed', `Form Master officially appointed for ${setVal} ${armVal}.`, 'success');
        document.getElementById('fmModal').classList.add('hidden');
        window.renderFormMasters();
    } catch (error) {
        Swal.fire('Error', error.message || "Cloud Vault rejected Form Master appointment.", 'error');
    }
};

window.renderFormMasters = async function () {
    const grid = document.getElementById('formMastersGrid');
    if (!grid) return;
    grid.innerHTML = '<div class="col-span-full p-4 text-center text-slate-400 font-bold"><i class="fa-solid fa-spinner fa-spin mr-2"></i> Loading Form Masters...</div>';

    try {
        const activeContext = SessionManager.getCurrentContextString();
        const formMasters = await ApiGateway.get(`/dd/academics/form-masters/all?session=${encodeURIComponent(activeContext)}`);
        const isHistorical = SessionManager.isHistoricalArchiveMode();

        if (!formMasters || formMasters.length === 0) {
            grid.innerHTML = `<div class="col-span-full p-4 text-center text-orange-400 text-xs font-bold border border-orange-200 border-dashed rounded-xl bg-white">No Form Masters officially appointed.</div>`;
            return;
        }

        let htmlBuffer = '';
        formMasters.forEach(fm => {
            const classParts = fm.targetClass.split(" ");
            const level = classParts[0] + " " + classParts[1];
            const arm = classParts.slice(2).join(" ");

            const safeStaffId = encodeURIComponent(fm.staffId || '').replace(/'/g, "%27");
            const safeName = encodeURIComponent(fm.teacherName || '').replace(/'/g, "%27");
            const safeRole = encodeURIComponent('Form Master').replace(/'/g, "%27");
            const safeScope = encodeURIComponent(fm.targetClass || '').replace(/'/g, "%27");

            const revokeBtn = isHistorical
                ? '<span class="text-slate-300 text-[10px]" title="Historical Record (Locked)"><i class="fa-solid fa-lock"></i></span>'
                : `<button onclick="window.removeFormMaster('${encodeURIComponent(level)}', '${encodeURIComponent(arm)}')" title="Revoke Appointment" class="text-red-400 hover:text-red-600 text-[11px] transition-colors"><i class="fa-solid fa-trash"></i></button>`;

            htmlBuffer += `
            <div class="bg-white border border-orange-200 rounded-xl p-4 hover:shadow-md transition-shadow">
                <h4 class="font-black text-orange-900 uppercase text-xs mb-3 flex items-center justify-between">${DOMPurify.sanitize(fm.targetClass)} <i class="fa-solid fa-users-rectangle text-orange-200"></i></h4>
                <div class="bg-orange-50 p-2 rounded-lg border border-orange-100 flex justify-between items-center">
                    <div class="font-bold text-slate-700 text-[10px] uppercase truncate cursor-pointer hover:text-blue-600" onclick="window.openDossierModal('STAFF', '${DOMPurify.sanitize(fm.staffId)}')">${DOMPurify.sanitize(fm.teacherName)}</div>
                    <div class="flex gap-3 items-center">
                        <button onclick="window.printAppointmentLetter('${safeStaffId}', '${safeName}', '${safeRole}', '${safeScope}')" title="Print Appointment Letter" class="text-slate-400 hover:text-gussNavy text-[11px] transition-colors"><i class="fa-solid fa-print"></i></button>
                        ${revokeBtn}
                    </div>
                </div>
            </div>`;
        });
        grid.innerHTML = htmlBuffer;
    } catch (e) {
        grid.innerHTML = `<div class="col-span-full p-4 text-center text-red-500 text-xs font-bold">Failed to load Form Masters.</div>`;
    }
};

window.removeFormMaster = async function (level, arm) {
    if (SessionManager.isHistoricalArchiveMode()) {
        return Swal.fire('Archive Lockout', 'Revoking Form Master appointments is prohibited in historical view.', 'error');
    }

    const res = await Swal.fire({
        title: 'Revoke Appointment?',
        text: 'Are you sure you want to revoke this Form Master appointment?',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#ef4444',
        confirmButtonText: 'Yes, Revoke'
    });

    if (!res.isConfirmed) return;

    const authRes = await Swal.fire({
        title: 'Zero-Trust Revocation',
        html: `Revoking Form Master Appointment.<br><br>Enter Admin Password to execute:`,
        input: 'password',
        inputAttributes: { autocapitalize: 'off', autocorrect: 'off' },
        icon: 'error',
        showCancelButton: true,
        confirmButtonColor: '#ef4444',
        confirmButtonText: 'Authorize Revocation'
    });

    if (!authRes.isConfirmed || !authRes.value) return;

    try {
        await ApiGateway.post('/dd/academics/form-masters/revoke', {
            targetLevel: decodeURIComponent(level),
            targetArm: decodeURIComponent(arm),
            adminPassword: authRes.value
        });

        window.renderFormMasters();
        Swal.fire('Revoked', 'Form Master appointment removed successfully.', 'success');
    } catch (error) {
        Swal.fire('Error', error.message || 'Failed to remove Form Master.', 'error');
    }
};

// ================= TAB 4: SUBSTITUTE TEACHERS MATRIX =================
window.renderSubstituteMatrix = async function () {
    const tbody = document.getElementById('substitutesBody');
    if (!tbody) return;
    tbody.innerHTML = '<tr><td colspan="4" class="py-12 text-center text-slate-400 font-bold text-xs"><i class="fa-solid fa-spinner fa-spin text-3xl mb-3 block"></i> Analyzing Matrix...</td></tr>';

    try {
        const activeContext = SessionManager.getCurrentContextString();
        const strandedData = await ApiGateway.get(`/dd/academics/allocations/stranded?session=${encodeURIComponent(activeContext)}`);
        const staffList = JSON.parse(sessionStorage.getItem('cloud_staff_registry')) || [];
        const isHistorical = SessionManager.isHistoricalArchiveMode();

        if (!strandedData || strandedData.length === 0) {
            tbody.innerHTML = `<tr><td colspan="4" class="py-12 text-center text-slate-400 font-bold text-xs"><i class="fa-solid fa-check-double text-3xl mb-3 opacity-30 block"></i> No stranded classes. All active staff are present.</td></tr>`;
            return;
        }

        let htmlBuffer = '';
        strandedData.forEach((alloc) => {
            const coverStaff = alloc.coverId ? staffList.find(s => s.id === alloc.coverId) : null;
            const coverNameHtml = coverStaff ? `<span class="text-emerald-600 font-black"><i class="fa-solid fa-user-shield mr-1"></i> ${DOMPurify.sanitize(coverStaff.name)}</span>` : `<span class="text-red-500 font-bold italic"><i class="fa-solid fa-triangle-exclamation mr-1"></i> Unassigned</span>`;

            let coverOptions = `<option value="">Select Temporary Cover...</option>`;
            staffList.filter(s => s.status === 'APPROVED' && s.staffType === 'Academic' && s.id !== alloc.staffId).forEach(s => {
                coverOptions += `<option value="${DOMPurify.sanitize(s.id)}">${DOMPurify.sanitize(s.name)}</option>`;
            });

            const actionCell = isHistorical
                ? `<span class="text-slate-400 text-[10px] font-bold"><i class="fa-solid fa-lock"></i> Sealed</span>`
                : `<div class="flex justify-end gap-2">
                       <select id="cover_${alloc.id}" class="bg-white border border-slate-300 rounded px-2 py-1 text-[9px] font-bold w-32 focus:outline-none focus:ring-1 focus:ring-amber-400">${coverOptions}</select>
                       <button onclick="window.assignCover('${DOMPurify.sanitize(alloc.id)}', 'cover_${DOMPurify.sanitize(alloc.id)}')" class="bg-amber-500 hover:bg-amber-600 text-white px-2 py-1 rounded text-[9px] font-black uppercase transition-colors shadow-sm">Assign</button>
                   </div>`;

            htmlBuffer += `
                <tr class="hover:bg-amber-50/50 transition-colors border-b border-amber-100">
                    <td class="py-3 px-3">
                        <div class="font-black text-gussNavy uppercase text-xs">${DOMPurify.sanitize(alloc.targetClass)}</div>
                        <div class="text-[10px] font-bold text-slate-500">${DOMPurify.sanitize(alloc.subject)}</div>
                    </td>
                    <td class="py-3 px-3">
                        <div class="font-bold text-slate-700 text-[10px] uppercase">${DOMPurify.sanitize(alloc.teacherName)}</div>
                    </td>
                    <td class="py-3 px-3 text-xs">${coverNameHtml}</td>
                    <td class="py-3 px-3 text-right">${actionCell}</td>
                </tr>`;
        });
        tbody.innerHTML = htmlBuffer;
    } catch (e) {
        tbody.innerHTML = `<tr><td colspan="4" class="py-12 text-center text-red-500 font-bold text-xs">Failed to fetch Substitute Matrix.</td></tr>`;
    }
};

window.assignCover = async function (allocationId, selectId) {
    if (SessionManager.isHistoricalArchiveMode()) {
        return Swal.fire('Archive Lockout', 'Assigning temporary covers is prohibited in historical view.', 'error');
    }

    const coverId = document.getElementById(selectId).value;
    if (!coverId) return Swal.fire('Validation Error', "Select a substitute staff member.", 'error');

    const authRes = await Swal.fire({
        title: 'Zero-Trust Authorization',
        html: `Assigning temporary cover to stranded class.<br>Enter Admin Password to execute:`,
        input: 'password',
        inputAttributes: { autocapitalize: 'off', autocorrect: 'off' },
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#d97706',
        confirmButtonText: 'Authorize Cover'
    });

    if (!authRes.isConfirmed || !authRes.value) return;

    try {
        await ApiGateway.post('/dd/academics/allocations/substitute', {
            allocationId: allocationId,
            targetStaffId: coverId,
            adminPassword: authRes.value
        });

        Swal.fire('Assigned', "Temporary cover assigned and synchronized to Cloud Vault.", 'success');
        window.renderSubstituteMatrix();
    } catch (error) {
        Swal.fire('Error', error.message || "Failed to assign cover.", 'error');
    }
};

// ================= TAB 5: STUDENT TRANSFERS =================
window.filterTransferStudents = function () {
    const query = document.getElementById('transferSearchInput').value.toLowerCase().trim();
    const res = document.getElementById('transferSearchResults');
    res.innerHTML = '';

    if (query.length < 2) { res.classList.add('hidden'); return; }

    const students = window.getStudentRegistrySafe();
    let foundCount = 0;
    const maxResults = 10;

    for (let i = 0; i < students.length; i++) {
        const student = students[i];
        if (student.status === 'ADMITTED' && ((student.name || '').toLowerCase().includes(query) || (student.admNo && student.admNo.toLowerCase().includes(query)))) {
            const className = student.assignedClass || "Unassigned";
            const div = document.createElement('div');
            div.className = "p-3 hover:bg-indigo-50 border-b border-slate-100 cursor-pointer transition-colors";
            div.onclick = () => {
                document.getElementById('transferSearchInput').value = `${student.name} (${student.admNo})`;
                document.getElementById('transferStudentId').value = student.admNo;
                document.getElementById('transferCurrentClass').value = className;
                res.classList.add('hidden');
            };
            div.innerHTML = `<p class="text-xs font-black text-slate-800 uppercase">${DOMPurify.sanitize(student.name)}</p><p class="text-[9px] font-mono text-slate-500">${DOMPurify.sanitize(student.admNo)} • ${DOMPurify.sanitize(className)}</p>`;
            res.appendChild(div);

            foundCount++;
            if (foundCount >= maxResults) break;
        }
    }

    if (foundCount > 0) res.classList.remove('hidden');
    else res.classList.add('hidden');
};

window.executeStudentTransfer = async function () {
    if (SessionManager.isHistoricalArchiveMode()) {
        return Swal.fire('Archive Lockout', 'Executing student transfers is strictly prohibited in historical view.', 'error');
    }

    const admNoEl = document.getElementById('transferStudentId');
    const oldClassEl = document.getElementById('transferCurrentClass');
    const newSetEl = document.getElementById('transferNewSet');
    const newArmEl = document.getElementById('transferNewArm');
    const reasonEl = document.getElementById('transferReason');
    const categoryEl = document.getElementById('transferCategory');

    if (!admNoEl || !oldClassEl || !newSetEl || !newArmEl || !reasonEl || !categoryEl) {
        return Swal.fire('UI Error', "Missing elements. Check HTML IDs.", 'error');
    }

    const admNo = admNoEl.value.trim();
    const oldClass = oldClassEl.value;
    const newClassLevel = newSetEl.value.trim();
    const newClassArm = newArmEl.value.trim();
    const reason = reasonEl.value.trim();
    const category = categoryEl.value;

    if (!admNo || !newClassLevel || !newClassArm || !reason) {
        return Swal.fire('Validation Error', "Please fill all transfer fields and provide a reason.", 'error');
    }

    const newClass = `${newClassLevel} ${newClassArm}`;
    if (oldClass === newClass) return Swal.fire('Duplicate Entry', "Destination class is the same as current class.", 'warning');

    const authRes = await Swal.fire({
        title: 'Zero-Trust Authorization',
        html: `Officially transferring ${admNo} to ${newClass} via <b>${category}</b>.<br>Enter Admin Password to execute:`,
        input: 'password',
        inputAttributes: { autocapitalize: 'off', autocorrect: 'off' },
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#4f46e5',
        confirmButtonText: 'Authorize Transfer'
    });

    if (!authRes.isConfirmed || !authRes.value) return;

    const btn = window.event ? window.event.currentTarget : document.querySelector('button[onclick="executeStudentTransfer()"]');
    let ogText = "";
    if (btn) {
        ogText = btn.innerHTML;
        btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin mr-1"></i> Authorizing...`;
        btn.disabled = true;
    }

    try {
        await ApiGateway.post('/dd/academics/transfers/execute', {
            admNo: admNo,
            targetLevel: newClassLevel,
            targetArm: newClassArm,
            category: category,
            reason: reason,
            adminPassword: authRes.value
        });

        await window.syncPostgresToLocal();
        Swal.fire('Transferred', `Success! Student has been officially transferred to ${newClass}.`, 'success');
        document.getElementById('transferSearchInput').value = '';
        reasonEl.value = '';
        oldClassEl.value = '';
        admNoEl.value = '';
    } catch (error) {
        Swal.fire('Error', error.message || "Backend rejected student transfer.", 'error');
    } finally {
        if (btn) {
            btn.innerHTML = ogText;
            btn.disabled = false;
        }
    }
};

// ================= TAB 6: COMMUNICATIONS DISPATCH =================
window.dispatchCommunication = async function () {
    if (SessionManager.isHistoricalArchiveMode()) {
        return Swal.fire('Archive Lockout', 'Dispatching official queries or warnings is prohibited in historical view.', 'error');
    }

    const targetId = document.getElementById('commStaffSelect').value;
    const severity = document.getElementById('commSeverity').value;
    const message = document.getElementById('commMessage').value.trim();

    if (!targetId || !message) return Swal.fire('Validation Error', "Please select a target and type a message.", 'error');

    const isMass = targetId === 'ALL_ACADEMIC_STAFF';
    const warningText = isMass
        ? `Dispatching <b>MASS ${severity}</b> to ALL active Academic Staff.`
        : `Dispatching official <b>${severity}</b> to ${targetId}.`;

    const authRes = await Swal.fire({
        title: 'Zero-Trust Authorization',
        html: `${warningText}<br>Enter Admin Password to execute:`,
        input: 'password',
        inputAttributes: { autocapitalize: 'off', autocorrect: 'off' },
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#dc2626',
        confirmButtonText: '<i class="fa-solid fa-paper-plane"></i> Authorize Dispatch'
    });

    if (!authRes.isConfirmed || !authRes.value) return;

    const btn = window.event ? window.event.currentTarget : null;
    let ogText = btn ? btn.innerHTML : "";
    if (btn) { btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin mr-1"></i> Dispatching...`; btn.disabled = true; }

    try {
        await ApiGateway.post('/dd/academics/comms/dispatch', {
            targetStaffId: targetId,
            category: severity,
            message: message,
            adminPassword: authRes.value
        });

        Swal.fire('Dispatched', "Message dispatched securely and delivered to staff portals.", 'success');
        document.getElementById('commMessage').value = '';
    } catch (error) {
        Swal.fire('Error', error.message || "Failed to dispatch message.", 'error');
    } finally {
        if (btn) { btn.innerHTML = ogText; btn.disabled = false; }
    }
};

window.publishBroadcast = async function () {
    if (SessionManager.isHistoricalArchiveMode()) {
        return Swal.fire('Archive Lockout', 'Publishing global broadcasts is prohibited in historical view.', 'error');
    }

    const msgEl = document.getElementById('broadcastMessageInput');
    if (!msgEl || msgEl.value.trim() === '') return Swal.fire('Validation Error', 'Broadcast message cannot be empty.', 'error');

    const authRes = await Swal.fire({
        title: 'Zero-Trust Authorization',
        html: `Transmit institutional broadcast to ALL staff portals globally?<br>Enter Admin Password to execute:`,
        input: 'password',
        inputAttributes: { autocapitalize: 'off', autocorrect: 'off' },
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#005A36',
        confirmButtonText: 'Authorize Broadcast'
    });

    if (!authRes.isConfirmed || !authRes.value) return;

    const btn = window.event ? window.event.currentTarget : null;
    const ogText = btn ? btn.innerHTML : '';
    if (btn) { btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin mr-2"></i> Transmitting...`; btn.disabled = true; }

    try {
        await ApiGateway.post('/dd/academics/comms/broadcast', {
            message: msgEl.value.trim(),
            adminPassword: authRes.value
        });

        Swal.fire('Transmitted', 'Official broadcast securely published.', 'success');
        msgEl.value = '';
    } catch (error) {
        Swal.fire('Error', error.message || 'Failed to transmit broadcast.', 'error');
    } finally {
        if (btn) { btn.innerHTML = ogText; btn.disabled = false; }
    }
};

// ================= PROFILE & SIGNATURE MANAGEMENT =================
window.openDDProfileSettings = async function () {
    const modal = document.getElementById('ddProfileModal');
    const sigPreview = document.getElementById('ddSignaturePreview');
    const nameDisplay = document.getElementById('readOnlyDDName');

    if (modal) modal.classList.remove('hidden');

    try {
        const safeId = encodeURIComponent(currentDDStaffId);
        const dbProfile = await ApiGateway.get(`/ict/staff/profile?id=${safeId}`);

        if (dbProfile) {
            if (nameDisplay) {
                nameDisplay.textContent = dbProfile.fullName || dbProfile.name || activeDDProfile.name;
            }
            if (dbProfile.signatureUrl) {
                if (sigPreview) {
                    sigPreview.src = window.resolveMediaUrl(dbProfile.signatureUrl);
                    sigPreview.classList.remove('hidden');
                }
            } else {
                if (sigPreview) sigPreview.src = activeDDProfile.signatureUrl ? window.resolveMediaUrl(activeDDProfile.signatureUrl) : '';
            }
        }
    } catch (e) {
        console.warn("Could not fetch live signature from ICT Registry.");
    }
};

// ================= APPOINTMENT LETTER JASPER ENGINE =================
window.printAppointmentLetter = async function (encodedStaffId, encodedStaffName, encodedRoleTitle, encodedTargetScope) {
    const btn = window.event ? window.event.currentTarget : null;
    let ogHtml = "";
    if (btn) { ogHtml = btn.innerHTML; btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i>`; btn.disabled = true; }

    try {
        const staffId = decodeURIComponent(encodedStaffId);
        const staffName = decodeURIComponent(encodedStaffName);
        const roleTitle = decodeURIComponent(encodedRoleTitle);
        const targetScope = decodeURIComponent(encodedTargetScope);

        const payload = {
            staffId: staffId,
            staffName: staffName.toUpperCase(),
            roleTitle: roleTitle.toUpperCase(),
            targetScope: targetScope.toUpperCase(),
            date: new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }),
            officerName: activeDDProfile.name,
            signatureBase64: activeDDProfile.signatureUrl
        };

        const response = await fetch(`${ENV.API_BASE_URL}/api/reports/appointment-letter`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${sessionStorage.getItem('guss_access_token')}`
            },
            body: JSON.stringify(payload)
        });

        if (response.ok) {
            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a'); a.href = url; a.download = `Official_Appointment_${staffId.replace(/\//g, '_')}.pdf`;
            document.body.appendChild(a); a.click(); window.URL.revokeObjectURL(url); a.remove();
        } else {
            Swal.fire('Error', "Server failed to generate the Appointment Letter.", 'error');
        }
    } catch (error) {
        Swal.fire('Network Error', "Could not connect to the Jasper PDF Report Engine.", 'error');
    } finally {
        if (btn) { btn.innerHTML = ogHtml; btn.disabled = false; }
    }
};

// ================= AUDIT TRAIL JASPER ENGINE =================
window.printStudentAuditTrail = async function (admNo, studentName) {
    const btn = window.event ? window.event.currentTarget : null;
    let ogHtml = "";
    if (btn) { ogHtml = btn.innerHTML; btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin mr-1"></i> Printing...`; btn.disabled = true; }

    try {
        const payload = {
            admNo: admNo, studentName: studentName.toUpperCase(),
            datePrinted: new Date().toLocaleString('en-GB'), officerName: activeDDProfile.name, signatureBase64: activeDDProfile.signatureUrl
        };

        const response = await fetch(`${ENV.API_BASE_URL}/api/reports/student-audit-relational`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${sessionStorage.getItem('guss_access_token')}`
            },
            body: JSON.stringify(payload)
        });

        if (response.ok) {
            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a'); a.href = url; a.download = `Audit_Trail_${admNo.replace(/\//g, '_')}.pdf`;
            document.body.appendChild(a); a.click(); window.URL.revokeObjectURL(url); a.remove();
        } else {
            Swal.fire('Error', "Server failed to generate the Audit Trail.", 'error');
        }
    } catch (error) {
        Swal.fire('Network Error', "Could not connect to the Jasper PDF Report Engine.", 'error');
    } finally {
        if (btn) { btn.innerHTML = ogHtml; btn.disabled = false; }
    }
};

//  ENTERPRISE TYPO FIXER: Edit Class UI
window.guiEditClass = async function () {
    if (SessionManager.isHistoricalArchiveMode()) {
        return Swal.fire('Archive Lockout', 'Modifying class schemas is strictly prohibited in historical view.', 'error');
    }

    const uniqueSets = window.alphaSort([...new Set(DB_CLASSES.map(c => c.level))]);
    let setHtml = '<option value="">Select Level...</option>';
    uniqueSets.forEach(s => setHtml += `<option value="${DOMPurify.sanitize(s)}">${DOMPurify.sanitize(s)}</option>`);

    const setRes = await Swal.fire({
        title: 'Edit Class',
        html: `<label class="text-xs font-bold text-slate-500 uppercase block mb-2">Select Set to Edit</label>
               <select id="swal-edit-class-set" onchange="window.populateArms('swal-edit-class-arm', this.value)" class="w-full bg-slate-50 border rounded-lg px-3 py-3 font-bold mb-2">${setHtml}</select>
               <select id="swal-edit-class-arm" class="w-full bg-slate-50 border rounded-lg px-3 py-3 font-bold" disabled><option value="">Arm...</option></select>`,
        showCancelButton: true, confirmButtonColor: '#d97706', confirmButtonText: 'Proceed',
        preConfirm: () => {
            const l = document.getElementById('swal-edit-class-set').value;
            const a = document.getElementById('swal-edit-class-arm').value;
            if (!l || !a) Swal.showValidationMessage('Select Set and Arm.');
            return { l, a };
        }
    });

    if (!setRes.isConfirmed) return;

    const classObj = DB_CLASSES.find(c => c.level === setRes.value.l && c.arm === setRes.value.a);
    if (!classObj) return;

    const newRes = await Swal.fire({
        title: `Edit ${classObj.level} ${classObj.arm}`,
        html: `
            <input type="text" id="swal-new-level" value="${classObj.level}" class="w-full bg-slate-50 border rounded-lg px-3 py-3 font-bold mb-2" placeholder="Class Level">
            <input type="text" id="swal-new-arm" value="${classObj.arm}" class="w-full bg-slate-50 border rounded-lg px-3 py-3 font-bold" placeholder="Class Arm">
        `,
        showCancelButton: true, confirmButtonColor: '#d97706', confirmButtonText: 'Update Schema',
        preConfirm: () => { return { l: document.getElementById('swal-new-level').value.trim().toUpperCase(), a: document.getElementById('swal-new-arm').value.trim().toUpperCase() }; }
    });

    if (!newRes.isConfirmed) return;

    const authRes = await Swal.fire({
        title: 'Zero-Trust Authorization',
        html: `Updating structural schema to <b>${newRes.value.l} ${newRes.value.a}</b>.<br><br>Enter Admin Password to execute:`,
        input: 'password', inputAttributes: { autocapitalize: 'off', autocorrect: 'off' },
        icon: 'warning', showCancelButton: true, confirmButtonColor: '#d97706'
    });

    if (!authRes.isConfirmed || !authRes.value) return;

    try {
        await ApiGateway.put(`/dd/academics/classes/edit/${classObj.id}`, {
            targetLevel: newRes.value.l,
            targetArm: newRes.value.a,
            adminPassword: authRes.value
        });

        await window.fetchRelationalInfrastructure();
        window.seedDropdowns();
        Swal.fire('Updated', 'Typo fixed perfectly without breaking relational mappings.', 'success');
    } catch (error) {
        Swal.fire('Error', error.message || 'API Connection Failed', 'error');
    }
};

//  ENTERPRISE TYPO FIXER: Edit Subject UI
window.guiEditSubject = async function () {
    if (SessionManager.isHistoricalArchiveMode()) {
        return Swal.fire('Archive Lockout', 'Modifying curriculum entries is strictly prohibited in historical view.', 'error');
    }

    const uniqueCategories = window.alphaSort([...new Set(DB_CURRICULUM.map(c => c.category))]);
    let catHtml = '<option value="">Select Category...</option>';
    uniqueCategories.forEach(c => catHtml += `<option value="${DOMPurify.sanitize(c)}">${DOMPurify.sanitize(c).replace(/_/g, ' ')}</option>`);

    const selRes = await Swal.fire({
        title: 'Edit Subject',
        html: `<select id="swal-edit-sub-cat" onchange="window.populateEditSubjectDropdown(this.value)" class="w-full bg-slate-50 border rounded-lg px-3 py-3 font-bold mb-2">${catHtml}</select>
               <select id="swal-edit-sub-select" class="w-full bg-slate-50 border rounded-lg px-3 py-3 font-bold" disabled><option value="">Subject...</option></select>`,
        showCancelButton: true, confirmButtonColor: '#d97706', confirmButtonText: 'Proceed',
        preConfirm: () => {
            const c = document.getElementById('swal-edit-sub-cat').value;
            const s = document.getElementById('swal-edit-sub-select').value;
            if (!c || !s) Swal.showValidationMessage('Select Category and Subject.');
            return { c, s };
        }
    });

    if (!selRes.isConfirmed) return;

    const subObj = DB_CURRICULUM.find(c => c.category === selRes.value.c && c.name === selRes.value.s);
    if (!subObj) return;

    const newRes = await Swal.fire({
        title: `Edit ${subObj.name}`,
        html: `
            <input type="text" id="swal-new-sub-cat" value="${subObj.category}" class="w-full bg-slate-50 border rounded-lg px-3 py-3 font-bold mb-2" placeholder="Category (Folder)">
            <input type="text" id="swal-new-sub-name" value="${subObj.name}" class="w-full bg-slate-50 border rounded-lg px-3 py-3 font-bold" placeholder="Subject Name">
        `,
        showCancelButton: true, confirmButtonColor: '#d97706', confirmButtonText: 'Update Dictionary',
        preConfirm: () => { return { c: document.getElementById('swal-new-sub-cat').value.trim().toUpperCase().replace(/\s+/g, '_'), s: window.toTitleCase(document.getElementById('swal-new-sub-name').value.trim()) }; }
    });

    if (!newRes.isConfirmed) return;

    const authRes = await Swal.fire({
        title: 'Zero-Trust Authorization',
        html: `Updating dictionary entry to <b>${newRes.value.s}</b>.<br><br>Enter Admin Password:`,
        input: 'password', inputAttributes: { autocapitalize: 'off', autocorrect: 'off' },
        icon: 'warning', showCancelButton: true, confirmButtonColor: '#d97706'
    });

    if (!authRes.isConfirmed || !authRes.value) return;

    try {
        await ApiGateway.put(`/dd/academics/curriculum/edit/${subObj.id}`, {
            category: newRes.value.c,
            subject: newRes.value.s,
            adminPassword: authRes.value
        });

        await window.fetchRelationalInfrastructure();
        window.seedDropdowns();
        if (typeof window.renderActiveAllocations === 'function') window.renderActiveAllocations();
        Swal.fire('Updated', 'Subject typography updated natively in the Vault.', 'success');
    } catch (error) {
        Swal.fire('Error', error.message || 'API Connection Failed', 'error');
    }
};

window.resolveDDIdentity = function () {
    const staffList = JSON.parse(sessionStorage.getItem('cloud_staff_registry')) || [];
    const me = staffList.find(s => s.id === currentDDStaffId);
    if (me) { activeDDProfile = { ...me }; activeDDProfile.staffId = me.id; activeDDProfile.name = me.name; }
    const nameDisplay = document.getElementById('activeDDNameDisplay');
    if (nameDisplay) nameDisplay.textContent = activeDDProfile.name;
};

window.attachSignatureModalListener = function () {
    const nameDisplay = document.getElementById('activeDDNameDisplay');
    if (nameDisplay) {
        const clickableArea = nameDisplay.closest('.cursor-pointer') || nameDisplay;
        clickableArea.removeEventListener('click', window.openDDProfileSettings);
        clickableArea.addEventListener('click', window.openDDProfileSettings);
    }
};

window.switchTab = function (tabId) {
    ['omnisearch', 'approvals', 'allocations', 'substitutes', 'transfers', 'comms'].forEach(id => {
        const btn = document.getElementById(`tabBtn${id.charAt(0).toUpperCase() + id.slice(1)}`);
        const content = document.getElementById(`tabContent${id.charAt(0).toUpperCase() + id.slice(1)}`);
        if (!btn || !content) return;
        if (id === tabId) {
            btn.className = "flex-1 whitespace-nowrap px-5 py-3 rounded-xl text-xs font-black uppercase tracking-widest transition-all bg-white shadow text-gussNavy border border-slate-200";
            content.classList.remove('hidden'); content.classList.add('block');
        } else {
            btn.className = "flex-1 whitespace-nowrap px-5 py-3 rounded-xl text-xs font-black uppercase tracking-widest transition-all text-slate-500 hover:text-gussNavy";
            content.classList.add('hidden'); content.classList.remove('block');
        }
    });
    if (tabId === 'approvals') window.renderApprovalsQueue();
    if (tabId === 'allocations') { window.renderActiveAllocations(); window.renderFormMasters(); }
    if (tabId === 'substitutes') window.renderSubstituteMatrix();
};