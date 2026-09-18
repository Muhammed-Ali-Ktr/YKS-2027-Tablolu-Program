/**
 * YKS 2027 Kişisel Çalışma Programı - Supabase Entegrasyonu ve Veri Katmanı (v2)
 * 
 * Bilgisayar ve telefon arasında şifresiz, anlık ve çift yönlü senkronizasyon sağlar.
 */

import { Config } from './config.js';

let supabaseClient = null;
let realtimeChannel = null;

function generateUniqueId(prefix = 'id') {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
        return crypto.randomUUID();
    }
    return `${prefix}-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

export const SupabaseService = {
    // İstemciyi başlat
    initClient() {
        const url = Config.getSupabaseUrl();
        const key = Config.getSupabaseAnonKey();

        if (url && key && window.supabase) {
            try {
                supabaseClient = window.supabase.createClient(url, key, {
                    auth: {
                        persistSession: true,
                        autoRefreshToken: true
                    },
                    realtime: {
                        params: {
                            eventsPerSecond: 10
                        }
                    }
                });
                return true;
            } catch (err) {
                console.error('Supabase client creation error:', err);
                supabaseClient = null;
                return false;
            }
        }
        supabaseClient = null;
        return false;
    },

    getClient() {
        if (!supabaseClient) {
            this.initClient();
        }
        return supabaseClient;
    },

    isConnected() {
        return Boolean(this.getClient());
    },

    // ----------------------------------------------------
    // SENKRONİZASYON & PROGRAM CRUD
    // ----------------------------------------------------
    async loadProgramBySyncCode(syncCode) {
        const client = this.getClient();
        if (!client || !syncCode) return null;

        const { data, error } = await client
            .from('programs')
            .select('*')
            .eq('sync_code', syncCode)
            .maybeSingle();

        if (error) {
            console.warn('Program yüklenirken uyarı:', error.message);
            return null;
        }
        return data;
    },

    async saveProgram(programData, syncCode, userId = null) {
        const client = this.getClient();
        if (!client || !syncCode) return null;

        const programId = (programData.id && !programData.id.startsWith('default-')) 
            ? programData.id 
            : generateUniqueId('prog');

        const payload = {
            id: programId,
            sync_code: syncCode,
            exam_name: programData.exam_name || 'YKS 2027',
            exam_date: programData.exam_date || '2027-06-19',
            start_date: programData.start_date,
            include_exam_day: Boolean(programData.include_exam_day),
            updated_at: new Date().toISOString()
        };

        if (userId) {
            payload.user_id = userId;
        }

        const { data, error } = await client
            .from('programs')
            .upsert(payload, { onConflict: 'sync_code' })
            .select()
            .single();

        if (error) {
            console.error('Program kaydedilirken hata:', error);
            throw error;
        }
        return data;
    },

    // ----------------------------------------------------
    // DERSLER (SUBJECTS) CRUD
    // ----------------------------------------------------
    async loadSubjectsBySyncCode(syncCode, programId = null) {
        const client = this.getClient();
        if (!client || !syncCode) return [];

        let query = client
            .from('subjects')
            .select('*')
            .eq('sync_code', syncCode)
            .order('created_at', { ascending: true });

        const { data, error } = await query;
        if (error) {
            console.warn('Dersler yüklenirken uyarı:', error.message);
            return [];
        }
        return data || [];
    },

    async saveSubject(subject, syncCode, programId, userId = null) {
        const client = this.getClient();
        if (!client || !syncCode) return subject;

        const subId = subject.id || generateUniqueId('sub');

        const payload = {
            id: subId,
            program_id: programId || 'default-program',
            sync_code: syncCode,
            name: subject.name,
            exam_type: subject.exam_type,
            teacher: subject.teacher || '',
            total_days: subject.total_days,
            youtube_url: subject.youtube_url || '',
            color_tag: subject.color_tag || 'blue',
            updated_at: new Date().toISOString()
        };

        if (userId) {
            payload.user_id = userId;
        }

        const { data, error } = await client
            .from('subjects')
            .upsert(payload)
            .select()
            .single();

        if (error) {
            console.error('Ders kaydedilirken hata:', error);
            throw error;
        }
        return data;
    },

    async deleteSubject(subjectId, syncCode) {
        const client = this.getClient();
        if (!client || !subjectId) return;

        let query = client.from('subjects').delete().eq('id', subjectId);
        if (syncCode) {
            query = query.eq('sync_code', syncCode);
        }

        const { error } = await query;
        if (error) throw error;
    },

    // ----------------------------------------------------
    // PROGRAMA EKLENEN ÇALIŞMALAR (SCHEDULE ITEMS) CRUD
    // ----------------------------------------------------
    async loadScheduleItemsBySyncCode(syncCode, programId = null) {
        const client = this.getClient();
        if (!client || !syncCode) return [];

        const { data, error } = await client
            .from('schedule_items')
            .select('*')
            .eq('sync_code', syncCode)
            .order('schedule_date', { ascending: true })
            .order('sort_order', { ascending: true });

        if (error) {
            console.warn('Takvim kayıtları yüklenirken uyarı:', error.message);
            return [];
        }
        return data || [];
    },

    async addScheduleItem(item, syncCode, programId, userId = null) {
        const client = this.getClient();
        if (!client || !syncCode) return item;

        const itemId = item.id || generateUniqueId('item');

        const payload = {
            id: itemId,
            program_id: programId || 'default-program',
            sync_code: syncCode,
            subject_id: item.subject_id,
            schedule_date: item.schedule_date,
            day_number: item.day_number,
            sort_order: item.sort_order ?? 0,
            completed: Boolean(item.completed),
            completed_at: item.completed ? new Date().toISOString() : null,
            updated_at: new Date().toISOString()
        };

        if (userId) {
            payload.user_id = userId;
        }

        const { data, error } = await client
            .from('schedule_items')
            .upsert(payload, { onConflict: 'sync_code,schedule_date,subject_id' })
            .select()
            .single();

        if (error) {
            console.error('Takvime ders eklenirken hata:', error);
            throw error;
        }
        return data;
    },

    async updateScheduleItemCompleted(itemId, completed, syncCode) {
        const client = this.getClient();
        if (!client || !itemId) return;

        const payload = {
            completed: Boolean(completed),
            completed_at: completed ? new Date().toISOString() : null,
            updated_at: new Date().toISOString()
        };

        let query = client.from('schedule_items').update(payload).eq('id', itemId);
        if (syncCode) {
            query = query.eq('sync_code', syncCode);
        }

        const { error } = await query;
        if (error) throw error;
    },

    async deleteScheduleItem(itemId, syncCode) {
        const client = this.getClient();
        if (!client || !itemId) return;

        let query = client.from('schedule_items').delete().eq('id', itemId);
        if (syncCode) {
            query = query.eq('sync_code', syncCode);
        }

        const { error } = await query;
        if (error) throw error;
    },

    async resetEntireProgram(syncCode, programId = null) {
        const client = this.getClient();
        if (!client || !syncCode) return;

        const { error } = await client
            .from('schedule_items')
            .delete()
            .eq('sync_code', syncCode);

        if (error) throw error;
    },

    // ----------------------------------------------------
    // CANLI REALTIME YAYIN ABONELİĞİ (PC <-> TELEFON ANLIK GÜNCELLEME)
    // ----------------------------------------------------
    subscribeToRealtime(syncCode, onRemoteChange) {
        const client = this.getClient();
        if (!client || !syncCode) return () => {};

        // Varsa eski kanaldan ayrıl
        if (realtimeChannel) {
            try {
                client.removeChannel(realtimeChannel);
            } catch (e) {}
            realtimeChannel = null;
        }

        const channelName = `realtime-sync-${syncCode}`;
        realtimeChannel = client
            .channel(channelName)
            .on(
                'postgres_changes',
                {
                    event: '*',
                    schema: 'public',
                    table: 'schedule_items',
                    filter: `sync_code=eq.${syncCode}`
                },
                (payload) => {
                    if (onRemoteChange) onRemoteChange('schedule_items', payload);
                }
            )
            .on(
                'postgres_changes',
                {
                    event: '*',
                    schema: 'public',
                    table: 'subjects',
                    filter: `sync_code=eq.${syncCode}`
                },
                (payload) => {
                    if (onRemoteChange) onRemoteChange('subjects', payload);
                }
            )
            .on(
                'postgres_changes',
                {
                    event: '*',
                    schema: 'public',
                    table: 'programs',
                    filter: `sync_code=eq.${syncCode}`
                },
                (payload) => {
                    if (onRemoteChange) onRemoteChange('programs', payload);
                }
            )
            .subscribe((status) => {
                if (status === 'SUBSCRIBED') {
                    console.log(`[Realtime] ${syncCode} kanalı başarıyla bağlandı.`);
                }
            });

        return () => {
            if (realtimeChannel) {
                client.removeChannel(realtimeChannel);
                realtimeChannel = null;
            }
        };
    },

    // ----------------------------------------------------
    // AUTH İŞLEMLERİ (İSTEĞE BAĞLI ÖZEL HESAP KULLANIMI)
    // ----------------------------------------------------
    async signUp(email, password) {
        const client = this.getClient();
        if (!client) throw new Error('Supabase yapılandırılmamış.');
        const { data, error } = await client.auth.signUp({ email, password });
        if (error) throw error;
        return data;
    },

    async signIn(email, password) {
        const client = this.getClient();
        if (!client) throw new Error('Supabase yapılandırılmamış.');
        const { data, error } = await client.auth.signInWithPassword({ email, password });
        if (error) throw error;
        return data;
    },

    async signOut() {
        const client = this.getClient();
        if (!client) return;
        const { error } = await client.auth.signOut();
        if (error) throw error;
    },

    async getCurrentUser() {
        const client = this.getClient();
        if (!client) return null;
        try {
            const { data: { user } } = await client.auth.getUser();
            return user;
        } catch {
            return null;
        }
    },

    onAuthStateChange(callback) {
        const client = this.getClient();
        if (!client) return () => {};
        const { data: { subscription } } = client.auth.onAuthStateChange((event, session) => {
            callback(event, session);
        });
        return () => subscription.unsubscribe();
    },

    // Bağlantı testi
    async testConnection(url, key) {
        if (!window.supabase) {
            return { success: false, message: 'Supabase kütüphanesi yüklenemedi.' };
        }
        try {
            const testClient = window.supabase.createClient(url, key);
            const { error } = await testClient.from('programs').select('id').limit(1);
            if (error && error.code !== 'PGRST116') {
                return { success: false, message: error.message };
            }
            return { success: true, message: 'Supabase bağlantısı başarılı!' };
        } catch (err) {
            return { success: false, message: err.message || 'Bağlantı kurulamadı.' };
        }
    }
};
