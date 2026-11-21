import { ENV } from './core_config.js';
import { ApiGateway } from './api_gateway.js';

export const CoreUI = {
    init() {
        this.injectModals();
        this.initNetworkMonitor();
        this.initRoleSwitcher();
        this.initNotificationEngine();

        //   Bind CoreUI methods to the global window object 
        // so inline HTML onclick handlers don't throw ReferenceErrors.
        window.CoreUI = this;
        window.openNotificationsModal = () => this.openNotificationsModal();
        window.closeNotificationsModal = () => this.closeNotificationsModal();
        window.toggleAppSwitcher = () => {
            const menu = document.getElementById('appSwitcherDropdown');
            if (menu) menu.classList.toggle('hidden');
        };
    },

    injectModals() {
        //   Prevent DOM Collisions. 
        // Only inject the modal if it doesn't already exist in the hardcoded HTML.

        // 1. Inject Notification Modal
        if (!document.getElementById('notifModal')) {
            const notifModal = document.createElement('div');
            notifModal.id = 'notifModal';
            notifModal.className = 'hidden fixed inset-0 bg-slate-900/80 backdrop-blur-sm z-[100] flex items-start justify-center p-4 pt-20 opacity-0 transition-opacity duration-300 no-print';
            notifModal.innerHTML = `
                <div class="bg-white rounded-3xl w-full max-w-lg overflow-hidden shadow-2xl flex flex-col max-h-[80vh] scale-95 transition-transform duration-300" id="notifContent">
                    <div class="bg-gussNavy p-5 flex justify-between items-center text-white shrink-0">
                        <h3 class="font-black text-sm uppercase tracking-wide flex items-center gap-2"><i class="fa-solid fa-bell text-blue-400"></i> Security & Comms</h3>
                        <button onclick="CoreUI.closeNotificationsModal()" class="text-slate-400 hover:text-white transition-colors"><i class="fa-solid fa-xmark text-lg"></i></button>
                    </div>
                    <div class="p-6 overflow-y-auto flex-1 bg-slate-50 space-y-4" id="notifBody"></div>
                </div>`;
            document.body.appendChild(notifModal);
        }

        // 2. Inject First Login Mandatory Security Modal
        if (!document.getElementById('staffFirstLoginModal')) {
            const firstLoginModal = document.createElement('div');
            firstLoginModal.id = 'staffFirstLoginModal';
            firstLoginModal.className = 'fixed inset-0 bg-slate-900/95 backdrop-blur-md z-[150] hidden items-center justify-center p-4 no-print';
            firstLoginModal.innerHTML = `
                <div class="bg-white rounded-[2rem] w-full max-w-md shadow-2xl p-10 text-center transform scale-95 transition-transform opacity-0" id="staffFirstLoginContent">
                    <div class="w-20 h-20 bg-amber-100 text-amber-600 rounded-full flex items-center justify-center text-4xl mx-auto mb-6 shadow-inner">
                        <i class="fa-solid fa-user-shield"></i>
                    </div>
                    <h2 class="text-2xl font-black text-gussNavy uppercase tracking-tight mb-2">Secure Your Account</h2>
                    <p class="text-sm text-slate-600 mb-8 leading-relaxed">You are currently using a system-generated access key. By institutional policy, you must create a permanent, private password before accessing your dashboard.</p>
                    <form id="staffFirstPasswordForm" class="space-y-4">
                        <input type="password" id="act-current-pass" required placeholder="Current Temporary Password" class="w-full p-3.5 bg-slate-800 border border-slate-700 rounded-xl text-center text-white font-black text-xs focus:border-amber-500 outline-none transition-colors">
                        <input type="password" id="setupNewStaffPass" required placeholder="Enter Permanent Password" class="w-full p-4 border border-slate-300 rounded-xl text-center font-black text-sm focus:border-gussGold outline-none transition-colors">
                        <input type="password" id="confirmNewStaffPass" required placeholder="Confirm Password" class="w-full p-4 border border-slate-300 rounded-xl text-center font-black text-sm focus:border-gussGold outline-none transition-colors">
                        <button type="submit" id="btnSaveNewPass" class="w-full bg-gussGold text-gussNavy py-4 rounded-xl text-xs font-black uppercase tracking-widest hover:bg-yellow-500 transition-colors shadow-lg shadow-yellow-500/30">
                            Activate My Account <i class="fa-solid fa-lock ml-2"></i>
                        </button>
                    </form>
                </div>`;
            document.body.appendChild(firstLoginModal);
        }
    },

    // 1. ADVANCED HYBRID NETWORK TELEMETRY ENGINE
    initNetworkMonitor() {
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
                //   Use ApiGateway to ensure headers are attached
                const response = await ApiGateway.get('/director/epoch/current');
                if (response) {
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
                }
            } catch (error) {
                pingText.textContent = "SERVER UNREACHABLE";
                pingText.className = "text-[9px] font-black text-red-500 tracking-widest";
                pingDot.className = "w-2 h-2 rounded-full bg-red-600 shadow-[0_0_8px_rgba(239,68,68,0.8)]";
                pingBadge.className = "bg-red-950/40 px-3 py-1 rounded-md border border-red-900/50 flex items-center gap-2 shadow-inner transition-colors duration-500";
            }
        }
        if (navigator.onLine) checkServerLatency();
        setInterval(checkServerLatency, 15000);
    },

    // 2. CROSS-PORTAL ROLE SWITCHER
    async initRoleSwitcher() {
        const staffId = sessionStorage.getItem('guss_staff_id');
        if (!staffId) return;

        const portalMap = {
            "ROLE_DIRECTOR": { title: "Executive Director Node", url: "director_terminal.html", icon: "fa-user-tie" },
            "ROLE_DEPUTY_DIR_ACADEMICS": { title: "DD Academics Console", url: "dd_academics.html", icon: "fa-book-open" },
            "ROLE_DEPUTY_DIR_ADMIN": { title: "DD Admin Console", url: "dd_admin.html", icon: "fa-briefcase" },
            "ROLE_ICT_ADMIN": { title: "ICT & Central Registry", url: "ict_registry.html", icon: "fa-network-wired" },
            "ROLE_WEB_ADMIN": { title: "Web Admin Command Center", url: "web_admin.html", icon: "fa-globe" },
            "ROLE_BURSAR": { title: "Central Bursary", url: "bursary_terminal.html", icon: "fa-vault" },
            "ROLE_ADMISSIONS_OFFICER": { title: "Admissions Console", url: "admission_officer.html", icon: "fa-id-card-clip" },
            "ROLE_CHIEF_EXAMINER": { title: "Chief Examiner", url: "chief_examiner.html", icon: "fa-scale-balanced" },
            "ROLE_CSO": { title: "Chief Security Officer", url: "cso_terminal.html", icon: "fa-shield-halved" },
            "FORM_MASTER": { title: "Form Master Portal", url: "form_master.html", icon: "fa-users-rectangle" },
            "SUBJECT_TEACHER": { title: "Subject Teacher Terminal", url: "teacher_grading.html", icon: "fa-chalkboard-user" },
            "HOUSE_WARDEN": { title: "House Warden Portal", url: "house_master.html", icon: "fa-building-user" }
        };

        let myPortals = [];

        try {
            const assignedRoles = await ApiGateway.get(`/bridge/staff-portals?staffId=${encodeURIComponent(staffId)}`);
            if (assignedRoles && Array.isArray(assignedRoles)) {
                assignedRoles.forEach(roleKey => {
                    let normalized = roleKey.toUpperCase().replace("GUSS_STATUTORY_", "").replace("GUSS_", "");
                    if (!normalized.startsWith("ROLE_")) normalized = "ROLE_" + normalized;
                    if (portalMap[normalized]) myPortals.push(portalMap[normalized]);
                });
            }

            const opRoles = await ApiGateway.get(`/ict/operational/staff?staffId=${encodeURIComponent(staffId)}`).catch(() => []);
            if (opRoles && Array.isArray(opRoles)) {
                opRoles.forEach(roleObj => {
                    if (portalMap[roleObj.type]) myPortals.push(portalMap[roleObj.type]);
                });
            }
        } catch (e) {
            console.warn("Could not fetch relational portals.");
        }

        myPortals.push({ title: "Staff Command Center", url: "staff_portal.html", icon: "fa-id-badge" });

        // Ensure current page is visually active even if backend fails
        const currentPath = window.location.pathname.split('/').pop();
        const currentPortal = Object.values(portalMap).find(p => p.url === currentPath);
        if (currentPortal && !myPortals.some(p => p.url === currentPath)) myPortals.push(currentPortal);

        myPortals = [...new Map(myPortals.map(item => [item.url, item])).values()];
        if (myPortals.length > 1) this.deployFloatingSwitcherUI(myPortals);
    },

    deployFloatingSwitcherUI(portals) {
        let container = document.getElementById('enterpriseRoleSwitcher');
        if (!container) {
            container = document.createElement('div');
            container.id = 'enterpriseRoleSwitcher';
            container.className = "fixed bottom-8 right-8 z-[200] no-print select-none";
            document.body.appendChild(container);
        }

        let menuHtml = `
            <div id="roleSwitcherMenu" class="hidden absolute bottom-full right-0 mb-4 w-72 bg-white border border-slate-200 shadow-2xl rounded-2xl p-2 flex flex-col gap-1 origin-bottom-right transition-all">
                <div class="px-3 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-100 mb-1 flex items-center gap-2">
                    <i class="fa-solid fa-shuffle"></i> Switch Active Portal
                </div>
        `;

        portals.forEach(p => {
            const isActive = window.location.href.includes(p.url);
            menuHtml += `
                <a href="${p.url}" class="flex items-center gap-3 px-3 py-3 rounded-xl text-xs font-bold transition-all ${isActive ? 'bg-gussNavy text-white shadow-md' : 'text-slate-600 hover:bg-slate-50 hover:text-gussNavy border border-transparent hover:border-slate-200'}">
                    <div class="w-8 h-8 rounded-full flex items-center justify-center ${isActive ? 'bg-slate-700 text-white' : 'bg-slate-100 text-slate-500'}">
                        <i class="fa-solid ${p.icon}"></i>
                    </div>
                    ${p.title}
                    ${isActive ? '<i class="fa-solid fa-circle-check ml-auto text-emerald-300"></i>' : ''}
                </a>
            `;
        });

        menuHtml += `</div>
            <button id="roleSwitcherDragHandle" class="bg-gussNavy hover:bg-black text-white px-5 py-4 rounded-full shadow-2xl flex items-center gap-3 font-black text-xs uppercase tracking-widest border-2 border-slate-700 transition-all group">
                <i class="fa-solid fa-layer-group text-gussGold group-hover:rotate-12 transition-transform"></i> My Portals
            </button>
        `;

        container.innerHTML = menuHtml;
        this.attachDragLogic(document.getElementById('roleSwitcherDragHandle'), document.getElementById('roleSwitcherMenu'), container);
    },

    attachDragLogic(handle, menu, container) {
        let isDragging = false, isHoldTriggered = false, holdTimeout = null;
        let currentX = 0, currentY = 0, initialX = 0, initialY = 0, xOffset = 0, yOffset = 0;

        function dragStart(e) {
            if (e.target === handle || handle.contains(e.target)) {
                if (e.type === "touchstart") { initialX = e.touches[0].clientX - xOffset; initialY = e.touches[0].clientY - yOffset; }
                else { initialX = e.clientX - xOffset; initialY = e.clientY - yOffset; }
                isHoldTriggered = false;
                holdTimeout = setTimeout(() => {
                    isHoldTriggered = true;
                    handle.classList.add('scale-110', 'ring-4', 'ring-gussGold/50', 'cursor-grabbing');
                }, 300);
            }
        }

        function drag(e) {
            if (isHoldTriggered) {
                isDragging = true; e.preventDefault();
                if (e.type === "touchmove") { currentX = e.touches[0].clientX - initialX; currentY = e.touches[0].clientY - initialY; }
                else { currentX = e.clientX - initialX; currentY = e.clientY - initialY; }
                xOffset = currentX; yOffset = currentY;
                container.style.transform = `translate3d(${currentX}px, ${currentY}px, 0)`;
                menu.classList.add('hidden');
            }
        }

        function dragEnd(e) {
            clearTimeout(holdTimeout);
            handle.classList.remove('scale-110', 'ring-4', 'ring-gussGold/50', 'cursor-grabbing');
            if (!isHoldTriggered && !isDragging) {
                if (e.target === handle || handle.contains(e.target)) menu.classList.toggle('hidden');
            }
            if (isDragging) { initialX = currentX; initialY = currentY; }
            isDragging = false; isHoldTriggered = false;
        }

        document.addEventListener("touchstart", dragStart, { passive: false });
        document.addEventListener("touchend", dragEnd, false);
        document.addEventListener("touchmove", drag, { passive: false });
        document.addEventListener("mousedown", dragStart, false);
        document.addEventListener("mouseup", dragEnd, false);
        document.addEventListener("mousemove", drag, false);
    },

    // 3. RELATIONAL NOTIFICATION ENGINE
    initNotificationEngine() {
        this.checkForNotifications();
        setInterval(() => this.checkForNotifications(), 30000);
    },

    async checkForNotifications() {
        try {
            const data = await ApiGateway.get('/ict/operations/comms/unread');
            const badge = document.getElementById('notifBadge');
            if (badge) {
                if (data && data.count > 0) badge.classList.remove('hidden');
                else badge.classList.add('hidden');
            }
        } catch (e) {
            console.warn("Silent fail: Could not fetch unread comms count.");
        }
    },

    async openNotificationsModal() {
        const modal = document.getElementById('notifModal');
        const content = document.getElementById('notifContent');
        const body = document.getElementById('notifBody');

        if (!modal || !content || !body) return;

        body.innerHTML = `<div class="text-center py-8 text-slate-400 font-bold text-xs"><i class="fa-solid fa-circle-notch fa-spin text-3xl mb-3 block"></i> Fetching Secure Comms...</div>`;
        modal.classList.remove('hidden');
        setTimeout(() => { modal.classList.remove('opacity-0'); content.classList.remove('scale-95'); }, 10);

        try {
            const msgs = await ApiGateway.get('/ict/operations/comms');
            if (!msgs || msgs.length === 0) {
                body.innerHTML = `<div class="text-center py-8 text-slate-400 font-bold text-xs"><i class="fa-regular fa-bell-slash text-3xl mb-3 opacity-30 block"></i> No administrative communications found.</div>`;
                return;
            }

            let htmlBuffer = '';
            msgs.forEach(msg => {
                let color = "bg-blue-50 border-blue-200 text-blue-800";
                let icon = "fa-circle-info text-blue-500";
                if (msg.severity === 'WARNING') { color = "bg-orange-50 border-orange-200 text-orange-800"; icon = "fa-triangle-exclamation text-orange-500"; }
                if (msg.severity === 'QUERY') { color = "bg-red-50 border-red-200 text-red-800"; icon = "fa-hand-paper text-red-500"; }

                // Safe XSS bypass check since we rely on DOMPurify
                htmlBuffer += `
                    <div class="${color} border p-4 rounded-xl shadow-sm relative">
                        ${!msg.read ? '<span class="absolute top-2 right-2 flex h-2 w-2 rounded-full bg-red-500 animate-pulse"></span>' : ''}
                        <div class="flex items-center gap-2 mb-2 border-b border-black/10 pb-2">
                            <i class="fa-solid ${icon}"></i>
                            <h4 class="text-[10px] font-black uppercase tracking-widest">${DOMPurify.sanitize(msg.severity)} from ${DOMPurify.sanitize(msg.sender)}</h4>
                        </div>
                        <p class="text-xs font-medium leading-relaxed">${DOMPurify.sanitize(msg.message)}</p>
                        <p class="text-[8px] font-bold uppercase tracking-widest mt-3 opacity-60 text-right">${DOMPurify.sanitize(msg.timestamp)}</p>
                    </div>
                `;
            });
            body.innerHTML = htmlBuffer;

            await ApiGateway.post('/ict/operations/comms/mark-read', {});
            this.checkForNotifications();

        } catch (e) {
            body.innerHTML = `<div class="text-center py-8 text-red-500 font-bold text-xs">Failed to load communications.</div>`;
        }
    },

    closeNotificationsModal() {
        const modal = document.getElementById('notifModal');
        const content = document.getElementById('notifContent');
        if (!modal || !content) return;
        modal.classList.add('opacity-0');
        content.classList.add('scale-95');
        setTimeout(() => { modal.classList.add('hidden'); }, 300);
    }
};