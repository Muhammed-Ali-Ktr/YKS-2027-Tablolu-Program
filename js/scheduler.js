/**
 * YKS 2027 Kişisel Çalışma Programı - Çizelgeleme & Dinamik Numaralandırma Mantığı
 */

const TURKISH_MONTHS = [
    'Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran',
    'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'
];

const TURKISH_DAYS = [
    'Pazar', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi'
];

/**
 * Bir 'YYYY-MM-DD' dizgisini yerel saat farkı etkilemeden güvenli Date nesnesine çevirir
 */
export function parseISODate(dateStr) {
    if (!isValidISODate(dateStr)) return new Date(NaN);
    const [year, month, day] = dateStr.split('-').map(Number);
    return new Date(year, month - 1, day, 12, 0, 0); // Öğlen saatine ayarlayarak saat dilimi kaymalarını önler
}

export function isValidISODate(value) {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const [year, month, day] = value.split('-').map(Number);
    if (year < 1900 || year > 2200) return false;
    const date = new Date(year, month - 1, day, 12);
    return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
}

/**
 * Bir Date nesnesini 'YYYY-MM-DD' dizgisine çevirir
 */
export function formatToISODate(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

/**
 * Türkçe tarih biçimlendirme (Örn: "20 Eylül 2026 Pazar")
 */
export function formatTurkishDate(dateStr, includeWeekday = true) {
    if (!dateStr) return '';
    const date = parseISODate(dateStr);
    const day = date.getDate();
    const month = TURKISH_MONTHS[date.getMonth()];
    const year = date.getFullYear();
    const weekday = TURKISH_DAYS[date.getDay()];
    return includeWeekday ? `${day} ${month} ${year} ${weekday}` : `${day} ${month} ${year}`;
}

/**
 * ISO Hafta Günü Numarası (1: Pazartesi, 2: Salı, ..., 7: Pazar)
 */
export function getIsoWeekday(dateStr) {
    if (!dateStr) return 1;
    const date = parseISODate(dateStr);
    const day = date.getDay();
    return day === 0 ? 7 : day;
}

/**
 * Kısa Türkçe tarih biçimlendirme (Örn: "20 Eyl")
 */
export function formatShortDate(dateStr) {
    if (!dateStr) return '';
    const date = parseISODate(dateStr);
    const day = date.getDate();
    const month = TURKISH_MONTHS[date.getMonth()].slice(0, 3);
    return `${day} ${month}`;
}

/**
 * Sınava kalan gün sayısını hesaplar
 */
export function getRemainingDays(examDateStr) {
    if (!isValidISODate(examDateStr)) return 0;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const examDate = parseISODate(examDateStr);
    examDate.setHours(0, 0, 0, 0);

    const diffTime = examDate.getTime() - today.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return Math.max(0, diffDays);
}

/**
 * Başlangıç tarihinden sınav tarihine kadar olan tüm takvim günlerini üretir
 */
export function generateDateRange(startDateStr, examDateStr, includeExamDay = false) {
    const days = [];
    if (!isValidISODate(startDateStr) || !isValidISODate(examDateStr) || startDateStr > examDateStr) return days;

    const start = parseISODate(startDateStr);
    start.setHours(0, 0, 0, 0);

    const exam = parseISODate(examDateStr);
    exam.setHours(0, 0, 0, 0);

    const todayStr = formatToISODate(new Date());

    let current = new Date(start);
    let dayIndex = 1;

    while (true) {
        const currentDateStr = formatToISODate(current);
        const isExamDay = currentDateStr === examDateStr;

        if (current > exam) {
            break;
        }

        if (isExamDay && !includeExamDay) {
            break;
        }

        days.push({
            dayIndex: dayIndex,
            dateStr: currentDateStr,
            formattedDate: formatTurkishDate(currentDateStr),
            shortDate: formatShortDate(currentDateStr),
            isToday: currentDateStr === todayStr,
            isPast: currentDateStr < todayStr,
            isExamDay: isExamDay
        });

        if (isExamDay && includeExamDay) {
            break;
        }

        current.setDate(current.getDate() + 1);
        dayIndex++;
    }

    return days;
}

/**
 * Dinamik Numaralandırma Motoru (KRİTİK MANTIK):
 * Tüm program kayıtlarını tarihe ve sıra numarasına göre sıralar.
 * Her ders için global bir sayaç tutar ve her kayda dinamik çalışma numarasını atar.
 * 
 * Örneğin:
 * 1. Gün -> TYT Matematik (Sıra 1)
 * 2. Gün -> TYT Fizik (Sıra 1)
 * 3. Gün -> TYT Matematik (Sıra 2)
 * 3. gündeki silinirse veya yeri değişirse numaralar dinamik olarak 1, 2 şeklinde yeniden hizalanır.
 * 
 * @param {Array} scheduleItems 
 * @returns {Map<string, number>} itemId -> dynamicStudyNumber haritası
 */
export function calculateDynamicNumbers(scheduleItems) {
    const numberMap = new Map();
    const subjectCounters = new Map();

    if (!Array.isArray(scheduleItems)) return { numberMap, totalPlannedPerSubject: subjectCounters };

    // Tarihe göre artan, aynı gün içindeyse sort_order veya oluşturulma anına göre sırala
    const sorted = [...scheduleItems].sort((a, b) => {
        if (a.schedule_date !== b.schedule_date) {
            return a.schedule_date.localeCompare(b.schedule_date);
        }
        const orderA = a.sort_order ?? 0;
        const orderB = b.sort_order ?? 0;
        if (orderA !== orderB) return orderA - orderB;
        return (a.created_at || '').localeCompare(b.created_at || '');
    });

    for (const item of sorted) {
        const currentCount = (subjectCounters.get(item.subject_id) || 0) + 1;
        subjectCounters.set(item.subject_id, currentCount);
        numberMap.set(item.id, currentCount);
    }

    return {
        numberMap,
        totalPlannedPerSubject: subjectCounters
    };
}

/**
 * Belirli bir dersten şu ana kadar programa kaç kez eklendiğini hesaplar
 */
export function getSubjectPlannedCount(scheduleItems, subjectId) {
    if (!Array.isArray(scheduleItems)) return 0;
    return scheduleItems.filter(item => item.subject_id === subjectId).length;
}

/**
 * Belirli bir dersten kaç tanesinin 'tamamlandı' olarak işaretlendiğini hesaplar
 */
export function getSubjectCompletedCount(scheduleItems, subjectId) {
    if (!Array.isArray(scheduleItems)) return 0;
    return scheduleItems.filter(item => item.subject_id === subjectId && item.completed).length;
}

/**
 * Aynı güne aynı dersten birden fazla bölüm eklenebilir.
 * Limit dolduğunda, eklenen bölüm karşılığında programın sonundaki (daha ileri tarihteki) kayıt düşer.
 */
export function findSubjectOccurrenceToTrim(scheduleItems, subjectId, targetDateStr) {
    if (!Array.isArray(scheduleItems) || !subjectId || !targetDateStr) return null;

    const laterItems = scheduleItems.filter(
        item => item.subject_id === subjectId && item.schedule_date > targetDateStr
    );
    if (laterItems.length === 0) return null;

    const byLastInProgram = (a, b) => {
        if (a.schedule_date !== b.schedule_date) {
            return b.schedule_date.localeCompare(a.schedule_date);
        }
        const orderA = a.sort_order ?? 0;
        const orderB = b.sort_order ?? 0;
        if (orderA !== orderB) return orderB - orderA;
        return (b.created_at || '').localeCompare(a.created_at || '');
    };

    const incompleteLater = laterItems.filter(item => !item.completed);
    const pool = incompleteLater.length > 0 ? incompleteLater : laterItems;
    return [...pool].sort(byLastInProgram)[0] || null;
}

function previewNextStudyNumber(scheduleItems, dateStr, subjectId, trimItemId = null) {
    const items = (scheduleItems || []).filter(item => item.id !== trimItemId);
    const previewId = '__preview-add__';
    const previewItems = [
        ...items,
        {
            id: previewId,
            subject_id: subjectId,
            schedule_date: dateStr,
            sort_order: 9999,
            created_at: '9999-12-31T00:00:00.000Z'
        }
    ];
    const { numberMap } = calculateDynamicNumbers(previewItems);
    return numberMap.get(previewId) || (items.filter(i => i.subject_id === subjectId).length + 1);
}

/**
 * Bir derse ait yeni bir bölüm eklenmeden önceki doğrulama
 */
export function validateAddSubjectToDay(scheduleItems, dateStr, subject) {
    if (!isValidISODate(dateStr)) return { valid: false, message: 'Geçerli bir çalışma tarihi seçin.' };
    if (!subject) {
        return { valid: false, message: 'Ders bulunamadı.' };
    }

    const items = Array.isArray(scheduleItems) ? scheduleItems : [];
    const plannedCount = getSubjectPlannedCount(items, subject.id);
    const sameDayCount = items.filter(
        item => item.schedule_date === dateStr && item.subject_id === subject.id
    ).length;

    if (plannedCount < subject.total_days) {
        return {
            valid: true,
            nextStudyNumber: previewNextStudyNumber(items, dateStr, subject.id),
            willTrimLast: false,
            trimItem: null,
            sameDayCount
        };
    }

    return {
        valid: false,
        message: `"${subject.name}" için ${subject.total_days} bölümün tamamı planlandı. Yeni çalışma eklemek için Dersler bölümünden toplam bölüm sayısını artırın.`,
        willTrimLast: false,
        trimItem: null,
        sameDayCount
    };
}
