/**
 * YKS 2027 Kişisel Çalışma Programı - Supabase Entegrasyonu ve Veri Katmanı
 */

import { Config } from './config.js';

let supabaseClient = null;

export const SupabaseService = {
    // İstemciyi başlat
    initClient() {
        const url = Config.getSupabaseUrl();
        const key = Config.getSupabaseAnonKey();

        if (url && key && window.supabase) {
            try {
                supabaseClient = window.supabase.createClient(url, key);
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
    // AUTH İŞLEMLERİ
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

    // ----------------------------------------------------
    // PROGRAM CRUD
    // ----------------------------------------------------
    async loadUserProgram(userId) {
        const client = this.getClient();
        if (!client || !userId) return null;

        const { data, error } = await client
            .from('programs')
            .select('*')
            .eq('user_id', userId)
            .order('created_at', { ascending: true })
            .limit(1)
            .maybeSingle();

        if (error) {
            console.error('Error loading program:', error);
            return null;
        }
        return data;
    },

    async createOrUpdateProgram(programData, userId) {
        const client = this.getClient();
        if (!client || !userId) return null;

        const payload = {
            user_id: userId,
            exam_name: programData.exam_name || 'YKS 2027',
            exam_date: programData.exam_date || '2027-06-19',
            start_date: programData.start_date,
            include_exam_day: Boolean(programData.include_exam_day),
            updated_at: new Date().toISOString()
        };

        if (programData.id && !programData.id.startsWith('default-')) {
            payload.id = programData.id;
        }

        const { data, error } = await client
            .from('programs')
            .upsert(payload)
            .select()
            .single();

        if (error) throw error;
        return data;
    },

    // ----------------------------------------------------
    // DERSLER (SUBJECTS) CRUD
    // ----------------------------------------------------
    async loadSubjects(programId) {
        const client = this.getClient();
        if (!client || !programId) return [];

        const { data, error } = await client
            .from('subjects')
            .select('*')
            .eq('program_id', programId)
            .order('created_at', { ascending: true });

        if (error) {
            console.error('Error loading subjects:', error);
            return [];
        }
        return data || [];
    },

    async saveSubject(subject, programId, userId) {
        const client = this.getClient();
        if (!client || !userId) return subject;

        const payload = {
            program_id: programId,
            user_id: userId,
            name: subject.name,
            exam_type: subject.exam_type,
            teacher: subject.teacher,
            total_days: subject.total_days,
            youtube_url: subject.youtube_url || '',
            color_tag: subject.color_tag || 'blue',
            updated_at: new Date().toISOString()
        };

        if (subject.id && !subject.id.startsWith('seed-')) {
            payload.id = subject.id;
        }

        const { data, error } = await client
            .from('subjects')
            .upsert(payload)
            .select()
            .single();

        if (error) throw error;
        return data;
    },

    async deleteSubject(subjectId) {
        const client = this.getClient();
        if (!client) return;

        const { error } = await client
            .from('subjects')
            .delete()
            .eq('id', subjectId);

        if (error) throw error;
    },

    // ----------------------------------------------------
    // PROGRAMA EKLENEN ÇALIŞMALAR (SCHEDULE ITEMS) CRUD
    // ----------------------------------------------------
    async loadScheduleItems(programId) {
        const client = this.getClient();
        if (!client || !programId) return [];

        const { data, error } = await client
            .from('schedule_items')
            .select('*')
            .eq('program_id', programId)
            .order('schedule_date', { ascending: true })
            .order('sort_order', { ascending: true });

        if (error) {
            console.error('Error loading schedule items:', error);
            return [];
        }
        return data || [];
    },

    async addScheduleItem(item, programId, userId) {
        const client = this.getClient();
        if (!client || !userId) return item;

        const payload = {
            program_id: programId,
            user_id: userId,
            subject_id: item.subject_id,
            schedule_date: item.schedule_date,
            day_number: item.day_number,
            sort_order: item.sort_order ?? 0,
            completed: Boolean(item.completed),
            updated_at: new Date().toISOString()
        };

        const { data, error } = await client
            .from('schedule_items')
            .insert(payload)
            .select()
            .single();

        if (error) throw error;
        return data;
    },

    async deleteScheduleItem(itemId) {
        const client = this.getClient();
        if (!client) return;

        const { error } = await client
            .from('schedule_items')
            .delete()
            .eq('id', itemId);

        if (error) throw error;
    },

    async updateScheduleItemCompleted(itemId, completed) {
        const client = this.getClient();
        if (!client) return;

        const payload = {
            completed: Boolean(completed),
            completed_at: completed ? new Date().toISOString() : null,
            updated_at: new Date().toISOString()
        };

        const { error } = await client
            .from('schedule_items')
            .update(payload)
            .eq('id', itemId);

        if (error) throw error;
    },

    async resetEntireProgram(programId) {
        const client = this.getClient();
        if (!client || !programId) return;

        // Schedule items'ı temizle
        const { error: itemsError } = await client
            .from('schedule_items')
            .delete()
            .eq('program_id', programId);

        if (itemsError) throw itemsError;
    },

    // Supabase bağlantısını test et
    async testConnection(url, key) {
        if (!window.supabase) {
            return { success: false, message: 'Supabase kütüphanesi yüklenemedi.' };
        }
        try {
            const testClient = window.supabase.createClient(url, key);
            // programs tablosundan basit bir sorgu dene
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
