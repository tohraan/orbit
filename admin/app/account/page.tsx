"use client";

/* Who you are signed in as, and the way out.
 *
 * It exists because the rail's foot needs somewhere to go. The portal's foot
 * is an account screen, and the desk's was a sign-out button wedged into the
 * header — which put a destructive action one mis-click from the theme toggle
 * and left the rail with an empty bottom. One avatar, one destination, both
 * deployments.
 */

import { Button, Pill } from "@rof/ui";
import t from "@/components/table.module.css";
import s from "@/components/shell.module.css";
import { useSession } from "@/lib/session";

export default function Account() {
  const { user, name, isStaff, signOut } = useSession();

  return (
    <>
      <header className={t.head}>
        <span className="eyebrow">Desk</span>
        <h1 className="t-page-title">Account</h1>
        <p className="t-body-sm c-secondary">
          The desk reads your campus account. There is no separate desk password to change here.
        </p>
      </header>

      <dl className={t.pairs}>
        <div className={t.pair}>
          <dt className={t.pairKey}>Name</dt>
          <dd className={t.pairVal}>{name || <span className={t.dim}>Not set</span>}</dd>
        </div>
        <div className={t.pair}>
          <dt className={t.pairKey}>Campus email</dt>
          <dd className={t.pairVal}>{user?.email}</dd>
        </div>
        <div className={t.pair}>
          <dt className={t.pairKey}>Desk access</dt>
          <dd className={t.pairVal}>
            {isStaff ? <Pill tone="success">Staff</Pill> : <Pill tone="neutral">Student</Pill>}
          </dd>
        </div>
      </dl>

      <p className={t.note}>
        Access is granted per account against <code>students.is_staff</code>, and every route re-checks it
        server-side. Revoking it for one person does not change it for anyone else.
      </p>

      <div className={s.actions}>
        <Button tone="danger" onClick={() => void signOut()}>
          Sign out
        </Button>
      </div>
    </>
  );
}
