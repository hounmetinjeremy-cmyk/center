import { useEffect, useState } from "react";
import { Loader2, Lock, RefreshCw, ShieldCheck, Ticket, Coins, UserCheck } from "lucide-react";

const API_BASE = "/api/fedapay/admin";
const STORAGE_KEY = "espace-formation:admin-password";

type AdminUser = {
  id: string;
  email: string | null;
  display_name: string | null;
  coins: number;
  access_unlocked: boolean;
  comp_ticket: boolean;
  referral_code: string | null;
  referred_by: string | null;
  created_at: string;
};

type AdminWithdrawal = {
  id: string;
  amount_coins: number;
  amount_xof: number;
  phone_number: string;
  country: string;
  operator: string;
  status: string;
  failure_reason: string | null;
  created_at: string;
  profiles: { email: string | null; display_name: string | null } | null;
};

type AdminPayment = {
  transaction_id: number;
  status: string;
  updated_at: string;
  profiles: { email: string | null; display_name: string | null } | null;
};

async function adminFetch<T>(password: string, path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", "x-admin-password": password, ...(init.headers as Record<string, string> | undefined) },
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error((data && typeof data.message === "string" ? data.message : `Erreur ${res.status}`));
  return data as T;
}

function formatDate(iso: string) {
  try {
    return new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
  } catch {
    return iso;
  }
}

export function AdminPanel() {
  const [password, setPassword] = useState(() => sessionStorage.getItem(STORAGE_KEY) ?? "");
  const [authorized, setAuthorized] = useState(false);
  const [passwordInput, setPasswordInput] = useState("");
  const [loginError, setLoginError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [users, setUsers] = useState<AdminUser[] | null>(null);
  const [withdrawals, setWithdrawals] = useState<AdminWithdrawal[] | null>(null);
  const [payments, setPayments] = useState<AdminPayment[] | null>(null);
  const [tab, setTab] = useState<"users" | "withdrawals" | "payments">("users");
  const [search, setSearch] = useState("");
  const [actionEmail, setActionEmail] = useState("");
  const [coinsDelta, setCoinsDelta] = useState("");
  const [actionBusy, setActionBusy] = useState(false);
  const [actionMessage, setActionMessage] = useState<{ text: string; kind: "success" | "error" } | null>(null);

  const loadAll = async (pwd: string) => {
    setLoading(true);
    try {
      const [u, w, p] = await Promise.all([
        adminFetch<{ users: AdminUser[] }>(pwd, "/users"),
        adminFetch<{ withdrawals: AdminWithdrawal[] }>(pwd, "/withdrawals"),
        adminFetch<{ payments: AdminPayment[] }>(pwd, "/payments"),
      ]);
      setUsers(u.users);
      setWithdrawals(w.withdrawals);
      setPayments(p.payments);
    } catch (err) {
      setLoginError(err instanceof Error ? err.message : "Erreur de chargement.");
      setAuthorized(false);
      sessionStorage.removeItem(STORAGE_KEY);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (password) {
      setAuthorized(true);
      loadAll(password);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleLogin = async () => {
    setLoginError(null);
    if (!passwordInput.trim()) return;
    sessionStorage.setItem(STORAGE_KEY, passwordInput.trim());
    setPassword(passwordInput.trim());
    setAuthorized(true);
    await loadAll(passwordInput.trim());
  };

  const runAction = async (action: () => Promise<void>) => {
    setActionBusy(true);
    setActionMessage(null);
    try {
      await action();
      await loadAll(password);
    } catch (err) {
      setActionMessage({ text: err instanceof Error ? err.message : "Erreur.", kind: "error" });
    } finally {
      setActionBusy(false);
    }
  };

  const handleGrantTicket = () => runAction(async () => {
    await adminFetch(password, "/grant-ticket", { method: "POST", body: JSON.stringify({ email: actionEmail.trim() }) });
    setActionMessage({ text: `Ticket gratuit accordé à ${actionEmail.trim()}.`, kind: "success" });
  });

  const handleUnlock = () => runAction(async () => {
    await adminFetch(password, "/unlock", { method: "POST", body: JSON.stringify({ email: actionEmail.trim() }) });
    setActionMessage({ text: `Accès débloqué pour ${actionEmail.trim()}.`, kind: "success" });
  });

  const handleAdjustCoins = () => runAction(async () => {
    const delta = parseInt(coinsDelta, 10);
    if (!Number.isFinite(delta) || delta === 0) { setActionMessage({ text: "Entre un nombre de coins valide (positif ou négatif).", kind: "error" }); return; }
    const result = await adminFetch<{ coins: number }>(password, "/coins", { method: "POST", body: JSON.stringify({ email: actionEmail.trim(), delta }) });
    setActionMessage({ text: `Nouveau solde de ${actionEmail.trim()} : ${result.coins} coins.`, kind: "success" });
  });

  if (!authorized) {
    return (
      <div className="notranslate" translate="no" style={{ minHeight: "100vh", display: "grid", placeItems: "center", background: "hsl(var(--background))", padding: 20 }}>
        <div style={{ width: "100%", maxWidth: 340, padding: 28, borderRadius: 20, border: "1px solid hsl(var(--border))", background: "hsl(var(--card))", textAlign: "center" }}>
          <Lock size={26} style={{ margin: "0 auto 12px", display: "block" }} />
          <h1 style={{ fontSize: 18, margin: "0 0 4px" }}>Panneau admin</h1>
          <p style={{ fontSize: 12, opacity: 0.6, margin: "0 0 18px" }}>Espace de Formation</p>
          <input
            type="password"
            value={passwordInput}
            onChange={(e) => setPasswordInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleLogin()}
            placeholder="Mot de passe admin"
            style={{ width: "100%", padding: "10px 12px", borderRadius: 10, border: "1px solid hsl(var(--border))", fontSize: 15, textAlign: "center" }}
            autoFocus
          />
          {loginError && <p style={{ color: "hsl(4 65% 45%)", fontSize: 12, marginTop: 10 }}>{loginError}</p>}
          <button type="button" className="primary-button" onClick={handleLogin} disabled={loading} style={{ marginTop: 14, width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
            {loading ? <Loader2 size={16} className="auth-spin" /> : "Entrer"}
          </button>
        </div>
      </div>
    );
  }

  const filteredUsers = (users ?? []).filter((u) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return (u.email ?? "").toLowerCase().includes(q) || (u.display_name ?? "").toLowerCase().includes(q);
  });

  return (
    <div className="notranslate" translate="no" style={{ minHeight: "100vh", background: "hsl(var(--background))", padding: "20px 16px 60px" }}>
      <div style={{ maxWidth: 720, margin: "0 auto" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
          <h1 style={{ fontSize: 20, margin: 0, display: "flex", alignItems: "center", gap: 8 }}><ShieldCheck size={20} /> Panneau admin</h1>
          <button type="button" onClick={() => loadAll(password)} disabled={loading} style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 12px", borderRadius: 10, border: "1px solid hsl(var(--border))", background: "transparent", fontSize: 12 }}>
            {loading ? <Loader2 size={14} className="auth-spin" /> : <RefreshCw size={14} />} Actualiser
          </button>
        </div>

        <section style={{ padding: 16, borderRadius: 16, border: "1px solid hsl(var(--border))", background: "hsl(var(--card))", marginBottom: 18 }}>
          <p className="eyebrow" style={{ margin: "0 0 10px" }}>ACTIONS SUR UN COMPTE</p>
          <input
            type="email"
            value={actionEmail}
            onChange={(e) => setActionEmail(e.target.value)}
            placeholder="email@exemple.com"
            style={{ width: "100%", padding: "10px 12px", borderRadius: 10, border: "1px solid hsl(var(--border))", fontSize: 14 }}
          />
          <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
            <button type="button" onClick={handleGrantTicket} disabled={actionBusy || !actionEmail.trim()} style={{ display: "flex", alignItems: "center", gap: 6, padding: "9px 12px", borderRadius: 10, border: "1px solid hsl(var(--border))", background: "transparent", fontSize: 12, fontWeight: 600 }}>
              <Ticket size={14} /> Ticket gratuit
            </button>
            <button type="button" onClick={handleUnlock} disabled={actionBusy || !actionEmail.trim()} style={{ display: "flex", alignItems: "center", gap: 6, padding: "9px 12px", borderRadius: 10, border: "1px solid hsl(var(--border))", background: "transparent", fontSize: 12, fontWeight: 600 }}>
              <UserCheck size={14} /> Débloquer l'accès
            </button>
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
            <input
              type="number"
              value={coinsDelta}
              onChange={(e) => setCoinsDelta(e.target.value)}
              placeholder="+10 ou -5"
              style={{ width: 110, padding: "9px 10px", borderRadius: 10, border: "1px solid hsl(var(--border))", fontSize: 13 }}
            />
            <button type="button" onClick={handleAdjustCoins} disabled={actionBusy || !actionEmail.trim() || !coinsDelta.trim()} style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, padding: "9px 12px", borderRadius: 10, border: "1px solid hsl(var(--border))", background: "transparent", fontSize: 12, fontWeight: 600 }}>
              <Coins size={14} /> Ajuster les coins
            </button>
          </div>
          {actionMessage && (
            <p style={{ marginTop: 10, fontSize: 12, color: actionMessage.kind === "success" ? "hsl(150 55% 32%)" : "hsl(4 65% 45%)" }}>{actionMessage.text}</p>
          )}
        </section>

        <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
          {(["users", "withdrawals", "payments"] as const).map((t) => (
            <button key={t} type="button" onClick={() => setTab(t)}
              style={{ flex: 1, padding: "9px", borderRadius: 10, border: tab === t ? "1px solid hsl(var(--primary))" : "1px solid hsl(var(--border))", background: tab === t ? "hsl(var(--primary) / .1)" : "transparent", color: tab === t ? "hsl(var(--primary))" : "inherit", fontSize: 12, fontWeight: 700 }}>
              {t === "users" ? "Comptes" : t === "withdrawals" ? "Retraits" : "Paiements"}
            </button>
          ))}
        </div>

        {tab === "users" && (
          <section style={{ borderRadius: 16, border: "1px solid hsl(var(--border))", background: "hsl(var(--card))", overflow: "hidden" }}>
            <div style={{ padding: 12, borderBottom: "1px solid hsl(var(--border))" }}>
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Rechercher un email ou un nom..." style={{ width: "100%", padding: "8px 10px", borderRadius: 10, border: "1px solid hsl(var(--border))", fontSize: 13 }} />
              <p style={{ margin: "8px 0 0", fontSize: 11, opacity: 0.6 }}>👆 Touche un compte pour le sélectionner dans les actions ci-dessus</p>
            </div>
            <div style={{ maxHeight: "50vh", overflowY: "auto" }}>
              {filteredUsers.map((u) => (
                <div
                  key={u.id}
                  onClick={() => { setActionEmail(u.email ?? ""); setActionMessage(null); window.scrollTo({ top: 0, behavior: "smooth" }); }}
                  style={{ padding: "10px 14px", borderBottom: "1px solid hsl(var(--border))", fontSize: 12, cursor: "pointer", background: actionEmail && u.email === actionEmail ? "hsl(var(--primary) / .08)" : "transparent" }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                    <strong>{u.display_name || "—"}</strong>
                    <span style={{ opacity: 0.6 }}>{formatDate(u.created_at)}</span>
                  </div>
                  <div style={{ opacity: 0.75, marginTop: 2 }}>{u.email}</div>
                  <div style={{ display: "flex", gap: 6, marginTop: 6, flexWrap: "wrap" }}>
                    <span style={{ padding: "2px 8px", borderRadius: 20, background: "hsl(var(--muted))", fontWeight: 700 }}>{u.coins} coins</span>
                    {u.access_unlocked && <span style={{ padding: "2px 8px", borderRadius: 20, background: "hsl(150 55% 92%)", color: "hsl(150 55% 28%)", fontWeight: 700 }}>Accès débloqué</span>}
                    {u.comp_ticket && <span style={{ padding: "2px 8px", borderRadius: 20, background: "hsl(42 92% 88%)", color: "hsl(38 70% 34%)", fontWeight: 700 }}>Ticket gratuit en attente</span>}
                  </div>
                </div>
              ))}
              {users && filteredUsers.length === 0 && <div style={{ padding: 20, textAlign: "center", fontSize: 12, opacity: 0.6 }}>Aucun compte trouvé.</div>}
            </div>
          </section>
        )}

        {tab === "withdrawals" && (
          <section style={{ borderRadius: 16, border: "1px solid hsl(var(--border))", background: "hsl(var(--card))", overflow: "hidden" }}>
            <div style={{ maxHeight: "60vh", overflowY: "auto" }}>
              {(withdrawals ?? []).map((w) => (
                <div key={w.id} style={{ padding: "10px 14px", borderBottom: "1px solid hsl(var(--border))", fontSize: 12 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                    <strong>{w.profiles?.email ?? "—"}</strong>
                    <span style={{ opacity: 0.6 }}>{formatDate(w.created_at)}</span>
                  </div>
                  <div style={{ opacity: 0.75, marginTop: 2 }}>{w.amount_coins} coins · +{w.country}{w.operator} {w.phone_number}</div>
                  <span style={{ display: "inline-block", marginTop: 4, padding: "2px 8px", borderRadius: 20, fontWeight: 700, background: w.status === "completed" ? "hsl(150 55% 92%)" : w.status === "failed" ? "hsl(4 70% 92%)" : "hsl(42 92% 88%)", color: w.status === "completed" ? "hsl(150 55% 28%)" : w.status === "failed" ? "hsl(4 65% 40%)" : "hsl(38 70% 34%)" }}>{w.status}</span>
                  {w.failure_reason && <div style={{ opacity: 0.6, marginTop: 4 }}>{w.failure_reason}</div>}
                </div>
              ))}
              {withdrawals && withdrawals.length === 0 && <div style={{ padding: 20, textAlign: "center", fontSize: 12, opacity: 0.6 }}>Aucun retrait.</div>}
            </div>
          </section>
        )}

        {tab === "payments" && (
          <section style={{ borderRadius: 16, border: "1px solid hsl(var(--border))", background: "hsl(var(--card))", overflow: "hidden" }}>
            <div style={{ maxHeight: "60vh", overflowY: "auto" }}>
              {(payments ?? []).map((p) => (
                <div key={p.transaction_id} style={{ padding: "10px 14px", borderBottom: "1px solid hsl(var(--border))", fontSize: 12 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                    <strong>{p.profiles?.email ?? "—"}</strong>
                    <span style={{ opacity: 0.6 }}>{formatDate(p.updated_at)}</span>
                  </div>
                  <span style={{ display: "inline-block", marginTop: 4, padding: "2px 8px", borderRadius: 20, fontWeight: 700, background: p.status === "approved" ? "hsl(150 55% 92%)" : (p.status === "declined" || p.status === "canceled") ? "hsl(4 70% 92%)" : "hsl(42 92% 88%)", color: p.status === "approved" ? "hsl(150 55% 28%)" : (p.status === "declined" || p.status === "canceled") ? "hsl(4 65% 40%)" : "hsl(38 70% 34%)" }}>{p.status}</span>
                </div>
              ))}
              {payments && payments.length === 0 && <div style={{ padding: 20, textAlign: "center", fontSize: 12, opacity: 0.6 }}>Aucun paiement.</div>}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
