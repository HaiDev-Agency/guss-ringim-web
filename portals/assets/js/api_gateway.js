import { ENV } from './core_config.js';

export const ApiGateway = {

    get baseURL() {
        return `${ENV.API_BASE_URL}/api`;
    },

    async request(endpoint, options = {}) {
        const token = sessionStorage.getItem('guss_access_token');

        const headers = {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            'ngrok-skip-browser-warning': 'true',
            ...options.headers
        };

        if (token) {
            headers['Authorization'] = `Bearer ${token}`;
        }

        try {
            const response = await fetch(`${this.baseURL}${endpoint}`, {
                ...options,
                headers
            });

            const isAuthRoute = endpoint.startsWith('/auth/')
                || endpoint.includes('/login')
                || endpoint.includes('/change-password')
                || endpoint.includes('/forgot-password')
                || endpoint.includes('/reset-password');

            if (response.status === 401 && !isAuthRoute) {
                this.triggerSecurityLockout("Session expired or invalid token detected.");
                return null;
            }

            const data = await response.json().catch(() => null);

            if (response.status === 403) {
                const errMsg = data?.message || data?.error || "Security Clearance Denied for this action.";
                console.warn(`[API Gateway] 403 Forbidden on ${endpoint}. ${errMsg}`);
                throw new Error(errMsg);
            }

            if (!response.ok) {
                throw new Error(data?.message || data?.error || `HTTP Error ${response.status}`);
            }

            return data;
        } catch (error) {
            console.error(`[API Gateway Error] ${endpoint}:`, error);
            throw error;
        }
    },

    async get(endpoint) {
        return this.request(endpoint, { method: 'GET' });
    },

    async post(endpoint, body) {
        return this.request(endpoint, {
            method: 'POST',
            body: JSON.stringify(body)
        });
    },

    async put(endpoint, body) {
        return this.request(endpoint, {
            method: 'PUT',
            body: JSON.stringify(body)
        });
    },

    async delete(endpoint) {
        return this.request(endpoint, { method: 'DELETE' });
    },

    async sendFormData(endpoint, method, formData) {
        const token = sessionStorage.getItem('guss_access_token');
        const headers = {
            'Accept': 'application/json',
            'ngrok-skip-browser-warning': 'true'
        };
        if (token) headers['Authorization'] = `Bearer ${token}`;

        try {
            const response = await fetch(`${this.baseURL}${endpoint}`, {
                method,
                headers,
                body: formData
            });

            const isAuthRoute = endpoint.startsWith('/auth/') || endpoint.includes('/login') || endpoint.includes('/register');

            if (response.status === 401 && !isAuthRoute) {
                this.triggerSecurityLockout("Session expired or invalid token detected.");
                return null;
            }

            const data = await response.json().catch(() => null);

            if (response.status === 403) {
                const errMsg = data?.message || data?.error || "Security Clearance Denied for this action.";
                throw new Error(errMsg);
            }

            if (!response.ok) {
                throw new Error(data?.message || data?.error || `HTTP Error ${response.status}`);
            }

            return data;
        } catch (error) {
            console.error(`[API Gateway Form Error] ${endpoint}:`, error);
            throw error;
        }
    },

    async postFormData(endpoint, formData) {
        return this.sendFormData(endpoint, 'POST', formData);
    },

    async putFormData(endpoint, formData) {
        return this.sendFormData(endpoint, 'PUT', formData);
    },

    async getBlob(endpoint, acceptMime = 'application/pdf') {
        const token = sessionStorage.getItem('guss_access_token');
        const headers = {
            'Accept': acceptMime,
            'ngrok-skip-browser-warning': 'true'
        };
        if (token) headers['Authorization'] = `Bearer ${token}`;

        const response = await fetch(`${this.baseURL}${endpoint}`, { method: 'GET', headers });
        if (response.status === 401) {
            this.triggerSecurityLockout("Session expired during document download.");
            return null;
        }
        if (!response.ok) throw new Error(`HTTP Error ${response.status}`);
        return response.blob();
    },

    async postBlob(endpoint, body, acceptMime = 'application/pdf') {
        const token = sessionStorage.getItem('guss_access_token');
        const headers = {
            'Content-Type': 'application/json',
            'ngrok-skip-browser-warning': 'true',
            'Accept': acceptMime
        };
        if (token) headers['Authorization'] = `Bearer ${token}`;

        const response = await fetch(`${this.baseURL}${endpoint}`, {
            method: 'POST',
            headers,
            body: JSON.stringify(body)
        });
        if (response.status === 401) {
            this.triggerSecurityLockout("Session expired during document generation.");
            return null;
        }
        if (response.status === 403) {
            throw new Error("Security Clearance Denied for this document.");
        }
        if (!response.ok) throw new Error(`HTTP Error ${response.status}`);
        return response.blob();
    },

    triggerSecurityLockout(reason) {
        console.warn("Security Lockout Triggered:", reason);
        const role = sessionStorage.getItem('guss_user_role');
        sessionStorage.clear();

        const currentPath = window.location.pathname.toLowerCase();
        if (role === 'ROLE_ALUMNUS' || currentPath.includes('alumni_')) {
            window.location.replace('alumni_login.html');
        } else if (role === 'ROLE_APPLICANT' || currentPath.includes('application.html') || currentPath.includes('student')) {
            window.location.replace('application.html');
        } else {
            window.location.replace('staff_login.html');
        }
    }
};