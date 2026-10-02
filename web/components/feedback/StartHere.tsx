"use client";

/* The empty-state action, chosen by where the student actually is.
 *
 * Sending someone to Explore from an empty Compare or Applications screen is
 * the right advice only if they already know what they are looking for. A
 * student who has not set up a profile is being told to go and browse 428
 * listings unaided, which is the thing the product exists to avoid — so for
 * them the first offer is the two-minute setup, with Explore kept as the
 * secondary way out for anyone who would rather just browse.
 */

import { ButtonLink } from "../ui/Button";
import { useProfile } from "@/lib/data";

export function StartHere({
  browseLabel = "Explore opportunities",
  browseHref = "/explore",
}: {
  browseLabel?: string;
  browseHref?: string;
}) {
  const { started, ready } = useProfile();

  /* Until storage has been read, offer the neutral action rather than guessing
   * and then swapping the button under the student's cursor. */
  if (!ready || started) {
    return (
      <ButtonLink href={browseHref} variant="primary">
        {browseLabel}
      </ButtonLink>
    );
  }

  return (
    <>
      <ButtonLink href="/welcome" variant="primary" icon="sparkle">
        Set up in two minutes
      </ButtonLink>
      <ButtonLink href={browseHref} variant="secondary">
        {browseLabel}
      </ButtonLink>
    </>
  );
}
