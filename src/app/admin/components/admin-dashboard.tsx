"use client";

import { type FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import {
  CheckCircle2, ChevronLeft, ChevronRight, CircleUserRound, FileText,
  PauseCircle, Plus, RotateCw, Search, ShieldCheck, Users,
} from "lucide-react";
import { AdminNav } from "@/components/admin/AdminNav";
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
  createdBy: { id: string; name: string | null; email: string | null } | null;
};

type AuditEvent = {
  id: string;
  action: string;
  success: boolean;
  details: string;
  createdAt: string;
  actor: { id: string; email: string | null; role: UserRole } | null;
};

type AccountPage = {
  users: Account[];
  page: number;
  totalPages: number;
  total: number;
  counts: { total: number; active: number; suspended: number; mfaEnabled: number };
};

type AuditPage = { events: AuditEvent[]; actions: string[]; page: number; totalPages: number; total: number };

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const result = await response.json() as T & { error?: string };
  if (!response.ok) throw new Error(result.error ?? "The request could not be completed.");
  return result;
}

function displayRole(role: UserRole) { return role.replaceAll("_", " "); }
function displayAction(action: string) { return action.replaceAll(".", " · ").replaceAll("_", " "); }
function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

export function AdminDashboard({ actorId, role }: { actorId: string; role: UserRole }) {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [counts, setCounts] = useState({ total: 0, active: 0, suspended: 0, mfaEnabled: 0 });
  const [accountSearch, setAccountSearch] = useState("");
  const [accountQuery, setAccountQuery] = useState("");
  const [accountPage, setAccountPage] = useState(1);
  const [accountPages, setAccountPages] = useState(1);
  const [accountTotal, setAccountTotal] = useState(0);
  const [auditEvents, setAuditEvents] = useState<AuditEvent[]>([]);
  const [auditActions, setAuditActions] = useState<string[]>([]);
  const [auditAction, setAuditAction] = useState("");
  const [auditRange, setAuditRange] = useState("7d");
  const [auditPage, setAuditPage] = useState(1);
  const [auditPages, setAuditPages] = useState(1);
  const [auditTotal, setAuditTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [auditError, setAuditError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [setupLink, setSetupLink] = useState("");
  const [roleChanges, setRoleChanges] = useState<Record<string, UserRole>>({});
  const [reloadVersion, setReloadVersion] = useState(0);
  const canReadAudit = role === "SUPER_ADMIN";

  const load = useCallback(async (signal?: AbortSignal) => {
    const accountParams = new URLSearchParams({ page: String(accountPage), limit: "25", search: accountQuery });
    const auditParams = new URLSearchParams({ page: String(auditPage), limit: "10", range: auditRange, action: auditAction });
    const accountPromise = requestJson<AccountPage>(`/api/admin/accounts?${accountParams}`, { signal });
    const auditPromise = canReadAudit
      ? requestJson<AuditPage>(`/api/admin/audit?${auditParams}`, { signal })
      : Promise.resolve(null);
    const [accountResult, auditResult] = await Promise.allSettled([accountPromise, auditPromise]);
    if (signal?.aborted) return;
    if (accountResult.status === "rejected") {
      setError(accountResult.reason instanceof Error ? accountResult.reason.message : "Admin accounts could not be loaded.");
      setLoading(false);
      return;
    }
    setError("");
    setAccounts(accountResult.value.users);
    setCounts(accountResult.value.counts);
    setAccountTotal(accountResult.value.total);
    setAccountPages(accountResult.value.totalPages);
    if (auditResult.status === "fulfilled" && auditResult.value) {
      setAuditEvents(auditResult.value.events);
      setAuditActions(auditResult.value.actions);
      setAuditTotal(auditResult.value.total);
      setAuditPages(auditResult.value.totalPages);
      setAuditError("");
    } else if (auditResult.status === "rejected") {
      setAuditError(auditResult.reason instanceof Error ? auditResult.reason.message : "Audit activity could not be loaded.");
    }
    setLoading(false);
  }, [accountPage, accountQuery, auditAction, auditPage, auditRange, canReadAudit]);

  useEffect(() => {
    const timer = window.setTimeout(() => setAccountQuery(accountSearch.trim()), 250);
    return () => window.clearTimeout(timer);
  }, [accountSearch]);

  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => void load(controller.signal), 0);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [load, reloadVersion]);

  const creatableRoles: UserRole[] = role === "SUPER_ADMIN"
    ? ["SUPER_ADMIN", "ADMIN", "EDITOR"]
    : role === "ADMIN" ? ["EDITOR"] : [];
  const countsCards = useMemo(() => [
    { label: "Total Accounts", value: counts.total, icon: Users, tone: "purple" },
    { label: "Active Accounts", value: counts.active, icon: CheckCircle2, tone: "green" },
    { label: "Suspended", value: counts.suspended, icon: PauseCircle, tone: "orange" },
    { label: "MFA Enabled", value: counts.mfaEnabled, icon: ShieldCheck, tone: "purple" },
  ], [counts]);

  function refresh() {
    setNotice("");
    setReloadVersion((version) => version + 1);
  }

  async function createAccount(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setNotice("");
    setSetupLink("");
    setBusy(true);
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
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
      setNotice("Account created. Share the one-time setup link with the verified recipient through your approved secure channel.");
      formElement.reset();
      setCreateOpen(false);
      refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Account could not be created.");
    } finally {
      setBusy(false);
    }
  }

  async function updateUser(account: Account, change: { role?: UserRole; status?: UserStatus }) {
    const operation = change.status === "SUSPENDED" ? "suspend" : change.status === "ACTIVE" ? "reactivate" : "change this account's role";
    const impact = change.status === "SUSPENDED" ? " Existing sessions will be revoked." : "";
    if (!window.confirm(`Are you sure you want to ${operation} for ${account.email ?? "this account"}?${impact}`)) return;
    setError("");
    setNotice("");
    setBusy(true);
    try {
      await requestJson(`/api/admin/accounts/${encodeURIComponent(account.id)}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(change),
      });
      setNotice("Account updated. Existing sessions may have been revoked.");
      setReloadVersion((version) => version + 1);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Account could not be updated.");
    } finally {
      setBusy(false);
    }
  }

  async function copySetupLink() {
    try {
      await navigator.clipboard.writeText(setupLink);
      setNotice("Setup link copied. Send it only through your verified secure channel.");
    } catch {
      setError("The setup link could not be copied. Select and copy it manually from the field.");
    }
  }

  return (
    <main className={styles.adminPage}>
      <AdminNav active="account" />

      <section className={styles.foundationHero}>
        <div>
          <h1>Admin Foundation</h1>
          <p>Authentication and account management for administrative access.</p>
        </div>
        <ShieldCheck size={60} aria-hidden="true" />
      </section>

      {error && <p className={styles.error} role="alert">{error}</p>}
      {notice && <p className={styles.notice} role="status">{notice}</p>}
      {setupLink && (
        <div className={styles.setupLinkPanel}>
          <label htmlFor="account-setup-link">One-time account setup link</label>
          <p>Share this link only with the verified recipient through your approved secure channel. It grants access to account setup.</p>
          <div className={styles.setupLinkRow}>
            <input id="account-setup-link" readOnly value={setupLink} onFocus={(event) => event.currentTarget.select()} />
            <button type="button" className={styles.secondaryButton} onClick={() => void copySetupLink()}>Copy link</button>
            <button type="button" className={styles.secondaryButton} onClick={() => setSetupLink("")}>Hide link</button>
          </div>
        </div>
      )}

      <section className={styles.summaryGrid} aria-label="Administrative account summary">
        {countsCards.map(({ label, value, icon: Icon, tone }) => (
          <article className={styles.summaryCard} key={label}>
            <span className={`${styles.summaryIcon} ${styles[`tone_${tone}`]}`}><Icon size={26} aria-hidden="true" /></span>
            <span><span className={styles.summaryLabel}>{label}</span><strong>{loading ? "—" : value}</strong></span>
          </article>
        ))}
      </section>

      <section className={styles.foundationSection} aria-labelledby="accounts-heading">
        <div className={styles.sectionHeadingBar}>
          <h2 id="accounts-heading"><Users size={24} aria-hidden="true" /> Accounts Management</h2>
          <div className={styles.sectionTools}>
            <label className={styles.searchField}>
              <Search size={18} aria-hidden="true" />
              <span className={styles.visuallyHidden}>Search by email or account</span>
              <input value={accountSearch} onChange={(event) => { setAccountSearch(event.target.value); setAccountPage(1); }} placeholder="Search by email or account…" />
            </label>
            {creatableRoles.length > 0 && (
              <button type="button" className={styles.button} onClick={() => setCreateOpen((open) => !open)} aria-expanded={createOpen}>
                <Plus size={18} /> {createOpen ? "Close" : "Create Account"}
              </button>
            )}
          </div>
        </div>

        {createOpen && creatableRoles.length > 0 && (
          <form className={styles.createAccountForm} onSubmit={createAccount}>
            <label className={styles.foundationInput}>
              Email address
              <input name="email" type="email" placeholder="name@example.com" autoComplete="email" required maxLength={254} />
            </label>
            <label className={styles.foundationInput}>
              Role
              <select name="role" defaultValue={creatableRoles[0]}>
                {creatableRoles.map((item) => <option key={item} value={item}>{displayRole(item)}</option>)}
              </select>
            </label>
            <label className={styles.emailAttestation}>
              <input name="emailDeliveryVerified" type="checkbox" required />
              <span>I verified this email address and will deliver the setup link through a secure channel.</span>
            </label>
            <button className={styles.button} disabled={busy}><Plus size={18} /> Create Account</button>
          </form>
        )}

        <div className={styles.tableWrap}>
          <table className={styles.accountTable}>
            <thead><tr><th>Account (Email)</th><th>Role</th><th>MFA Status</th><th>Status</th><th>Created by</th><th>Actions</th></tr></thead>
            <tbody>
              {loading && accounts.length === 0 ? (
                <tr><td colSpan={6} className={styles.tableState}>Loading administrative accounts…</td></tr>
              ) : accounts.length === 0 ? (
                <tr><td colSpan={6} className={styles.tableState}>{accountQuery ? "No accounts match this search." : "No administrative accounts found."}</td></tr>
              ) : accounts.map((account) => {
                const canManageAccount = account.id !== actorId && (role === "SUPER_ADMIN" || (role === "ADMIN" && account.role === "EDITOR"));
                return (
                  <tr key={account.id}>
                    <td data-label="Account (Email)">
                      <div className={styles.accountCell}>
                        <span className={styles.avatar} aria-hidden="true">{(account.name || account.email || "?").trim().slice(0, 1).toUpperCase()}</span>
                        <span className={styles.accountIdentity}><strong>{account.email || "No email address"}</strong><small>{account.name || account.email || account.id}</small></span>
                      </div>
                    </td>
                    <td data-label="Role"><span className={styles.roleBadge}>{displayRole(account.role)}</span></td>
                    <td data-label="MFA Status"><span className={`${styles.stateBadge} ${account.totpEnabledAt ? styles.stateGood : styles.stateMuted}`}>
                      {account.totpEnabledAt ? <CheckCircle2 size={15} /> : <CircleUserRound size={15} />}{account.totpEnabledAt ? "Enabled" : "Not enrolled"}
                    </span></td>
                    <td data-label="Status"><span className={`${styles.stateBadge} ${account.status === "ACTIVE" ? styles.stateGood : account.status === "SUSPENDED" ? styles.stateWarn : styles.stateMuted}`}>
                      {account.status === "ACTIVE" ? <CheckCircle2 size={15} /> : <PauseCircle size={15} />}{account.status.replaceAll("_", " ")}
                    </span></td>
                    <td data-label="Created by"><span className={styles.creatorCell}>
                      {account.createdBy ? <><strong>{account.createdBy.name || account.createdBy.email || "Admin"}</strong>{account.createdBy.name && account.createdBy.email && <small>{account.createdBy.email}</small>}</> : <span className={styles.meta}>System / legacy</span>}
                    </span></td>
                    <td data-label="Actions"><div className={styles.rowActions}>
                      {canManageAccount && role === "SUPER_ADMIN" && (
                        <div className={styles.roleEditor}>
                          <select aria-label={`Role for ${account.email ?? account.id}`} value={roleChanges[account.id] ?? account.role}
                            onChange={(event) => setRoleChanges((existing) => ({ ...existing, [account.id]: event.target.value as UserRole }))}>
                            {(["SUPER_ADMIN", "ADMIN", "EDITOR"] as UserRole[]).map((item) => <option key={item} value={item}>{displayRole(item)}</option>)}
                          </select>
                          <button type="button" className={styles.secondaryButton} disabled={busy || (roleChanges[account.id] ?? account.role) === account.role}
                            onClick={() => void updateUser(account, { role: roleChanges[account.id] })}>Update Role</button>
                        </div>
                      )}
                      {canManageAccount && account.status === "ACTIVE" && (
                        <button type="button" className={styles.dangerButton} disabled={busy} onClick={() => void updateUser(account, { status: "SUSPENDED" })}>Suspend</button>
                      )}
                      {canManageAccount && account.status === "SUSPENDED" && (
                        <button type="button" className={styles.secondaryButton} disabled={busy} onClick={() => void updateUser(account, { status: "ACTIVE" })}><RotateCw size={15} /> Reactivate</button>
                      )}
                      {!canManageAccount && <span className={styles.meta}>{account.id === actorId ? "Current account" : "—"}</span>}
                    </div></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className={styles.tableFooter}>
          <span>Showing {accounts.length ? (accountPage - 1) * 25 + 1 : 0}–{(accountPage - 1) * 25 + accounts.length} of {accountTotal} accounts</span>
          <div className={styles.pagination}>
            <button type="button" className={styles.secondaryButton} disabled={loading || accountPage <= 1} onClick={() => setAccountPage((page) => Math.max(1, page - 1))}><ChevronLeft size={16} /> Previous</button>
            <span>Page {accountPage} of {accountPages}</span>
            <button type="button" className={styles.secondaryButton} disabled={loading || accountPage >= accountPages} onClick={() => setAccountPage((page) => page + 1)}>Next <ChevronRight size={16} /></button>
          </div>
        </div>
      </section>

      {canReadAudit && (
        <section className={styles.foundationSection} aria-labelledby="audit-heading">
          <div className={styles.sectionHeadingBar}>
            <h2 id="audit-heading"><FileText size={24} aria-hidden="true" /> Recent Audit Activity (Logs)</h2>
            <div className={styles.sectionTools}>
              <label className={styles.filterField}>
                <span className={styles.visuallyHidden}>Filter audit events</span>
                <select value={auditAction} onChange={(event) => { setAuditAction(event.target.value); setAuditPage(1); }}>
                  <option value="">All Actions</option>
                  {auditActions.map((action) => <option key={action} value={action}>{displayAction(action)}</option>)}
                </select>
              </label>
              <label className={styles.filterField}>
                <span className={styles.visuallyHidden}>Audit date range</span>
                <select value={auditRange} onChange={(event) => { setAuditRange(event.target.value); setAuditPage(1); }}>
                  <option value="24h">Last 24 hours</option><option value="7d">Last 7 days</option><option value="30d">Last 30 days</option><option value="all">All time</option>
                </select>
              </label>
              <button type="button" className={styles.iconButton} onClick={refresh} aria-label="Refresh audit activity" title="Refresh"><RotateCw size={18} /></button>
            </div>
          </div>
          {auditError && <p className={styles.error} role="alert">{auditError}</p>}
          <div className={styles.tableWrap}>
            <table className={styles.auditTable}>
              <thead><tr><th>Time</th><th>Action / Event</th><th>Account</th><th>Details</th><th>Result</th></tr></thead>
              <tbody>
                {loading && auditEvents.length === 0 ? <tr><td colSpan={5} className={styles.tableState}>Loading audit activity…</td></tr> :
                  auditEvents.length === 0 ? <tr><td colSpan={5} className={styles.tableState}>No audit events match these filters.</td></tr> :
                    auditEvents.map((event) => <tr key={event.id}>
                      <td data-label="Time">{formatDate(event.createdAt)}</td>
                      <td data-label="Action / Event"><span className={styles.auditAction}><Users size={15} />{displayAction(event.action)}</span></td>
                      <td data-label="Account">{event.actor?.email || "System"}</td>
                      <td data-label="Details" className={styles.auditDetails}>{event.details}</td>
                      <td data-label="Result"><span className={`${styles.stateBadge} ${event.success ? styles.stateGood : styles.stateBad}`}>{event.success ? <CheckCircle2 size={15} /> : <PauseCircle size={15} />}{event.success ? "Success" : "Failed"}</span></td>
                    </tr>)}
              </tbody>
            </table>
          </div>
          <div className={styles.tableFooter}>
            <span>{auditTotal} audit events</span>
            <div className={styles.pagination}>
              <button type="button" className={styles.secondaryButton} disabled={loading || auditPage <= 1} onClick={() => setAuditPage((page) => Math.max(1, page - 1))}><ChevronLeft size={16} /> Previous</button>
              <span>Page {auditPage} of {auditPages}</span>
              <button type="button" className={styles.secondaryButton} disabled={loading || auditPage >= auditPages} onClick={() => setAuditPage((page) => page + 1)}>Next <ChevronRight size={16} /></button>
            </div>
          </div>
        </section>
      )}

      {!canReadAudit && <p className={styles.meta}>Audit activity requires the audit read permission.</p>}
      <span className={styles.visuallyHidden} aria-live="polite">{loading ? "Refreshing dashboard data" : "Dashboard data loaded"}</span>
    </main>
  );
}
