import { AppState, validateBackup } from './state.js';
import { UI } from './ui.js';
import { SupabaseService } from './supabase.js';
import { generateDateRange, formatToISODate, parseISODate, formatTurkishDate, calculateDynamicNumbers, validateAddSubjectToDay } from './scheduler.js';

const today = () => formatToISODate(new Date());
const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const types = { study: 'Konu çalışması', questions: 'Soru çözümü', review: 'Tekrar', exam: 'Deneme', other: 'Diğer' };
let selectedDate = today(), cursor = today(), view = 'month', search = '', subjectFilter = '', undoItem = null;
let queue = new Map(), queueCode, flushing = false;
const days = () => generateDateRange(AppState.program.start_date, AppState.program.exam_date, AppState.program.include_exam_day);
const byDate = (a,b) => a.schedule_date.localeCompare(b.schedule_date) || (a.sort_order || 0) - (b.sort_order || 0);
const subjects = () => new Map(AppState.subjects.map(s => [s.id, s]));
const safeUrl = value => { try { const u = new URL(value); return ['https:','http:'].includes(u.protocol) ? escape(u.href) : ''; } catch { return ''; } };

function loadQueue() {
    if (queueCode === AppState.syncCode) return;
    undoItem = null;
    queueCode = AppState.syncCode;
    try { queue = new Map(JSON.parse(localStorage.getItem('yks_pending_' + queueCode) || '[]')); } catch { queue = new Map(); }
    AppState.pendingItemIds = new Set(queue.keys());
}
function saveQueue() {
    AppState.pendingItemIds = new Set(queue.keys());
    try { localStorage.setItem('yks_pending_' + queueCode, JSON.stringify([...queue])); } catch { AppState.localSaveError = 'Bekleyen kayıtlar saklanamadı. Yedek indir.'; }
}
function enqueue(id, action) { loadQueue(); queue.set(id, { action, version: crypto.randomUUID() }); saveQueue(); }

export async function flushPending() {
    loadQueue();
    if (flushing || !AppState.isSupabaseConnected || !queue.size) return;
    flushing = true;
    AppState.plannerFlushing = true;
    const code = queueCode;
    try {
        await AppState.flushPendingSettings?.();
        for (const [id, operation] of [...queue]) {
            if (code !== AppState.syncCode) break;
            if (operation.action === 'delete') await SupabaseService.deleteScheduleItem(id, code);
            else {
                const item = AppState.scheduleItems.find(i => i.id === id);
                if (item) await SupabaseService.updateScheduleItem(item, code, AppState.program.id, AppState.currentUser?.id);
            }
            if (queue.get(id)?.version === operation.version) queue.delete(id);
            saveQueue();
        }
        AppState.syncError = null;
    } catch (error) {
        AppState.syncError = 'Değişiklikler bu cihazda. Buluta aktarım bekliyor.';
        console.warn('Planner sync pending:', error);
    } finally {
        flushing = false;
        AppState.plannerFlushing = false;
        UI.updateHeaderInfo();
        if (AppState.activeTab === 'schedule') renderPlanner();
    }
}

function filtered(items) {
    const map = subjects();
    return items.filter(i => (!subjectFilter || i.subject_id === subjectFilter) && (!search || [i.title,i.notes,map.get(i.subject_id)?.name].join(' ').toLocaleLowerCase('tr').includes(search.toLocaleLowerCase('tr'))));
}
function taskHTML(item, numbers) {
    const subject = subjects().get(item.subject_id);
    const title = item.title || (subject ? `${subject.name} · ${numbers.get(item.id) || 1}. çalışma` : 'Çalışma');
    const resource = safeUrl(item.resource_url || subject?.youtube_url);
    return `<article class="task-card ${item.completed ? 'is-completed' : ''}">
      <div class="task-top"><input type="checkbox" data-complete="${escape(item.id)}" ${item.completed ? 'checked' : ''} aria-label="${escape(title)} tamamlandı">
      <div class="task-body"><h4 class="task-title">${escape(title)}</h4><p class="task-subtitle">${escape(subject?.name || 'Kişisel görev')}${subject?.teacher ? ' · ' + escape(subject.teacher) : ''}</p></div></div>
      ${item.notes ? `<p class="task-note">${escape(item.notes)}</p>` : ''}
      <div class="task-tags"><span>${types[item.task_type] || types.study}</span>${item.duration_minutes ? `<span>${item.duration_minutes} dk</span>` : ''}${item.question_count ? `<span>${item.question_count} soru</span>` : ''}${item.completed ? '<span>Tamamlandı</span>' : ''}</div>
      <div class="task-actions">${resource ? `<a class="btn btn-ghost btn-sm" href="${resource}" target="_blank" rel="noopener noreferrer">Kaynağı aç ↗</a>` : ''}<button class="btn btn-ghost btn-sm" data-edit="${escape(item.id)}">Düzenle / taşı</button><button class="btn btn-ghost btn-sm" data-delete="${escape(item.id)}" aria-label="${escape(title)} görevini sil">Sil</button></div>
    </article>`;
}
function agenda(date, numbers, onlyPending = false) {
    const all = AppState.scheduleItems.filter(i=>i.schedule_date === date);
    const list = filtered(all).filter(i=>!onlyPending || !i.completed).sort(byDate);
    const done = all.filter(i=>i.completed).length;
    const valid = days().some(d=>d.dateStr === date);
    return `<section class="day-agenda"><div class="agenda-header"><div><p class="eyebrow">${date === today() ? 'BUGÜN' : 'GÜNLÜK PLAN'}</p><h3>${formatTurkishDate(date)}</h3><p>${all.length ? `${done} / ${all.length} görev tamamlandı` : 'Bu günü sen planla.'}</p></div>${valid ? `<button class="btn btn-primary btn-sm" data-add="${date}">+ Görev ekle</button>` : ''}</div>
      <div class="agenda-list">${list.map(i=>taskHTML(i,numbers)).join('') || `<div class="planner-empty"><span class="empty-symbol">○</span><h4>${search || subjectFilter ? 'Eşleşen görev yok' : 'Biraz alan, yeni bir başlangıç.'}</h4><p>${!valid ? 'Bu tarih program aralığının dışında. Tarihleri Ayarlar’dan değiştirebilirsin.' : search || subjectFilter ? 'Aramayı veya ders filtresini değiştir.' : 'Ne çalışacağına sen karar ver. İlk görevini ekleyerek başla.'}</p></div>`}</div></section>`;
}

export function renderPlanner() {
    const root = document.getElementById('plannerRoot');
    if (!root) return;
    loadQueue();
    const range = days(), dates = new Set(range.map(d=>d.dateStr));
    const items = AppState.scheduleItems;
    const current = items.filter(i=>i.schedule_date === today());
    const done = current.filter(i=>i.completed).length;
    const overdue = items.filter(i=>!i.completed && i.schedule_date < today());
    const outOfRange = items.filter(i=>!dates.has(i.schedule_date));
    const totalDone = items.filter(i=>i.completed).length;
    const minutes = current.reduce((sum,i)=>sum + (Number(i.duration_minutes)||0),0);
    const percent = current.length ? Math.round(done/current.length*100) : 0;
    const {numberMap} = calculateDynamicNumbers(items);
    const date = parseISODate(cursor);
    const monthLabel = date.toLocaleDateString('tr-TR',{month:'long',year:'numeric'});
    const title = view === 'today' ? 'Bugünün planı' : view === 'backlog' ? 'Tamamlanmamış işler' : view === 'all' ? 'Tüm görevler' : monthLabel;
    const stat = (label,value,detail) => `<div class="summary-card"><span class="summary-label">${label}</span><strong class="summary-value">${value}</strong><span class="summary-detail">${detail}</span></div>`;
    root.innerHTML = `<div class="planner-intro"><div><p class="eyebrow">HER GÜN, BİR ADIM</p><h2>Planın sana ait.</h2><p>Gününü seç, yapacaklarını yaz. Kendi ritminde ilerle.</p></div><button class="btn btn-primary" data-add="${dates.has(selectedDate) ? selectedDate : range[0]?.dateStr || today()}">+ Görev ekle</button></div>
      <div class="planner-summary">${stat('BUGÜN', `${done}<small> / ${current.length}</small>`, 'görev tamamlandı')}${stat('PLANLANAN SÜRE',minutes ? `${minutes}<small> dk</small>` : '—', 'bugünkü görevlerinin toplamı')}${stat('GENEL İLERLEME',`${totalDone}<small> / ${items.length}</small>`,'görev tamamlandı')}${stat('BEKLEYEN',overdue.length,'geçmiş günlerden kalan görev')}</div>
      <div class="daily-progress"><span>Bugünkü ilerleme</span><div class="progress-track"><div class="progress-fill" style="width:${percent}%"></div></div><strong>%${percent}</strong></div>
      ${AppState.localSaveError ? `<div class="backlog-banner" role="alert">Cihaza kayıt yapılamadı. Verilerini kaybetmemek için yedek indir.<button class="btn btn-secondary btn-sm" data-export>Yedek indir</button></div>` : ''}
      ${queue.size && AppState.isSupabaseConnected ? `<div class="backlog-banner" role="status">${queue.size} değişiklik buluta aktarılmayı bekliyor.<button class="btn btn-secondary btn-sm" data-retry ${flushing ? 'disabled' : ''}>${flushing ? 'Aktarılıyor…' : 'Yeniden dene'}</button></div>` : ''}
      ${AppState.taskMetadataLocalOnly ? '<div class="backlog-banner">Konu, not ve hedef ayrıntıları bu cihazda saklanıyor. Yedek dosyasına dahildir; diğer cihazlara aktarım için veritabanı güncellemesi gerekir.</div>' : ''}
      ${outOfRange.length ? `<div class="backlog-banner">Tarih aralığı dışında ${outOfRange.length} görev korunuyor.<button class="btn btn-ghost btn-sm" data-view="all">Tümünü gör</button></div>` : ''}
      ${undoItem ? `<div class="backlog-banner" role="status">Görev silindi.<button class="btn btn-secondary btn-sm" data-undo>Geri al</button></div>` : ''}
      <div class="planner-toolbar"><div class="calendar-navigation"><button class="btn btn-secondary btn-sm" data-shift="-1" aria-label="Önceki dönem" ${['today','backlog','all'].includes(view) ? 'hidden' : ''}>‹</button><h3 id="calendarTitle">${title}</h3><button class="btn btn-secondary btn-sm" data-shift="1" aria-label="Sonraki dönem" ${['today','backlog','all'].includes(view) ? 'hidden' : ''}>›</button></div>
      <div class="view-switch" aria-label="Takvim görünümü">${[['today','Bugün'],['week','Hafta'],['month','Ay'],['backlog','Bekleyen'],['all','Tümü']].map(([key,label])=>`<button type="button" data-view="${key}" aria-pressed="${view===key}" class="${view===key ? 'active' : ''}">${label}</button>`).join('')}</div></div>
      <div class="planner-controls"><label class="search-field"><span class="sr-only">Görev veya konu ara</span><input id="plannerSearch" class="form-input" type="search" placeholder="Görev veya konu ara…" value="${escape(search)}"></label><label><span class="sr-only">Derse göre filtrele</span><select id="plannerSubjectFilter" class="form-select"><option value="">Tüm dersler</option>${AppState.subjects.map(s=>`<option value="${escape(s.id)}" ${subjectFilter===s.id ? 'selected' : ''}>${escape(s.name)}</option>`).join('')}</select></label><label class="date-jump">Tarihe git<input id="plannerDateJump" class="form-input" type="date" value="${selectedDate}" min="${AppState.program.start_date}" max="${range.at(-1)?.dateStr || ''}"></label>${search || subjectFilter ? '<button class="btn btn-ghost btn-sm" data-clear>Filtreleri temizle</button>' : ''}</div>
      <div id="plannerContent"></div>`;
    const content = document.getElementById('plannerContent');
    if (view === 'today') content.innerHTML = agenda(today(),numberMap);
    else if (view === 'backlog' || view === 'all') {
        const visible = filtered(items).filter(i=>view === 'all' || (!i.completed && i.schedule_date < today()));
        const groups = [...new Set(visible.sort(byDate).map(i=>i.schedule_date))];
        content.innerHTML = `<div class="planner-list">${groups.map(d=>agenda(d,numberMap,view==='backlog')).join('') || '<div class="planner-empty"><h3>Burada bekleyen bir iş yok.</h3><p>Planını görmek veya yeni bir görev yazmak için takvime dönebilirsin.</p></div>'}</div>`;
    } else if (view === 'week') {
        const monday = parseISODate(cursor); monday.setDate(monday.getDate() - (monday.getDay()+6)%7);
        content.innerHTML = `<div class="week-grid">${Array.from({length:7},(_,i)=>{const d=new Date(monday);d.setDate(d.getDate()+i);return `<div class="week-day">${agenda(formatToISODate(d),numberMap)}</div>`;}).join('')}</div>`;
    } else {
        const first = new Date(date.getFullYear(),date.getMonth(),1,12), start = new Date(first);
        start.setDate(start.getDate() - (start.getDay()+6)%7);
        const cellCount = Math.ceil(((first.getDay()+6)%7 + new Date(date.getFullYear(),date.getMonth()+1,0).getDate()) / 7)*7;
        const cells = Array.from({length:cellCount},(_,i)=>{
            const d = new Date(start);d.setDate(d.getDate()+i); const iso=formatToISODate(d);
            const list=filtered(items.filter(t=>t.schedule_date===iso)), count=list.length, completed=list.filter(t=>t.completed).length;
            return `<button type="button" class="month-day ${!dates.has(iso) || d.getMonth()!==date.getMonth() ? 'outside' : ''} ${iso===selectedDate ? 'selected' : ''} ${iso===today() ? 'today' : ''} ${count ? 'has-tasks' : ''}" data-date="${iso}" ${!dates.has(iso) ? 'disabled' : ''} aria-pressed="${iso===selectedDate}" aria-label="${formatTurkishDate(iso)}, ${count} görev, ${completed} tamamlandı"><span class="date-number">${d.getDate()}</span>${count ? `<span class="day-count">${completed}/${count} görev</span><span class="day-dots">${list.slice(0,4).map(t=>`<i class="${t.completed ? 'done' : ''}"></i>`).join('')}</span>` : dates.has(iso) ? '<span class="day-count empty-count">+ Planla</span>' : ''}</button>`;
        }).join('');
        content.innerHTML = `<div class="planner-layout"><section class="calendar-panel" aria-label="Aylık takvim"><div class="month-grid">${['Pzt','Sal','Çar','Per','Cum','Cmt','Paz'].map(d=>`<div class="month-weekday">${d}</div>`).join('')}${cells}</div><p class="calendar-help">Bir gün seçerek görevlerini görüntüle veya ekle.</p></section>${agenda(selectedDate,numberMap)}</div>`;
    }
}

function openTask(date, id) {
    const form = document.getElementById('taskForm');form.reset();form.dataset.itemId=id || '';
    const item = AppState.scheduleItems.find(i=>i.id===id);
    document.getElementById('taskModalTitle').textContent = item ? 'Görevi düzenle' : 'Gününe bir görev ekle';
    document.getElementById('taskSubject').innerHTML = '<option value="">Ders seçmeden devam et</option>' + AppState.subjects.map(s=>`<option value="${escape(s.id)}">${escape(s.name)}</option>`).join('');
    for (const [field,input] of Object.entries({title:'taskTitle',subject_id:'taskSubject',task_type:'taskType',notes:'taskNotes',duration_minutes:'taskDuration',question_count:'taskQuestions',resource_url:'taskResource'})) document.getElementById(input).value = item?.[field] ?? (field==='task_type' ? 'study' : '');
    document.getElementById('taskDate').value = item?.schedule_date || date;
    document.getElementById('taskDate').min = AppState.program.start_date;
    document.getElementById('taskDate').max = days().at(-1)?.dateStr || AppState.program.exam_date;
    UI.openModal('taskModal');
}

function downloadBackup() {
    const url=URL.createObjectURL(new Blob([JSON.stringify(AppState.createBackup(),null,2)],{type:'application/json'}));
    const a=document.createElement('a');a.href=url;a.download=`yks-planim-${today()}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}

export function initPlanner() {
    loadQueue();
    const range=days();
    if (!range.some(d=>d.dateStr===selectedDate) && range.length) selectedDate=cursor=range[0].dateStr;
    try { document.documentElement.dataset.theme=localStorage.getItem('yks_theme') || 'light'; } catch {}
    document.getElementById('themeToggle').addEventListener('click',()=>{
        const next=document.documentElement.dataset.theme==='dark' ? 'light' : 'dark';
        document.documentElement.dataset.theme=next;
        try { localStorage.setItem('yks_theme',next); } catch {}
    });
    document.getElementById('plannerRoot').addEventListener('click',async e=>{
        const b=e.target.closest('button');if(!b)return;
        if(b.hasAttribute('data-add'))return openTask(b.dataset.add);
        if(b.hasAttribute('data-edit'))return openTask(null,b.dataset.edit);
        if(b.hasAttribute('data-export'))return downloadBackup();
        if(b.hasAttribute('data-retry'))return flushPending();
        if(b.hasAttribute('data-delete')){
            undoItem=AppState.scheduleItems.find(i=>i.id===b.dataset.delete);
            AppState.scheduleItems=AppState.scheduleItems.filter(i=>i.id!==b.dataset.delete);
            enqueue(b.dataset.delete,'delete');AppState.notify('task_deleted');flushPending();return;
        }
        if(b.hasAttribute('data-undo') && undoItem){const restored=undoItem;undoItem=null;AppState.scheduleItems.push(restored);enqueue(restored.id,'save');AppState.notify('task_restored');flushPending();return;}
        if(b.dataset.date){selectedDate=b.dataset.date;}
        if(b.dataset.view){view=b.dataset.view;if(view==='today'){selectedDate=cursor=today();}}
        if(b.dataset.shift){const d=parseISODate(cursor);if(view==='week')d.setDate(d.getDate()+7*Number(b.dataset.shift));else {d.setDate(1);d.setMonth(d.getMonth()+Number(b.dataset.shift));}cursor=formatToISODate(d);}
        if(b.hasAttribute('data-clear')){search='';subjectFilter='';}
        renderPlanner();
    });
    document.getElementById('plannerRoot').addEventListener('change',e=>{
        if(e.target.dataset.complete){const item=AppState.scheduleItems.find(i=>i.id===e.target.dataset.complete);if(!item)return;item.completed=e.target.checked;item.completed_at=item.completed?new Date().toISOString():null;enqueue(item.id,'save');AppState.notify('task_completed');flushPending();}
        if(e.target.id==='plannerSubjectFilter'){subjectFilter=e.target.value;renderPlanner();}
        if(e.target.id==='plannerDateJump' && e.target.value && e.target.validity.valid){selectedDate=cursor=e.target.value;view='month';renderPlanner();}
    });
    document.getElementById('plannerRoot').addEventListener('input',e=>{
        if(e.target.id!=='plannerSearch')return;
        search=e.target.value;renderPlanner();const field=document.getElementById('plannerSearch');field.focus();
    });
    document.getElementById('taskForm').addEventListener('submit',e=>{
        e.preventDefault();
        const form=e.target, id=form.dataset.itemId, old=AppState.scheduleItems.find(i=>i.id===id);
        const value=id=>document.getElementById(id).value.trim();
        const subjectId=value('taskSubject'), title=value('taskTitle'), date=value('taskDate');
        if(!title && !subjectId){UI.showToast('Bir görev başlığı yaz veya ders seç.','warning');return;}
        if(!days().some(d=>d.dateStr===date)){UI.showToast('Programın tarih aralığından bir gün seç.','warning');return;}
        if(subjectId && subjectId!==old?.subject_id){const result=validateAddSubjectToDay(AppState.scheduleItems,date,subjects().get(subjectId));if(!result.valid){UI.showToast(result.message,'warning');return;}}
        const resource=value('taskResource');if(resource && !safeUrl(resource)){UI.showToast('Kaynak bağlantısı https:// veya http:// ile başlamalı.','warning');return;}
        const item={...old,id:id||crypto.randomUUID(),program_id:AppState.program.id,sync_code:AppState.syncCode,subject_id:subjectId,schedule_date:date,day_number:days().find(d=>d.dateStr===date).dayIndex,sort_order:old?.schedule_date===date?old.sort_order:Math.max(-1,...AppState.scheduleItems.filter(i=>i.schedule_date===date).map(i=>i.sort_order||0))+1,completed:old?.completed||false,created_at:old?.created_at||new Date().toISOString(),title,notes:value('taskNotes'),task_type:value('taskType'),duration_minutes:Number(value('taskDuration'))||0,question_count:Number(value('taskQuestions'))||0,resource_url:resource};
        if(old)AppState.scheduleItems=AppState.scheduleItems.map(i=>i.id===id?item:i);else AppState.scheduleItems.push(item);
        selectedDate=cursor=date;enqueue(item.id,'save');UI.closeModal('taskModal');AppState.notify('task_saved');UI.showToast('Görev kaydedildi.','success');flushPending();
    });
    document.getElementById('exportBackup').addEventListener('click',downloadBackup);
    document.getElementById('importBackup').addEventListener('change',async e=>{
        const file=e.target.files[0];if(!file)return;
        try {
            if(file.size>10*1024*1024)throw new Error('Yedek dosyası 10 MB sınırını aşıyor.');
            const backup=validateBackup(JSON.parse(await file.text()));
            if(!confirm(`Yedekte ${backup.scheduleItems.length} görev var. Mevcut programın yerine yüklensin mi? Önce mevcut programın yedeği indirilecek.`))return;
            downloadBackup();
            const previous=[...AppState.scheduleItems];
            AppState.restoreBackup(backup);
            AppState.queueSettingsForSync?.();
            previous.filter(i=>!AppState.scheduleItems.some(n=>n.id===i.id)).forEach(i=>enqueue(i.id,'delete'));
            AppState.scheduleItems.forEach(i=>enqueue(i.id,'save'));
            AppState.notify('backup_restored');UI.showToast('Yedek bu cihaza yüklendi.','success');
            if(AppState.isSupabaseConnected){
                try { await SupabaseService.saveProgram(AppState.program,AppState.syncCode,AppState.currentUser?.id);for(const s of AppState.subjects)await SupabaseService.saveSubject(s,AppState.syncCode,AppState.program.id,AppState.currentUser?.id);await flushPending(); }
                catch {UI.showToast('Yedek bu cihazda korundu. Buluta aktarım tamamlanamadı.','warning');}
            }
        } catch(error){UI.showToast(error.message || 'Yedek okunamadı.','error');}finally{e.target.value='';}
    });
    window.addEventListener('online',flushPending);
    document.addEventListener('keydown',e=>{
        const modal=document.querySelector('.modal-overlay.open');
        if(!modal)return;
        if(e.key==='Escape'){UI.closeAllModals();return;}
        if(e.key==='Tab'){
            const controls=[...modal.querySelectorAll('button,input,select,textarea,a[href]')].filter(el=>!el.disabled && el.getClientRects().length);
            const first=controls[0],last=controls.at(-1);
            if(e.shiftKey && (document.activeElement===first || !modal.contains(document.activeElement))){e.preventDefault();last?.focus();}
            else if(!e.shiftKey && document.activeElement===last){e.preventDefault();first?.focus();}
        }
    });
    AppState.subscribe(event=>{if(event==='supabase_synced')flushPending();});
    let lastDay=today();setInterval(()=>{if(today()!==lastDay){lastDay=today();UI.updateHeaderInfo();if(AppState.activeTab==='schedule')renderPlanner();}},60000);
}
