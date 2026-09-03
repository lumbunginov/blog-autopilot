const test = require('node:test');
const assert = require('node:assert');
const {
  takenDatesFromCache, addDays, toScheduleString, utcOffsetHours,
  assertTimezoneContract, scheduleStringToInstant, earliestSchedulableDate, findAvailableDate
} = require('./schedule-date');

const WIB = { timeZone: 'Asia/Jakarta', gmtOffset: 7 };

test('tanggal terpakai diambil dari field date di cache', () => {
  const cache = { articles: [
    { id: 1, date: '2026-04-13', slug: 'a' },
    { id: 2, date: '2026-04-15', slug: 'b' },
    { id: 3, date: '', slug: 'c' }
  ]};
  assert.deepStrictEqual([...takenDatesFromCache(cache)].sort(), ['2026-04-13', '2026-04-15']);
});

test('draft tidak menempati slot — tanggalnya cuma waktu simpan-terakhir', () => {
  const cache = { articles: [{ id: 1, date: '2026-04-13', status: 'draft' }] };
  assert.strictEqual(takenDatesFromCache(cache).size, 0);
});

test('publish menempati slot', () => {
  const cache = { articles: [{ id: 1, date: '2026-04-13', status: 'publish' }] };
  assert.deepStrictEqual([...takenDatesFromCache(cache)], ['2026-04-13']);
});

test('future (terjadwal) menempati slot', () => {
  const cache = { articles: [{ id: 1, date: '2026-04-13', status: 'future' }] };
  assert.deepStrictEqual([...takenDatesFromCache(cache)], ['2026-04-13']);
});

test('status tidak dikenal atau hilang tetap dianggap menempati slot (default konservatif)', () => {
  const cache = { articles: [
    { id: 1, date: '2026-04-13', status: 'pending' },
    { id: 2, date: '2026-04-14' }
  ]};
  assert.deepStrictEqual([...takenDatesFromCache(cache)].sort(), ['2026-04-13', '2026-04-14']);
});

test('cache kosong atau null menghasilkan himpunan kosong', () => {
  assert.strictEqual(takenDatesFromCache(null).size, 0);
  assert.strictEqual(takenDatesFromCache({}).size, 0);
});

test('stempel ISO penuh diterima, diambil bagian tanggalnya', () => {
  const cache = { articles: [{ id: 1, date: '2026-04-13T09:08:13.536Z' }] };
  assert.deepStrictEqual([...takenDatesFromCache(cache)], ['2026-04-13']);
});

test('addDays melewati batas bulan dan tahun', () => {
  assert.strictEqual(addDays('2026-01-31', 1), '2026-02-01');
  assert.strictEqual(addDays('2026-12-31', 1), '2027-01-01');
  assert.strictEqual(addDays('2028-02-28', 1), '2028-02-29');
});

test('string jadwal tidak membawa offset UTC', () => {
  assert.strictEqual(toScheduleString('2026-07-21', 6, WIB), '2026-07-21T06:00:00');
  assert.doesNotMatch(toScheduleString('2026-07-21', 6, WIB), /Z|\+/);
});

test('toScheduleString menolak mencetak tanpa ctx zona terverifikasi', () => {
  assert.throws(() => toScheduleString('2026-07-21', 6), /ctx.*terverifikasi/i);
  assert.throws(() => toScheduleString('2026-07-21', 6, {}), /ctx.*terverifikasi/i);
});

test('toScheduleString menjalankan kontrak zona — ctx yang tidak cocok GAGAL mencetak', () => {
  assert.throws(
    () => toScheduleString('2026-07-21', 6, { timeZone: 'Asia/Makassar', gmtOffset: 7 }),
    /kontrak zona/i
  );
});

test('utcOffsetHours membaca basis data zona sungguhan', () => {
  assert.strictEqual(utcOffsetHours('Asia/Jakarta', new Date('2026-07-01T00:00:00Z')), 7);
  assert.strictEqual(utcOffsetHours('America/New_York', new Date('2026-01-15T00:00:00Z')), -5);
  assert.strictEqual(utcOffsetHours('America/New_York', new Date('2026-07-15T00:00:00Z')), -4);
});

test('kontrak zona lulus kalau zona dan offset cocok', () => {
  assert.doesNotThrow(() => assertTimezoneContract(WIB, new Date('2026-07-01T00:00:00Z')));
});

test('kontrak zona GAGAL kalau zona dan offset berbeda — ini bug yang dicegah', () => {
  assert.throws(
    () => assertTimezoneContract({ timeZone: 'Asia/Makassar', gmtOffset: 7 }, new Date('2026-07-01T00:00:00Z')),
    /kontrak zona/i
  );
});

test('slot terbit teruraikan ke instan yang benar bagi penerima', () => {
  // 06:00 WIB tanggal 21 = 23:00Z tanggal 20.
  assert.strictEqual(
    scheduleStringToInstant('2026-07-21T06:00:00', 7).toISOString(),
    '2026-07-20T23:00:00.000Z'
  );
});

test('scheduleStringToInstant menolak string yang tidak jelas artinya', () => {
  assert.throws(() => scheduleStringToInstant('2026-07-21T06:00:00Z', 7), /bukan string jadwal/i);
  assert.throws(() => scheduleStringToInstant('2026-07-21', 7), /bukan string jadwal/i);
});

test('sebelum jam terbit, hari ini masih boleh dipakai', () => {
  // 2026-07-19T22:30Z = 2026-07-20 05:30 WIB
  assert.strictEqual(
    earliestSchedulableDate({ ...WIB, hour: 6 }, new Date('2026-07-19T22:30:00Z')),
    '2026-07-20'
  );
});

test('tepat jam terbit sudah dianggap lewat', () => {
  // 2026-07-19T23:00Z = 2026-07-20 06:00 WIB
  assert.strictEqual(
    earliestSchedulableDate({ ...WIB, hour: 6 }, new Date('2026-07-19T23:00:00Z')),
    '2026-07-21'
  );
});

test('tanggal yang sudah terpakai dilewati', () => {
  const taken = new Set(['2026-07-20', '2026-07-21']);
  const r = findAvailableDate({
    takenDates: taken, startDate: null, ...WIB, hour: 6,
    now: new Date('2026-07-19T22:00:00Z')
  });
  assert.strictEqual(r, '2026-07-22T06:00:00');
});

test('tanggal permintaan di masa lalu ditarik ke yang paling awal', () => {
  const r = findAvailableDate({
    takenDates: new Set(), startDate: '2020-01-01', ...WIB, hour: 6,
    now: new Date('2026-07-19T22:00:00Z')
  });
  assert.strictEqual(r, '2026-07-20T06:00:00');
});

test('null kalau semua hari dalam rentang pencarian sudah terpakai', () => {
  const taken = new Set();
  for (let i = 0; i < 40; i++) taken.add(addDays('2026-07-20', i));
  const r = findAvailableDate({
    takenDates: taken, startDate: null, ...WIB, hour: 6,
    now: new Date('2026-07-19T22:00:00Z'), maxDaysAhead: 30
  });
  assert.strictEqual(r, null);
});
