import { ApiGateway } from './api_gateway.js';

//   Cross-Tab Synchronization Channel
// Prevents split-brain database corruption if a user has multiple tabs open
const sessionChannel = new BroadcastChannel('guss_session_sync');
sessionChannel.onmessage = (event) => {
    if (event.data.type === 'SESSION_CHANGED') {
        console.warn("Time Machine state changed in another tab. Synchronizing...");
        window.location.reload();
    }
};

export const SessionManager = {

    async initHeaderDropdown() {
        try {
            //   Routed through ApiGateway to ensure JWT headers are attached
            const [currentEpoch, archives] = await Promise.all([
                ApiGateway.get('/director/epoch/current'),
                ApiGateway.get('/director/epoch/archives')
            ]);

            const sessionSelect = document.getElementById('globalSessionSelect');
            const termSelect = document.getElementById('globalTermSelect');
            if (!sessionSelect) return;

            sessionSelect.innerHTML = '';

            let liveSessionString = "2026/2027 SESSION";
            let liveTermString = "1ST TERM";

            // 1. Add Live Session
            if (currentEpoch && currentEpoch.label !== "SYSTEM STANDBY") {
                const parts = currentEpoch.label.split('|');

                //  ENTERPRISE CANONICAL KEY EXTRACTION: Strictly "YYYY/YYYY"
                const canonicalSession = parts[0].trim();
                liveSessionString = canonicalSession;
                liveTermString = parts[1] ? parts[1].trim() : "1ST TERM";

                const opt = document.createElement('option');
                opt.value = canonicalSession;
                opt.textContent = `${canonicalSession} (LIVE)`;
                sessionSelect.appendChild(opt);

                sessionStorage.setItem('guss_live_session', canonicalSession);
                sessionStorage.setItem('guss_live_term', liveTermString);

                if (!sessionStorage.getItem('guss_selected_session')) {
                    sessionStorage.setItem('guss_selected_session', canonicalSession);
                    sessionStorage.setItem('guss_selected_term', liveTermString);
                }
            }

            // 2. Add Upcoming Intake (Admissions Portal Only)
            const isAdmissionsPortal = window.location.pathname.includes('admission_officer.html');
            if (isAdmissionsPortal) {
                const startYear = parseInt(liveSessionString.substring(0, 4));
                if (!isNaN(startYear)) {
                    const nextCanonical = `${startYear + 1}/${startYear + 2}`;
                    const nextOpt = document.createElement('option');
                    nextOpt.value = nextCanonical;
                    nextOpt.textContent = `${nextCanonical} (UPCOMING INTAKE)`;
                    sessionSelect.appendChild(nextOpt);
                }
            }

            // 3. Add Archives
            const uniqueSessions = new Set();
            if (archives && Array.isArray(archives)) {
                archives.forEach(arch => {
                    const sessionStr = arch.label.split('|')[0].trim();
                    if (!uniqueSessions.has(sessionStr) && sessionStr !== liveSessionString) {
                        uniqueSessions.add(sessionStr);
                        const opt = document.createElement('option');
                        opt.value = sessionStr;
                        opt.textContent = `${sessionStr} (ARCHIVED)`;
                        sessionSelect.appendChild(opt);
                    }
                });
            }

            // 4. Restore UI State
            sessionSelect.value = sessionStorage.getItem('guss_selected_session');
            if (termSelect && sessionStorage.getItem('guss_selected_term')) {
                termSelect.value = sessionStorage.getItem('guss_selected_term');
            }

            this.updateLiveIndicator();

        } catch (error) {
            console.error("SessionManager Sync Failed:", error);
        }
    },

    setSession(sessionValue) {
        sessionStorage.setItem('guss_selected_session', sessionValue);
        sessionChannel.postMessage({ type: 'SESSION_CHANGED' }); //  Notify other tabs
        window.location.reload();
    },

    setTerm(termValue) {
        sessionStorage.setItem('guss_selected_term', termValue);
        sessionChannel.postMessage({ type: 'SESSION_CHANGED' }); //  Notify other tabs
        window.location.reload();
    },

    resetToLive() {
        const liveSession = sessionStorage.getItem('guss_live_session');
        const liveTerm = sessionStorage.getItem('guss_live_term');
        if (liveSession) {
            sessionStorage.setItem('guss_selected_session', liveSession);
            sessionStorage.setItem('guss_selected_term', liveTerm);
            sessionChannel.postMessage({ type: 'SESSION_CHANGED' }); //  Notify other tabs
            window.location.reload();
        }
    },

    updateLiveIndicator() {
        const btn = document.getElementById('tmLiveBtn');
        if (!btn) return;

        const currentSession = sessionStorage.getItem('guss_selected_session');
        const currentTerm = sessionStorage.getItem('guss_selected_term');
        const liveSession = sessionStorage.getItem('guss_live_session');
        const liveTerm = sessionStorage.getItem('guss_live_term');

        //   Must match BOTH Session and Term to be "LIVE"
        if (currentSession === liveSession && currentTerm === liveTerm) {
            btn.className = "bg-gussGreen text-white px-3 py-1.5 rounded-md text-[10px] font-black uppercase tracking-widest shadow-sm border border-emerald-600 transition-colors flex items-center gap-1.5";
            btn.innerHTML = `<span class="relative flex h-2 w-2 mr-1"><span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span><span class="relative inline-flex rounded-full h-2 w-2 bg-white"></span></span>Live`;
        } else {
            btn.className = "bg-slate-700 text-slate-400 px-3 py-1.5 rounded-md text-[10px] font-black uppercase tracking-widest shadow-sm border border-slate-600 transition-colors flex items-center gap-1.5";
            btn.innerHTML = `<i class="fa-solid fa-clock-rotate-left mr-1"></i> Archive`;
        }
    },

    //  ENTERPRISE ARCHIVAL IMMUTABILITY DETECTOR
    isHistoricalArchiveMode() {
        const currentSession = sessionStorage.getItem('guss_selected_session');
        const currentTerm = sessionStorage.getItem('guss_selected_term');
        const liveSession = sessionStorage.getItem('guss_live_session');
        const liveTerm = sessionStorage.getItem('guss_live_term');

        if (!liveSession || !currentSession) return false;

        // If either the Session string OR the Term string differs from LIVE, we are in the past
        const cleanCurrent = currentSession.replace(/ \| .*/, '').trim();
        const cleanLive = liveSession.replace(/ \| .*/, '').trim();

        return (cleanCurrent !== cleanLive || (currentTerm && liveTerm && currentTerm.trim() !== liveTerm.trim()));
    },

    getCurrentContextString() {
        const session = sessionStorage.getItem('guss_selected_session') || '2026/2027 SESSION';
        const term = sessionStorage.getItem('guss_selected_term') || '1ST TERM';
        return `${session} | ${term}`;
    }
};

window.SessionManager = SessionManager;