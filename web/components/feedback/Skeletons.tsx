import s from "./feedback.module.css";

/* §47: never a full-page spinner when the structure can be shown immediately.
 * §103: the skeleton's geometry is the real component's geometry, so there is
 * no layout shift when the data arrives.
 *
 * `w` is a percentage, so a skeleton line is a share of its container rather
 * than a fixed pixel width that would overflow a narrow card. */

function Line({ w, tall, delay = 1 }: { w: number; tall?: boolean; delay?: 1 | 2 | 3 }) {
  return (
    <span
      className={`skeleton skeleton-line${tall ? " tall" : ""} skeleton-stagger-${delay}`}
      style={{ width: `${w}%` }}
    />
  );
}

function Block({ w, h, r = 8, delay = 1 }: { w: number; h: number; r?: number; delay?: 1 | 2 | 3 }) {
  return (
    <span
      className={`skeleton skeleton-stagger-${delay}`}
      style={{ width: `${w}%`, height: h, borderRadius: r, display: "block" }}
    />
  );
}

/** Mirrors OpportunityCard: chip row, 2-line title, org, 3-line body, metadata, deadline, footer. */
export function CardSkeleton({ delay = 1 }: { delay?: 1 | 2 | 3 }) {
  return (
    <div className={s.skCard} aria-hidden="true">
      <div className={s.skRow}>
        <Block w={34} h={22} r={8} delay={delay} />
        <Block w={9} h={22} r={8} delay={delay} />
      </div>
      <div className={s.skStack}>
        <Line w={96} tall delay={delay} />
        <Line w={62} tall delay={delay} />
        <Line w={44} delay={delay} />
      </div>
      <div className={s.skStack}>
        <Line w={100} delay={delay} />
        <Line w={94} delay={delay} />
        <Line w={70} delay={delay} />
      </div>
      <div className={s.skChips}>
        <Block w={30} h={22} r={8} delay={delay} />
        <Block w={26} h={22} r={8} delay={delay} />
      </div>
      <div className={s.skFoot}>
        <Block w={34} h={32} r={10} delay={delay} />
        <Block w={28} h={32} r={10} delay={delay} />
      </div>
    </div>
  );
}

export function GridSkeleton({ count = 6 }: { count?: number }) {
  return (
    <>
      {Array.from({ length: count }, (_, i) => (
        <CardSkeleton key={i} delay={((i % 3) + 1) as 1 | 2 | 3} />
      ))}
    </>
  );
}

export function BentoSkeleton({ lines = 4, height }: { lines?: number; height?: number }) {
  return (
    <div className={s.skBento} style={height ? { minHeight: height } : undefined} aria-hidden="true">
      <Line w={38} tall />
      {Array.from({ length: lines }, (_, i) => (
        <Line key={i} w={[100, 92, 76, 84, 68][i % 5]} delay={((i % 3) + 1) as 1 | 2 | 3} />
      ))}
    </div>
  );
}

/** For the Deadlines and Applications lists, which are rows rather than cards. */
export function RowsSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div aria-hidden="true">
      {Array.from({ length: count }, (_, i) => (
        <div className={s.skRowItem} key={i}>
          <Block w={14} h={22} r={8} delay={((i % 3) + 1) as 1 | 2 | 3} />
          <span style={{ flex: "1 1 auto", display: "flex", flexDirection: "column", gap: 6 }}>
            <Line w={58} tall delay={((i % 3) + 1) as 1 | 2 | 3} />
            <Line w={34} delay={((i % 3) + 1) as 1 | 2 | 3} />
          </span>
          <Block w={12} h={22} r={8} delay={((i % 3) + 1) as 1 | 2 | 3} />
        </div>
      ))}
    </div>
  );
}

/** The thin indeterminate bar for an in-flight navigation. */
export function RouteProgress() {
  return <div className="route-progress" role="progressbar" aria-label="Loading" aria-busy="true" />;
}
