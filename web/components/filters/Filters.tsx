"use client";

/* The filter layer. Every selection lives in the URL, not in component state,
 * so a filtered view is a link a student can send to a friend, the browser's
 * back button undoes one choice at a time, and the server and the client can
 * never disagree about what is being asked for.
 *
 * §41: six primary filters. Four are on the bar; Level, Source and the
 * requirement toggles sit behind "More filters", because §41 forbids exposing
 * fifteen at once.
 *
 * One filter named in §41 is deliberately absent: Field / Area. Not one of the
 * six live sources populates fields_of_study, so the control could only ever
 * return nothing — and §105 forbids implying data that does not exist. The API
 * returns an empty `field` facet; this component reads that emptiness and
 * leaves the control out rather than offering a dead end. */

import { useCallback, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import s from "./filters.module.css";
import u from "../ui/ui.module.css";
import { Option, Popover } from "./Popover";
import { Button } from "../ui/Button";
import { Select } from "../ui/Field";
import { Icon } from "../ui/Icon";
import { titleCase } from "@rof/core";
import type { Facets } from "@rof/core";

const DEADLINE_OPTIONS = [
  { value: "any", label: "Any deadline" },
  { value: "d7", label: "Next 7 days" },
  { value: "d30", label: "Next 30 days" },
  { value: "d90", label: "Next 90 days" },
  { value: "d180", label: "Next 6 months" },
  { value: "dated", label: "Has a fixed date" },
  { value: "rolling", label: "Rolling or undated" },
] as const;

/* `mixed` is first because it is the default on Explore. The control has to
 * offer it: without it the select reads "Deadline soonest" while the grid is
 * showing a mixed batch, which is the control lying about the list. */
const SORT_OPTIONS = [
  { value: "mixed", label: "Recommended mix" },
  { value: "deadline", label: "Deadline soonest" },
  { value: "relevance", label: "Best match" },
  { value: "newest", label: "Newest" },
  { value: "updated", label: "Recently updated" },
  { value: "amount", label: "Largest amount" },
] as const;

const REQUIREMENT_OPTIONS = [
  { value: "detail", label: "Full details available" },
  { value: "amount", label: "States an amount" },
  { value: "apply", label: "Has an application link" },
] as const;

const MULTI_KEYS = ["type", "country", "funding", "level", "source", "requires"] as const;
type MultiKey = (typeof MULTI_KEYS)[number];

/** Read, write and clear the filter query string. */
export function useFilters() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const get = useCallback((key: MultiKey): string[] => params.getAll(key).flatMap((v) => v.split(",")).filter(Boolean), [params]);

  const push = useCallback(
    (mutate: (sp: URLSearchParams) => void) => {
      const sp = new URLSearchParams(params.toString());
      mutate(sp);
      /* Any change to the filters invalidates the page number: page 7 of a
       * narrower result set is usually empty, which reads as "nothing matched". */
      sp.delete("page");
      router.replace(`${pathname}?${sp.toString()}`, { scroll: false });
    },
    [params, pathname, router],
  );

  return {
    params,
    get,
    toggle: (key: MultiKey, value: string) =>
      push((sp) => {
        const current = sp.getAll(key).flatMap((v) => v.split(",")).filter(Boolean);
        const next = current.includes(value) ? current.filter((v) => v !== value) : [...current, value];
        sp.delete(key);
        if (next.length) sp.set(key, next.join(","));
      }),
    setOne: (key: string, value: string | null) =>
      push((sp) => {
        if (!value || value === "any") sp.delete(key);
        else sp.set(key, value);
      }),
    clearKey: (key: string) => push((sp) => sp.delete(key)),
    clearAll: () =>
      push((sp) => {
        for (const k of [...MULTI_KEYS, "deadline", "q", "sort", "page"]) sp.delete(k);
      }),
    activeCount:
      MULTI_KEYS.reduce((n, k) => n + get(k).length, 0) + (params.get("deadline") && params.get("deadline") !== "any" ? 1 : 0),
  };
}

/* ----------------------------------------------------------- desktop bar --- */

export function FilterBar({ facets }: { facets: Facets | null }) {
  const f = useFilters();
  const deadline = f.params.get("deadline") ?? "any";

  return (
    <div className={s.bar}>
      <Popover label="Category" count={f.get("type").length}>
        {() => (
          <>
            {(facets?.type ?? []).map((b) => (
              <Option
                key={b.value}
                label={b.label}
                count={b.count}
                checked={f.get("type").includes(b.value)}
                onToggle={() => f.toggle("type", b.value)}
              />
            ))}
            {!facets ? <LoadingOptions /> : null}
          </>
        )}
      </Popover>

      <Popover label="Country" count={f.get("country").length}>
        {() => (
          <>
            {(facets?.country ?? []).map((b) => (
              <Option
                key={b.value}
                label={b.label}
                count={b.count}
                checked={f.get("country").includes(b.value)}
                onToggle={() => f.toggle("country", b.value)}
              />
            ))}
            {!facets ? <LoadingOptions /> : null}
          </>
        )}
      </Popover>

      <Popover label="Funding" count={f.get("funding").length}>
        {() => (
          <>
            {(facets?.funding ?? []).map((b) => (
              <Option
                key={b.value}
                label={b.label}
                count={b.count}
                checked={f.get("funding").includes(b.value)}
                onToggle={() => f.toggle("funding", b.value)}
              />
            ))}
            {!facets ? <LoadingOptions /> : null}
          </>
        )}
      </Popover>

      <Popover label="Deadline" count={deadline !== "any" ? 1 : 0}>
        {(close) => (
          <>
            {DEADLINE_OPTIONS.map((o) => (
              <Option
                key={o.value}
                label={o.label}
                radio
                checked={deadline === o.value}
                onToggle={() => {
                  f.setOne("deadline", o.value);
                  close();
                }}
              />
            ))}
          </>
        )}
      </Popover>

      <Popover
        label="More filters"
        align="right"
        count={f.get("level").length + f.get("source").length + f.get("requires").length}
      >
        {() => (
          <>
            <p className={s.groupTitle} style={{ padding: "8px 12px 0" }}>
              Degree level
            </p>
            {(facets?.level ?? []).map((b) => (
              <Option
                key={b.value}
                label={b.label}
                count={b.count}
                checked={f.get("level").includes(b.value)}
                onToggle={() => f.toggle("level", b.value)}
              />
            ))}
            <p className={s.groupTitle} style={{ padding: "12px 12px 0" }}>
              Source
            </p>
            {(facets?.source ?? []).map((b) => (
              <Option
                key={b.value}
                label={b.label}
                count={b.count}
                checked={f.get("source").includes(b.value)}
                onToggle={() => f.toggle("source", b.value)}
              />
            ))}
            <p className={s.groupTitle} style={{ padding: "12px 12px 0" }}>
              Information available
            </p>
            {REQUIREMENT_OPTIONS.map((o) => (
              <Option
                key={o.value}
                label={o.label}
                checked={f.get("requires").includes(o.value)}
                onToggle={() => f.toggle("requires", o.value)}
              />
            ))}
            {/* §41's "Field / Area" appears only if a source ever fills it. */}
            {facets?.field?.length ? (
              <>
                <p className={s.groupTitle} style={{ padding: "12px 12px 0" }}>
                  Field
                </p>
                {facets.field.map((b) => (
                  <Option
                    key={b.value}
                    label={b.label}
                    count={b.count}
                    checked={f.get("field" as MultiKey).includes(b.value)}
                    onToggle={() => f.toggle("field" as MultiKey, b.value)}
                  />
                ))}
              </>
            ) : null}
          </>
        )}
      </Popover>

      {f.activeCount > 0 ? (
        <Button variant="ghost" size="md" onClick={f.clearAll}>
          Clear filters
        </Button>
      ) : null}
    </div>
  );
}

function LoadingOptions() {
  return (
    <div style={{ padding: 8, display: "flex", flexDirection: "column", gap: 8 }} aria-hidden="true">
      {[86, 70, 78, 62].map((w, i) => (
        <span key={i} className="skeleton skeleton-line" style={{ width: `${w}%` }} />
      ))}
    </div>
  );
}

/* --------------------------------------------------------- active filters --- */

export function ActiveFilters({ facets }: { facets: Facets | null }) {
  const f = useFilters();
  const labels = useMemo(() => {
    const map = new Map<string, string>();
    for (const group of [facets?.type, facets?.country, facets?.funding, facets?.level, facets?.source]) {
      for (const b of group ?? []) map.set(b.value, b.label);
    }
    for (const o of REQUIREMENT_OPTIONS) map.set(o.value, o.label);
    return map;
  }, [facets]);

  const chips: { key: string; group: MultiKey | "deadline"; value: string; label: string; groupLabel: string }[] = [];
  const GROUP_LABELS: Record<string, string> = {
    type: "Category",
    country: "Country",
    funding: "Funding",
    level: "Level",
    source: "Source",
    requires: "Needs",
  };
  for (const key of MULTI_KEYS) {
    for (const v of f.get(key)) {
      /* The facet list supplies the human label. Before it loads — or for a
       * value that is in the URL but not in the facets — fall back to a tidied
       * slug rather than showing the raw `college_desk`. */
      chips.push({
        key: `${key}:${v}`,
        group: key,
        value: v,
        label: labels.get(v) ?? titleCase(v) ?? v,
        groupLabel: GROUP_LABELS[key],
      });
    }
  }
  const dl = f.params.get("deadline");
  if (dl && dl !== "any") {
    chips.push({
      key: `deadline:${dl}`,
      group: "deadline",
      value: dl,
      label: DEADLINE_OPTIONS.find((o) => o.value === dl)?.label ?? dl,
      groupLabel: "Deadline",
    });
  }

  if (!chips.length) return null;

  return (
    <div className={s.active}>
      {chips.map((c) => (
        <span className={s.pill} key={c.key}>
          <span className={s.pillKey}>{c.groupLabel}:</span>
          {c.label}
          <button
            type="button"
            className={s.pillX}
            aria-label={`Remove ${c.groupLabel} filter ${c.label}`}
            onClick={() => (c.group === "deadline" ? f.setOne("deadline", null) : f.toggle(c.group, c.value))}
          >
            <Icon name="close" size={12} strokeWidth={2} />
          </button>
        </span>
      ))}
    </div>
  );
}

/* ----------------------------------------------------------------- sort ---
   §44: sorting is a separate control from filtering, and stays separate. */

/* `fallback` is the sort that is actually in effect when the URL names none —
 * Explore mixes by default, the other screens do not. Passing it in keeps the
 * control honest about what the list below it is doing. */
export function SortControl({ fallback = "deadline" }: { fallback?: string }) {
  const f = useFilters();
  const value = f.params.get("sort") ?? fallback;
  return (
    <label style={{ display: "inline-flex", alignItems: "center", gap: "var(--s-2)" }}>
      <span className="t-meta c-muted">Sort</span>
      <span style={{ minWidth: 180 }}>
        <Select
          size="sm"
          value={value}
          options={SORT_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
          onChange={(v) => f.setOne("sort", v)}
          ariaLabel="Sort opportunities"
        />
      </span>
    </label>
  );
}

/* ------------------------------------------------------- mobile controls ---
   §43: [Filter] [Sort], each opening a bottom sheet with the primary action
   always visible (§69). */

export function MobileFilterBar({ facets, sortFallback = "deadline" }: { facets: Facets | null; sortFallback?: string }) {
  const f = useFilters();
  const [sheet, setSheet] = useState<null | "filter" | "sort">(null);
  const deadline = f.params.get("deadline") ?? "any";
  const sort = f.params.get("sort") ?? sortFallback;

  return (
    <>
      <div className={s.mobileBar}>
        <Button variant="secondary" icon="filter" onClick={() => setSheet("filter")}>
          Filter{f.activeCount ? ` (${f.activeCount})` : ""}
        </Button>
        <Button variant="secondary" icon="sort" onClick={() => setSheet("sort")}>
          Sort
        </Button>
      </div>

      {sheet ? (
        <>
          <div className={u.scrim} onClick={() => setSheet(null)} />
          <div className={u.sheet} role="dialog" aria-modal="true" aria-label={sheet === "filter" ? "Filters" : "Sort"}>
            <span className={u.sheetHandle} />
            <div className={u.sheetHead}>
              <h2 className="t-section">{sheet === "filter" ? "Filters" : "Sort"}</h2>
              <Button variant="ghost" size="sm" icon="close" onClick={() => setSheet(null)}>
                Close
              </Button>
            </div>

            <div className={u.sheetBody}>
              {sheet === "sort" ? (
                SORT_OPTIONS.map((o) => (
                  <Option
                    key={o.value}
                    label={o.label}
                    radio
                    checked={sort === o.value}
                    onToggle={() => {
                      f.setOne("sort", o.value);
                      setSheet(null);
                    }}
                  />
                ))
              ) : (
                <>
                  <Group title="Deadline">
                    {DEADLINE_OPTIONS.map((o) => (
                      <Option
                        key={o.value}
                        label={o.label}
                        radio
                        checked={deadline === o.value}
                        onToggle={() => f.setOne("deadline", o.value)}
                      />
                    ))}
                  </Group>
                  <Group title="Category">
                    {(facets?.type ?? []).map((b) => (
                      <Option
                        key={b.value}
                        label={b.label}
                        count={b.count}
                        checked={f.get("type").includes(b.value)}
                        onToggle={() => f.toggle("type", b.value)}
                      />
                    ))}
                  </Group>
                  <Group title="Funding">
                    {(facets?.funding ?? []).map((b) => (
                      <Option
                        key={b.value}
                        label={b.label}
                        count={b.count}
                        checked={f.get("funding").includes(b.value)}
                        onToggle={() => f.toggle("funding", b.value)}
                      />
                    ))}
                  </Group>
                  <Group title="Degree level">
                    {(facets?.level ?? []).map((b) => (
                      <Option
                        key={b.value}
                        label={b.label}
                        count={b.count}
                        checked={f.get("level").includes(b.value)}
                        onToggle={() => f.toggle("level", b.value)}
                      />
                    ))}
                  </Group>
                  <Group title="Country">
                    {(facets?.country ?? []).slice(0, 14).map((b) => (
                      <Option
                        key={b.value}
                        label={b.label}
                        count={b.count}
                        checked={f.get("country").includes(b.value)}
                        onToggle={() => f.toggle("country", b.value)}
                      />
                    ))}
                  </Group>
                  <Group title="Source">
                    {(facets?.source ?? []).map((b) => (
                      <Option
                        key={b.value}
                        label={b.label}
                        count={b.count}
                        checked={f.get("source").includes(b.value)}
                        onToggle={() => f.toggle("source", b.value)}
                      />
                    ))}
                  </Group>
                </>
              )}
            </div>

            {sheet === "filter" ? (
              <div className={u.sheetFoot}>
                <Button variant="secondary" onClick={f.clearAll}>
                  Clear all
                </Button>
                <Button variant="primary" onClick={() => setSheet(null)}>
                  Apply filters
                </Button>
              </div>
            ) : null}
          </div>
        </>
      ) : null}
    </>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className={s.group}>
      <p className={s.groupTitle}>{title}</p>
      {children}
    </div>
  );
}
