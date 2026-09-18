/**
 * YKS 2027 Kişisel Çalışma Programı - Kullanıcı Arayüzü (UI) Yöneticisi
 */

import { AppState } from './state.js';
import { 
    generateDateRange, 
    calculateDynamicNumbers, 
    getRemainingDays,
    getSubjectPlannedCount,
    getSubjectCompletedCount,
    validateAddSubjectToDay,
    getIsoWeekday,
    parseISODate,
    formatToISODate,
    formatTurkishDate
} from './scheduler.js';

export const UI = {
    // ----------------------------------------------------
    // TOAST BİLDİRİM MOTORU
    // ----------------------------------------------------
    showToast(message, type = 'info', duration = 3500) {
        const container = document.getElementById('toastContainer');
        if (!container) return;

        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        
        let iconSvg = '';
        if (type === 'success') {
            iconSvg = `<svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/></svg>`;
        } else if (type === 'error') {
            iconSvg = `<svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>`;
        } else if (type === 'warning') {
            iconSvg = `<svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/></svg>`;
        } else {
            iconSvg = `<svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>`;
        }

        toast.innerHTML = `${iconSvg}<span>${message}</span>`;
        container.appendChild(toast);

        setTimeout(() => {
            toast.style.opacity = '0';
            toast.style.transform = 'translateY(10px)';
            toast.style.transition = 'all 0.25s ease';
            setTimeout(() => toast.remove(), 250);
        }, duration);
    },

    // ----------------------------------------------------
    // MODAL YÖNETİMİ
    // ----------------------------------------------------
    openModal(modalId) {
        const modal = document.getElementById(modalId);
        if (modal) {
            modal.classList.add('open');
            document.body.style.overflow = 'hidden';
        }
    },

    closeModal(modalId) {
        const modal = document.getElementById(modalId);
        if (modal) {
            modal.classList.remove('open');
            document.body.style.overflow = '';
        }
    },

    closeAllModals() {
        document.querySelectorAll('.modal-overlay').forEach(modal => {
            modal.classList.remove('open');
        });
        document.body.style.overflow = '';
    },

    // ----------------------------------------------------
    // ÜST BAR & GERİ SAYIM GÜNCELLEMESİ
    // ----------------------------------------------------
    updateHeaderInfo() {
        const remaining = getRemainingDays(AppState.program.exam_date);
        const countdownElem = document.getElementById('examCountdownText');
        if (countdownElem) {
            countdownElem.textContent = `Sınava ${remaining} gün kaldı`;
        }

        // Mod butonlarının aktifliğini güncelle
        const btnCreate = document.getElementById('modeBtnCreate');
        const btnUse = document.getElementById('modeBtnUse');
        if (btnCreate && btnUse) {
            if (AppState.currentMode === 'create') {
                btnCreate.classList.add('active');
                btnUse.classList.remove('active');
            } else {
                btnUse.classList.add('active');
                btnCreate.classList.remove('active');
            }
        }

        // Bulut/Bağlantı durum rozeti
        const cloudStatus = document.getElementById('cloudStatusText');
        const cloudDot = document.getElementById('cloudStatusDot');
        if (cloudStatus && cloudDot) {
            if (AppState.isSupabaseConnected) {
                if (AppState.isSyncing) {
                    cloudStatus.textContent = 'Eşitleniyor...';
                    cloudDot.className = 'status-dot syncing';
                } else {
                    const code = (AppState.syncCode || 'yks2027').toUpperCase();
                    cloudStatus.textContent = `Bulut: ${code}`;
                    cloudDot.className = 'status-dot online';
                }
            } else {
                cloudStatus.textContent = 'Yerel Mod (Çevrimdışı)';
                cloudDot.className = 'status-dot';
            }
        }
    },

    // ----------------------------------------------------
    // 1. PROGRAM TAKVİMİ RENDER
    // ----------------------------------------------------
    renderSchedule() {
        const container = document.getElementById('scheduleGridContainer');
        if (!container) return;

        const { numberMap } = calculateDynamicNumbers(AppState.scheduleItems);
        const dateRange = generateDateRange(
            AppState.program.start_date,
            AppState.program.exam_date,
            AppState.program.include_exam_day
        );

        if (dateRange.length === 0) {
            container.innerHTML = `
                <div class="day-empty-placeholder" style="grid-column: 1 / -1; padding: 3rem;">
                    Başlangıç veya sınav tarihi geçersiz. Lütfen Ayarlar sekmesini kontrol edin.
                </div>
            `;
            return;
        }

        // Filtreleme kontrolü (Örn: Programı Kullan modunda "Bugün", "Kalanlar")
        let displayedDays = dateRange;
        if (AppState.currentMode === 'use') {
            if (AppState.useFilter === 'today') {
                displayedDays = dateRange.filter(d => d.isToday);
                if (displayedDays.length === 0) {
                    displayedDays = dateRange.slice(0, 1); // Bugün aralıkta yoksa ilk günü göster
                }
            } else if (AppState.useFilter === 'uncompleted') {
                // İçinde en az bir tamamlanmamış ders olan günleri filtrele
                const uncompletedDates = new Set(
                    AppState.scheduleItems.filter(item => !item.completed).map(item => item.schedule_date)
                );
                displayedDays = dateRange.filter(d => uncompletedDates.has(d.dateStr) || d.isToday);
            }
        }

        const wrapper = container.closest('.schedule-calendar-wrapper');
        const isFiltered = AppState.currentMode === 'use' && AppState.useFilter !== 'all';
        if (wrapper) {
            wrapper.classList.toggle('is-filtered-view', isFiltered);
        }

        const subjectMap = new Map(AppState.subjects.map(s => [s.id, s]));

        let html = '';

        // Pazartesi ile başlaması için başlangıç haftasının önceki günlerini dolgu olarak ekle
        if (!isFiltered && displayedDays.length > 0) {
            const firstDateStr = displayedDays[0].dateStr;
            const firstWeekday = getIsoWeekday(firstDateStr); // 1: Pazartesi ... 7: Pazar
            if (firstWeekday > 1) {
                const firstDateObj = parseISODate(firstDateStr);
                for (let offset = firstWeekday - 1; offset >= 1; offset--) {
                    const padDate = new Date(firstDateObj);
                    padDate.setDate(padDate.getDate() - offset);
                    const padDateStr = formatToISODate(padDate);
                    const padFormatted = formatTurkishDate(padDateStr);
                    html += `
                        <div class="day-card day-card-placeholder" data-date="${padDateStr}">
                            <div class="day-header">
                                <div class="day-info">
                                    <div class="day-number-title">-</div>
                                    <div class="day-date-sub">${padFormatted}</div>
                                </div>
                            </div>
                            <div class="day-content">
                                <div class="day-placeholder-box">Program Öncesi</div>
                            </div>
                        </div>
                    `;
                }
            }
        }

        displayedDays.forEach(day => {
            const dayItems = AppState.scheduleItems
                .filter(item => item.schedule_date === day.dateStr)
                .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));

            const isTodayClass = day.isToday ? 'is-today' : '';
            const isExamClass = day.isExamDay ? 'is-exam' : '';

            html += `
                <div class="day-card ${isTodayClass} ${isExamClass}" id="day-card-${day.dateStr}" data-date="${day.dateStr}">
                    <div class="day-header">
                        <div class="day-info">
                            <div class="day-number-title">
                                ${day.isExamDay ? '🎯 Sınav Günü' : `Gün ${day.dayIndex}`}
                            </div>
                            <div class="day-date-sub">${day.formattedDate}</div>
                        </div>
                    </div>

                    <div class="day-content">
                        ${dayItems.length === 0 ? `
                            <div class="day-empty-placeholder">
                                ${AppState.currentMode === 'create' ? 'Henüz ders eklenmedi. Aşağıdan ekleyin.' : 'Bu gün için planlanmış çalışma yok.'}
                            </div>
                        ` : ''}

                        ${dayItems.map(item => {
                            const subject = subjectMap.get(item.subject_id) || {
                                name: 'Bilinmeyen Ders',
                                exam_type: 'TYT',
                                teacher: '-',
                                youtube_url: ''
                            };
                            const dynamicNum = numberMap.get(item.id) || 1;
                            const isCompleted = Boolean(item.completed);

                            if (AppState.currentMode === 'use') {
                                // PROGRAMI KULLAN MODU GÖRÜNÜMÜ
                                return `
                                    <div class="schedule-item-row ${isCompleted ? 'completed' : ''}" data-item-id="${item.id}">
                                        <div class="item-left">
                                            <div class="custom-checkbox-wrapper js-toggle-complete" data-item-id="${item.id}">
                                                <div class="custom-checkbox ${isCompleted ? 'checked' : ''}">
                                                    ${isCompleted ? `
                                                        <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 13l4 4L19 7"/>
                                                        </svg>
                                                    ` : ''}
                                                </div>
                                            </div>
                                            <div class="item-meta">
                                                <div class="item-title">
                                                    <span class="badge ${subject.exam_type === 'AYT' ? 'badge-ayt' : 'badge-tyt'}">${subject.exam_type}</span>
                                                    ${escapeHtml(subject.name)} ${dynamicNum}
                                                </div>
                                                <div class="item-teacher">${escapeHtml(subject.teacher)}</div>
                                            </div>
                                        </div>
                                        <div class="item-actions">
                                            ${subject.youtube_url ? `
                                                <a href="${escapeHtml(subject.youtube_url)}" target="_blank" rel="noopener noreferrer" class="action-link-yt" title="YouTube Oynatma Listesini Aç">
                                                    <svg width="18" height="18" fill="currentColor" viewBox="0 0 24 24">
                                                        <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
                                                    </svg>
                                                </a>
                                            ` : ''}
                                        </div>
                                    </div>
                                `;
                            } else {
                                // PROGRAMI OLUŞTUR MODU GÖRÜNÜMÜ
                                return `
                                    <div class="schedule-item-row" data-item-id="${item.id}">
                                        <div class="item-left">
                                            <div class="item-meta">
                                                <div class="item-title">
                                                    <span class="badge ${subject.exam_type === 'AYT' ? 'badge-ayt' : 'badge-tyt'}">${subject.exam_type}</span>
                                                    ${escapeHtml(subject.name)} ${dynamicNum}
                                                </div>
                                                <div class="item-teacher">${escapeHtml(subject.teacher)}</div>
                                            </div>
                                        </div>
                                        <div class="item-actions">
                                            ${subject.youtube_url ? `
                                                <a href="${escapeHtml(subject.youtube_url)}" target="_blank" rel="noopener noreferrer" class="action-link-yt" title="YouTube Playlist">
                                                    <svg width="17" height="17" fill="currentColor" viewBox="0 0 24 24">
                                                        <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
                                                    </svg>
                                                </a>
                                            ` : ''}
                                            <button type="button" class="action-delete-btn js-delete-schedule-item" data-item-id="${item.id}" title="Bu Dersi Bu Günden Kaldır">
                                                <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
                                                </svg>
                                            </button>
                                        </div>
                                    </div>
                                `;
                            }
                        }).join('')}
                    </div>

                    ${AppState.currentMode === 'create' ? `
                        <div class="day-footer">
                            <button type="button" class="btn btn-secondary btn-sm js-open-add-subject-modal" data-date="${day.dateStr}" data-day-index="${day.dayIndex}">
                                <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/>
                                </svg>
                                Ders Ekle
                            </button>
                        </div>
                    ` : ''}
                </div>
            `;
        });

        // Pazar ile bitmesi için bitiş haftasının kalan günlerini dolgu olarak ekle
        if (!isFiltered && displayedDays.length > 0) {
            const lastDateStr = displayedDays[displayedDays.length - 1].dateStr;
            const lastWeekday = getIsoWeekday(lastDateStr); // 1: Pazartesi ... 7: Pazar
            if (lastWeekday < 7) {
                const lastDateObj = parseISODate(lastDateStr);
                for (let offset = 1; offset <= (7 - lastWeekday); offset++) {
                    const padDate = new Date(lastDateObj);
                    padDate.setDate(padDate.getDate() + offset);
                    const padDateStr = formatToISODate(padDate);
                    const padFormatted = formatTurkishDate(padDateStr);
                    html += `
                        <div class="day-card day-card-placeholder" data-date="${padDateStr}">
                            <div class="day-header">
                                <div class="day-info">
                                    <div class="day-number-title">-</div>
                                    <div class="day-date-sub">${padFormatted}</div>
                                </div>
                            </div>
                            <div class="day-content">
                                <div class="day-placeholder-box">Program Sonu</div>
                            </div>
                        </div>
                    `;
                }
            }
        }

        container.innerHTML = html;
    },

    // ----------------------------------------------------
    // 2. DERSLER KATALOĞU (SUBJECTS) RENDER
    // ----------------------------------------------------
    renderSubjects() {
        const container = document.getElementById('subjectsGridContainer');
        if (!container) return;

        if (AppState.subjects.length === 0) {
            container.innerHTML = `
                <div class="day-empty-placeholder" style="grid-column: 1 / -1; padding: 3rem;">
                    Henüz tanımlanmış ders yok. "Yeni Ders Ekle" butonuna tıklayarak ders ekleyebilirsiniz.
                </div>
            `;
            return;
        }

        let html = '';
        AppState.subjects.forEach(subject => {
            const plannedCount = getSubjectPlannedCount(AppState.scheduleItems, subject.id);
            const completedCount = getSubjectCompletedCount(AppState.scheduleItems, subject.id);
            const progressPercent = Math.min(100, Math.round((plannedCount / subject.total_days) * 100));

            html += `
                <div class="subject-card" data-subject-id="${subject.id}">
                    <div class="subject-card-header">
                        <div>
                            <span class="badge ${subject.exam_type === 'AYT' ? 'badge-ayt' : 'badge-tyt'}">${subject.exam_type}</span>
                            <h3 class="subject-card-title" style="margin-top: 0.35rem;">${escapeHtml(subject.name)}</h3>
                            <div class="subject-card-teacher">${escapeHtml(subject.teacher || 'Hoca belirtilmedi')}</div>
                        </div>
                        <div class="badge badge-count">${subject.total_days} Günlük</div>
                    </div>

                    <div class="subject-card-stats">
                        <div class="progress-label-row">
                            <span>Programa Eklenen</span>
                            <span><strong>${plannedCount}</strong> / ${subject.total_days} Gün (%${progressPercent})</span>
                        </div>
                        <div class="progress-bar-track">
                            <div class="progress-bar-fill" style="width: ${progressPercent}%;"></div>
                        </div>
                        <div class="progress-label-row" style="margin-top: 0.2rem; color: var(--text-muted); font-size: 0.72rem;">
                            <span>Tamamlanan: ${completedCount} Gün</span>
                            <span>Kalan: ${Math.max(0, subject.total_days - plannedCount)} Gün</span>
                        </div>
                    </div>

                    <div class="subject-card-footer">
                        ${subject.youtube_url ? `
                            <a href="${escapeHtml(subject.youtube_url)}" target="_blank" rel="noopener noreferrer" class="btn btn-secondary btn-sm" title="YouTube Playlist">
                                <svg width="15" height="15" fill="#dc2626" viewBox="0 0 24 24">
                                    <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
                                </svg>
                                Playlist
                            </a>
                        ` : '<span></span>'}

                        <div style="display: flex; gap: 0.35rem;">
                            <button type="button" class="btn btn-ghost btn-sm js-edit-subject" data-subject-id="${subject.id}" title="Dersi Düzenle">
                                Düzenle
                            </button>
                            <button type="button" class="btn btn-ghost btn-sm js-delete-subject" data-subject-id="${subject.id}" style="color: var(--accent-danger);" title="Dersi Sil">
                                Sil
                            </button>
                        </div>
                    </div>
                </div>
            `;
        });

        container.innerHTML = html;
    },

    // ----------------------------------------------------
    // 3. İSTATİSTİK RENDER
    // ----------------------------------------------------
    renderStats() {
        const totalPlanned = AppState.scheduleItems.length;
        const totalCompleted = AppState.scheduleItems.filter(i => i.completed).length;
        const totalRemaining = Math.max(0, totalPlanned - totalCompleted);
        const completionRate = totalPlanned > 0 ? Math.round((totalCompleted / totalPlanned) * 100) : 0;

        const elemPlanned = document.getElementById('statTotalPlanned');
        const elemCompleted = document.getElementById('statTotalCompleted');
        const elemRemaining = document.getElementById('statTotalRemaining');
        const elemRate = document.getElementById('statCompletionRate');

        if (elemPlanned) elemPlanned.textContent = totalPlanned;
        if (elemCompleted) elemCompleted.textContent = totalCompleted;
        if (elemRemaining) elemRemaining.textContent = totalRemaining;
        if (elemRate) elemRate.textContent = `%${completionRate}`;

        // Ders bazlı detaylı ilerleme listesi
        const detailsContainer = document.getElementById('statsSubjectDetailsList');
        if (detailsContainer) {
            let html = '';
            AppState.subjects.forEach(subject => {
                const planned = getSubjectPlannedCount(AppState.scheduleItems, subject.id);
                const completed = getSubjectCompletedCount(AppState.scheduleItems, subject.id);
                const plannedPercent = Math.min(100, Math.round((planned / subject.total_days) * 100));

                html += `
                    <div style="background-color: var(--bg-surface); border: 1px solid var(--border-subtle); border-radius: var(--radius-md); padding: 1rem; margin-bottom: 0.85rem;">
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem;">
                            <div>
                                <span class="badge ${subject.exam_type === 'AYT' ? 'badge-ayt' : 'badge-tyt'}">${subject.exam_type}</span>
                                <strong style="margin-left: 0.5rem; font-size: 0.95rem;">${escapeHtml(subject.name)}</strong>
                                <span style="font-size: 0.8rem; color: var(--text-secondary); margin-left: 0.35rem;">(${escapeHtml(subject.teacher)})</span>
                            </div>
                            <div style="font-weight: 700; font-size: 0.95rem;">
                                ${planned} / ${subject.total_days} Gün Planlandı
                            </div>
                        </div>
                        <div class="progress-bar-track" style="height: 10px;">
                            <div class="progress-bar-fill" style="width: ${plannedPercent}%;"></div>
                        </div>
                        <div style="display: flex; justify-content: space-between; font-size: 0.78rem; color: var(--text-secondary); margin-top: 0.4rem;">
                            <span>Tamamlanan Çalışma: <strong>${completed}</strong></span>
                            <span>Kalan Planlanabilir Gün: <strong>${Math.max(0, subject.total_days - planned)}</strong></span>
                        </div>
                    </div>
                `;
            });
            detailsContainer.innerHTML = html;
        }
    },

    // ----------------------------------------------------
    // 4. AYARLAR FORMU GÜNCELLEMESİ
    // ----------------------------------------------------
    populateSettings() {
        const inputExamDate = document.getElementById('settingExamDate');
        const inputStartDate = document.getElementById('settingStartDate');
        const checkIncludeExamDay = document.getElementById('settingIncludeExamDay');
        const inputSupabaseUrl = document.getElementById('settingSupabaseUrl');
        const inputSupabaseKey = document.getElementById('settingSupabaseKey');
        const inputSyncCode = document.getElementById('settingSyncCode');

        if (inputExamDate) inputExamDate.value = AppState.program.exam_date || '2027-06-19';
        if (inputStartDate) inputStartDate.value = AppState.program.start_date || '';
        if (checkIncludeExamDay) checkIncludeExamDay.checked = Boolean(AppState.program.include_exam_day);
        if (inputSyncCode) inputSyncCode.value = AppState.syncCode || 'yks2027';

        // Supabase anahtarlarını Config'den al
        if (inputSupabaseUrl) inputSupabaseUrl.value = localStorage.getItem('yks2027_supabase_url') || '';
        if (inputSupabaseKey) inputSupabaseKey.value = localStorage.getItem('yks2027_supabase_anon_key') || '';
    },

    // ----------------------------------------------------
    // CİHAZ SENKRONİZASYON (TELEFONU BAĞLA) MODALI
    // ----------------------------------------------------
    renderSyncModal() {
        const codeDisplay = document.getElementById('displaySyncCode');
        const codeInput = document.getElementById('inputSyncCode');
        const urlDisplay = document.getElementById('displaySyncUrl');
        const qrContainer = document.getElementById('syncQrContainer');

        const currentCode = (AppState.syncCode || 'yks2027').toLowerCase();
        const shareUrl = window.location.origin ? `${window.location.origin}${window.location.pathname}?sync=${encodeURIComponent(currentCode)}` : `?sync=${encodeURIComponent(currentCode)}`;

        if (codeDisplay) codeDisplay.textContent = currentCode.toUpperCase();
        if (codeInput) codeInput.value = currentCode;
        if (urlDisplay) urlDisplay.value = shareUrl;

        if (qrContainer) {
            qrContainer.innerHTML = '';

            // QR Kodu göster: Öncelikli olarak qrcodejs kütüphanesi veya fallback QR image servisi
            if (window.QRCode) {
                try {
                    new window.QRCode(qrContainer, {
                        text: shareUrl,
                        width: 170,
                        height: 170,
                        colorDark: '#0f172a',
                        colorLight: '#ffffff',
                        correctLevel: window.QRCode.CorrectLevel.H
                    });
                    return;
                } catch (e) {
                    console.warn('QR library error, fallback image used:', e);
                }
            }

            // Fallback: Doğrudan güvenilir QR API görseli
            const qrImg = document.createElement('img');
            qrImg.src = `https://api.qrserver.com/v1/create-qr-code/?size=170x170&margin=10&data=${encodeURIComponent(shareUrl)}`;
            qrImg.alt = 'Telefon Eşleştirme QR Kodu';
            qrImg.style.width = '170px';
            qrImg.style.height = '170px';
            qrImg.style.borderRadius = '8px';
            qrImg.style.boxShadow = '0 2px 8px rgba(0,0,0,0.1)';
            qrContainer.appendChild(qrImg);
        }
    },

    // ----------------------------------------------------
    // DERS SEÇİM MODALI (GÜNE DERS EKLEME)
    // ----------------------------------------------------
    populateSubjectPicker(targetDateStr, targetDayIndex) {
        const modal = document.getElementById('addSubjectModal');
        const listElem = document.getElementById('subjectPickerList');
        const dateSubElem = document.getElementById('pickerTargetDayDate');

        if (!modal || !listElem) return;

        modal.dataset.targetDate = targetDateStr;
        modal.dataset.targetDayIndex = targetDayIndex;

        if (dateSubElem) {
            dateSubElem.textContent = `${targetDateStr} (Gün ${targetDayIndex})`;
        }

        let html = '';
        AppState.subjects.forEach(subject => {
            const validation = validateAddSubjectToDay(AppState.scheduleItems, targetDateStr, subject);
            const planned = getSubjectPlannedCount(AppState.scheduleItems, subject.id);

            html += `
                <div class="picker-item ${validation.valid ? '' : 'disabled'}">
                    <div class="picker-info">
                        <div class="picker-title">
                            <span class="badge ${subject.exam_type === 'AYT' ? 'badge-ayt' : 'badge-tyt'}">${subject.exam_type}</span>
                            ${escapeHtml(subject.name)}
                        </div>
                        <div class="picker-sub">
                            ${escapeHtml(subject.teacher)} • Toplam ${subject.total_days} Gün (${planned}/${subject.total_days} eklendi)
                        </div>
                    </div>

                    ${validation.valid ? `
                        <button type="button" class="btn btn-primary btn-sm js-confirm-add-subject" data-subject-id="${subject.id}">
                            + Ekle (${validation.nextStudyNumber})
                        </button>
                    ` : `
                        <span style="font-size: 0.78rem; color: var(--accent-danger); font-weight: 500;">
                            ${escapeHtml(validation.message)}
                        </span>
                    `}
                </div>
            `;
        });

        listElem.innerHTML = html;
        this.openModal('addSubjectModal');
    }
};

function escapeHtml(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}
