export const ENV = {
    isDev: window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1',
    get API_BASE_URL() {
        return this.isDev ? 'http://127.0.0.1:8080' : 'https://throbbing-dribble-twelve.ngrok-free.dev';
    }
};

export function getAuthHeaders() {
    return {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + (sessionStorage.getItem('guss_access_token') || ''),
        'ngrok-skip-browser-warning': 'true'
    };
}

export function getMultipartAuthHeaders() {
    return {
        'Authorization': 'Bearer ' + (sessionStorage.getItem('guss_access_token') || ''),
        'ngrok-skip-browser-warning': 'true'
    };
}
// Global Ngrok free-tier warning bypass for all legacy/direct fetch() report & media calls
if (typeof window !== 'undefined' && !window.__gussFetchPatched) {
    window.__gussFetchPatched = true;
    const _origFetch = window.fetch.bind(window);
    window.fetch = function(resource, init = {}) {
        const url = typeof resource === 'string' ? resource : (resource?.url || '');
        if (url.includes('ngrok-free.dev') || url.includes('ngrok.io') || url.startsWith('/api')) {
            const headers = new Headers(init.headers || (resource instanceof Request ? resource.headers : undefined));
            if (!headers.has('ngrok-skip-browser-warning')) {
                headers.set('ngrok-skip-browser-warning', 'true');
            }
            init = { ...init, headers };
        }
        return _origFetch(resource, init);
    };
}
