/**
 * YKS 2027 Kişisel Çalışma Programı - Durum Yönetimi (State Management)
 */

import { Config } from './config.js';
import { isValidISODate } from './scheduler.js';

export const TASK_METADATA_FIELDS = ['title', 'notes', 'task_type', 'duration_minutes', 'question_count', 'resource_url'];
const clone = value => JSON.parse(JSON.stringify(value));

export function validateBackup(input) {
    const data = typeof input === 'string' ? JSON.parse(input) : input;
    if (!data || typeof data !== 'object' || (data.format && data.format !== 'yks-planner') || (data.version && data.version !== 1)) throw new Error('Bu dosya desteklenen bir çalışma programı yedeği değil.');
    if (!data.program || !isValidISODate(data.program.start_date) || !isValidISODate(data.program.exam_date) || data.program.start_date > data.program.exam_date) throw new Error('Yedekteki program tarihleri geçersiz.');
    if (!Array.isArray(data.subjects) || !Array.isArray(data.scheduleItems) || data.subjects.length > 1000 || data.scheduleItems.length > 50000) throw new Error('Yedek ders ve çalışma listelerini içermeli.');
    const ids = new Set();
    const text = (value, limit = 500) => typeof value === 'string' ? value.slice(0, limit) : '';
    const url = value => /^https?:\/\//i.test(value || '') ? text(value, 2048) : '';
    const subjects = data.subjects.map(subject => {
        if (!subject || typeof subject.id !== 'string' || !subject.id || ids.has(subject.id) || !subject.name || !Number.isInteger(subject.total_days) || subject.total_days < 1 || subject.total_days > 100000) throw new Error('Yedekteki ders bilgileri geçersiz veya yineleniyor.');
        ids.add(subject.id);
        return { id: subject.id, name: text(subject.name), teacher: text(subject.teacher), exam_type: subject.exam_type === 'AYT' ? 'AYT' : 'TYT', total_days: subject.total_days, color_tag: text(subject.color_tag, 30), youtube_url: url(subject.youtube_url) };
    });
    const itemIds = new Set();
    const scheduleItems = data.scheduleItems.map(item => {
        if (!item || typeof item.id !== 'string' || !item.id || itemIds.has(item.id) || !isValidISODate(item.schedule_date) || (item.subject_id && !ids.has(item.subject_id))) throw new Error('Yedekteki çalışma kayıtları geçersiz veya eksik ders içeriyor.');
        itemIds.add(item.id);
        const boundedNumber = (v, max) => Number.isInteger(v) && v >= 0 && v <= max ? v : 0;
        return { id: item.id, subject_id: item.subject_id || '', schedule_date: item.schedule_date, day_number: Math.max(1, boundedNumber(item.day_number, 200000)), sort_order: boundedNumber(item.sort_order, 100000), completed: item.completed === true, completed_at: text(item.completed_at, 40) || null, created_at: text(item.created_at, 40), title: text(item.title), notes: text(item.notes, 10000), task_type: ['study','questions','review','exam','other'].includes(item.task_type) ? item.task_type : 'study', duration_minutes: boundedNumber(item.duration_minutes, 1440), question_count: boundedNumber(item.question_count, 10000), resource_url: url(item.resource_url) };
    });
    return { program: { exam_name: text(data.program.exam_name) || 'YKS 2027', start_date: data.program.start_date, exam_date: data.program.exam_date, include_exam_day: data.program.include_exam_day === true }, subjects, scheduleItems };
}

export const INITIAL_SEED_SUBJECTS = [
    {
        id: 'seed-tyt-mat',
        name: 'TYT Matematik',
        exam_type: 'TYT',
        teacher: 'Mert Hoca',
        total_days: 70,
        youtube_url: 'https://youtube.com/playlist?list=PLYh67QmhXVyA&si=s58ReKmh95L224A',
        color_tag: 'blue'
    },
    {
        id: 'seed-ayt-mat',
        name: 'AYT Matematik',
        exam_type: 'AYT',
        teacher: 'Mert Hoca',
        total_days: 90,
        youtube_url: 'https://youtube.com/playlist?list=PLxSXQclq3muCMAuYR8gEvoyhm4IJkZoq9&si=ZqqCYbdqiddSJcn-',
        color_tag: 'blue'
    },
    {
        id: 'seed-tyt-fiz',
        name: 'TYT Fizik',
        exam_type: 'TYT',
        teacher: 'Özcan Aykın',
        total_days: 55,
        youtube_url: 'https://youtube.com/playlist?list=PLhhV4F6NB0-uEPdZncMf_qb0tSKyBM-Lf&si=PJCXe98MLx1X5yYc',
        color_tag: 'purple'
    },
    {
        id: 'seed-ayt-fiz',
        name: 'AYT Fizik',
        exam_type: 'AYT',
        teacher: 'Özcan Aykın',
        total_days: 90,
        youtube_url: 'https://youtube.com/playlist?list=PLhhV4F6NB0-tU__PwCFhnaK-Gg_I3JG_4&si=kY_1p1zyTbIazkE7',
        color_tag: 'purple'
    },
    {
        id: 'seed-tyt-kim',
        name: 'TYT Kimya',
        exam_type: 'TYT',
        teacher: 'Benim Hocam / Görkem Şahin',
        total_days: 50,
        youtube_url: 'https://youtube.com/playlist?list=PLYLBaDBvPgfo&si=jlfavvBedk04pTR4',
        color_tag: 'emerald'
    },
    {
        id: 'seed-ayt-kim',
        name: 'AYT Kimya',
        exam_type: 'AYT',
        teacher: 'Benim Hocam / Görkem Şahin',
        total_days: 70,
        youtube_url: 'https://youtube.com/playlist?list=PL5kIOunpmSBOaWNDVqqwfRoEyfl9Vp7RC&si=6tuaJo7aKNfWoNf9',
        color_tag: 'emerald'
    },
    {
        id: 'seed-tyt-biy',
        name: 'TYT Biyoloji',
        exam_type: 'TYT',
        teacher: 'Dr Biyoloji',
        total_days: 30,
        youtube_url: 'https://youtube.com/playlist?list=PL87vBAl7SzvzqiYcuIxz7ptFykyE2qYS_&si=OvhiF7NWXYZFlgr9',
        color_tag: 'amber'
    },
    {
        id: 'seed-ayt-biy',
        name: 'AYT Biyoloji',
        exam_type: 'AYT',
        teacher: 'Dr Biyoloji',
        total_days: 50,
        youtube_url: 'https://youtube.com/playlist?list=PL87vBAl7Szvwq_wAtJgLdw7sVMFo9KIca&si=zI0o7inYjBI8aiDR',
        color_tag: 'amber'
    }
];

function getTodayISODate() {
    const d = new Date();
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

const LOCAL_STORAGE_KEY = 'yks2027_app_state_v2';
function initialSyncCode() {
    try { return Config.getSyncCode(); } catch { return 'yks2027'; }
}

export const AppState = {
    syncCode: initialSyncCode(),
    program: {
        id: 'default-program',
        sync_code: initialSyncCode(),
        exam_name: 'YKS 2027',
        exam_date: '2027-06-19', // YKS 2027 tahmini sınav tarihi
        start_date: getTodayISODate(),
        include_exam_day: false
    },
    subjects: clone(INITIAL_SEED_SUBJECTS),
    scheduleItems: [], // { id, program_id, sync_code, subject_id, schedule_date, day_number, sort_order, completed, completed_at }
    currentMode: 'use', // 'create' = Programı Oluştur, 'use' = Programı Kullan
    activeTab: 'schedule', // 'schedule' | 'subjects' | 'stats' | 'settings'
    useFilter: 'all', // 'all' | 'today' | 'upcoming' | 'uncompleted'
    currentUser: null,
    isSupabaseConnected: false,
    isSyncing: false,
    lastSyncTime: null,
    localSaveError: null,
    taskMetadataLocalOnly: false,
    listeners: new Set(),

    // State değişikliklerini dinleyen bileşenlere haber ver
    subscribe(callback) {
        this.listeners.add(callback);
        return () => this.listeners.delete(callback);
    },

    notify(eventType = 'change') {
        this.saveToLocal();
        this.listeners.forEach(cb => {
            try {
                cb(eventType, this);
            } catch (err) {
                console.error('State listener error:', err);
            }
        });
    },

    // Yeni senkronizasyon kodu ata
    setSyncCode(newCode) {
        const cleaned = Config.saveSyncCode(newCode);
        this.syncCode = cleaned;
        this.program.sync_code = cleaned;
        this.saveToLocal();
        this.notify('sync_code_changed');
    },

    // Yerel depolamaya kaydet (Offline veya anlık yedekleme için)
    saveToLocal() {
        try {
            const dataToSave = {
                syncCode: this.syncCode,
                program: this.program,
                subjects: this.subjects,
                scheduleItems: this.scheduleItems,
                currentMode: this.currentMode,
                taskMetadataLocalOnly: this.taskMetadataLocalOnly
            };
            localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(dataToSave));
            this.localSaveError = null;
            return true;
        } catch (err) {
            this.localSaveError = 'Tarayıcı kaydı yapılamadı. Çalışmalarını kaybetmemek için yedek indir.';
            console.warn('Could not save state to localStorage:', err);
            return false;
        }
    },

    // Yerel depolamadan yükle
    loadFromLocal() {
        try {
            const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
            if (raw) {
                const parsed = JSON.parse(raw);
                if (parsed.syncCode) {
                    this.syncCode = parsed.syncCode;
                }
                if (parsed.program) {
                    this.program = { ...this.program, ...parsed.program };
                }
                if (Array.isArray(parsed.subjects)) {
                    this.subjects = parsed.subjects;
                }
                if (Array.isArray(parsed.scheduleItems)) {
                    this.scheduleItems = parsed.scheduleItems;
                }
                if (parsed.currentMode) {
                    this.currentMode = parsed.currentMode;
                }
                this.taskMetadataLocalOnly = parsed.taskMetadataLocalOnly === true;
            }
        } catch (err) {
            console.warn('Could not load state from localStorage:', err);
        }
    },

    mergeRemoteItems(remoteItems) {
        const local = new Map(this.scheduleItems.map(item => [item.id, item]));
        return remoteItems.map(remote => {
            const prior = local.get(remote.id);
            const merged = { ...remote };
            if (prior && (!prior.sync_code || prior.sync_code === this.syncCode)) {
                for (const field of TASK_METADATA_FIELDS) {
                    if (remote[field] == null && field in prior) merged[field] = prior[field];
                }
            }
            return merged;
        });
    },

    createBackup() {
        return clone({ format: 'yks-planner', version: 1, exportedAt: new Date().toISOString(), program: this.program, subjects: this.subjects, scheduleItems: this.scheduleItems });
    },

    restoreBackup(input) {
        const restored = validateBackup(input);
        // Identity belongs to the current program, never to an imported backup.
        this.program = { ...this.program, ...restored.program };
        this.subjects = restored.subjects;
        this.scheduleItems = restored.scheduleItems.map(item => ({ ...item, program_id: this.program.id, sync_code: this.syncCode }));
        this.notify('backup_restored');
    },

    // Programı tamamen sıfırla
    resetProgram() {
        this.scheduleItems = [];
        this.notify('reset');
    }
};
