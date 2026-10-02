"use client";

/* §71: explain what happened and what the user can do, and never show a raw
 * error. Next hands this component the error object; the digest is a server
 * log correlation id, not a message, so only it is surfaced — the message
 * itself can carry internals. */

import { ErrorState } from "@/components/feedback/States";
import { Button, ButtonLink } from "@/components/ui/Button";

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <ErrorState
      title="Something went wrong on this page"
      body={
        error.digest
          ? `The page couldn't be rendered. Reference ${error.digest} if you need to report it.`
          : "The page couldn't be rendered. Reloading usually clears it."
      }
      actions={
        <>
          <Button variant="primary" icon="refresh" onClick={reset}>
            Try again
          </Button>
          <ButtonLink href="/" variant="secondary">
            Go home
          </ButtonLink>
        </>
      }
    />
  );
}
