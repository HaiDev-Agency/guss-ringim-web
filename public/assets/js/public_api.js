export const PUBLIC_ENV = {
    isDev: window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1',
    get API_BASE_URL() {
        return this.isDev ? 'http://127.0.0.1:8080' : 'https://throbbing-dribble-twelve.ngrok-free.dev';
    }
};

export function cleanText(value) {
    const str = value === null || value === undefined ? '' : String(value);
    if (typeof window !== 'undefined' && window.DOMPurify) {
        return window.DOMPurify.sanitize(str, { ALLOWED_TAGS: [], ALLOWED_ATTR: [] });
    }
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

export function cleanRichHtml(value) {
    const str = value === null || value === undefined ? '' : String(value);
    if (typeof window !== 'undefined' && window.DOMPurify) {
        return window.DOMPurify.sanitize(str);
    }
    return cleanText(str);
}

export function resolveMediaUrl(url, fallback = '') {
    if (!url || String(url).trim() === '') return fallback;
    const raw = String(url).trim();
    if (raw.startsWith('http://') || raw.startsWith('https://') || raw.startsWith('data:')) {
        return raw;
    }
    if (raw.startsWith('/uploads')) {
        return `${PUBLIC_ENV.API_BASE_URL}${raw}`;
    }
    if (raw.startsWith('assets/')) {
        return raw;
    }
    return `${PUBLIC_ENV.API_BASE_URL}/uploads/${raw}`;
}

export function formatDisplayDate(isoString) {
    if (!isoString) return 'Recent';
    const d = new Date(isoString);
    if (Number.isNaN(d.getTime())) return cleanText(isoString);
    return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function debounce(fn, waitMs = 450) {
    let timer = null;
    return (...args) => {
        clearTimeout(timer);
        timer = setTimeout(() => fn(...args), waitMs);
    };
}

export const PublicApi = {
    get baseURL() {
        return `${PUBLIC_ENV.API_BASE_URL}/api/public`;
    },

    async get(endpoint) {
        const res = await fetch(`${this.baseURL}${endpoint}`, {
            method: 'GET',
            headers: {
                'Accept': 'application/json',
                'ngrok-skip-browser-warning': 'true',
            }
        });
        const data = await res.json().catch(() => null);
        if (!res.ok) {
            throw new Error(data?.message || data?.error || `HTTP ${res.status}`);
        }
        return data;
    },

    async post(endpoint, body) {
        const res = await fetch(`${this.baseURL}${endpoint}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json',
                'ngrok-skip-browser-warning': 'true',
            },
            body: JSON.stringify(body)
        });
        const data = await res.json().catch(() => null);
        if (!res.ok) {
            throw new Error(data?.message || data?.error || `HTTP ${res.status}`);
        }
        return data;
    }
};