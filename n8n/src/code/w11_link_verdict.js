/* W11 · turn a link-check response into a status patch.
 * Lots of university sites answer 403 to a bare programmatic GET while being
 * perfectly alive, so only hard 404/410 and transport failures are "dead". */
const rows  = $('Loop Link Queue').all();
const items = $input.all();
const nowISO = new Date().toISOString();

const out = [];
for (let i = 0; i < items.length; i++) {
  const row  = (rows[i] || {}).json || {};
  const resp = items[i].json || {};
  const code = Number(resp.statusCode || (resp.error && resp.error.statusCode) || 0);

  const dead    = code === 404 || code === 410 || code === 0;
  const blocked = code === 403 || code === 429 || code === 401;

  const patch = { link_checked_at: nowISO, link_status: code || null };
  if (dead) {
    patch.status = 'dead_link';
    patch.confidence = Math.max(0.1, Number(row.confidence || 0.5) - 0.25);
  } else if (!blocked && code >= 200 && code < 400) {
    patch.last_verified_at = nowISO;
    if (row.status === 'dead_link') patch.status = 'active';   // recovered
  }
  out.push({ json: { id: row.id, fingerprint: row.fingerprint, patch,
                     verdict: dead ? 'dead' : blocked ? 'blocked' : 'ok' } });
}
return out;
