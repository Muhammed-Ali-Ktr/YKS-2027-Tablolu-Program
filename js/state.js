/**
 * YKS 2027 Kişisel Çalışma Programı - Durum Yönetimi (State Management)
 */

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

const LOCAL_STORAGE_KEY = 'yks2027_app_state_v1';

export const AppState = {
    program: {
        id: 'default-program',
        exam_name: 'YKS 2027',
        exam_date: '2027-06-19', // YKS 2027 tahmini sınav tarihi
        start_date: getTodayISODate(),
        include_exam_day: false
    },
    subjects: [...INITIAL_SEED_SUBJECTS],
    scheduleItems: [], // { id, program_id, subject_id, schedule_date, day_number, sort_order, completed, completed_at }
    currentMode: 'create', // 'create' = Programı Oluştur, 'use' = Programı Kullan
    activeTab: 'schedule', // 'schedule' | 'subjects' | 'stats' | 'settings'
    useFilter: 'all', // 'all' | 'today' | 'upcoming' | 'uncompleted'
    currentUser: null,
    isSupabaseConnected: false,
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

    // Yerel depolamaya kaydet (Offline veya bağımsız çalışma için yedekleme)
    saveToLocal() {
        try {
            const dataToSave = {
                program: this.program,
                subjects: this.subjects,
                scheduleItems: this.scheduleItems,
                currentMode: this.currentMode
            };
            localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(dataToSave));
        } catch (err) {
            console.warn('Could not save state to localStorage:', err);
        }
    },

    // Yerel depolamadan yükle
    loadFromLocal() {
        try {
            const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
            if (raw) {
                const parsed = JSON.parse(raw);
                if (parsed.program) this.program = { ...this.program, ...parsed.program };
                if (Array.isArray(parsed.subjects) && parsed.subjects.length > 0) {
                    this.subjects = parsed.subjects;
                }
                if (Array.isArray(parsed.scheduleItems)) {
                    this.scheduleItems = parsed.scheduleItems;
                }
                if (parsed.currentMode) {
                    this.currentMode = parsed.currentMode;
                }
            }
        } catch (err) {
            console.warn('Could not load state from localStorage:', err);
        }
    },

    // Programı tamamen sıfırla
    resetProgram() {
        this.scheduleItems = [];
        this.subjects = [...INITIAL_SEED_SUBJECTS];
        this.program.start_date = getTodayISODate();
        this.program.exam_date = '2027-06-19';
        this.program.include_exam_day = false;
        this.notify('reset');
    }
};
