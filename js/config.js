/**
 * YKS 2027 Kişisel Çalışma Programı - Konfigürasyon
 * 
 * Supabase bağlantı ve cihaz senkronizasyon bilgileri.
 */

const STORAGE_KEY_URL = 'yks2027_supabase_url';
const STORAGE_KEY_KEY = 'yks2027_supabase_anon_key';
const STORAGE_KEY_SYNC = 'yks2027_sync_code';

// Varsayılan Supabase anahtarları
const DEFAULT_SUPABASE_URL = 'https://imepwmcvzkezyruayoxe.supabase.co';
const DEFAULT_SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImltZXB3bWN2emtlenlydWF5b3hlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODk3NDM2MzcsImV4cCI6MjEwNTMxOTYzN30.698KQTM-YE5hEsmRXFpXTAcBAfRQvyoovEq_x3qgie4';
const DEFAULT_SYNC_CODE = 'yks2027';

export const Config = {
    // Supabase URL bilgisini getir
    getSupabaseUrl() {
        return localStorage.getItem(STORAGE_KEY_URL) || DEFAULT_SUPABASE_URL;
    },

    // Supabase Anon Key bilgisini getir
    getSupabaseAnonKey() {
        return localStorage.getItem(STORAGE_KEY_KEY) || DEFAULT_SUPABASE_ANON_KEY;
    },

    // Arayüz üzerinden yeni anahtarları kaydet
    saveCredentials(url, anonKey) {
        if (url) localStorage.setItem(STORAGE_KEY_URL, url.trim());
        else localStorage.removeItem(STORAGE_KEY_URL);

        if (anonKey) localStorage.setItem(STORAGE_KEY_KEY, anonKey.trim());
        else localStorage.removeItem(STORAGE_KEY_KEY);
    },

    // Yapılandırma tanımlı mı?
    isConfigured() {
        const url = this.getSupabaseUrl();
        const key = this.getSupabaseAnonKey();
        return Boolean(url && key && url.startsWith('http'));
    },

    // Yapılandırmayı temizle
    clearCredentials() {
        localStorage.removeItem(STORAGE_KEY_URL);
        localStorage.removeItem(STORAGE_KEY_KEY);
    },

    // Senkronizasyon (Eşleştirme) Kodunu Getir
    getSyncCode() {
        // Önce URL parametresine bak: ?sync=KOD
        try {
            const params = new URLSearchParams(window.location.search);
            const urlCode = params.get('sync');
            if (urlCode && urlCode.trim()) {
                const cleaned = urlCode.trim().toLowerCase();
                localStorage.setItem(STORAGE_KEY_SYNC, cleaned);
                return cleaned;
            }
        } catch (e) {
            // Ortamda window bulunmuyorsa (ör. node test ortamı)
        }

        const stored = typeof localStorage !== 'undefined' ? localStorage.getItem(STORAGE_KEY_SYNC) : null;
        return (stored && stored.trim()) ? stored.trim().toLowerCase() : DEFAULT_SYNC_CODE;
    },

    // Yeni senkronizasyon kodu kaydet
    saveSyncCode(code) {
        const cleanCode = (code || DEFAULT_SYNC_CODE).trim().toLowerCase();
        if (typeof localStorage !== 'undefined') {
            localStorage.setItem(STORAGE_KEY_SYNC, cleanCode);
        }
        return cleanCode;
    },

    // Telefonla eşleşme için doğrudan bağlantı URL'sini üret
    getShareUrl(syncCode) {
        const code = syncCode || this.getSyncCode();
        try {
            const base = window.location.origin + window.location.pathname;
            return `${base}?sync=${encodeURIComponent(code)}`;
        } catch {
            return `?sync=${encodeURIComponent(code)}`;
        }
    }
};
