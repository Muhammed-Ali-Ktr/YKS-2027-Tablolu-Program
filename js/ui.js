import { renderPlanner } from './planner.js';
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

        toast.innerHTML = `${iconSvg}<span></span>`;
        toast.querySelector("span").textContent = message;
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
            this.previousFocus = document.activeElement;
            modal.classList.add('open');
            const dialog = modal.querySelector('.modal-dialog');
            dialog?.setAttribute('role', 'dialog');
            dialog?.setAttribute('aria-modal', 'true');
            const heading = dialog?.querySelector('h3');
            if (heading) { heading.id ||= modalId + '-title'; dialog.setAttribute('aria-labelledby', heading.id); }
            setTimeout(() => modal.querySelector('input:not([type=hidden]), select, textarea, button')?.focus(), 0);
            document.body.style.overflow = 'hidden';
        }
    },

    closeModal(modalId) {
        const modal = document.getElementById(modalId);
        if (modal) {
            modal.classList.remove('open');
            document.body.style.overflow = '';
            this.previousFocus?.focus();
        }
    },

    closeAllModals() {
        document.querySelectorAll('.modal-overlay').forEach(modal => {
            modal.classList.remove('open');
        });
        document.body.style.overflow = '';
            this.previousFocus?.focus();
    },

    // ----------------------------------------------------
    // ÜST BAR & GERİ SAYIM GÜNCELLEMESİ
    // ----------------------------------------------------
    updateHeaderInfo() {
        const remaining = getRemainingDays(AppState.program.exam_date);
        const countdownElem = document.getElementById('examCountdownText');
        if (countdownElem) {
            countdownElem.textContent = `Hedef tarihe ${remaining} gün`;
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
            if (AppState.localSaveError) {
                cloudStatus.textContent = 'Cihaza kaydedilemedi';
                cloudDot.className = 'status-dot';
            } else if (AppState.syncError) {
                cloudStatus.textContent = 'Bulut aktarımı bekliyor';
                cloudDot.className = 'status-dot';
            } else if (AppState.isSupabaseConnected) {
                if (AppState.isSyncing) {
                    cloudStatus.textContent = 'Eşitleniyor...';
                    cloudDot.className = 'status-dot syncing';
                } else {
                    const code = (AppState.syncCode || 'yks2027').toUpperCase();
                    cloudStatus.textContent = AppState.lastSyncTime ? 'Bulut güncel' : 'Bulut bağlantısı hazırlanıyor';
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
    renderSchedule() { renderPlanner(); },

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
            const sameDayNote = validation.sameDayCount > 0
                ? ` • Bu günde ${validation.sameDayCount} bölüm var`
                : '';
            const trimNote = validation.willTrimLast && validation.trimItem
                ? `Sondan düşecek: ${formatTurkishDate(validation.trimItem.schedule_date, false)}`
                : '';

            html += `
                <div class="picker-item ${validation.valid ? '' : 'disabled'}">
                    <div class="picker-info">
                        <div class="picker-title">
                            <span class="badge ${subject.exam_type === 'AYT' ? 'badge-ayt' : 'badge-tyt'}">${subject.exam_type}</span>
                            ${escapeHtml(subject.name)}
                        </div>
                        <div class="picker-sub">
                            ${escapeHtml(subject.teacher)} • ${planned}/${subject.total_days} bölüm eklendi${sameDayNote}
                            ${trimNote ? `<br>${escapeHtml(trimNote)}` : ''}
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
