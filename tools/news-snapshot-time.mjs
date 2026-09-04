export function sentieroRomeDayKey(date = new Date()) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Rome', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
  }).formatToParts(date).filter(part => part.type !== 'literal').map(part => [part.type, Number(part.value)]));
  let civil = new Date(Date.UTC(parts.year, parts.month - 1, parts.day, 12));
  if (parts.hour * 60 + parts.minute < 4 * 60 + 20) civil = new Date(civil.getTime() - 86400000);
  return civil.getUTCFullYear() + '-' + String(civil.getUTCMonth() + 1).padStart(2, '0') + '-' + String(civil.getUTCDate()).padStart(2, '0');
}
