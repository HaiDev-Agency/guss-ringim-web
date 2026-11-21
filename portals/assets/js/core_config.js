export const ENV = {
    isDev: window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1',
    get API_BASE_URL() {
        return this.isDev ? 'http://127.0.0.1:8080' : 'https://bailey-participated-buses-nonprofit.trycloudflare.com';
    }
};

export function getAuthHeaders() {
    return {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + (sessionStorage.getItem('guss_access_token') || '')
    };
}

export function getMultipartAuthHeaders() {
    return {
        'Authorization': 'Bearer ' + (sessionStorage.getItem('guss_access_token') || '')
    };
}