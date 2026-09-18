/**
 * YKS 2027 Kişisel Çalışma Programı - Ana Uygulama Mantığı (App Controller)
 */

import { AppState } from './state.js';
import { Config } from './config.js';
import { SupabaseService } from './supabase.js';
import { UI } from './ui.js';
import { validateAddSubjectToDay } from './scheduler.js';

// DOM Elements
let currentEditingSubjectId = null;

document.addEventListener('DOMContentLoaded', async () => {
    // 1. Yerel veriyi yükle
    AppState.loadFromLocal();

    // 2. Supabase başlatma
    const isClientReady = SupabaseService.initClient();
    AppState.isSupabaseConnected = isClientReady;

    if (isClientReady) {
        try {
            const user = await SupabaseService.getCurrentUser();
            AppState.currentUser = user;

            if (user) {
                // Kullanıcının buluttaki verilerini çek
                await syncFromSupabase(user.id);
            }
        } catch (err) {
            console.warn('Supabase initial auth check error:', err);
        }

        // Auth dinleyici kur
        SupabaseService.onAuthStateChange(async (event, session) => {
            const user = session?.user || null;
            AppState.currentUser = user;
            if (user) {
                await syncFromSupabase(user.id);
            }
            UI.updateHeaderInfo();
        });
    }

    // 3. State dinleyicisi bağla (Her değişiklikte UI render edilsin)
    AppState.subscribe((eventType) => {
        UI.updateHeaderInfo();
        if (AppState.activeTab === 'schedule') {
            UI.renderSchedule();
        } else if (AppState.activeTab === 'subjects') {
            UI.renderSubjects();
        } else if (AppState.activeTab === 'stats') {
            UI.renderStats();
        } else if (AppState.activeTab === 'settings') {
            UI.populateSettings();
        }
    });

    // 4. İlk Render
    UI.updateHeaderInfo();
    switchTab('schedule');

    // 5. Event Listener'ları Kur
    bindEvents();
});

/**
 * Supabase bulut verileri ile senkronizasyon
 */
async function syncFromSupabase(userId) {
    try {
        let program = await SupabaseService.loadUserProgram(userId);
        if (!program) {
            // İlk kez giriş yapan kullanıcı için program oluştur
            program = await SupabaseService.createOrUpdateProgram(AppState.program, userId);
            // Varsayılan dersleri Supabase'e yükle
            for (const sub of AppState.subjects) {
                await SupabaseService.saveSubject(sub, program.id, userId);
            }
        } else {
            AppState.program = program;
        }

        const subjects = await SupabaseService.loadSubjects(program.id);
        if (subjects && subjects.length > 0) {
            AppState.subjects = subjects;
        }

        const items = await SupabaseService.loadScheduleItems(program.id);
        AppState.scheduleItems = items || [];

        AppState.notify('supabase_synced');
        UI.showToast('Verileriniz Supabase bulutundan başarıyla yüklendi.', 'success');
    } catch (err) {
        console.error('Sync error:', err);
        UI.showToast('Bulut verileri senkronize edilirken bir hata oluştu.', 'error');
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
    // PROGRAM TAKVİMİ İLE İLGİLİ OLAYLAR
    // ----------------------------------------------------
    const scheduleContainer = document.getElementById('scheduleGridContainer');
    if (scheduleContainer) {
        scheduleContainer.addEventListener('click', async (e) => {
            // 1. "+ Ders Ekle" Butonuna tıklanması
            const addBtn = e.target.closest('.js-open-add-subject-modal');
            if (addBtn) {
                const dateStr = addBtn.dataset.date;
                const dayIndex = addBtn.dataset.dayIndex;
                UI.populateSubjectPicker(dateStr, dayIndex);
                return;
            }

            // 2. Programı Kullan modunda "Tamamlandı" Checkbox'ına tıklanması
            const toggleCompleteBtn = e.target.closest('.js-toggle-complete');
            if (toggleCompleteBtn) {
                const itemId = toggleCompleteBtn.dataset.itemId;
                const item = AppState.scheduleItems.find(i => i.id === itemId);
                if (item) {
                    item.completed = !item.completed;
                    item.completed_at = item.completed ? new Date().toISOString() : null;
                    
                    // Supabase'e asenkron kaydet
                    if (AppState.isSupabaseConnected && AppState.currentUser) {
                        SupabaseService.updateScheduleItemCompleted(itemId, item.completed).catch(err => {
                            console.error('Supabase completion update failed:', err);
                        });
                    }

                    AppState.notify('completed_toggled');
                    UI.showToast(item.completed ? 'Ders tamamlandı olarak işaretlendi! 🎉' : 'Ders işareti kaldırıldı.', 'info');
                }
                return;
            }

            // 3. Programı Oluştur modunda Ders Silme Butonuna tıklanması
            const deleteItemBtn = e.target.closest('.js-delete-schedule-item');
            if (deleteItemBtn) {
                const itemId = deleteItemBtn.dataset.itemId;
                const itemIndex = AppState.scheduleItems.findIndex(i => i.id === itemId);
                if (itemIndex !== -1) {
                    AppState.scheduleItems.splice(itemIndex, 1);

                    // Supabase'den sil
                    if (AppState.isSupabaseConnected && AppState.currentUser) {
                        SupabaseService.deleteScheduleItem(itemId).catch(err => {
                            console.error('Supabase delete item failed:', err);
                        });
                    }

                    // Dinamik numaralar otomatik güncellensin
                    AppState.notify('item_deleted');
                    UI.showToast('Ders programdan silindi. Numaralandırma otomatik yeniden hizalandı.', 'info');
                }
                return;
            }
        });
    }

    // Modal içinden Güne Ders Ekleme Onayı
    const subjectPickerList = document.getElementById('subjectPickerList');
    if (subjectPickerList) {
        subjectPickerList.addEventListener('click', async (e) => {
            const confirmBtn = e.target.closest('.js-confirm-add-subject');
            if (!confirmBtn) return;

            const modal = document.getElementById('addSubjectModal');
            const dateStr = modal.dataset.targetDate;
            const dayIndex = parseInt(modal.dataset.targetDayIndex, 10) || 1;
            const subjectId = confirmBtn.dataset.subjectId;
            const subject = AppState.subjects.find(s => s.id === subjectId);

            if (!subject || !dateStr) return;

            // Doğrulama kontrolü
            const validation = validateAddSubjectToDay(AppState.scheduleItems, dateStr, subject);
            if (!validation.valid) {
                UI.showToast(validation.message, 'warning');
                return;
            }

            const newItem = {
                id: 'item-' + Date.now() + '-' + Math.random().toString(36).substring(2, 6),
                program_id: AppState.program.id,
                subject_id: subject.id,
                schedule_date: dateStr,
                day_number: dayIndex,
                sort_order: AppState.scheduleItems.filter(i => i.schedule_date === dateStr).length,
                completed: false,
                created_at: new Date().toISOString()
            };

            AppState.scheduleItems.push(newItem);

            // Supabase senkronizasyonu
            if (AppState.isSupabaseConnected && AppState.currentUser) {
                SupabaseService.addScheduleItem(newItem, AppState.program.id, AppState.currentUser.id).then(saved => {
                    if (saved && saved.id) newItem.id = saved.id;
                }).catch(err => {
                    console.error('Supabase add item failed:', err);
                });
            }

            UI.closeModal('addSubjectModal');
            AppState.notify('item_added');
            UI.showToast(`"${subject.name}" başarıyla Gün ${dayIndex} programına eklendi!`, 'success');
        });
    }

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
        subjectsGrid.addEventListener('click', (e) => {
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
                    // Programa eklenen kayıtları da sil
                    AppState.scheduleItems = AppState.scheduleItems.filter(i => i.subject_id !== subId);
                    AppState.subjects = AppState.subjects.filter(s => s.id !== subId);

                    if (AppState.isSupabaseConnected && AppState.currentUser) {
                        SupabaseService.deleteSubject(subId).catch(err => {
                            console.error('Supabase delete subject failed:', err);
                        });
                    }

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

            if (youtube && !youtube.startsWith('http')) {
                UI.showToast('Lütfen geçerli bir bağlantı adresi (http:// veya https://) girin.', 'warning');
                return;
            }

            if (currentEditingSubjectId) {
                // Güncelleme
                const subject = AppState.subjects.find(s => s.id === currentEditingSubjectId);
                if (subject) {
                    subject.name = name;
                    subject.exam_type = examType;
                    subject.teacher = teacher;
                    subject.total_days = totalDays;
                    subject.youtube_url = youtube;

                    if (AppState.isSupabaseConnected && AppState.currentUser) {
                        SupabaseService.saveSubject(subject, AppState.program.id, AppState.currentUser.id).catch(err => {
                            console.error('Supabase update subject failed:', err);
                        });
                    }
                    UI.showToast('Ders başarıyla güncellendi.', 'success');
                }
            } else {
                // Yeni Ekleme
                const newSubject = {
                    id: 'sub-' + Date.now() + '-' + Math.random().toString(36).substring(2, 6),
                    name,
                    exam_type: examType,
                    teacher,
                    total_days: totalDays,
                    youtube_url: youtube,
                    color_tag: 'blue'
                };

                AppState.subjects.push(newSubject);

                if (AppState.isSupabaseConnected && AppState.currentUser) {
                    SupabaseService.saveSubject(newSubject, AppState.program.id, AppState.currentUser.id).then(saved => {
                        if (saved && saved.id) newSubject.id = saved.id;
                    }).catch(err => {
                        console.error('Supabase save subject failed:', err);
                    });
                }
                UI.showToast('Yeni ders başarıyla eklendi.', 'success');
            }

            UI.closeModal('subjectFormModal');
            AppState.notify('subjects_changed');
        });
    }

    // ----------------------------------------------------
    // AYARLAR VE SIFIRLAMA
    // ----------------------------------------------------
    const settingsForm = document.getElementById('settingsDatesForm');
    if (settingsForm) {
        settingsForm.addEventListener('submit', (e) => {
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

            AppState.program.exam_date = examDate;
            AppState.program.start_date = startDate;
            AppState.program.include_exam_day = includeExamDay;

            if (AppState.isSupabaseConnected && AppState.currentUser) {
                SupabaseService.createOrUpdateProgram(AppState.program, AppState.currentUser.id).catch(err => {
                    console.error('Supabase program update failed:', err);
                });
            }

            AppState.notify('settings_saved');
            UI.showToast('Tarih ayarları kaydedildi ve takvim güncellendi.', 'success');
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
            AppState.isSupabaseConnected = initialized;

            if (initialized) {
                const test = await SupabaseService.testConnection(url, key);
                if (test.success) {
                    UI.showToast('Supabase bağlantısı doğrulandı ve kaydedildi!', 'success');
                } else {
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
            if (AppState.isSupabaseConnected && AppState.currentUser) {
                try {
                    await SupabaseService.resetEntireProgram(AppState.program.id);
                } catch (err) {
                    console.error('Supabase reset error:', err);
                }
            }

            AppState.resetProgram();
            UI.closeModal('resetConfirmModal');
            UI.showToast('Tüm çalışma programı başarıyla sıfırlandı.', 'info');
        });
    }

    // ----------------------------------------------------
    // AUTH MODALI VE İŞLEMLERİ
    // ----------------------------------------------------
    const btnOpenAuth = document.getElementById('btnOpenAuthModal');
    if (btnOpenAuth) {
        btnOpenAuth.addEventListener('click', () => {
            if (AppState.currentUser) {
                if (confirm(`${AppState.currentUser.email} hesabından çıkış yapmak istiyor musunuz?`)) {
                    SupabaseService.signOut().then(() => {
                        AppState.currentUser = null;
                        UI.showToast('Çıkış yapıldı.', 'info');
                        AppState.notify('sign_out');
                    });
                }
            } else {
                UI.openModal('authModal');
            }
        });
    }

    const authForm = document.getElementById('authForm');
    if (authForm) {
        authForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const email = document.getElementById('authEmail').value.trim();
            const password = document.getElementById('authPassword').value;
            const mode = document.querySelector('input[name="authMode"]:checked')?.value || 'login';

            if (!Config.isConfigured()) {
                UI.showToast('Giriş yapabilmek için önce Ayarlar sekmesinden Supabase URL ve Anon Key giriniz.', 'warning');
                return;
            }

            try {
                if (mode === 'login') {
                    await SupabaseService.signIn(email, password);
                    UI.showToast('Başarıyla giriş yapıldı!', 'success');
                } else {
                    await SupabaseService.signUp(email, password);
                    UI.showToast('Kayıt oluşturuldu! Eğer e-posta onayı gerekiyorsa gelen kutunuzu kontrol edin.', 'success');
                }
                UI.closeModal('authModal');
            } catch (err) {
                UI.showToast(`Giriş başarısız: ${err.message}`, 'error');
            }
        });
    }
}
