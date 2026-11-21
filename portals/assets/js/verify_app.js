import { ENV } from './core_config.js';

document.getElementById('verifyForm').addEventListener('submit', async (e) => {
    e.preventDefault();

    const input = document.getElementById('verifyInput').value.trim();
    const btn = document.getElementById('verifyBtn');
    const pane = document.getElementById('resultPane');

    if (!input) return;

    const ogText = btn.innerHTML;
    btn.innerHTML = `<i class="fa-solid fa-circle-notch fa-spin"></i>`;
    btn.disabled = true;
    pane.classList.add('hidden');

    try {
        const response = await fetch(`${ENV.API_BASE_URL}/api/public/verify?query=${encodeURIComponent(input)}`);
        const data = await response.json();

        if (response.ok) {
            const safePhoto = data.photoUrl ? (data.photoUrl.startsWith('http') ? data.photoUrl : `${ENV.API_BASE_URL}/${data.photoUrl.replace(/^\/+/, '')}`) : `https://ui-avatars.com/api/?name=${encodeURIComponent(data.name)}&background=0F172A&color=fff`;

            let statusBadge = "";
            let cardTheme = "";
            let icon = "";
            let docTitle = "";

            //  1. SERVICE CERTIFICATE (Gold/Amber Theme)
            if (data.docType === 'SERVICE_CERTIFICATE') {
                cardTheme = "bg-amber-900/20 border-amber-500/30";
                icon = "fa-award text-amber-400";
                docTitle = "Official Certificate of Service";
                statusBadge = data.status === 'HONORABLY DISCHARGED'
                    ? `<span class="bg-emerald-500/20 text-emerald-300 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest border border-emerald-500/50 shadow-sm"><i class="fa-solid fa-check-double mr-1"></i> Honorably Discharged</span>`
                    : `<span class="bg-blue-500/20 text-blue-300 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest border border-blue-500/50 shadow-sm"><i class="fa-solid fa-clock mr-1"></i> Active Duty</span>`;
            }
            //  2. ADMISSION LETTER (Blue Theme)
            else if (data.docType === 'ADMISSION_LETTER') {
                cardTheme = "bg-blue-900/20 border-blue-500/30";
                icon = "fa-file-contract text-blue-400";
                docTitle = "Provisional Admission Letter";
                statusBadge = data.status === 'AUTHENTIC & ADMITTED'
                    ? `<span class="bg-emerald-500/20 text-emerald-300 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest border border-emerald-500/50 shadow-sm"><i class="fa-solid fa-check-circle mr-1"></i> Admitted</span>`
                    : `<span class="bg-red-500/20 text-red-300 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest border border-red-500/50 shadow-sm animate-pulse"><i class="fa-solid fa-skull mr-1"></i> ${DOMPurify.sanitize(data.status)}</span>`;
            }
            //  3 & 4. STAFF ID CARD (Split Themes based on Role)
            else if (data.docType === 'STAFF_ID') {
                const isActive = data.status === 'APPROVED' || data.status === 'ACTIVATED';

                if (data.role === 'NYSC' || data.role === 'TP') {
                    // TRANSIENT STAFF (Orange/Amber Theme)
                    cardTheme = "bg-orange-900/20 border-orange-500/30";
                    icon = "fa-id-badge text-orange-400";
                    docTitle = "Transient Personnel ID";
                } else {
                    // PERMANENT STAFF (Purple/Indigo Theme)
                    cardTheme = "bg-purple-900/20 border-purple-500/30";
                    icon = "fa-id-card-clip text-purple-400";
                    docTitle = "Permanent Faculty ID";
                }

                statusBadge = isActive
                    ? `<span class="bg-emerald-500/20 text-emerald-300 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest border border-emerald-500/50 shadow-sm"><i class="fa-solid fa-shield-check mr-1"></i> Active Personnel</span>`
                    : `<span class="bg-red-500/20 text-red-300 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest border border-red-500/50 shadow-sm"><i class="fa-solid fa-ban mr-1"></i> ${DOMPurify.sanitize(data.status)}</span>`;
            }
            //  5. STUDENT ID CARD (Emerald Theme)
            else {
                const isActive = data.status === 'ADMITTED';
                cardTheme = "bg-emerald-900/20 border-emerald-500/30";
                icon = "fa-graduation-cap text-emerald-400";
                docTitle = "Institutional Student ID";

                statusBadge = isActive
                    ? `<span class="bg-emerald-500/20 text-emerald-300 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest border border-emerald-500/50 shadow-sm"><i class="fa-solid fa-check-circle mr-1"></i> Active Student</span>`
                    : `<span class="bg-red-500/20 text-red-300 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest border border-red-500/50 shadow-sm animate-pulse"><i class="fa-solid fa-skull mr-1"></i> ${DOMPurify.sanitize(data.status)}</span>`;
            }

            pane.innerHTML = `
                <div class="${cardTheme} border rounded-2xl p-6 shadow-xl relative overflow-hidden backdrop-blur-md">
                    <div class="absolute -right-6 -top-6 opacity-10 text-9xl"><i class="fa-solid ${icon.split(' ')[0]}"></i></div>
                    
                    <div class="flex items-center gap-2 mb-4 border-b border-white/10 pb-3 relative z-10">
                        <i class="fa-solid ${icon} text-xl"></i>
                        <h4 class="font-black text-slate-300 uppercase tracking-widest text-xs">${docTitle}</h4>
                    </div>

                    <div class="flex flex-col sm:flex-row items-center sm:items-start gap-6 relative z-10">
                        <img src="${DOMPurify.sanitize(safePhoto)}" class="w-28 h-28 rounded-xl object-cover border-2 border-white/20 shadow-md bg-slate-800 shrink-0">
                        <div class="w-full text-center sm:text-left">
                            <h3 class="text-xl font-black text-white uppercase tracking-wide mb-2">${DOMPurify.sanitize(data.name)}</h3>
                            <p class="text-sm font-mono font-black text-slate-300 mb-1 bg-black/30 inline-block px-2 py-1 rounded border border-white/10">${DOMPurify.sanitize(data.identity)}</p>
                            <p class="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4">${DOMPurify.sanitize(data.role)}</p>
                            
                            <div class="flex justify-center sm:justify-start">
                                ${statusBadge}
                            </div>
                        </div>
                    </div>
                    
                    <div class="mt-5 p-3 bg-black/20 rounded-xl border border-white/5 text-[10px] text-slate-400 font-bold flex items-start gap-2 relative z-10 shadow-inner">
                        <i class="fa-solid fa-lock text-emerald-500 mt-0.5 text-sm"></i>
                        <p>This document has been cryptographically verified against the central PostgreSQL database of Government Unity Secondary School, Ringim.</p>
                    </div>
                </div>
            `;
        } else {
            pane.innerHTML = `
                <div class="bg-red-900/20 border border-red-500/30 rounded-2xl p-6 shadow-xl flex items-start gap-4 backdrop-blur-md">
                    <i class="fa-solid fa-circle-xmark text-red-500 text-4xl"></i>
                    <div>
                        <h3 class="text-lg font-black text-red-400 uppercase tracking-wide mb-1">Verification Failed</h3>
                        <p class="text-sm text-red-300/80 font-medium">${DOMPurify.sanitize(data.error || 'No authentic record found matching this identity parameter.')}</p>
                    </div>
                </div>
            `;
        }
        pane.classList.remove('hidden');
    } catch (error) {
        pane.innerHTML = `<div class="text-center text-red-400 font-bold text-sm bg-red-900/20 p-4 rounded-xl border border-red-500/30 backdrop-blur-md"><i class="fa-solid fa-wifi mr-2"></i> Network connection failed.</div>`;
        pane.classList.remove('hidden');
    } finally {
        btn.innerHTML = 'Verify';
        btn.disabled = false;
    }
});