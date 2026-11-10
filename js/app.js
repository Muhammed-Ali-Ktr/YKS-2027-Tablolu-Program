/**
 * YKS 2027 Kişisel Çalışma Programı - Ana Uygulama Mantığı (App Controller)
 */

import { AppState } from './state.js';
import { requireAccount } from './account.js';
import { Config } from './config.js';
import { SupabaseService } from './supabase.js';
import { UI } from './ui.js';
import { initPlanner } from './planner.js';

// DOM Elements
let currentEditingSubjectId = null;
let unsubscribeRealtime = null;
let pendingSettings = { subjects: [], program: false };
let settingsFlush = null;
const settingsQueueKey = () => `yks2027_pending_settings_${AppState.syncCode}`;
function persistSettingsQueue() {
    try { localStorage.setItem(settingsQueueKey(), JSON.stringify(pendingSettings)); }
    catch { UI.showToast('Bekleyen kayıtlar saklanamadı. Lütfen program yedeği alın.', 'warning'); }
}
function queueSettingsForSync() {
    pendingSettings.program = true;
    pendingSettings.subjects = [...new Set([...pendingSettings.subjects, ...AppState.subjects.map(subject => subject.id)])];
    AppState.saveToLocal();
    persistSettingsQueue();
}
function flushPendingSettings() {
    if (settingsFlush) return settingsFlush;
    settingsFlush = writePendingSettings().finally(() => { settingsFlush = null; });
    return settingsFlush;
}
async function writePendingSettings() {
    if (pendingSettings.program) {
        const version = JSON.stringify(AppState.program);
        const saved = await SupabaseService.saveProgram({ ...AppState.program }, AppState.syncCode, AppState.currentUser?.id);
        const unchanged = JSON.stringify(AppState.program) === version;
        if (saved?.id) AppState.program.id = saved.id;
        if (unchanged) pendingSettings.program = false;
        persistSettingsQueue();
    }
    for (const id of [...pendingSettings.subjects]) {
        const subject = AppState.subjects.find(s => s.id === id);
        const version = JSON.stringify(subject);
        if (subject) await SupabaseService.saveSubject({ ...subject }, AppState.syncCode, AppState.program.id, AppState.currentUser?.id);
        if (JSON.stringify(AppState.subjects.find(s => s.id === id)) === version) {
            pendingSettings.subjects = pendingSettings.subjects.filter(value => value !== id);
        }
        persistSettingsQueue();
    }
    persistSettingsQueue();
}

document.addEventListener('DOMContentLoaded', async () => {
    const user = await requireAccount();
    AppState.currentUser = user;
    AppState.syncCode = user.id;
    AppState.program.sync_code = user.id;
    AppState.subjects = AppState.subjects.map(subject => ({...subject, id: user.id + '-' + subject.id}));
    AppState.loadFromLocal();
    AppState.syncCode = user.id;
    AppState.program.sync_code = user.id;
    SupabaseService.onAuthStateChange((event, session) => {
        if (!session || session.user.id !== user.id) location.reload();
    });
    try {
        const saved = JSON.parse(localStorage.getItem(settingsQueueKey()) || 'null');
        if (saved && Array.isArray(saved.subjects)) pendingSettings = saved;
    } catch { /* Keep malformed optional queue from blocking local access. */ }
    AppState.flushPendingSettings = flushPendingSettings;
    AppState.queueSettingsForSync = queueSettingsForSync;

    // The local planner is usable before any network request finishes.
    AppState.subscribe(() => {
        UI.updateHeaderInfo();
        if (AppState.activeTab === 'schedule') UI.renderSchedule();
        else if (AppState.activeTab === 'subjects') UI.renderSubjects();
        else if (AppState.activeTab === 'stats') UI.renderStats();
        // Do not replace unsaved settings form inputs during background sync.
    });
    bindEvents();
    initPlanner();
    UI.updateHeaderInfo();
    switchTab('schedule');

    // 2. Supabase istemcisini başlat
    const isClientReady = SupabaseService.initClient();
    AppState.isSupabaseConnected = false;

    if (isClientReady) {
        // Varsa giriş yapmış kullanıcı kontrolü
        try {
            const user = await SupabaseService.getCurrentUser();
            AppState.currentUser = user;
        } catch (err) {
            console.warn('Auth check error:', err);
        }

        // Supabase Realtime aboneliğini başlat
        setupRealtimeSubscription(AppState.syncCode);

        // Bulut verilerini doğrudan yükle ve senkronize et
        await syncWithSupabase(AppState.syncCode);

        // Auth dinleyici (Opsiyonel kullanıcı giriş/çıkışları için)
        SupabaseService.onAuthStateChange(async (event, session) => {
            AppState.currentUser = session?.user || null;
            UI.updateHeaderInfo();
        });
    }

});

/**
 * Realtime senkronizasyon kanalını kur
 */
function setupRealtimeSubscription(syncCode) {
    if (unsubscribeRealtime) {
        unsubscribeRealtime();
        unsubscribeRealtime = null;
    }
    unsubscribeRealtime = SupabaseService.subscribeToRealtime(syncCode, handleRemoteChange);
}

/**
 * Supabase bulut verileri ile senkronizasyon
 */
async function syncWithSupabase(syncCode) {
    if (!SupabaseService.isConnected() || AppState.isSyncing) return false;

    AppState.isSyncing = true;
    UI.updateHeaderInfo();

    try {
        let program = await SupabaseService.loadProgramBySyncCode(syncCode);
        if (!program) {
            // İlk kez bu sync_code için bulutta program kaydı aç
            program = await SupabaseService.saveProgram(AppState.program, syncCode, AppState.currentUser?.id);
            AppState.program = pendingSettings.program ? { ...program, ...AppState.program, id: program.id } : { ...AppState.program, ...program };
            // Varsayılan dersleri Supabase'e yükle
            for (const sub of AppState.subjects) {
                await SupabaseService.saveSubject(sub, syncCode, program.id, AppState.currentUser?.id);
            }
            // Upload existing local work as well as the subject catalogue.
            for (const item of AppState.scheduleItems) {
                if (!AppState.pendingItemIds?.has(item.id)) {
                    await SupabaseService.addScheduleItem(item, syncCode, program.id, AppState.currentUser?.id);
                }
            }
        } else {
            AppState.program.id = program.id;
            const hadPendingProgram = pendingSettings.program;
            await flushPendingSettings();
            if (hadPendingProgram) program = AppState.program;
            const subjects = await SupabaseService.loadSubjectsBySyncCode(syncCode, program.id);
            const items = await SupabaseService.loadScheduleItemsBySyncCode(syncCode, program.id);
            if (syncCode !== AppState.syncCode) return false;
            const pending = AppState.pendingItemIds || new Set();
            const remoteIds = new Set((items || []).map(item => item.id));
            const localOnly = AppState.scheduleItems.filter(item => !remoteIds.has(item.id) && !pending.has(item.id));
            const mergedItems = [
                ...(items || []).filter(item => !pending.has(item.id)),
                ...AppState.scheduleItems.filter(item => pending.has(item.id)),
                ...localOnly
            ];
            AppState.program = pendingSettings.program ? AppState.program : { ...AppState.program, ...program };
            const remoteSubjects = subjects || [];
            const remoteSubjectIds = new Set(remoteSubjects.map(subject => subject.id));
            AppState.subjects = [...remoteSubjects.filter(subject => !pendingSettings.subjects.includes(subject.id)), ...AppState.subjects.filter(subject => !remoteSubjectIds.has(subject.id) || pendingSettings.subjects.includes(subject.id))];
            AppState.scheduleItems = AppState.mergeRemoteItems(mergedItems);
            if (localOnly.length) UI.showToast(`${localOnly.length} yerel çalışma bulutta bulunamadı; bu cihazda korundu. Yedek alabilirsiniz.`, 'warning', 6500);
        }

        AppState.isSupabaseConnected = true;
        AppState.syncError = null;
        AppState.lastSyncTime = new Date();
        AppState.isSyncing = false;
        AppState.notify('supabase_synced');
        UI.showToast(`Bulut senkronize: "${syncCode.toUpperCase()}"`, 'success');
        return true;
    } catch (err) {
        console.error('Supabase sync error:', err);
        AppState.isSyncing = false;
        AppState.syncError = 'Buluta bağlanılamadı. Yerel kayıtlarınız korunuyor.';
        AppState.isSupabaseConnected = false;
        UI.updateHeaderInfo();
        UI.showToast('Bulut senkronizasyonu sırasında bağlantı hatası oluştu.', 'warning');
        return false;
    } finally {
        AppState.isSyncing = false;
        UI.updateHeaderInfo();
    }
}

/**
 * Diğer cihazdan (telefon ya da bilgisayar) gelen canlı değişiklikleri işle
 */
function handleRemoteChange(tableName, payload) {
    if (tableName === 'schedule_items') {
        const { eventType, new: newRow, old: oldRow } = payload;
        if (AppState.pendingItemIds?.has(newRow?.id || oldRow?.id)) return;
        if (eventType === 'INSERT') {
            const exists = AppState.scheduleItems.some(i => i.id === newRow.id);
            if (!exists) {
                AppState.scheduleItems.push(newRow);
                AppState.notify('remote_item_added');
                UI.showToast('Diğer cihazdan takvime ders eklendi! 📅', 'info', 2500);
            }
        } else if (eventType === 'UPDATE') {
            const item = AppState.scheduleItems.find(i => i.id === newRow.id);
            if (item) {
                const statusChanged = item.completed !== newRow.completed;
                Object.assign(item, newRow);
                AppState.notify('remote_item_updated');
                if (statusChanged) {
                    UI.showToast(newRow.completed ? 'Diğer cihazda ders tamamlandı! 🎉' : 'Ders işareti güncellendi.', 'info', 2500);
                }
            }
        } else if (eventType === 'DELETE') {
            const idx = AppState.scheduleItems.findIndex(i => i.id === oldRow.id);
            if (idx !== -1) {
                AppState.scheduleItems.splice(idx, 1);
                AppState.notify('remote_item_deleted');
                UI.showToast('Diğer cihazdan bir ders silindi.', 'info', 2500);
            }
        }
    } else if (tableName === 'subjects') {
        const { eventType, new: newRow, old: oldRow } = payload;
        if (pendingSettings.subjects.includes(newRow?.id || oldRow?.id)) return;
        if (eventType === 'INSERT') {
            if (!AppState.subjects.some(s => s.id === newRow.id)) {
                AppState.subjects.push(newRow);
                AppState.notify('remote_subject_added');
            }
        } else if (eventType === 'UPDATE') {
            const idx = AppState.subjects.findIndex(s => s.id === newRow.id);
            if (idx !== -1) {
                AppState.subjects[idx] = newRow;
                AppState.notify('remote_subject_updated');
            }
        } else if (eventType === 'DELETE') {
            if (AppState.scheduleItems.some(item => item.subject_id === oldRow.id && AppState.pendingItemIds?.has(item.id))) {
                pendingSettings.subjects = [...new Set([...pendingSettings.subjects, oldRow.id])];
                persistSettingsQueue();
                UI.showToast('Diğer cihazda silinen derse ait bekleyen çalışmalar bu cihazda korundu.', 'warning');
                return;
            }
            AppState.subjects = AppState.subjects.filter(s => s.id !== oldRow.id);
            AppState.scheduleItems = AppState.scheduleItems.filter(i => i.subject_id !== oldRow.id);
            AppState.notify('remote_subject_deleted');
        }
    } else if (tableName === 'programs') {
        if (payload.new && !pendingSettings.program) {
            AppState.program = { ...AppState.program, ...payload.new };
            AppState.notify('remote_program_updated');
        }
    }
}

/**
 * Sekme Değiştirme
 */
function switchTab(tabId) {
    AppState.activeTab = tabId;

    // Sidebar aktif sekme işaretleme
    document.querySelectorAll('.nav-item').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.tab === tabId);
    });

    // Görünüm bölümlerini göster/gizle
    document.querySelectorAll('.view-section').forEach(section => {
        section.classList.toggle('active', section.id === `view-${tabId}`);
    });

    // İlgili görünümü render et
    if (tabId === 'schedule') {
        UI.renderSchedule();
    } else if (tabId === 'subjects') {
        UI.renderSubjects();
    } else if (tabId === 'stats') {
        UI.renderStats();
    } else if (tabId === 'settings') {
        UI.populateSettings();
    }

    // Mobil menü açıksa kapat
    const sidebar = document.getElementById('appSidebar');
    const backdrop = document.getElementById('sidebarBackdrop');
    if (sidebar) sidebar.classList.remove('mobile-open');
    if (backdrop) backdrop.classList.remove('active');
}

/**
 * Olay Dinleyicileri (Event Listeners)
 */
function bindEvents() {
    // Sekme Değiştirme Butonları
    document.querySelectorAll('.nav-item').forEach(btn => {
        btn.addEventListener('click', () => {
            const tab = btn.dataset.tab;
            if (tab) switchTab(tab);
        });
    });

    // Mod Değiştirme: "Programı Oluştur" vs "Programı Kullan"
    const btnCreate = document.getElementById('modeBtnCreate');
    const btnUse = document.getElementById('modeBtnUse');

    if (btnCreate) {
        btnCreate.addEventListener('click', () => {
            AppState.currentMode = 'create';
            AppState.notify('mode_changed');
            UI.showToast('Düzenleme Modu: Ders ekleyebilir, silebilir ve programı düzenleyebilirsiniz.', 'info');
        });
    }

    if (btnUse) {
        btnUse.addEventListener('click', () => {
            AppState.currentMode = 'use';
            AppState.notify('mode_changed');
            UI.showToast('Çalışma Modu: Tamamladığınız dersleri işaretleyerek ilerlemenizi takip edin.', 'info');
        });
    }

    // Programı Kullan Filtreleri
    document.querySelectorAll('.js-use-filter').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.js-use-filter').forEach(b => b.classList.remove('btn-primary'));
            document.querySelectorAll('.js-use-filter').forEach(b => b.classList.add('btn-secondary'));
            btn.classList.remove('btn-secondary');
            btn.classList.add('btn-primary');

            AppState.useFilter = btn.dataset.filter || 'all';
            UI.renderSchedule();
        });
    });

    // Mobil Menü Butonu
    const mobileMenuBtn = document.getElementById('mobileMenuBtn');
    const sidebar = document.getElementById('appSidebar');
    const backdrop = document.getElementById('sidebarBackdrop');

    if (mobileMenuBtn && sidebar && backdrop) {
        mobileMenuBtn.addEventListener('click', () => {
            sidebar.classList.toggle('mobile-open');
            backdrop.classList.toggle('active');
        });

        backdrop.addEventListener('click', () => {
            sidebar.classList.remove('mobile-open');
            backdrop.classList.remove('active');
        });
    }

    // Modal Kapatma Butonları
    document.querySelectorAll('.js-close-modal').forEach(btn => {
        btn.addEventListener('click', () => {
            UI.closeAllModals();
        });
    });

    document.querySelectorAll('.modal-overlay').forEach(overlay => {
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) {
                UI.closeAllModals();
            }
        });
    });

    // ----------------------------------------------------
    // DERSLER KATALOĞU (SUBJECTS) İŞLEMLERİ
    // ----------------------------------------------------
    const btnOpenNewSubject = document.getElementById('btnOpenNewSubject');
    if (btnOpenNewSubject) {
        btnOpenNewSubject.addEventListener('click', () => {
            currentEditingSubjectId = null;
            document.getElementById('subjectModalTitle').textContent = 'Yeni Ders Tanımla';
            document.getElementById('subjectForm').reset();
            document.getElementById('subjectTotalDays').value = '50';
            UI.openModal('subjectFormModal');
        });
    }

    const subjectsGrid = document.getElementById('subjectsGridContainer');
    if (subjectsGrid) {
        subjectsGrid.addEventListener('click', async (e) => {
            // Düzenle
            const editBtn = e.target.closest('.js-edit-subject');
            if (editBtn) {
                const subId = editBtn.dataset.subjectId;
                const subject = AppState.subjects.find(s => s.id === subId);
                if (subject) {
                    currentEditingSubjectId = subId;
                    document.getElementById('subjectModalTitle').textContent = 'Dersi Düzenle';
                    document.getElementById('subjectName').value = subject.name;
                    document.getElementById('subjectExamType').value = subject.exam_type;
                    document.getElementById('subjectTeacher').value = subject.teacher || '';
                    document.getElementById('subjectTotalDays').value = subject.total_days;
                    document.getElementById('subjectYoutube').value = subject.youtube_url || '';
                    UI.openModal('subjectFormModal');
                }
                return;
            }

            // Sil
            const deleteBtn = e.target.closest('.js-delete-subject');
            if (deleteBtn) {
                const subId = deleteBtn.dataset.subjectId;
                const subject = AppState.subjects.find(s => s.id === subId);
                if (!subject) return;

                const usageCount = AppState.scheduleItems.filter(i => i.subject_id === subId).length;
                const confirmMsg = usageCount > 0 
                    ? `"${subject.name}" dersi programda ${usageCount} kez kullanılmış. Bu dersi ve programdaki tüm kayıtlarını silmek istediğinize emin misiniz?`
                    : `"${subject.name}" dersini silmek istediğinize emin misiniz?`;

                if (confirm(confirmMsg)) {
                    if (Config.isConfigured() && !AppState.isSupabaseConnected) {
                        UI.showToast('Dersi tüm kayıtlardan silmek için önce bulut bağlantısını yenileyin.', 'warning');
                        return;
                    }
                    deleteBtn.disabled = true;
                    try {
                        if (AppState.isSupabaseConnected) await SupabaseService.deleteSubject(subId, AppState.syncCode);
                    } catch (err) {
                        deleteBtn.disabled = false;
                        UI.showToast('Ders silinemedi. Kayıtlarınız korundu; tekrar deneyebilirsiniz.', 'error');
                        return;
                    }
                    AppState.scheduleItems = AppState.scheduleItems.filter(i => i.subject_id !== subId);
                    AppState.subjects = AppState.subjects.filter(s => s.id !== subId);
                    AppState.notify('subject_deleted');
                    UI.showToast(`"${subject.name}" dersi silindi.`, 'info');
                }
                return;
            }
        });
    }

    // Ders Formu Submit (Yeni Ders / Düzenleme)
    const subjectForm = document.getElementById('subjectForm');
    if (subjectForm) {
        subjectForm.addEventListener('submit', async (e) => {
            e.preventDefault();

            const name = document.getElementById('subjectName').value.trim();
            const examType = document.getElementById('subjectExamType').value;
            const teacher = document.getElementById('subjectTeacher').value.trim();
            const totalDays = parseInt(document.getElementById('subjectTotalDays').value, 10);
            const youtube = document.getElementById('subjectYoutube').value.trim();

            if (!name) {
                UI.showToast('Lütfen ders adını girin.', 'warning');
                return;
            }

            if (isNaN(totalDays) || totalDays <= 0) {
                UI.showToast('Toplam gün sayısı 0\'dan büyük bir sayı olmalıdır.', 'warning');
                return;
            }

            if (youtube && !/^https?:\/\//i.test(youtube)) {
                UI.showToast('Lütfen geçerli bir bağlantı adresi (http:// veya https://) girin.', 'warning');
                return;
            }

            const original = AppState.subjects.find(s => s.id === currentEditingSubjectId);
            const used = original ? AppState.scheduleItems.filter(item => item.subject_id === original.id).length : 0;
            if (totalDays < used) {
                UI.showToast(`Bu ders için ${used} çalışma var. Bölüm sayısı en az ${used} olmalı.`, 'warning');
                return;
            }
            const subject = {
                ...(original || {}),
                id: original?.id || crypto.randomUUID(),
                name, exam_type: examType, teacher, total_days: totalDays,
                youtube_url: youtube, color_tag: original?.color_tag || 'blue'
            };
            const submit = subjectForm.querySelector('[type="submit"]');
            submit.disabled = true;
            try {
                if (AppState.isSupabaseConnected) {
                    const saved = await SupabaseService.saveSubject(subject, AppState.syncCode, AppState.program.id, AppState.currentUser?.id);
                    if (saved) Object.assign(subject, saved);
                }
                const index = AppState.subjects.findIndex(s => s.id === subject.id);
                if (index >= 0) AppState.subjects[index] = subject;
                else AppState.subjects.push(subject);
                if (!AppState.isSupabaseConnected) {
                    pendingSettings.subjects = [...new Set([...pendingSettings.subjects, subject.id])];
                    persistSettingsQueue();
                }
            } catch (err) {
                UI.showToast('Ders buluta kaydedilemedi. Formunuz açık; tekrar deneyebilirsiniz.', 'error');
                return;
            } finally {
                submit.disabled = false;
            }
            UI.showToast(AppState.isSupabaseConnected ? 'Ders kaydedildi.' : 'Ders bu cihaza kaydedildi. Bağlantı yenilendiğinde buluta aktarılacak.', AppState.isSupabaseConnected ? 'success' : 'info');
            UI.closeModal('subjectFormModal');
            AppState.notify('subjects_changed');
        });
    }

    // ----------------------------------------------------
    // AYARLAR VE SIFIRLAMA
    // ----------------------------------------------------
    const settingsForm = document.getElementById('settingsDatesForm');
    if (settingsForm) {
        settingsForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const examDate = document.getElementById('settingExamDate').value;
            const startDate = document.getElementById('settingStartDate').value;
            const includeExamDay = document.getElementById('settingIncludeExamDay').checked;

            if (!examDate || !startDate) {
                UI.showToast('Lütfen geçerli tarihler seçin.', 'warning');
                return;
            }

            if (startDate > examDate) {
                UI.showToast('Başlangıç tarihi sınav tarihinden sonra olamaz.', 'warning');
                return;
            }
            const outsideCount = AppState.scheduleItems.filter(item => item.schedule_date < startDate || item.schedule_date > examDate || (!includeExamDay && item.schedule_date === examDate)).length;
            if (outsideCount && !confirm(`${outsideCount} çalışma seçtiğiniz tarih aralığının dışında kalıyor. Kayıtlar silinmeyecek; tarihleri değiştirmek istiyor musunuz?`)) return;
            const nextProgram = { ...AppState.program, exam_date: examDate, start_date: startDate, include_exam_day: includeExamDay };
            const submit = settingsForm.querySelector('[type="submit"]');
            submit.disabled = true;
            try {
                if (AppState.isSupabaseConnected) await SupabaseService.saveProgram(nextProgram, AppState.syncCode, AppState.currentUser?.id);
                AppState.program = nextProgram;
                if (!AppState.isSupabaseConnected) {
                    pendingSettings.program = true;
                    persistSettingsQueue();
                }
            } catch (err) {
                UI.showToast('Tarihler buluta kaydedilemedi. Önceki tarihler korundu.', 'error');
                return;
            } finally {
                submit.disabled = false;
            }

            AppState.notify('settings_saved');
            UI.showToast(AppState.isSupabaseConnected ? 'Tarihler kaydedildi ve takvim güncellendi.' : 'Tarihler bu cihazda kaydedildi. Bağlantı yenilendiğinde buluta aktarılacak.', 'success');
        });
    }

    // Supabase Kimlik Bilgilerini Kaydetme
    const supabaseConfigForm = document.getElementById('settingsSupabaseForm');
    if (supabaseConfigForm) {
        supabaseConfigForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const url = document.getElementById('settingSupabaseUrl').value.trim();
            const key = document.getElementById('settingSupabaseKey').value.trim();

            Config.saveCredentials(url, key);
            const initialized = SupabaseService.initClient();
            AppState.isSupabaseConnected = false;

            if (initialized) {
                const test = await SupabaseService.testConnection(url, key);
                if (test.success) {
                    AppState.isSupabaseConnected = true;
                    setupRealtimeSubscription(AppState.syncCode);
                    await syncWithSupabase(AppState.syncCode);
                } else {
                    AppState.syncError = test.message;
                    UI.showToast(`Supabase anahtarları kaydedildi fakat bağlantı uyarısı: ${test.message}`, 'warning');
                }
            } else {
                UI.showToast('Supabase bilgileri temizlendi veya geçersiz.', 'info');
            }

            AppState.notify('config_changed');
        });
    }

    // Programı Sıfırla Butonu
    const btnTriggerReset = document.getElementById('btnTriggerReset');
    if (btnTriggerReset) {
        btnTriggerReset.addEventListener('click', () => {
            UI.openModal('resetConfirmModal');
        });
    }

    const btnConfirmReset = document.getElementById('btnConfirmReset');
    if (btnConfirmReset) {
        btnConfirmReset.addEventListener('click', async () => {
            if (AppState.pendingItemIds?.size) {
                UI.showToast('Sıfırlamadan önce bekleyen kayıtları eşitleyin.', 'warning');
                return;
            }
            if (Config.isConfigured() && !AppState.isSupabaseConnected) {
                UI.showToast('Programı sıfırlamak için önce bulut bağlantısını yenileyin.', 'warning');
                return;
            }
            btnConfirmReset.disabled = true;
            if (AppState.isSupabaseConnected) {
                try {
                    await SupabaseService.resetEntireProgram(AppState.syncCode, AppState.program.id);
                } catch (err) {
                    console.error('Supabase reset error:', err);
                    btnConfirmReset.disabled = false;
                    UI.showToast('Program sıfırlanamadı. Kayıtlarınız korundu.', 'error');
                    return;
                }
            }

            AppState.resetProgram();
            btnConfirmReset.disabled = false;
            UI.closeModal('resetConfirmModal');
            UI.showToast('Tüm çalışma programı başarıyla sıfırlandı.', 'info');
        });
    }

    // ----------------------------------------------------
    // CİHAZ EŞLEŞTİRME (TELEFONU BAĞLA) MODALI
    // ----------------------------------------------------
    const btnOpenSyncModal = document.getElementById('btnOpenSyncModal');
    const btnOpenSyncModalHeader = document.getElementById('btnOpenSyncModalHeader');

    const openSyncModalHandler = () => {
        UI.renderSyncModal();
        UI.openModal('syncDeviceModal');
    };

    if (btnOpenSyncModal) btnOpenSyncModal.addEventListener('click', openSyncModalHandler);
    if (btnOpenSyncModalHeader) btnOpenSyncModalHeader.addEventListener('click', openSyncModalHandler);

    // Kodu Değiştir / Başka Koda Bağlan Formu
    const syncCodeForm = document.getElementById('syncCodeForm');
    if (syncCodeForm) {
        syncCodeForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const inputCode = document.getElementById('inputSyncCode').value.trim();
            if (!inputCode) return;
            if (AppState.isSyncing || AppState.plannerFlushing || settingsFlush) {
                UI.showToast('Eşitleme bitince program kodunu değiştirebilirsiniz.', 'info');
                return;
            }
            if (AppState.pendingItemIds?.size || pendingSettings.subjects.length || pendingSettings.program) {
                UI.showToast('Kodu değiştirmeden önce bekleyen kayıtları eşitleyin.', 'warning');
                return;
            }
            if (inputCode.toLowerCase() !== AppState.syncCode && !confirm('Başka programa geçmeden önce Ayarlar bölümünden yedek alabilirsiniz. Eşleştirme kodunu değiştirmek istiyor musunuz?')) return;
            const code = inputCode.toLowerCase();
            if (code === AppState.syncCode) {
                await syncWithSupabase(code);
                return;
            }
            AppState.isSyncing = true;
            UI.updateHeaderInfo();
            try {
                if (!SupabaseService.isConnected()) throw new Error('Önce bulut bağlantısını kurun.');
                const program = await SupabaseService.loadProgramBySyncCode(code);
                if (!program) throw new Error('Bu koda ait program bulunamadı. Mevcut programınız korunuyor.');
                const subjects = await SupabaseService.loadSubjectsBySyncCode(code, program.id);
                const items = await SupabaseService.loadScheduleItemsBySyncCode(code, program.id);
                if (AppState.pendingItemIds?.size || pendingSettings.subjects.length || pendingSettings.program) {
                    throw new Error('Bu sırada yapılan değişiklikler korunuyor. Önce eşitlemeyi tamamlayın.');
                }
                localStorage.setItem(`yks2027_before_switch_${AppState.syncCode}`, JSON.stringify(AppState.createBackup()));
                pendingSettings = { subjects: [], program: false };
                AppState.setSyncCode(code);
                AppState.program = program;
                AppState.subjects = subjects;
                AppState.scheduleItems = items;
                AppState.isSupabaseConnected = true;
                AppState.syncError = null;
                AppState.lastSyncTime = new Date();
                setupRealtimeSubscription(code);
                AppState.notify('supabase_synced');
                UI.closeAllModals();
                UI.renderSyncModal();
                UI.showToast(`"${code.toUpperCase()}" programına bağlandı.`, 'success');
            } catch (err) {
                UI.showToast(err.message || 'Eşleştirme yapılamadı. Mevcut programınız korundu.', 'warning');
            } finally {
                AppState.isSyncing = false;
                UI.updateHeaderInfo();
            }
        });
    }

    // Eşleşme Linkini Kopyala Butonu
    const btnCopySyncLink = document.getElementById('btnCopySyncLink');
    if (btnCopySyncLink) {
        btnCopySyncLink.addEventListener('click', () => {
            const shareUrl = Config.getShareUrl(AppState.syncCode);
            if (navigator.clipboard && navigator.clipboard.writeText) {
                navigator.clipboard.writeText(shareUrl).then(() => {
                    UI.showToast('Telefon eşleşme bağlantısı kopyalandı! 📋', 'success');
                }).catch(() => {
                    prompt('Aşağıdaki linki kopyalayıp telefonunuzda açabilirsiniz:', shareUrl);
                });
            } else {
                prompt('Aşağıdaki linki kopyalayıp telefonunuzda açabilirsiniz:', shareUrl);
            }
        });
    }

    // Manuel Senkronizasyon (Tazele) Butonu
    const btnManualRefreshSync = document.getElementById('btnManualRefreshSync');
    if (btnManualRefreshSync) {
        btnManualRefreshSync.addEventListener('click', async () => {
            await syncWithSupabase(AppState.syncCode);
        });
    }

    // ----------------------------------------------------
    // Account identity is validated before the planner is initialized.
    document.getElementById('btnOpenAuthModal')?.addEventListener('click', async () => {
        if (!confirm('Hesabından çıkış yapılsın mı?')) return;
        try { await SupabaseService.signOut(); location.reload(); }
        catch { UI.showToast('Çıkış yapılamadı. Tekrar dene.', 'error'); }
    });
    const accountButton=document.getElementById('btnOpenAuthModal');
    if(accountButton)accountButton.textContent='Hesaptan çıkış yap';
}
