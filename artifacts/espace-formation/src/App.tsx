import { useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  BookOpen,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock3,
  Coins,
  Copy,
  Gauge,
  Gift,
  History,
  KeyRound,
  Loader2,
  LogOut,
  Menu,
  MessageCircle,
  ShieldCheck,
  Sparkles,
  Ticket,
  TrendingUp,
  UserRound,
  X,
  XCircle,
  Zap,
} from "lucide-react";

import { AuthView } from "@/components/auth-view";
import { AdminPanel } from "@/components/admin-panel";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/lib/supabase";
import { payMobile, checkPaymentStatus, redeemTicketCode, requestWithdrawal, claimCompTicket, checkExistingTicket } from "@/lib/access-api";

type ToastKind = "success" | "warning" | "info";
type AppUser = { displayName: string; email: string; photoURL?: string | null };
type NavItem = "accueil" | "formations" | "acces-prive" | "portefeuille";

interface PromoModule {
  id: string;
  title: string;
  gradient: string;
  icon: typeof TrendingUp;
  detail: string;
}

interface Operator {
  label: string;
  mode: string;
  color: string;
}

interface Country {
  id: string;
  code: string;
  isoCode: string;
  flag: string;
  dialCode: string;
  name: string;
  phonePlaceholder: string;
  operators: Operator[];
}

const PENDING_REFERRAL_KEY = "espace-formation:pending-referral";
const REFERRAL_REWARD_COINS = 1;
const REFERRAL_DRIP_HOURS = 3;
const WITHDRAWAL_THRESHOLD = 10;

type HistoryItem = {
  id: string;
  type: "retrait" | "paiement";
  date: string;
  amountCoins?: number;
  status: string;
};

function formatHistoryDate(iso: string) {
  try {
    return new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
  } catch {
    return iso;
  }
}

function historyStatusMeta(item: HistoryItem): { label: string; className: string } {
  if (item.type === "retrait") {
    if (item.status === "completed") return { label: "Envoyé", className: "ok" };
    if (item.status === "failed") return { label: "Échoué", className: "fail" };
    return { label: "En attente", className: "pending" };
  }
  if (item.status === "approved") return { label: "Réussi", className: "ok" };
  if (item.status === "declined" || item.status === "canceled") return { label: "Refusé", className: "fail" };
  return { label: "En attente", className: "pending" };
}

const COUNTRIES: Country[] = [
  {
    id: "BEN", code: "bj", isoCode: "BJ", flag: "🇧🇯", dialCode: "229", name: "Bénin", phonePlaceholder: "01XXXXXXXX",
    operators: [
      { label: "MTN", mode: "mtn_open", color: "#FFD700" },
      { label: "MOOV", mode: "moov", color: "#FF6B1A" },
      { label: "CELTIIS", mode: "sbin", color: "#4A90D9" },
    ],
  },
  {
    id: "TGO", code: "tg", isoCode: "TG", flag: "🇹🇬", dialCode: "228", name: "Togo", phonePlaceholder: "90123456",
    operators: [
      { label: "MOOV", mode: "moov_tg", color: "#FF6B1A" },
      { label: "TOGOCEL T-Money", mode: "togocel", color: "#0070C0" },
    ],
  },
  {
    id: "CIV", code: "ci", isoCode: "CI", flag: "🇨🇮", dialCode: "225", name: "Côte d'Ivoire", phonePlaceholder: "0501234567",
    operators: [
      { label: "MTN", mode: "mtn_ci", color: "#FFD700" },
    ],
  },
  {
    id: "NER", code: "ne", isoCode: "NE", flag: "🇳🇪", dialCode: "227", name: "Niger", phonePlaceholder: "96123456",
    operators: [
      { label: "Airtel", mode: "airtel_ne", color: "#E53935" },
    ],
  },
  {
    id: "SEN", code: "sn", isoCode: "SN", flag: "🇸🇳", dialCode: "221", name: "Sénégal", phonePlaceholder: "771234567",
    operators: [
      { label: "Free", mode: "free_sn", color: "#E53935" },
    ],
  },
];

const MODULES: PromoModule[] = [
  {
    id: "adsense",
    title: "Explosez vos revenus avec Google AdSense",
    gradient: "linear-gradient(135deg, #4285F4, #34A853)",
    icon: TrendingUp,
    detail:
      "Vous apprendrez à configurer votre site de A à Z pour obtenir l'approbation Google AdSense rapidement, même si vous partez de zéro. Vous recevrez également notre outil clé en main pour installer les publicités en deux clics, sans aucune connaissance technique. Connectez-vous ensuite au tableau de bord AdSense pour suivre vos gains en temps réel (solde, CPC, CTR).",
  },
  {
    id: "promo",
    title: "Monétisez votre audience avec le parrainage",
    gradient: "linear-gradient(135deg, #16A34A, #F59E0B)",
    icon: Gift,
    detail:
      "Maîtrisez l'art de l'affiliation et du parrainage. Nous vous montrerons comment créer votre propre code promo personnalisé et comment le diffuser pour attirer une communauté engagée. Vous apprendrez à lire et à surveiller l'interface partenaire pour visualiser instantanément votre solde de commissions, le nombre d'inscrits et l'évolution de vos revenus.",
  },
  {
    id: "facebook",
    title: "Automatisez vos scores en direct sur Facebook",
    gradient: "linear-gradient(135deg, #1877F2, #0B5FCC)",
    icon: Zap,
    detail:
      "L'automatisation est la clé. Dans ce module, apprenez à utiliser l'API Graph de Facebook pour connecter vos scripts et publier automatiquement les scores des matches, les buts et les résumés en temps réel sur votre page Facebook. C'est la méthode ultime pour capturer un trafic massif et diriger les fans de sport vers vos liens monétisés (AdSense et Code Promo), sans intervention manuelle.",
  },
];

interface ProofCard {
  id: string;
  gradient: string;
  icon: typeof TrendingUp;
  label: string;
  value: string;
  valueLabel: string;
  bars: number[];
  stats: { value: string; label: string }[];
}

const PROOF_CARDS: ProofCard[] = [
  {
    id: "adsense",
    gradient: "linear-gradient(135deg, #4285F4, #34A853)",
    icon: TrendingUp,
    label: "Google AdSense",
    value: "$67.40",
    valueLabel: "Solde estimé",
    bars: [40, 65, 50, 80, 60, 95],
    stats: [{ value: "$2.48", label: "Ce mois" }, { value: "5.09K", label: "Impressions" }],
  },
  {
    id: "promo",
    gradient: "linear-gradient(135deg, #16A34A, #F59E0B)",
    icon: Gift,
    label: "Programme partenaire",
    value: "38",
    valueLabel: "Filleuls actifs",
    bars: [30, 55, 45, 70, 85, 60],
    stats: [{ value: "124", label: "Coins gagnés" }, { value: "+9", label: "Cette semaine" }],
  },
  {
    id: "facebook",
    gradient: "linear-gradient(135deg, #1877F2, #0B5FCC)",
    icon: Zap,
    label: "Automatisation Facebook",
    value: "312",
    valueLabel: "Publications auto",
    bars: [50, 40, 70, 55, 90, 75],
    stats: [{ value: "18.2K", label: "Portée" }, { value: "1.4K", label: "Partages" }],
  },
];

function ProofMarquee() {
  const cards = [...PROOF_CARDS, ...PROOF_CARDS];
  return (
    <div className="proof-marquee">
      <div className="proof-track">
        {cards.map((card, i) => {
          const Icon = card.icon;
          return (
          <div key={`${card.id}-${i}`} className="proof-card" style={{ background: card.gradient }}>
            <div className="proof-card-head"><Icon size={14} /> <span className="proof-dot" /> {card.label}</div>
            <strong>{card.value}</strong>
            <p className="proof-label">{card.valueLabel}</p>
            <div className="proof-bars">{card.bars.map((h, j) => <span key={j} style={{ height: `${h}%` }} />)}</div>
            <div className="proof-stats">
              {card.stats.map((s, j) => <div key={j}><b>{s.value}</b><span>{s.label}</span></div>)}
            </div>
          </div>
          );
        })}
      </div>
    </div>
  );
}

function capturePendingReferralFromUrl() {
  const params = new URLSearchParams(window.location.search);
  const ref = params.get("ref");
  if (ref) {
    window.localStorage.setItem(PENDING_REFERRAL_KEY, ref.trim().toUpperCase());
    window.history.replaceState({}, "", window.location.pathname);
  }
}

async function syncWallet(
  uid: string,
  email: string | null,
  displayName: string | null,
  avatarUrl: string | null,
): Promise<{ coins: number; referralCode: string | null; unlocked: boolean } | null> {
  const { data, error } = await supabase.rpc("sync_wallet", {
    p_user_id: uid,
    p_email: email,
    p_display_name: displayName,
    p_avatar_url: avatarUrl,
  });
  if (error) return null;
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) return null;
  return {
    coins: row.coins ?? 0,
    referralCode: row.referral_code ?? null,
    unlocked: Boolean(row.access_unlocked),
  };
}

async function claimPendingReferral(uid: string): Promise<boolean> {
  const pendingCode = window.localStorage.getItem(PENDING_REFERRAL_KEY);
  if (!pendingCode) return false;
  const { data, error } = await supabase.rpc("claim_referral", { p_user_id: uid, p_code: pendingCode });
  window.localStorage.removeItem(PENDING_REFERRAL_KEY);
  if (error) return false;
  return Boolean(data);
}

async function markAccessUnlocked(uid: string) {
  await supabase.rpc("unlock_access", { p_user_id: uid });
}

function App() {
  const { user: authUser, loading: authLoading, logout } = useAuth();
  if (typeof window !== "undefined" && window.location.hash === "#admin") {
    return <AdminPanel />;
  }
  const user: AppUser | null = authUser
    ? {
        displayName: authUser.displayName?.trim() || "Apprenant·e",
        email: authUser.email ?? "",
        photoURL: authUser.photoURL ?? null,
      }
    : null;
  const [activeNav, setActiveNav] = useState<NavItem>("accueil");
  const [walletOpensAt, setWalletOpensAt] = useState<"wallet" | "history">("wallet");
  const [toast, setToast] = useState<{ message: string; kind: ToastKind } | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [coins, setCoins] = useState(0);
  const [referralCode, setReferralCode] = useState<string | null>(null);
  const [walletLoading, setWalletLoading] = useState(false);
  const [unlocked, setUnlocked] = useState(false);

  useEffect(() => {
    capturePendingReferralFromUrl();
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 3600);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const firstName = user?.displayName?.split(" ")[0] || "apprenant·e";
  const showToast = (message: string, kind: ToastKind = "success") => setToast({ message, kind });

  useEffect(() => {
    if (!authUser) return;
    setWalletLoading(true);
    (async () => {
      const wallet = await syncWallet(authUser.uid, authUser.email ?? null, authUser.displayName ?? null, authUser.photoURL ?? null);
      if (wallet) {
        setCoins(wallet.coins);
        setReferralCode(wallet.referralCode);
        setUnlocked(wallet.unlocked);
      } else {
        showToast("Impossible de charger ton portefeuille pour le moment.", "warning");
      }
      const claimed = await claimPendingReferral(authUser.uid);
      if (claimed) {
        showToast("Code de parrainage validé ! Ton ami recevra ses coins quand tu paieras ton ticket.", "success");
        const refreshed = await syncWallet(authUser.uid, null, null, null);
        if (refreshed) setCoins(refreshed.coins);
      }
      setWalletLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authUser?.uid]);

  const handleLogout = async () => {
    try {
      await logout();
      showToast("Tu es déconnecté·e.", "info");
    } catch {
      showToast("Déconnexion impossible pour le moment.", "warning");
    }
  };

  const handleUnlocked = async () => {
    setUnlocked(true);
    if (authUser) {
      await markAccessUnlocked(authUser.uid);
    }
  };

  const copyReferralLink = async () => {
    if (!referralCode) return;
    const link = `${window.location.origin}${window.location.pathname}?ref=${referralCode}`;
    try {
      await navigator.clipboard.writeText(link);
      showToast("Lien de parrainage copié !", "success");
    } catch {
      showToast(link, "info");
    }
  };

  const refreshCoins = async () => {
    if (!authUser) return;
    const wallet = await syncWallet(authUser.uid, null, null, null);
    if (wallet) setCoins(wallet.coins);
  };

  if (authLoading) {
    return <div className="auth-loading"><div className="brand-mark"><Sparkles size={18} /></div><span>Préparation de ton espace...</span></div>;
  }

  if (!user) {
    return (
      <main className="app-shell">
        <div className="phone-frame login-frame">
          <AuthView onNotify={showToast} />
          {toast && <div className={`toast toast-${toast.kind}`} role="status"><span>{toast.message}</span><button type="button" aria-label="Fermer" onClick={() => setToast(null)}><X size={15} /></button></div>}
        </div>
      </main>
    );
  }

  return (
    <main className="app-shell">
      <div className="phone-frame">
        <header className="topbar">
          <button type="button" className="icon-button" aria-label="Ouvrir le menu" aria-expanded={menuOpen} onClick={() => setMenuOpen((open) => !open)}><Menu size={20} /></button>
          <div className="brand-lockup"><span className="brand-mark"><Sparkles size={14} /></span><span>Espace <b>formation</b></span></div>
          <div className="topbar-right">
            <button type="button" className="coin-chip" title="Voir mon portefeuille" onClick={() => setActiveNav("portefeuille")} style={{ border: 0, cursor: "pointer" }}>
              <Coins size={13} /><b>{walletLoading ? "…" : coins}</b>
            </button>
          </div>
        </header>

        <div className="app-content">
          {activeNav === "accueil" && (
            <HomeView firstName={firstName} onGoToFormations={() => setActiveNav("formations")} />
          )}
          {activeNav === "formations" && (
            <ModulesView onBack={() => setActiveNav("accueil")} onContinue={() => setActiveNav("acces-prive")} />
          )}
          {activeNav === "acces-prive" && (
            <PrivateAccessView unlocked={unlocked} userId={authUser?.uid ?? null} onUnlocked={handleUnlocked} onToast={showToast} />
          )}
          {activeNav === "portefeuille" && (
            <WalletView coins={coins} referralCode={referralCode} userId={authUser?.uid ?? null} onCopyReferral={copyReferralLink} onToast={showToast} onCoinsUpdated={refreshCoins} initialPage={walletOpensAt} />
          )}
        </div>

        <nav className="bottom-nav" aria-label="Navigation principale">
          {([
            ["accueil", "Accueil", Sparkles],
            ["formations", "Formations", BookOpen],
            ["acces-prive", "Ticket", Ticket],
            ["portefeuille", "Portefeuille", Coins],
          ] as const).map(([id, label, Icon]) => (
            <button type="button" key={id} className={activeNav === id ? "active" : ""} onClick={() => { setWalletOpensAt("wallet"); setActiveNav(id); }}><Icon size={18} /><span>{label}</span></button>
          ))}
        </nav>

        {menuOpen && (
          <div className="menu-layer" role="dialog" aria-label="Menu du compte">
            <button type="button" className="menu-scrim" aria-label="Fermer" onClick={() => setMenuOpen(false)} />
            <aside className="menu-panel">
              <div className="menu-panel-header">
                <div><p className="eyebrow">TON ESPACE</p><h2>Menu principal</h2></div>
                <button type="button" className="menu-close" aria-label="Fermer" onClick={() => setMenuOpen(false)}><X size={17} /></button>
              </div>
              <div className="menu-profile">
                <span className="menu-profile-avatar">{user.photoURL ? <img src={user.photoURL} alt="" /> : <UserRound size={18} />}</span>
                <span><b>{user.displayName}</b><small>{user.email}</small></span>
              </div>
              <div className="menu-actions">
                <button type="button" onClick={() => { setMenuOpen(false); setActiveNav("formations"); }}><BookOpen size={17} /><span>Formations</span><ChevronRight size={15} /></button>
                <button type="button" onClick={() => { setMenuOpen(false); setActiveNav("acces-prive"); }}><Ticket size={17} /><span>Ticket d'entrée</span><ChevronRight size={15} /></button>
                <button type="button" onClick={() => { setMenuOpen(false); setActiveNav("portefeuille"); }}><Coins size={17} /><span>Portefeuille</span><ChevronRight size={15} /></button>
                <button type="button" onClick={() => { setMenuOpen(false); setWalletOpensAt("history"); setActiveNav("portefeuille"); }}><History size={17} /><span>Historique</span><ChevronRight size={15} /></button>
                <button type="button" onClick={() => { setMenuOpen(false); showToast("La communauté est prête à t'accueillir.", "info"); }}><MessageCircle size={17} /><span>Communauté</span><ChevronRight size={15} /></button>
                <button type="button" className="menu-logout" onClick={() => { setMenuOpen(false); handleLogout(); }}><LogOut size={17} /><span>Se déconnecter</span><ChevronRight size={15} /></button>
              </div>
            </aside>
          </div>
        )}
        {toast && <div className={`toast toast-${toast.kind}`} role="status"><span>{toast.message}</span><button type="button" aria-label="Fermer" onClick={() => setToast(null)}><X size={15} /></button></div>}
      </div>
    </main>
  );
}

function HomeView({ firstName, onGoToFormations }: { firstName: string; onGoToFormations: () => void }) {
  return <div className="view-stack">
    <section className="welcome-block animate-rise"><p className="eyebrow">TON ESPACE, TON RYTHME</p><h1>Bonjour,<br /><em>{firstName}.</em></h1><p>Heureux de te retrouver. Prêt·e à faire avancer ton projet ?</p></section>
    <ProofMarquee />
    <button type="button" className="progress-card animate-rise" onClick={onGoToFormations} style={{ width: "100%", textAlign: "left", border: 0, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginTop: "clamp(6px, 2.5vh, 22px)" }}>
      <div><p className="eyebrow">ÉTAPE 1</p><h2>Découvre les modules</h2><p style={{ margin: "7px 0 0", color: "hsl(42 67% 98% / .62)", fontSize: 10 }}>AdSense, parrainage, automatisation.</p></div>
      <ArrowRight size={20} color="hsl(var(--accent))" />
    </button>
  </div>;
}

function ModulesView({ onBack, onContinue }: { onBack: () => void; onContinue: () => void }) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const toggle = (id: string) => {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return <div className="view-stack formations-view">
    <div className="page-heading">
      <button type="button" className="back-button" onClick={onBack}><ArrowRight size={17} className="rotate-180" /></button>
      <div><p className="eyebrow">ÉTAPE 1 · MODULES</p><h1>Découvre les modules</h1></div>
    </div>

    <div style={{ display: "flex", flexDirection: "column", gap: 10, overflowY: "auto", flex: 1, minHeight: 0 }}>
      {MODULES.map((mod) => {
        const isOpen = expanded.has(mod.id);
        const Icon = mod.icon;
        return (
          <div key={mod.id} style={{ borderRadius: 16, overflow: "hidden", border: "1px solid hsl(var(--border))", flexShrink: 0 }}>
            <div
              style={{
                background: mod.gradient,
                padding: "20px 16px",
                position: "relative",
                minHeight: 96,
                display: "flex",
                flexDirection: "column",
                justifyContent: "space-between",
              }}
            >
              <Icon size={28} color="rgba(255,255,255,0.85)" />
              <h3 style={{ color: "#fff", fontSize: 15, fontWeight: 700, margin: "10px 0 0", lineHeight: 1.25 }}>{mod.title}</h3>
            </div>
            <button
              type="button"
              onClick={() => toggle(mod.id)}
              style={{
                width: "100%",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 6,
                padding: "10px 12px",
                border: 0,
                background: "hsl(var(--muted, 0 0% 96%))",
                fontSize: 12,
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              Voir plus de détails
              <ChevronDown size={14} style={{ transform: isOpen ? "rotate(180deg)" : "none", transition: "transform .15s" }} />
            </button>
            {isOpen && (
              <div style={{ padding: "12px 14px", fontSize: 12.5, lineHeight: 1.5, opacity: 0.85 }}>
                {mod.detail}
              </div>
            )}
          </div>
        );
      })}
    </div>

    <button type="button" className="primary-button" onClick={onContinue} style={{ marginTop: 4 }}>
      Continuer vers le ticket <ArrowRight size={16} />
    </button>
  </div>;
}

function WalletView({
  coins,
  referralCode,
  userId,
  onCopyReferral,
  onToast,
  onCoinsUpdated,
  initialPage,
}: {
  coins: number;
  referralCode: string | null;
  userId: string | null;
  onCopyReferral: () => void;
  onToast: (message: string, kind?: ToastKind) => void;
  onCoinsUpdated: () => void;
  initialPage?: "wallet" | "history";
}) {
  const [page, setPage] = useState<"wallet" | "withdraw" | "history">(initialPage ?? "wallet");
  const [countryId, setCountryId] = useState(COUNTRIES[0].id);
  const [operatorMode, setOperatorMode] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [amount, setAmount] = useState(String(WITHDRAWAL_THRESHOLD));
  const [busy, setBusy] = useState(false);
  const [drip, setDrip] = useState<{ startedAt: number; endsAt: number; totalCoins: number } | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const hadDripRef = useRef(false);
  const [historyItems, setHistoryItems] = useState<HistoryItem[] | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);

  const country = COUNTRIES.find((c) => c.id === countryId) ?? COUNTRIES[0];
  const canWithdraw = coins >= WITHDRAWAL_THRESHOLD;

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    const fetchDrip = async () => {
      const { data } = await supabase.rpc("get_active_referral_drip", { p_user_id: userId });
      if (cancelled) return;
      const row = Array.isArray(data) ? data[0] : null;
      if (row) {
        hadDripRef.current = true;
        setDrip({ startedAt: new Date(row.started_at).getTime(), endsAt: new Date(row.ends_at).getTime(), totalCoins: row.total_coins });
      } else {
        if (hadDripRef.current) onCoinsUpdated(); // un versement vient de se terminer : rafraichir le vrai solde
        hadDripRef.current = false;
        setDrip(null);
      }
    };
    fetchDrip();
    const poll = window.setInterval(fetchDrip, 30_000);
    return () => { cancelled = true; window.clearInterval(poll); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  useEffect(() => {
    if (!drip) return;
    const tick = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(tick);
  }, [drip]);

  const dripProgress = drip ? Math.min(1, Math.max(0, (now - drip.startedAt) / (drip.endsAt - drip.startedAt))) : 0;
  const dripPending = drip ? (dripProgress * drip.totalCoins).toFixed(2) : null;

  const handleOpenWithdraw = () => {
    if (!canWithdraw) {
      onToast(`Retrait possible à partir de ${WITHDRAWAL_THRESHOLD} coins.`, "warning");
      return;
    }
    setPage("withdraw");
  };

  const loadHistory = async () => {
    if (!userId) return;
    setHistoryLoading(true);
    try {
      const { data } = await supabase.rpc("get_user_history", { p_user_id: userId });
      const rows = (data ?? []) as Array<{ kind: "retrait" | "paiement"; ref: string; occurred_at: string; amount_coins: number | null; status: string }>;
      const items: HistoryItem[] = rows.map((row) => ({
        id: `${row.kind[0]}-${row.ref}`,
        type: row.kind,
        date: row.occurred_at,
        amountCoins: row.amount_coins ?? undefined,
        status: row.status,
      }));
      setHistoryItems(items);
    } catch {
      setHistoryItems([]);
    } finally {
      setHistoryLoading(false);
    }
  };

  const handleOpenHistory = () => {
    setPage("history");
    loadHistory();
  };

  useEffect(() => {
    if (initialPage === "history") loadHistory();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleWithdraw = async () => {
    if (!userId) return;
    const amountNum = parseInt(amount, 10);
    if (!operatorMode) { onToast("Choisis ton opérateur mobile money.", "warning"); return; }
    if (phoneNumber.trim().length < 6) { onToast("Entre un numéro de téléphone valide.", "warning"); return; }
    if (!amountNum || amountNum < WITHDRAWAL_THRESHOLD) { onToast(`Le montant minimum est de ${WITHDRAWAL_THRESHOLD} coins.`, "warning"); return; }
    if (amountNum > coins) { onToast("Solde insuffisant.", "warning"); return; }
    setBusy(true);
    try {
      const result = await requestWithdrawal({ userId, amountCoins: amountNum, phoneNumber: phoneNumber.trim(), country: country.isoCode, operator: operatorMode });
      onToast(`Retrait envoyé ! Statut : ${result.status}`, "success");
      setPage("wallet");
      setOperatorMode("");
      setPhoneNumber("");
      onCoinsUpdated();
    } catch (err) {
      onToast(err instanceof Error ? err.message : "Erreur lors du retrait.", "warning");
    } finally {
      setBusy(false);
    }
  };

  if (page === "history") {
    return <div className="view-stack">
      <div className="page-heading">
        <button type="button" className="back-button" onClick={() => setPage("wallet")}><ArrowRight size={17} className="rotate-180" /></button>
        <div><p className="eyebrow">HISTORIQUE</p><h1>Retraits & paiements</h1></div>
      </div>

      <section className="steps-card">
        {historyLoading && (
          <div className="history-empty"><Loader2 size={18} className="auth-spin" /></div>
        )}
        {!historyLoading && historyItems && historyItems.length === 0 && (
          <div className="history-empty">Aucune opération pour le moment.</div>
        )}
        {!historyLoading && historyItems && historyItems.length > 0 && (
          <div className="history-list">
            {historyItems.map((item) => {
              const meta = historyStatusMeta(item);
              return (
                <div key={item.id} className="history-row">
                  <span className="history-icon">{item.type === "retrait" ? <ArrowRight size={16} className="rotate-45" /> : <Ticket size={16} />}</span>
                  <div className="history-info">
                    <strong>{item.type === "retrait" ? `Retrait${item.amountCoins ? ` — ${item.amountCoins} coins` : ""}` : "Ticket d'entrée"}</strong>
                    <span>{formatHistoryDate(item.date)}</span>
                  </div>
                  <span className={`history-badge ${meta.className}`}>
                    {meta.className === "ok" ? <CheckCircle2 size={11} /> : meta.className === "fail" ? <XCircle size={11} /> : <Clock3 size={11} />}
                    {meta.label}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>;
  }

  if (page === "withdraw") {
    return <div className="view-stack">
      <div className="page-heading">
        <button type="button" className="back-button" onClick={() => setPage("wallet")}><ArrowRight size={17} className="rotate-180" /></button>
        <div><p className="eyebrow">RETRAIT MOBILE MONEY</p><h1>Où envoyer tes coins ?</h1></div>
      </div>

      <section className="steps-card country-payment-selector notranslate" translate="no">
        <p className="eyebrow">PAYS</p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 6, marginTop: 6 }}>
          {COUNTRIES.map((c) => (
            <button key={c.id} type="button" onClick={() => { setCountryId(c.id); setOperatorMode(""); }}
              style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2, padding: "8px 4px", borderRadius: 10, border: countryId === c.id ? "2px solid hsl(var(--primary))" : "1px solid hsl(var(--border))", background: "transparent", cursor: "pointer" }}>
              <span style={{ fontSize: 18 }}>{c.flag}</span>
              <span style={{ fontSize: 9, fontWeight: 600 }}>+{c.dialCode}</span>
            </button>
          ))}
        </div>

        <p className="eyebrow" style={{ marginTop: 12 }}>OPÉRATEUR</p>
        <div style={{ display: "grid", gridTemplateColumns: `repeat(${Math.min(country.operators.length, 3)}, 1fr)`, gap: 6, marginTop: 6 }}>
          {country.operators.map((op) => (
            <button key={op.mode} type="button" onClick={() => setOperatorMode(op.mode)}
              style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 3, padding: "10px 4px", borderRadius: 10, fontWeight: 700, fontSize: 11,
                border: operatorMode === op.mode ? `2px solid ${op.color}` : "1px solid hsl(var(--border))",
                background: operatorMode === op.mode ? op.color : "transparent",
                color: operatorMode === op.mode ? "#fff" : "inherit", cursor: "pointer" }}>
              {op.label}
            </button>
          ))}
        </div>

        <p className="eyebrow" style={{ marginTop: 12 }}>NUMÉRO DE TÉLÉPHONE</p>
        <div style={{ display: "flex", marginTop: 6, border: "1px solid hsl(var(--border))", borderRadius: 10, overflow: "hidden" }}>
          <span key={country.id} className="notranslate" translate="no" style={{ display: "flex", alignItems: "center", padding: "0 10px", background: "hsl(var(--muted, 0 0% 96%))", fontSize: 13, fontWeight: 600 }}>+{country.dialCode}</span>
          <input type="tel" value={phoneNumber} onChange={(e) => setPhoneNumber(e.target.value.replace(/\D/g, ""))} placeholder={country.phonePlaceholder} style={{ flex: 1, border: 0, padding: "10px 12px", fontSize: 15 }} />
        </div>

        <p className="eyebrow" style={{ marginTop: 12 }}>MONTANT (COINS)</p>
        <input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} min={WITHDRAWAL_THRESHOLD} max={coins}
          style={{ width: "100%", marginTop: 6, padding: "10px 12px", borderRadius: 10, border: "1px solid hsl(var(--border))", fontSize: 15 }} />

        <button type="button" className="primary-button" onClick={handleWithdraw} disabled={busy} style={{ marginTop: 14 }}>
          {busy ? <><Loader2 size={16} className="auth-spin" /> Envoi...</> : <>Confirmer le retrait <ArrowRight size={16} /></>}
        </button>
      </section>
    </div>;
  }

  return <div className="view-stack">
    <div className="page-heading">
      <div><p className="eyebrow">TON PORTEFEUILLE</p><h1>Pièces & parrainage</h1></div>
      <button type="button" className="reward-icon" onClick={handleOpenHistory} aria-label="Historique des retraits et paiements"><History size={18} /></button>
    </div>
    <section className="reward-card">
      <div className="coin-ring-badge"><Coins size={22} className={drip ? "coin-dripping" : undefined} /></div>
      <p>Ton solde de pièces</p>
      <strong>{coins}</strong>
      <span>Gagne des coins en parrainant tes amis. Retrait possible dès {WITHDRAWAL_THRESHOLD} coins.</span>
      {drip && (
        <div className="drip-status">
          <span className="drip-gauge"><Gauge size={14} /></span>
          +{dripPending} coin en cours de versement...
        </div>
      )}
      <button type="button" onClick={handleOpenWithdraw}>Demander un retrait <ArrowRight size={16} /></button>
    </section>
    <section className="reward-card">
      <Gift size={26} />
      <p>Parraine tes amis</p>
      <strong>+{REFERRAL_REWARD_COINS} coin</strong>
      <span>Par filleul·e qui paie son ticket d'entrée avec ton lien (crédité progressivement sur {REFERRAL_DRIP_HOURS}h).</span>
      {referralCode ? (
        <button type="button" onClick={onCopyReferral}><Copy size={15} /> Copier mon lien ({referralCode})</button>
      ) : (
        <span style={{ opacity: 0.6, fontSize: 10 }}>Chargement de ton code...</span>
      )}
    </section>
  </div>;
}

function PrivateAccessView({ unlocked, userId, onUnlocked, onToast }: { unlocked: boolean; userId: string | null; onUnlocked: () => void; onToast: (message: string, kind?: ToastKind) => void }) {
  const [step, setStep] = useState<"form" | "redeem" | "done">(unlocked ? "done" : "form");
  const [countryId, setCountryId] = useState(COUNTRIES[0].id);
  const [operatorMode, setOperatorMode] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [transactionId, setTransactionId] = useState<number | null>(null);
  const [pendingSince, setPendingSince] = useState<number | null>(null);
  const [pendingDialCode, setPendingDialCode] = useState("");
  const [pendingPhone, setPendingPhone] = useState("");
  const [ticketCode, setTicketCode] = useState<string | null>(null);
  const [enteredCode, setEnteredCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [paymentError, setPaymentError] = useState<string | null>(null);
  const [checkingTicket, setCheckingTicket] = useState(!unlocked);

  const country = COUNTRIES.find((c) => c.id === countryId) ?? COUNTRIES[0];

  const PENDING_TIMEOUT_MS = 45_000;

  useEffect(() => {
    if (!transactionId || !pendingSince) return;
    const interval = window.setInterval(async () => {
      if (Date.now() - pendingSince > PENDING_TIMEOUT_MS) {
        setTransactionId(null);
        setPendingSince(null);
        setPaymentError("Aucune confirmation reçue de ton opérateur. Vérifie ton solde, que le numéro correspond bien à l'opérateur choisi, puis réessaie.");
        return;
      }
      try {
        const result = await checkPaymentStatus(transactionId);
        if (result.status === "approved" && result.ticketCode) {
          setTicketCode(result.ticketCode);
          setStep("redeem");
          setTransactionId(null);
          setPendingSince(null);
          onToast("Paiement confirmé ! Voici ton code ticket.", "success");
        } else if (result.status === "declined" || result.status === "canceled") {
          setTransactionId(null);
          setPendingSince(null);
          setPaymentError("Paiement refusé ou annulé par l'opérateur. Vérifie ton solde et ton numéro/opérateur, puis réessaie.");
        }
      } catch { /* on reessaiera au prochain tick */ }
    }, 3000);
    return () => window.clearInterval(interval);
  }, [transactionId, pendingSince, onToast]);

  const handleCountryChange = (id: string) => { setCountryId(id); setOperatorMode(""); setPhoneNumber(""); setPaymentError(null); };

  const handlePay = async () => {
    if (!operatorMode) { onToast("Choisis ton opérateur mobile money.", "warning"); return; }
    if (phoneNumber.trim().length < 6) { onToast("Entre un numéro de téléphone valide.", "warning"); return; }
    if (!userId) { onToast("Connecte-toi avant de payer.", "warning"); return; }
    setBusy(true);
    setPaymentError(null);
    try {
      const result = await payMobile(phoneNumber.trim(), country.isoCode, operatorMode, userId);
      setPendingDialCode(country.dialCode);
      setPendingPhone(phoneNumber.trim());
      setTransactionId(result.transactionId);
      setPendingSince(Date.now());
      onToast(result.message ?? "Demande envoyée sur ton téléphone.", "success");
    } catch (err) {
      setPaymentError(err instanceof Error ? err.message : "Erreur de paiement. Vérifie ton numéro ou change d'opérateur.");
    } finally {
      setBusy(false);
    }
  };

  const handleCopyCode = async () => {
    if (!ticketCode) return;
    try { await navigator.clipboard.writeText(ticketCode); onToast("Code copié !", "success"); }
    catch { onToast(`Ton code : ${ticketCode}`, "info"); }
  };

  const handleRedeem = async () => {
    if (enteredCode.trim().length < 4) { onToast("Entre le code complet reçu après paiement.", "warning"); return; }
    setBusy(true);
    try {
      const { inviteUrl } = await redeemTicketCode(enteredCode);
      setStep("done");
      onUnlocked();
      onToast("Code validé ! Accès débloqué, ouverture de WhatsApp...", "success");
      window.location.href = inviteUrl;
    } catch (err) {
      onToast(err instanceof Error ? err.message : "Code incorrect.", "warning");
    } finally {
      setBusy(false);
    }
  };

  // Restaure un ticket deja emis (cookie encore valide) si la page a ete
  // rechargee avant que le code ait ete tape, sinon verifie silencieusement
  // si ce compte a un ticket gratuit en attente (accorde manuellement cote
  // admin) : si oui, on saute directement a l'etape de validation du code,
  // sans passer par le paiement.
  useEffect(() => {
    if (unlocked || !userId) { setCheckingTicket(false); return; }
    let cancelled = false;
    setCheckingTicket(true);
    checkExistingTicket()
      .then(({ hasTicket, ticketCode: existingCode }) => {
        if (cancelled) return;
        if (hasTicket && existingCode) {
          setTicketCode(existingCode);
          setStep("redeem");
          return;
        }
        return claimCompTicket(userId).then(({ ticketCode: code }) => {
          if (cancelled) return;
          setTicketCode(code);
          setStep("redeem");
        });
      })
      .catch(() => { /* pas de ticket en attente : flux normal */ })
      .finally(() => { if (!cancelled) setCheckingTicket(false); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  if (step === "done") {
    return <div className="view-stack">
      <div className="page-heading"><div><p className="eyebrow">ÉTAPE 2 · TICKET D'ENTRÉE</p><h1>Accès au groupe privé</h1></div><span className="reward-icon"><Ticket size={18} /></span></div>
      <section className="reward-card"><ShieldCheck size={26} /><p>Accès débloqué</p><strong>✓</strong><span>Tu as accès à toutes les formations et au groupe WhatsApp privé.</span></section>
    </div>;
  }

  if (checkingTicket) {
    return <div className="view-stack">
      <div className="page-heading"><div><p className="eyebrow">ÉTAPE 2 · TICKET D'ENTRÉE</p><h1>Accès au groupe privé</h1></div><span className="reward-icon"><Ticket size={18} /></span></div>
      <section className="steps-card" style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10, padding: "40px 20px" }}>
        <Loader2 size={22} className="auth-spin" />
        <span style={{ fontSize: 12, color: "hsl(var(--muted-foreground))" }}>Vérification de ton accès...</span>
      </section>
    </div>;
  }

  return <div className="view-stack">
    <div className="page-heading"><div><p className="eyebrow">ÉTAPE 2 · TICKET D'ENTRÉE</p><h1>Accès au groupe privé</h1></div><span className="reward-icon"><Ticket size={18} /></span></div>

    {step === "form" && (
      <section className="steps-card country-payment-selector notranslate" translate="no">
        <p className="eyebrow">1. CHOISIS TON PAYS</p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 6, marginTop: 8 }}>
          {COUNTRIES.map((c) => (
            <button key={c.id} type="button" onClick={() => handleCountryChange(c.id)}
              style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2, padding: "8px 4px", borderRadius: 10, border: countryId === c.id ? "2px solid hsl(var(--primary))" : "1px solid hsl(var(--border))", background: "transparent", cursor: "pointer" }}>
              <span style={{ fontSize: 18 }}>{c.flag}</span>
              <span style={{ fontSize: 9, fontWeight: 600 }}>+{c.dialCode}</span>
            </button>
          ))}
        </div>

        <p className="eyebrow" style={{ marginTop: 16 }}>2. CHOISIS TON OPÉRATEUR</p>
        <div style={{ display: "grid", gridTemplateColumns: `repeat(${Math.min(country.operators.length, 3)}, 1fr)`, gap: 6, marginTop: 8 }}>
          {country.operators.map((op) => (
            <button key={op.mode} type="button" onClick={() => { setOperatorMode(op.mode); setPaymentError(null); }}
              style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 3, padding: "10px 4px", borderRadius: 10, fontWeight: 700, fontSize: 11,
                border: operatorMode === op.mode ? `2px solid ${op.color}` : "1px solid hsl(var(--border))",
                background: operatorMode === op.mode ? op.color : "transparent",
                color: operatorMode === op.mode ? "#fff" : "inherit", cursor: "pointer" }}>
              {op.label}
            </button>
          ))}
        </div>

        <p className="eyebrow" style={{ marginTop: 16 }}>3. NUMÉRO DE TÉLÉPHONE</p>
        <div style={{ display: "flex", marginTop: 8, border: "1px solid hsl(var(--border))", borderRadius: 10, overflow: "hidden" }}>
          <span key={country.id} className="notranslate" translate="no" style={{ display: "flex", alignItems: "center", padding: "0 10px", background: "hsl(var(--muted, 0 0% 96%))", fontSize: 13, fontWeight: 600 }}>+{country.dialCode}</span>
          <input type="tel" value={phoneNumber} onChange={(e) => { setPhoneNumber(e.target.value.replace(/\D/g, "")); setPaymentError(null); }} placeholder={country.phonePlaceholder} style={{ flex: 1, border: 0, padding: "10px 12px", fontSize: 15 }} />
        </div>

        {paymentError && (
          <div role="alert" style={{ display: "flex", alignItems: "flex-start", gap: 8, marginTop: 14, padding: "12px 14px", borderRadius: 12, border: "1px solid hsl(4 70% 55% / .4)", background: "hsl(4 70% 55% / .1)", color: "hsl(4 65% 38%)" }}>
            <X size={15} style={{ flex: "0 0 auto", marginTop: 1, cursor: "pointer" }} onClick={() => setPaymentError(null)} />
            <div style={{ flex: 1, fontSize: 12, lineHeight: 1.5 }}>
              <strong style={{ display: "block", marginBottom: 2, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.04em" }}>Échec du paiement</strong>
              {paymentError}
            </div>
          </div>
        )}

        <button type="button" className="primary-button" onClick={handlePay} disabled={busy} style={{ marginTop: 16, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
          {busy ? <><Loader2 size={16} className="auth-spin" /> Envoi en cours...</> : <>Payer le ticket <ArrowRight size={16} /></>}
        </button>

        {transactionId && (
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 12, padding: "9px 12px", borderRadius: 10, background: "hsl(var(--muted, 0 0% 96%))", fontSize: 11 }}>
            <Loader2 size={13} className="auth-spin" style={{ flex: "0 0 auto" }} />
            <span>En attente de confirmation sur +{pendingDialCode} {pendingPhone}. Tu peux corriger ton numéro/opérateur et relancer à tout moment si besoin.</span>
          </div>
        )}
      </section>
    )}

    {step === "redeem" && (
      <section className="steps-card">
        <p className="eyebrow">VALIDATION</p>
        <h2>Entre ton code ticket</h2>
        {ticketCode && (
          <div className="lesson-summary" style={{ alignItems: "center", cursor: "pointer" }} onClick={handleCopyCode}>
            <span style={{ flex: 1 }}><KeyRound size={14} /> <b style={{ letterSpacing: "0.1em" }}>{ticketCode}</b></span>
            <span style={{ display: "flex", alignItems: "center", gap: 4, flex: "0 0 auto" }}><Copy size={13} /> Copier</span>
          </div>
        )}
        <input type="text" value={enteredCode} onChange={(event) => setEnteredCode(event.target.value.toUpperCase())} placeholder="Ex: A3F7K9" maxLength={6}
          style={{ width: "100%", marginTop: 10, padding: "10px 12px", borderRadius: 10, border: "1px solid hsl(var(--border))", fontFamily: "var(--font-mono)", fontSize: 16, letterSpacing: "0.15em", textAlign: "center" }} />
        <button type="button" className="primary-button" onClick={handleRedeem} disabled={busy} style={{ marginTop: 12, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
          {busy ? <><Loader2 size={16} className="auth-spin" /> Vérification...</> : <>Entrer le code et débloquer l'accès <ArrowRight size={16} /></>}
        </button>
      </section>
    )}
  </div>;
}

export default App;
