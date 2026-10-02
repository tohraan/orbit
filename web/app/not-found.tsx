import { EmptyState } from "@/components/feedback/States";
import { ButtonLink } from "@/components/ui/Button";

/* §71's shape applied to a bad URL: what happened, then what to do. */
export default function NotFound() {
  return (
    <EmptyState
      icon="search"
      title="That page doesn't exist"
      body="The link may be out of date, or the opportunity it pointed at has left the index."
      actions={
        <>
          <ButtonLink href="/explore" variant="primary">
            Explore opportunities
          </ButtonLink>
          <ButtonLink href="/" variant="secondary">
            Go home
          </ButtonLink>
        </>
      }
    />
  );
}
