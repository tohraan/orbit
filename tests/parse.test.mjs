import { readFileSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
const L = createRequire(import.meta.url)('../n8n/src/code/_lib_html.js');

let fail = 0;
const ok = (c, m) => { if (!c) { fail++; console.log('  FAIL ' + m); } else console.log('  pass ' + m); };

console.log('# toISODate');
ok(L.toISODate('October 15, 2026') === '2026-10-15', 'US long form');
ok(L.toISODate('15 October 2026') === '2026-10-15', 'day-first form');
ok(L.toISODate('2026-10-15') === '2026-10-15', 'ISO passthrough');
ok(L.toISODate('Sept 1, 2027') === '2027-09-01', 'abbreviated month');
ok(L.toISODate('garbage') === null, 'rejects garbage');
ok(L.extractDeadline('Deadline is different for each course and university offering it.').deadline_kind === 'varies', 'per-course deadlines -> varies');
ok(L.extractDeadline('Applications are accepted on a rolling basis.').deadline_kind === 'rolling', 'rolling detected');

console.log('\n# regression: h2 immediately followed by h3 must NOT yield an empty body');
const trap = '<h2>Eligibility Criteria :</h2><h3>Eligibility for X:</h3><ul><li>Open to all nationals</li></ul><h2>Benefits :</h2><p>Full tuition</p>';
const s = L.sections(trap);
const elig = L.pickSection(s, ['eligib'], 5);
ok(elig.includes('Open to all nationals'), 'eligibility body captured across nested h3');
ok(L.pickSection(s, ['benefit'], 5).includes('Full tuition'), 'benefits body captured');

console.log('\n# live fixtures');
for (const f of readdirSync('tests/fixtures').filter(f => f.endsWith('.html'))) {
  const html = readFileSync('tests/fixtures/' + f, 'utf8');
  const secs = L.sections(html);
  const r = {
    deadline:  L.extractDeadline(html),
    eligibility: L.pickSection(secs, ['eligib', 'who can apply', 'requirement']),
    benefits:    L.pickSection(secs, ['benefit', 'coverage', 'what you get', 'what will you get']),
    how:         L.pickSection(secs, ['how to apply', 'application process', 'application procedure']),
    apply:       L.extractApplyLink(html, L.pickSection(secs, ['how to apply', 'application process'])),
    title:       L.meta(html, 'og:title'),
  };
  console.log(`\n  --- ${f}`);
  console.log(`  title      : ${r.title.slice(0, 70)}`);
  console.log(`  deadline   : ${r.deadline.deadline || r.deadline.deadline_kind.toUpperCase()}${r.deadline.deadline_note ? ' — ' + r.deadline.deadline_note.slice(0,70) : ''}`);
  console.log(`  apply_link : ${r.apply.slice(0, 80)}`);
  console.log(`  eligibility: ${r.eligibility.length}ch  ${JSON.stringify(r.eligibility.slice(0, 85))}`);
  console.log(`  benefits   : ${r.benefits.length}ch  ${JSON.stringify(r.benefits.slice(0, 85))}`);
  console.log(`  how_to_app : ${r.how.length}ch  ${JSON.stringify(r.how.slice(0, 85))}`);
  console.log(`  fingerprint: ${L.fingerprint(r.title, 'USA', r.deadline.deadline)}`);
  ok(r.eligibility.length > 40, `${f}: eligibility non-empty`);
  ok(r.benefits.length > 20,    `${f}: benefits non-empty`);
  ok(!!r.apply,                 `${f}: apply link found`);
}
console.log(fail ? `\n${fail} FAILURE(S)` : '\nall assertions passed');
process.exit(fail ? 1 : 0);
