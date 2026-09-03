'use strict';
// ---------------------------------------------------------------------------
// KONTRAK ZONA WAKTU — baca sebelum mengubah apa pun di sini.
//
// Modul ini memancarkan string tanggal TANPA offset UTC. WordPress membaca
// `date` tanpa offset dalam zona waktu SITUS-nya sendiri. Jadi satu-satunya
// zona yang membuat string itu berarti sesuai maksud kita adalah zona situs.
//
// Di skill lama (Perkap Article), nilai ini dikunci ke WIB (UTC+7) karena
// perkap.com melaporkan gmt_offset "7". Di sini nilainya PER TENANT, dibaca
// dari config.workflow.site_gmt_offset + site_timezone, karena blog lain bisa
// berada di zona lain — dan salah offset berarti artikel terbit di jam yang
// salah tanpa satu pun error muncul.
//
// assertTimezoneContract mengecek keduanya saling cocok, supaya keduanya tidak
// bisa berbeda diam-diam.
// ---------------------------------------------------------------------------

const DEFAULT_MAX_DAYS_AHEAD = 30;
const pad = (n) => String(n).padStart(2, '0');

function takenDatesFromCache(cache) {
  const out = new Set();
  const articles = cache && Array.isArray(cache.articles) ? cache.articles : [];
  for (const a of articles) {
    const m = String(a && a.date || '').match(/^(\d{4}-\d{2}-\d{2})/);
    if (m) out.add(m[1]);
  }
  return out;
}

function utcOffsetHours(timeZone, at = new Date()) {
  const p = new Intl.DateTimeFormat('en-CA', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23'
  }).formatToParts(at).reduce((acc, x) => ((acc[x.type] = x.value), acc), {});
  const wallClockAsIfUtc = Date.UTC(
    Number(p.year), Number(p.month) - 1, Number(p.day),
    Number(p.hour), Number(p.minute), Number(p.second));
  return Math.round((wallClockAsIfUtc - at.getTime()) / 60000) / 60;
}

function assertTimezoneContract({ timeZone, gmtOffset }, at = new Date()) {
  const actual = utcOffsetHours(timeZone, at);
  if (actual !== gmtOffset) {
    throw new Error(
      `Kontrak zona rusak: modul menghitung dalam ${timeZone} (UTC${actual >= 0 ? '+' : ''}${actual}) ` +
      `tapi situs WordPress diset UTC+${gmtOffset}. String jadwal tanpa offset akan terbit di jam yang salah. ` +
      `Ukur ulang gmt_offset di <url-situs>/wp-json/ lalu perbarui workflow.site_gmt_offset ` +
      `dan workflow.site_timezone bersamaan.`
    );
  }
}

function scheduleStringToInstant(scheduleStr, gmtOffset) {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})$/.exec(String(scheduleStr).trim());
  if (!m) throw new Error(`Bukan string jadwal (harus YYYY-MM-DDTHH:MM:SS): "${scheduleStr}"`);
  const [, y, mo, d, h, mi, s] = m.map(Number);
  return new Date(Date.UTC(y, mo - 1, d, h, mi, s) - gmtOffset * 3600000);
}

function nowInTimezone(at, timeZone) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
  }).formatToParts(at).reduce((acc, p) => ((acc[p.type] = p.value), acc), {});
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    hour: Number(parts.hour),
    minute: Number(parts.minute)
  };
}

function addDays(dateStr, days) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d));
  t.setUTCDate(t.getUTCDate() + days);
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
}

function toScheduleString(dateStr, hour) {
  return `${dateStr}T${pad(hour)}:00:00`;
}

function earliestSchedulableDate({ timeZone, hour }, now = new Date()) {
  const site = nowInTimezone(now, timeZone);
  const slotHasPassed = site.hour > hour || (site.hour === hour && site.minute >= 0);
  return slotHasPassed ? addDays(site.date, 1) : site.date;
}

function findAvailableDate({ takenDates, startDate = null, timeZone, gmtOffset, hour,
                             now = new Date(), maxDaysAhead = DEFAULT_MAX_DAYS_AHEAD }) {
  assertTimezoneContract({ timeZone, gmtOffset }, now);
  const earliest = earliestSchedulableDate({ timeZone, hour }, now);
  // YYYY-MM-DD urut secara leksikografis, jadi perbandingan string sudah benar.
  const start = startDate && startDate > earliest ? startDate : earliest;
  for (let day = 0; day < maxDaysAhead; day++) {
    const dateStr = addDays(start, day);
    if (!takenDates.has(dateStr)) return toScheduleString(dateStr, hour);
  }
  return null;
}

module.exports = {
  DEFAULT_MAX_DAYS_AHEAD, takenDatesFromCache, utcOffsetHours, assertTimezoneContract,
  scheduleStringToInstant, nowInTimezone, addDays, toScheduleString,
  earliestSchedulableDate, findAvailableDate
};
