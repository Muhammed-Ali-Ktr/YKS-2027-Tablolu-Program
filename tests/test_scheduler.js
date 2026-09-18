/**
 * YKS 2027 Dinamik Numaralandırma Senaryo Testi (Madde 26)
 */

import { calculateDynamicNumbers, validateAddSubjectToDay } from '../js/scheduler.js';

console.log('=== YKS 2027 SENARYO DOĞRULAMA TESTİ BAŞLIYOR ===\n');

// 1. Ders Tanımları
const tytMat = { id: 'mat', name: 'TYT Matematik', total_days: 70 };
const tytFiz = { id: 'fiz', name: 'TYT Fizik', total_days: 55 };
const tytKim = { id: 'kim', name: 'TYT Kimya', total_days: 50 };

// 2. Programa Ekleme
let scheduleItems = [
    // 1. Gün
    { id: 'item-1', subject_id: 'mat', schedule_date: '2026-09-20', day_number: 1, sort_order: 0 },
    { id: 'item-2', subject_id: 'kim', schedule_date: '2026-09-20', day_number: 1, sort_order: 1 },
    // 2. Gün
    { id: 'item-3', subject_id: 'mat', schedule_date: '2026-09-21', day_number: 2, sort_order: 0 },
    { id: 'item-4', subject_id: 'fiz', schedule_date: '2026-09-21', day_number: 2, sort_order: 1 },
    // 3. Gün
    { id: 'item-5', subject_id: 'mat', schedule_date: '2026-09-22', day_number: 3, sort_order: 0 },
    { id: 'item-6', subject_id: 'kim', schedule_date: '2026-09-22', day_number: 3, sort_order: 1 },
    // 4. Gün
    { id: 'item-7', subject_id: 'fiz', schedule_date: '2026-09-23', day_number: 4, sort_order: 0 }
];

// Hesapla
let { numberMap } = calculateDynamicNumbers(scheduleItems);

console.log('1. Aşama: 4 günlük yerleşim sonucu');
console.log('Gün 1: TYT Mat ->', numberMap.get('item-1'), '(Beklenen: 1)');
console.log('Gün 1: TYT Kim ->', numberMap.get('item-2'), '(Beklenen: 1)');
console.log('Gün 2: TYT Mat ->', numberMap.get('item-3'), '(Beklenen: 2)');
console.log('Gün 2: TYT Fiz ->', numberMap.get('item-4'), '(Beklenen: 1)');
console.log('Gün 3: TYT Mat ->', numberMap.get('item-5'), '(Beklenen: 3)');
console.log('Gün 3: TYT Kim ->', numberMap.get('item-6'), '(Beklenen: 2)');
console.log('Gün 4: TYT Fiz ->', numberMap.get('item-7'), '(Beklenen: 2)');

const pass1 = 
    numberMap.get('item-1') === 1 &&
    numberMap.get('item-2') === 1 &&
    numberMap.get('item-3') === 2 &&
    numberMap.get('item-4') === 1 &&
    numberMap.get('item-5') === 3 &&
    numberMap.get('item-6') === 2 &&
    numberMap.get('item-7') === 2;

if (!pass1) {
    console.error('❌ HATA: 1. Aşama sonuçları beklendiği gibi değil!');
    process.exit(1);
} else {
    console.log('✅ 1. Aşama Testi BAŞARILI!\n');
}

// 2. Aşama: 3. gündeki TYT Matematik (item-5) siliniyor
console.log('2. Aşama: 3. gündeki TYT Matematik (item-5) siliniyor...');
scheduleItems = scheduleItems.filter(item => item.id !== 'item-5');

const result2 = calculateDynamicNumbers(scheduleItems);
const numberMap2 = result2.numberMap;

console.log('Silme Sonrası Gün 1 TYT Mat ->', numberMap2.get('item-1'), '(Beklenen: 1)');
console.log('Silme Sonrası Gün 2 TYT Mat ->', numberMap2.get('item-3'), '(Beklenen: 2)');
console.log('Gün 3 TYT Kim ->', numberMap2.get('item-6'), '(Beklenen: 2)');
console.log('Gün 4 TYT Fiz ->', numberMap2.get('item-7'), '(Beklenen: 2)');

const pass2 = 
    numberMap2.get('item-1') === 1 &&
    numberMap2.get('item-3') === 2 &&
    !numberMap2.has('item-5');

if (!pass2) {
    console.error('❌ HATA: 2. Aşama silme sonrası numaralandırma beklendiği gibi değil!');
    process.exit(1);
} else {
    console.log('✅ 2. Aşama Dinamik Yeniden Numaralandırma Testi BAŞARILI!\n');
}

// 3. Aşama: Aynı gün aynı dersi ekleme kontrolü
console.log('3. Aşama: Aynı güne aynı dersi ekleme engeli...');
const dupCheck = validateAddSubjectToDay(scheduleItems, '2026-09-20', tytMat);
console.log('Aynı gün TYT Mat ekleme izni:', dupCheck.valid, `(${dupCheck.message})`);
if (dupCheck.valid !== false) {
    console.error('❌ HATA: Aynı güne mükerrer ders eklenmesine izin verildi!');
    process.exit(1);
} else {
    console.log('✅ 3. Aşama Mükerrer Ders Engeli Testi BAŞARILI!\n');
}

// 4. Aşama: Toplam limit kontrolü
console.log('4. Aşama: Toplam gün limiti aşım kontrolü...');
const testLimitedSub = { id: 'limit-test', name: 'Mini Ders', total_days: 2 };
const limitedItems = [
    { id: 'l1', subject_id: 'limit-test', schedule_date: '2026-09-20' },
    { id: 'l2', subject_id: 'limit-test', schedule_date: '2026-09-21' }
];
const limitCheck = validateAddSubjectToDay(limitedItems, '2026-09-22', testLimitedSub);
console.log('Limit dolunca 3. ekleme izni:', limitCheck.valid, `(${limitCheck.message})`);
if (limitCheck.valid !== false) {
    console.error('❌ HATA: Toplam gün limitini aşan derse izin verildi!');
    process.exit(1);
} else {
    console.log('✅ 4. Aşama Limit Kontrolü Testi BAŞARILI!\n');
}

console.log('🎉 TÜM TESTLER BAŞARIYLA GEÇTİ!');
