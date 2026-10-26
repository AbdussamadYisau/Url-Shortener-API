const DAY_MS = 86_400_000;
function creationDate(row) {
  const value = row.createdAt ?? row.date;
  // The original schema also stored millisecond timestamps as strings.
  const date = new Date(typeof value === 'string' && /^\d{13}$/.test(value) ? Number(value) : value);
  return value != null && Number.isFinite(date.getTime()) ? date : null;
}
function retentionPolicy(days, now = () => Date.now()) {
  if (!Number.isInteger(days) || days < 0 || days > 36500) throw new Error('LINK_RETENTION_DAYS must be an integer between 0 and 36500.');
  return {
    cutoff: () => new Date(now() - days * DAY_MS),
    activeFilter() {
      // Legacy records are checked individually until the migration backfills dates.
      return days ? {$or:[{createdAt:{$gt:this.cutoff()}},{createdAt:null}]} : {};
    },
    expired(row) { const date = creationDate(row); return days > 0 && date !== null && date <= this.cutoff(); },
    expiresAt(row) { const date = creationDate(row); return days && date ? new Date(+date + days * DAY_MS).toISOString() : null; },
  };
}
module.exports = {creationDate,retentionPolicy};
