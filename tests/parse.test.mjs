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
// grants.gov returns closeDate as MM/DD/YYYY; all 651 of its rows were losing
// their deadline before this was handled.
ok(L.toISODate('10/14/2030') === '2030-10-14', 'US slash MM/DD/YYYY');
ok(L.toISODate('12/31/2026') === '2026-12-31', 'US slash, end of year');
ok(L.toISODate('25/12/2026') === '2026-12-25', 'day>12 is read as DD/MM');
ok(L.toISODate('13/13/2026') === null, 'impossible slash date rejected');
ok(L.extractDeadline('Deadline is different for each course and university offering it.').deadline_kind === 'varies', 'per-course deadlines -> varies');
ok(L.extractDeadline('Applications are accepted on a rolling basis.').deadline_kind === 'rolling', 'rolling detected');

console.log('\n# regression: h2 immediately followed by h3 must NOT yield an empty body');
const trap = '<h2>Eligibility Criteria :</h2><h3>Eligibility for X:</h3><ul><li>Open to all nationals</li></ul><h2>Benefits :</h2><p>Full tuition</p>';
const s = L.sections(trap);
const elig = L.pickSection(s, ['eligib'], 5);
ok(elig.includes('Open to all nationals'), 'eligibility body captured across nested h3');
ok(L.pickSection(s, ['benefit'], 5).includes('Full tuition'), 'benefits body captured');

console.log('\n# isPastDeadline — closed opportunities are never stored');
{
  const T = '2026-10-01';
  ok(L.isPastDeadline('2026-09-30', T) === true,  'yesterday is past');
  ok(L.isPastDeadline('2026-10-01', T) === false, 'today still counts as open');
  ok(L.isPastDeadline('2026-12-31', T) === false, 'later this year is open');
  // Absence of a date is NOT evidence an opportunity closed -- rolling and
  // "varies" deadlines are real (CONTEXT.md §6.12) and must survive.
  ok(L.isPastDeadline(null, T) === false, 'null deadline is kept');
  ok(L.isPastDeadline('', T) === false, 'empty deadline is kept');
  ok(L.isPastDeadline('varies', T) === false, 'unparseable deadline is kept');
  ok(L.isPastDeadline('2026-09-30T23:59:00', T) === true, 'timestamp form compares date-only');
}

console.log('\n# plausibleDeadline — sentinel dates are not deadlines');
{
  const T = '2026-10-01';
  // grants.gov uses 2099-01-01 to mean "no real close date". Showing a student
  // a deadline 73 years out is worse than showing none.
  ok(L.plausibleDeadline('2099-01-01', T) === null, '2099 sentinel rejected');
  ok(L.plausibleDeadline('2040-01-01', T) === null, 'beyond the 10y horizon rejected');
  ok(L.plausibleDeadline('2026-09-30', T) === null, 'already-closed rejected');
  ok(L.plausibleDeadline('2030-10-14', T) === '2030-10-14', 'genuine far deadline kept');
  ok(L.plausibleDeadline('2026-10-01', T) === '2026-10-01', 'today kept');
  ok(L.plausibleDeadline('2026-12-31', T) === '2026-12-31', 'end of year kept');
  ok(L.plausibleDeadline(null, T) === null, 'null in, null out');
  ok(L.plausibleDeadline('varies', T) === null, 'unparseable in, null out');
}

console.log('\n# robotsAllows — registry-driven robots.txt compliance');
{
  // scholars4dev.com/robots.txt, read 2026-10-01.
  const dis = ['/wp-admin', '/archives/', '/io/', '/about/about-us/',
               '/tag/scholarships-for-africans/',
               '/international-scholarships-for-kenyan-students/'];
  const A = (u) => L.robotsAllows(u, dis);
  ok(A('https://www.scholars4dev.com/2191/weidenfeld-scholarships-at-oxford'),
     'a normal /<id>/<slug>/ post page is allowed');
  ok(!A('https://www.scholars4dev.com/archives/'), '/archives/ disallowed');
  ok(!A('https://www.scholars4dev.com/tag/scholarships-for-africans/'), 'tag path disallowed');
  ok(!A('https://www.scholars4dev.com/international-scholarships-for-kenyan-students/'),
     'specifically disallowed post page is blocked');
  ok(!A('https://www.scholars4dev.com/wp-admin/admin.php?x=1'), 'query string does not evade the check');
  ok(A('https://www.scholars4dev.com/wp-json/wp/v2/posts?per_page=100'),
     'the listing API is NOT disallowed');
  ok(L.robotsAllows('https://a.test/anything', []), 'empty disallow list allows everything');
  ok(L.robotsAllows('https://a.test/anything', undefined), 'absent list allows everything');
  ok(!A('https://www.scholars4dev.com/ARCHIVES/'), 'matching is case-insensitive');
}

console.log('\n# sourceFilter — registry-driven relevance');
{
  // No patterns configured must change nothing, or every existing source breaks.
  ok(L.sourceFilter({})('anything at all'), 'no patterns -> everything passes');
  ok(L.sourceFilter(undefined)('anything at all'), 'undefined config -> passes');

  // Real ERC feed titles from 2026-10-01.
  const erc = L.sourceFilter({
    exclude_patterns: ['interim agent', 'president.s speech', 'examples of projects'],
    include_patterns: ['call for', 'grant', 'fellowship', 'funding'],
  });
  ok(!erc('Interim Agent position in the area Chemistry and Materials Science'),
     'ERC staff vacancy excluded');
  ok(!erc('ERC President\u2019s speech on academic freedom under threat'), 'ERC speech excluded');
  ok(erc('ERC Advanced Grant 2027 call for proposals now open'), 'a real ERC call passes');

  // Exclusions must beat includes: these MSCA news items contain "fellowship".
  const msca = L.sourceFilter({
    exclude_patterns: ['record number of applications', 'co-funds'],
    include_patterns: ['fellowship'],
  });
  ok(msca('MSCA Postdoctoral Fellowships 2026'), 'real MSCA call passes');
  ok(!msca('MSCA Postdoctoral Fellowships 2026 receives record number of applications'),
     'exclusion beats a matching include');
  ok(!msca('MSCA co-funds 29 doctoral training and postdoctoral fellowship programmes'),
     'programme news excluded despite the word fellowship');

  // An unparseable pattern must not take the run down with it.
  ok(L.sourceFilter({ include_patterns: ['(['] })('whatever') === true,
     'invalid regex is skipped, not thrown');
}

console.log('\n# regression: a promoted funnel link must not win over the real apply target');
// Live shape from opportunitiescircle.com/unicef-internship-program (2026-10-01):
// the page carries an Elementor button pointing at svfellow.com -- an unrelated
// programme it promotes -- BEFORE the genuine jobs.unicef.org link. All three
// detail pages sampled that day returned svfellow.com as the apply link.
// tests/fixtures/*.html is gitignored, so this guard is inline on purpose.
const funnel = `
  <h2>How to Apply</h2>
  <p>Read the steps below.</p>
  <a class="elementor-button elementor-button-link default" href="https://www.svfellow.com/apply?open=1">Apply Now</a>
  <a class="elementor-button default" href="https://whatsapp.com/channel/0029Va8">Join our WhatsApp</a>
  <a href="https://www.unicef.org/careers/internships">Official UNICEF internships page</a>`;
const funnelHow = L.pickSection(L.sections(funnel), ['how to apply'], 5);
const picked = L.extractApplyLink(funnel, funnelHow);
ok(!/svfellow/.test(picked || ''), `funnel domain rejected (picked: ${picked})`);
ok(!/whatsapp/.test(picked || ''), 'social link rejected');
ok(/unicef\.org/.test(picked || ''), 'real apply target chosen');

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
