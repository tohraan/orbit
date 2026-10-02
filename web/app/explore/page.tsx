import { Suspense } from "react";
import { ExploreScreen } from "./ExploreScreen";
import { GridSkeleton } from "@/components/feedback/Skeletons";
import { PageHead } from "@/components/layout/AppShell";
import card from "@/components/opportunities/card.module.css";

/* §25: the most important screen in the product. The shell renders on the
 * server; the grid is a client component because the filter state lives in the
 * URL and `useSearchParams` requires a Suspense boundary above it.
 *
 * The fallback is the real card skeleton, not a spinner (§47), so the first
 * frame already has the page's geometry. */
export default function ExplorePage() {
  return (
    <Suspense
      fallback={
        <>
          <PageHead
            eyebrow="Discover"
            title="Find opportunities that match your goals"
            description="Scholarships, fellowships, grants, internships and other programmes a BITS Pilani Dubai student can actually apply to, in one place."
          />
          <div className={card.grid}>
            <GridSkeleton count={6} />
          </div>
        </>
      }
    >
      <ExploreScreen />
    </Suspense>
  );
}
