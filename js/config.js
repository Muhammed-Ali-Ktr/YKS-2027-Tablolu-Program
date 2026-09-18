/**
 * YKS 2027 Kişisel Çalışma Programı - Konfigürasyon
 * 
 * Supabase bağlantı bilgilerinizi buraya girebilir veya doğrudan
 * web sitesi arayüzündeki Ayarlar menüsünden güvenle kaydedebilirsiniz.
 * Ayarlar menüsünden girilen bilgiler tarayıcınızın yerel hafızasında saklanır.
 */

const STORAGE_KEY_URL = 'yks2027_supabase_url';
const STORAGE_KEY_KEY = 'yks2027_supabase_anon_key';

// İsteğe bağlı varsayılan anahtarlar (buraya yazabilir ya da boş bırakıp arayüzden girebilirsiniz)
const DEFAULT_SUPABASE_URL = 'https://imepwmcvzkezyruayoxe.supabase.co';
const DEFAULT_SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImltZXB3bWN2emtlenlydWF5b3hlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODk3NDM2MzcsImV4cCI6MjEwNTMxOTYzN30.698KQTM-YE5hEsmRXFpXTAcBAfRQvyoovEq_x3qgie4';

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
    }
};
