"use client";

import { type FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import {
  CheckCircle2, ChevronLeft, ChevronRight, CircleUserRound, FileText,
  Ban, KeyRound, PauseCircle, Plus, RotateCw, Search, ShieldCheck, Trash2, Users, X,
} from "lucide-react";
import { AdminNav } from "@/components/admin/AdminNav";
import { ACCESS_MODULES, ROLE_ONLY_MODULES } from "@/server/auth/modules";
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
  suspendedFrom: string | null;
  suspendedUntil: string | null;
  suspensionReason: string | null;
  customAccess: boolean;
  customAccessUntil: string | null;
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

type StateAction = "suspend" | "disable" | "enable" | "delete";
const ACTION_COPY: Record<StateAction, { title: string; verb: string; text: string; needsCode: boolean }> = {
  suspend: { title: "Suspend account", verb: "Suspend", text: "The person cannot sign in during the period you choose and is signed out when it starts.", needsCode: false },
  disable: { title: "Disable account", verb: "Disable", text: "The person is signed out and cannot sign in until you enable the account again.", needsCode: true },
  enable: { title: "Enable account", verb: "Enable", text: "The person can sign in again with their existing password and authenticator.", needsCode: true },
  delete: { title: "Delete account", verb: "Delete", text: "The account disappears from this list and can no longer sign in. Its records stay in the database for the audit trail, and its email address cannot be reused.", needsCode: true },
};
/** Value for a datetime-local input, in the time zone of the browser. */
function localInput(date: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
function statusLabel(account: Account) {
  const now = Date.now();
  if (account.status === "SUSPENDED" && account.suspendedUntil) return `Suspended until ${formatDate(account.suspendedUntil)}`;
  if (account.status === "ACTIVE" && account.suspendedUntil && new Date(account.suspendedUntil).getTime() > now) return `Suspension scheduled from ${formatDate(account.suspendedFrom ?? account.suspendedUntil)}`;
  return account.status.replaceAll("_", " ");
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
  const [stateDialog, setStateDialog] = useState<{ account: Account; action: StateAction; from: string; until: string } | null>(null);
  const [dialogError, setDialogError] = useState("");
  const [dialogBusy, setDialogBusy] = useState(false);
  const [accessDialog, setAccessDialog] = useState<{ account: Account; levels: Record<string, string>; until: string; loading: boolean } | null>(null);

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

  function openState(account: Account, action: StateAction) {
    setDialogError("");
    // Defaults are worked out here, in the click handler, so the dialog render stays pure.
    const now = Date.now();
    setStateDialog({ account, action, from: localInput(new Date(now)), until: localInput(new Date(now + 7 * 24 * 60 * 60 * 1000)) });
  }

  async function submitState(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!stateDialog) return;
    const form = new FormData(event.currentTarget);
    const { account, action } = stateDialog;
    const body: Record<string, string> = { action };
    if (ACTION_COPY[action].needsCode) body.totp = String(form.get("totp") ?? "").trim();
    if (action === "suspend") {
      const from = String(form.get("from") ?? ""), until = String(form.get("until") ?? "");
      if (!from || !until) { setDialogError("Choose the start and end date and time."); return; }
      body.suspendedFrom = new Date(from).toISOString();
      body.suspendedUntil = new Date(until).toISOString();
      body.reason = String(form.get("reason") ?? "");
    }
    setDialogBusy(true);
    setDialogError("");
    try {
      await requestJson(`/api/admin/accounts/${encodeURIComponent(account.id)}/state`, {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
      });
      setStateDialog(null);
      setNotice(`${ACTION_COPY[action].verb} done for ${account.email ?? "the account"}.`);
      setReloadVersion((version) => version + 1);
    } catch (reason) {
      setDialogError(reason instanceof Error ? reason.message : "The action could not be completed.");
    } finally {
      setDialogBusy(false);
    }
  }

  async function openAccess(account: Account) {
    setDialogError("");
    setAccessDialog({ account, levels: {}, until: "", loading: true });
    try {
      const { access } = await requestJson<{ access: { customAccess: boolean; customAccessUntil: string | null; levels: Record<string, string> } }>(`/api/admin/accounts/${encodeURIComponent(account.id)}/access`);
      setAccessDialog({ account, levels: access.customAccess ? access.levels : {}, until: access.customAccessUntil ? localInput(new Date(access.customAccessUntil)) : "", loading: false });
    } catch (reason) {
      setAccessDialog(null);
      setError(reason instanceof Error ? reason.message : "Access could not be loaded.");
    }
  }

  async function submitAccess(formElement: HTMLFormElement, useRoleDefaults: boolean) {
    if (!accessDialog) return;
    const form = new FormData(formElement);
    const choice = Object.fromEntries(Object.entries(accessDialog.levels).filter(([, level]) => level));
    setDialogBusy(true);
    setDialogError("");
    try {
      await requestJson(`/api/admin/accounts/${encodeURIComponent(accessDialog.account.id)}/access`, {
        method: "PUT", headers: { "content-type": "application/json" },
        body: JSON.stringify({ useRoleDefaults, ...(useRoleDefaults ? {} : { choice, until: accessDialog.until ? new Date(accessDialog.until).toISOString() : null }), totp: String(form.get("totp") ?? "").trim() }),
      });
      setNotice(useRoleDefaults ? "Access reset to the role defaults." : "Access saved. It applies on the person's next request.");
      setAccessDialog(null);
      setReloadVersion((version) => version + 1);
    } catch (reason) {
      setDialogError(reason instanceof Error ? reason.message : "Access could not be saved.");
    } finally {
      setDialogBusy(false);
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
          <h1>Admin</h1>
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
                    <td data-label="Role"><span className={styles.roleBadge}>{displayRole(account.role)}</span>
                      {account.customAccess && <small className={styles.meta} style={{ display: "block", marginTop: 4 }}>Custom access{account.customAccessUntil ? ` until ${formatDate(account.customAccessUntil)}` : ""}</small>}</td>
                    <td data-label="MFA Status"><span className={`${styles.stateBadge} ${account.totpEnabledAt ? styles.stateGood : styles.stateMuted}`}>
                      {account.totpEnabledAt ? <CheckCircle2 size={15} /> : <CircleUserRound size={15} />}{account.totpEnabledAt ? "Enabled" : "Not enrolled"}
                    </span></td>
                    <td data-label="Status"><span className={`${styles.stateBadge} ${account.status === "ACTIVE" ? styles.stateGood : account.status === "SUSPENDED" || account.status === "DISABLED" ? styles.stateWarn : styles.stateMuted}`}>
                      {account.status === "ACTIVE" ? <CheckCircle2 size={15} /> : <PauseCircle size={15} />}{statusLabel(account)}
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
                      {canManageAccount && account.status === "ACTIVE" && !account.suspendedUntil && (
                        <button type="button" className={styles.dangerButton} disabled={busy} onClick={() => openState(account, "suspend")}><PauseCircle size={15} /> Suspend</button>
                      )}
                      {canManageAccount && (account.status === "ACTIVE" || account.status === "SUSPENDED") && (
                        <button type="button" className={styles.dangerButton} disabled={busy} onClick={() => openState(account, "disable")}><Ban size={15} /> Disable</button>
                      )}
                      {canManageAccount && (account.status === "DISABLED" || account.status === "SUSPENDED" || (account.status === "ACTIVE" && account.suspendedUntil)) && (
                        <button type="button" className={styles.secondaryButton} disabled={busy} onClick={() => openState(account, "enable")}><RotateCw size={15} /> Enable</button>
                      )}
                      {canManageAccount && role === "SUPER_ADMIN" && account.role !== "SUPER_ADMIN" && account.role !== "COMMUNITY_MODERATOR" && (
                        <button type="button" className={styles.secondaryButton} disabled={busy} onClick={() => void openAccess(account)}><KeyRound size={15} /> Access</button>
                      )}
                      {canManageAccount && role === "SUPER_ADMIN" && (
                        <button type="button" className={styles.dangerButton} disabled={busy} onClick={() => openState(account, "delete")}><Trash2 size={15} /> Delete</button>
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
      {stateDialog && (() => {
        const { account, action } = stateDialog;
        const copy = ACTION_COPY[action];
        return (
          <div className={styles.modalBackdrop} role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !dialogBusy) setStateDialog(null); }}>
            <form className={styles.modal} role="dialog" aria-modal="true" aria-labelledby="state-dialog-title" onSubmit={submitState}>
              <div className={styles.modalHead}>
                <h2 id="state-dialog-title">{copy.title}</h2>
                <button type="button" className={styles.modalClose} aria-label="Close" onClick={() => setStateDialog(null)} disabled={dialogBusy}><X size={18} /></button>
              </div>
              <p><strong>{account.email ?? account.id}</strong></p>
              <p>{copy.text}</p>
              {action === "suspend" && (
                <>
                  <label className={styles.foundationInput}>From<input name="from" type="datetime-local" defaultValue={stateDialog.from} required /></label>
                  <label className={styles.foundationInput}>To<input name="until" type="datetime-local" defaultValue={stateDialog.until} required /></label>
                  <label className={styles.foundationInput}>Reason for suspension<textarea name="reason" rows={3} minLength={5} maxLength={300} required placeholder="Why is this account being suspended?" /></label>
                </>
              )}
              {copy.needsCode && (
                <label className={styles.foundationInput}>Authenticator code (6 digits)
                  <input name="totp" inputMode="numeric" pattern="[0-9]{6}" maxLength={6} autoComplete="one-time-code" placeholder="123456" required autoFocus />
                </label>
              )}
              {dialogError && <p className={styles.error} role="alert">{dialogError}</p>}
              <div className={styles.modalActions}>
                <button type="button" className={styles.secondaryButton} onClick={() => setStateDialog(null)} disabled={dialogBusy}>Cancel</button>
                <button className={action === "enable" ? styles.button : styles.dangerButton} disabled={dialogBusy}>{dialogBusy ? "Working…" : `Confirm ${copy.verb.toLowerCase()}`}</button>
              </div>
            </form>
          </div>
        );
      })()}
      {accessDialog && (
        <div className={styles.modalBackdrop} role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !dialogBusy) setAccessDialog(null); }}>
          <form className={`${styles.modal} ${styles.modalWide}`} role="dialog" aria-modal="true" aria-labelledby="access-dialog-title" onSubmit={(event) => { event.preventDefault(); void submitAccess(event.currentTarget, false); }}>
            <div className={styles.modalHead}>
              <h2 id="access-dialog-title">Access for {accessDialog.account.email ?? "this account"}</h2>
              <button type="button" className={styles.modalClose} aria-label="Close" onClick={() => setAccessDialog(null)} disabled={dialogBusy}><X size={18} /></button>
            </div>
            <p>Tick what this person can open. The list replaces what their role normally allows; leave a module unticked to hide it.</p>
            {accessDialog.loading ? <p>Loading…</p> : (
              <>
                <div className={styles.accessList}>
                  {ACCESS_MODULES.map((module) => {
                    const selected = module.levels.findIndex((level) => level.key === accessDialog.levels[module.key]);
                    return (
                      <fieldset key={module.key} className={styles.accessRow}>
                        <legend>{module.label}</legend>
                        <small>{module.description}</small>
                        <div className={styles.accessChecks}>
                          {module.levels.map((level, index) => (
                            <label key={level.key}>
                              <input
                                type="checkbox"
                                checked={index <= selected}
                                onChange={(event) => setAccessDialog((d) => {
                                  if (!d) return d;
                                  // A higher level includes the lower ones: ticking one ticks the levels below it, clearing one clears the levels above it.
                                  const levels = { ...d.levels };
                                  const next = event.target.checked ? level.key : module.levels[index - 1]?.key;
                                  if (next) levels[module.key] = next; else delete levels[module.key];
                                  return { ...d, levels };
                                })}
                              />
                              {level.label}
                            </label>
                          ))}
                        </div>
                      </fieldset>
                    );
                  })}
                </div>
                <p className={styles.meta}>Always follows the role and is not set here: {ROLE_ONLY_MODULES.join(", ")}.</p>
                <div className={styles.accessFooter}>
                  <label className={styles.foundationInput}>Access ends (optional)
                    <input type="datetime-local" value={accessDialog.until} onChange={(event) => setAccessDialog((d) => d && ({ ...d, until: event.target.value }))} />
                    <small>After this time the person goes back to their role&apos;s normal access. Leave empty for no end.</small>
                  </label>
                  <label className={styles.foundationInput}>Your authenticator code (6 digits)
                    <input name="totp" inputMode="numeric" pattern="[0-9]{6}" maxLength={6} autoComplete="one-time-code" placeholder="123456" required />
                  </label>
                </div>
              </>
            )}
            {dialogError && <p className={styles.error} role="alert">{dialogError}</p>}
            <div className={styles.modalActions}>
              <button type="button" className={styles.secondaryButton} onClick={() => setAccessDialog(null)} disabled={dialogBusy}>Cancel</button>
              <button type="button" className={styles.secondaryButton} disabled={dialogBusy || accessDialog.loading} onClick={(event) => { const f = event.currentTarget.form; if (f && f.reportValidity()) void submitAccess(f, true); }}>Use role defaults</button>
              <button className={styles.button} disabled={dialogBusy || accessDialog.loading}>{dialogBusy ? "Saving…" : "Save access"}</button>
            </div>
          </form>
        </div>
      )}
    </main>
  );
}
