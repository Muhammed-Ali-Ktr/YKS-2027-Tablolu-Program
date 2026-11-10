import assert from 'node:assert/strict';

const storage = new Map();
globalThis.localStorage = {
    getItem: key => storage.get(key) ?? null,
    setItem: (key, value) => storage.set(key, value),
    removeItem: key => storage.delete(key)
};
const { AppState, validateBackup } = await import('../js/state.js');
AppState.subjects = [{ id: 'math', name: 'Matematik', total_days: 10, exam_type: 'TYT' }];
AppState.scheduleItems = [{ id: 'task', subject_id: 'math', schedule_date: '2026-11-10', title: 'Üslü sayılar', notes: 'Sayfa 15', duration_minutes: 45, completed: false }];
AppState.program.start_date = '2026-11-10';
const snapshot = AppState.createBackup();
AppState.scheduleItems[0].notes = 'değişiklik';
assert.equal(snapshot.scheduleItems[0].notes, 'Sayfa 15');
assert.equal(validateBackup(JSON.stringify(snapshot)).scheduleItems[0].duration_minutes, 45);
assert.throws(() => validateBackup({ ...snapshot, program: { ...snapshot.program, start_date: '2026-02-30' } }));
assert.throws(() => validateBackup({ ...snapshot, scheduleItems: [...snapshot.scheduleItems, snapshot.scheduleItems[0]] }));
const merged = AppState.mergeRemoteItems([{ id: 'task', completed: true, schedule_date: '2026-11-11' }]);
assert.equal(merged[0].title, 'Üslü sayılar');
assert.equal(merged[0].schedule_date, '2026-11-11');
assert.equal(merged[0].completed, true);
assert.equal(AppState.mergeRemoteItems([{ id: 'task', title: '' }])[0].title, '');
const identity = AppState.program.id;
AppState.restoreBackup(snapshot);
assert.equal(AppState.program.id, identity);
assert.equal(AppState.scheduleItems[0].notes, 'Sayfa 15');
assert.equal(AppState.saveToLocal(), true);
AppState.scheduleItems = [];
AppState.loadFromLocal();
assert.equal(AppState.scheduleItems[0].title, 'Üslü sayılar');
const setter = localStorage.setItem;
localStorage.setItem = () => { throw new Error('quota'); };
const warn = console.warn;
console.warn = () => {};
assert.equal(AppState.saveToLocal(), false);
assert.ok(AppState.localSaveError);
localStorage.setItem = setter;
console.warn = warn;
assert.equal(AppState.saveToLocal(), true);
assert.equal(AppState.localSaveError, null);

// Exercise the legacy cloud fallback without contacting a real user database.
const writes = [];
let readsFail = false;
globalThis.window = { supabase: { createClient: () => ({ from: () => {
    let payload;
    const query = {
        upsert(value) { payload = value; writes.push(value); return query; },
        select() { return query; }, eq() { return query; }, order() { return query; },
        async single() { return 'title' in payload ? { error: { code: 'PGRST204', message: "Could not find the 'title' column" } } : { data: { ...payload } }; },
        async maybeSingle() { return { error: { message: 'Network error' } }; },
        then(resolve) { return Promise.resolve(readsFail ? { error: { message: 'Network error' } } : { data: [] }).then(resolve); }
    };
    return query;
} }) } };
const { SupabaseService } = await import('../js/supabase.js');
SupabaseService.initClient();
const saved = await SupabaseService.updateScheduleItem(AppState.scheduleItems[0], 'test-code', 'test-program');
assert.equal(writes.length, 2);
assert.equal(saved.title, 'Üslü sayılar');
assert.equal(AppState.taskMetadataLocalOnly, true);
assert.equal('title' in writes[1], false);
readsFail = true;
console.warn = () => {};
await assert.rejects(SupabaseService.loadScheduleItemsBySyncCode('test-code'));
await assert.rejects(SupabaseService.loadProgramBySyncCode('test-code'));
console.warn = warn;
console.log('Backup round trip, validation, metadata merge, storage failure and legacy cloud tests passed.');
