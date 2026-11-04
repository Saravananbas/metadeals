"use client";

import Link from "next/link";
import { type FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import type { UserRole, UserStatus } from "@/generated/prisma/client";
import styles from "../admin.module.css";

type Account = {
  id: string;
  email: string | null;
  name: string | null;
  role: UserRole;
  status: UserStatus;
  totpEnabledAt: string | null;
  createdAt: string;
};

type AuditEvent = {
  id: string;
  action: string;
  success: boolean;
  createdAt: string;
  actor: { id: string; email: string | null; role: UserRole } | null;
};

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const result = await response.json() as T & { error?: string };
  if (!response.ok) throw new Error(result.error ?? "The request could not be completed.");
  return result;
}

export function AdminDashboard({
  actorId,
  role,
  initialAccounts,
  initialEvents,
}: {
  actorId: string;
  role: UserRole;
  initialAccounts: Account[];
  initialEvents: AuditEvent[];
}) {
  const [accounts, setAccounts] = useState(initialAccounts);
  const [events, setEvents] = useState(initialEvents);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [setupLink, setSetupLink] = useState("");
  const [roleChanges, setRoleChanges] = useState<Record<string, UserRole>>({});
  const router = useRouter();

  async function load() {
    try {
      const accountResult = await requestJson<{ users: Account[] }>("/api/admin/accounts");
      setAccounts(accountResult.users);
      setError("");
      if (role === "SUPER_ADMIN") {
        const auditResult = await requestJson<{ events: AuditEvent[] }>("/api/admin/audit");
        setEvents(auditResult.events);
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Admin data could not be loaded.");
    }
  }

  async function createAccount(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setNotice("");
    setSetupLink("");
    setBusy(true);
    const formElement = event.currentTarget;
    const form = new FormData(event.currentTarget);
    try {
      const result = await requestJson<{ setupUrl: string }>("/api/admin/accounts", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email: form.get("email"),
          role: form.get("role"),
          emailDeliveryVerified: form.get("emailDeliveryVerified") === "on",
        }),
      });
      setSetupLink(result.setupUrl);
      setNotice("Account created. Deliver this one-time setup link to the intended user through your approved secure channel.");
      formElement.reset();
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Account could not be created.");
    } finally {
      setBusy(false);
    }
  }

  async function updateUser(id: string, change: { role?: UserRole; status?: UserStatus }) {
    setError("");
    setNotice("");
    setBusy(true);
    try {
      await requestJson(`/api/admin/accounts/${encodeURIComponent(id)}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(change),
      });
      setNotice("Account updated. Existing sessions may have been revoked.");
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Account could not be updated.");
    } finally {
      setBusy(false);
    }
  }

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/admin/login");
  }

  const creatableRoles: UserRole[] = role === "SUPER_ADMIN"
    ? ["SUPER_ADMIN", "ADMIN", "EDITOR"]
    : role === "ADMIN" ? ["EDITOR"] : [];

  return (
    <main className={styles.adminPage}>
      <nav className={styles.navBar}>
        <Link href="/">MetaDeals4U</Link>
        <Link href="/admin">Account administration</Link>
        <Link href="/admin/deals">Deals</Link>
      </nav>
      <header className={styles.topBar}>
        <div>
          <div className={styles.eyebrow}>MetaDeals4U · M2.5</div>
          <h1>Admin foundation</h1>
          <p className={styles.meta}>Signed in as {role.toLowerCase().replace("_", " ")} · Authentication and account management</p>
        </div>
        <button className={styles.secondaryButton} onClick={logout}>Sign out</button>
      </header>

      {error && <p className={styles.error} role="alert">{error}</p>}
      {notice && <p className={styles.notice} role="status">{notice}</p>}

      <div className={styles.dashboardGrid}>
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Accounts <span className={styles.badge}>{accounts.length}</span></h2>
          {creatableRoles.length > 0 && (
            <form className={styles.inlineForm} onSubmit={createAccount}>
              <input aria-label="New account email" name="email" type="email" placeholder="name@example.com" autoComplete="email" required maxLength={254} />
              <select aria-label="New account role" name="role" defaultValue={creatableRoles[0]}>
                {creatableRoles.map((item) => <option key={item} value={item}>{item.replace("_", " ")}</option>)}
              </select>
              <label className={styles.emailAttestation}>
                <input name="emailDeliveryVerified" type="checkbox" required />
                I verified this email address and will deliver the setup link through a secure channel.
              </label>
              <button className={styles.button} disabled={busy}>Create account</button>
            </form>
          )}
          {setupLink && <p className={styles.setupLink}><a href={setupLink}>{setupLink}</a></p>}
          {accounts.length === 0 ? <p className={styles.empty}>No accounts found.</p> : (
            <ul className={styles.accountList}>
              {accounts.map((account) => {
                const canManageAccount = account.id !== actorId &&
                  (role === "SUPER_ADMIN" || (role === "ADMIN" && account.role === "EDITOR"));
                return (
                  <li className={styles.accountItem} key={account.id}>
                    <div className={styles.accountHeader}>
                      <span className={styles.accountName}>{account.name || account.email || "Unnamed account"}</span>
                      <span className={styles.badge}>{account.status.replace("_", " ")}</span>
                    </div>
                    <div className={styles.accountHeader}>
                      <span className={styles.meta}>{account.email || "No email address"} · {account.role.replace("_", " ")}</span>
                      <span className={styles.meta}>{account.totpEnabledAt ? "MFA enabled" : "MFA not enrolled"}</span>
                    </div>
                    {canManageAccount && (
                      <div className={styles.accountControls}>
                        {role === "SUPER_ADMIN" && (
                          <>
                            <select
                              aria-label={`Role for ${account.email ?? account.id}`}
                              value={roleChanges[account.id] ?? account.role}
                              onChange={(event) => setRoleChanges((existing) => ({ ...existing, [account.id]: event.target.value as UserRole }))}
                            >
                              {(["SUPER_ADMIN", "ADMIN", "EDITOR"] as UserRole[]).map((item) => (
                                <option key={item} value={item}>{item.replace("_", " ")}</option>
                              ))}
                            </select>
                            <button
                              className={styles.secondaryButton}
                              disabled={busy || (roleChanges[account.id] ?? account.role) === account.role}
                              onClick={() => updateUser(account.id, { role: roleChanges[account.id] })}
                            >
                              Update role
                            </button>
                          </>
                        )}
                        {account.status === "ACTIVE" && (
                          <button className={styles.dangerButton} disabled={busy} onClick={() => updateUser(account.id, { status: "SUSPENDED" })}>Suspend</button>
                        )}
                        {account.status === "SUSPENDED" && (
                          <button className={styles.secondaryButton} disabled={busy} onClick={() => updateUser(account.id, { status: "ACTIVE" })}>Reactivate</button>
                        )}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {role === "SUPER_ADMIN" && (
          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>Recent audit activity</h2>
            {events.length === 0 ? <p className={styles.empty}>No audit events have been recorded.</p> : (
              <ul className={styles.eventList}>
                {events.map((event) => (
                  <li className={styles.eventItem} key={event.id}>
                    <div>
                      <strong>{event.action}</strong>
                      <div className={styles.meta}>{event.actor?.email || "System"} · {new Date(event.createdAt).toLocaleString()}</div>
                    </div>
                    <span className={styles.badge}>{event.success ? "Success" : "Failed"}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}
      </div>
      <p className={styles.meta}>Deal, affiliate, and publishing tools are intentionally outside this authentication milestone.</p>
    </main>
  );
}
