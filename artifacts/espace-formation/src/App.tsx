import { useEffect, useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  BookOpen,
  Check,
  ChevronRight,
  Clock3,
  Coins,
  Copy,
  Gift,
  KeyRound,
  LogOut,
  Menu,
  MessageCircle,
  ShieldCheck,
  Sparkles,
  Ticket,
  Trophy,
  UserRound,
  X,
} from "lucide-react";

import { AuthView } from "@/components/auth-view";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/lib/supabase";
import { payMobile, checkPaymentStatus, redeemTicketCode } from "@/lib/access-api";
import { getDeviceId } from "@/lib/device";

type ToastKind = "success" | "warning" | "info";
type AppUser = { displayName: string; email: string; photoURL?: string | null };
type NavItem = "accueil" | "formations" | "acces-prive" | "portefeuille";

interface Formation {
  id: string;
  title: string;
  description: string;
  lessons: number;
  duration: string;
  tone: "coral" | "teal" | "violet";
}

interface Operator {
  label: string;
  mode: string;
  color: string;
}

interface Country {
  id: string;
  code: string;
  flag: string;
  dialCode: string;
  name: string;
  phonePlaceholder: string;
  operators: Operator[];
}

const PENDING_REFERRAL_KEY = "espace-formation:pending-referral";
const REFERRAL_REWARD_COINS = 100;

// 6 pays no-redirect confirmes par FedaPay (paiement Mobile Money direct, sans page externe).
const COUNTRIES: Country[] = [
  {
    id: "BEN", code: "bj", flag: "🇧🇯", dialCode: "229", name: "Bénin", phonePlaceholder: "01XXXXXXXX",
    operators: [
      { label: "MTN", mode: "mtn_open", color: "#FFD700" },
      { label: "MOOV", mode: "moov", color: "#FF6B1A" },
      { label: "CELTIIS", mode: "sbin", color: "#4A90D9" },
    ],
  },
  {
    id: "TGO", code: "tg", flag: "🇹🇬", dialCode: "228", name: "Togo", phonePlaceholder: "90123456",
    operators: [
      { label: "MOOV", mode: "moov_tg", color: "#FF6B1A" },
      { label: "Togocom", mode: "togocel", color: "#0070C0" },
    ],
  },
  {
    id: "CIV", code: "ci", flag: "🇨🇮", dialCode: "225", name: "Côte d'Ivoire", phonePlaceholder: "0712345678",
    operators: [{ label: "MTN", mode: "mtn_ci", color: "#FFD700" }],
  },
  {
    id: "NER", code: "ne", flag: "🇳🇪", dialCode: "227", name: "Niger", phonePlaceholder: "96123456",
    operators: [{ label: "Airtel", mode: "airtel_ne", color: "#E53935" }],
  },
  {
    id: "SEN", code: "sn", flag: "🇸🇳", dialCode: "221", name: "Sénégal", phonePlaceholder: "771234567",
    operators: [{ label: "Free", mode: "free_sn", color: "#E53935" }],
  },
  {
    id: "GIN", code: "gn", flag: "🇬🇳", dialCode: "224", name: "Guinée", phonePlaceholder: "621234567",
    operators: [{ label: "MTN", mode: "mtn_open_gn", color: "#FFD700" }],
  },
];

const formations: Formation[] = [
  {
    id: "facebook-scores",
    title: "Booster sa visibilité avec les scores en direct",
    description: "Apprends à capter l’attention, générer des vues et créer une audience fidèle avec des contenus qui vivent en temps réel.",
    lessons: 8,
    duration: "1 h 40",
    tone: "coral",
  },
  {
    id: "onewin-promo",
    title: "Gagner de l’argent avec un code promo",
    description: "Une méthode pratique pour créer, configurer et monétiser ton propre code promo.",
    lessons: 6,
    duration: "1 h 15",
    tone: "teal",
  },
];

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
  if (error) {
    console.warn("sync_wallet:", error.message);
    return null;
  }
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
  if (error) {
    console.warn("claim_referral:", error.message);
    return false;
  }
  return Boolean(data);
}

async function markAccessUnlocked(uid: string) {
  const { error } = await supabase.rpc("unlock_access", { p_user_id: uid });
  if (error) console.warn("unlock_access:", error.message);
}

async function bindOrCheckDevice(uid: string, deviceId: string): Promise<string> {
  const { data, error } = await supabase.rpc("bind_or_check_device", {
    p_user_id: uid,
    p_device_id: deviceId,
  });
  if (error) {
    console.warn("bind_or_check_device:", error.message);
    return "error";
  }
  return data as string;
}

async function requestDeviceReset(uid: string) {
  const { error } = await supabase.rpc("request_device_reset", { p_user_id: uid });
  if (error) console.warn("request_device_reset:", error.message);
  return !error;
}

function App() {
  const { user: authUser, loading: authLoading, logout } = useAuth();
  const user: AppUser | null = authUser
    ? {
        displayName: authUser.displayName?.trim() || "Apprenant·e",
        email: authUser.email ?? "",
        photoURL: authUser.photoURL ?? null,
      }
    : null;
  const [activeNav, setActiveNav] = useState<NavItem>("accueil");
  const [toast, setToast] = useState<{ message: string; kind: ToastKind } | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [coins, setCoins] = useState(0);
  const [referralCode, setReferralCode] = useState<string | null>(null);
  const [walletLoading, setWalletLoading] = useState(false);
  const [unlocked, setUnlocked] = useState(false);
  const [selectedFormations, setSelectedFormations] = useState<string[]>([]);
  const [deviceBlocked, setDeviceBlocked] = useState(false);

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
      const wallet = await syncWallet(
        authUser.uid,
        authUser.email ?? null,
        authUser.displayName ?? null,
        authUser.photoURL ?? null,
      );

      if (wallet) {
        setCoins(wallet.coins);
        setReferralCode(wallet.referralCode);
        setUnlocked(wallet.unlocked);

        if (wallet.unlocked) {
          const status = await bindOrCheckDevice(authUser.uid, getDeviceId());
          if (status === "blocked") setDeviceBlocked(true);
        }
      } else {
        showToast("Impossible de charger ton portefeuille pour le moment.", "warning");
      }

      const claimed = await claimPendingReferral(authUser.uid);
      if (claimed) {
        showToast("Code de parrainage validé, ton ami a reçu ses coins !", "success");
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

  const toggleFormation = (id: string) => {
    setSelectedFormations((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id],
    );
  };

  const validateSelection = () => {
    if (selectedFormations.length === 0) {
      showToast("Sélectionne au moins une formation avant de continuer.", "warning");
      return;
    }
    setActiveNav("acces-prive");
  };

  const handleUnlocked = async () => {
    setUnlocked(true);
    if (authUser) {
      await markAccessUnlocked(authUser.uid);
      const status = await bindOrCheckDevice(authUser.uid, getDeviceId());
      if (status === "blocked") setDeviceBlocked(true);
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

  if (authLoading) {
    return <div className="auth-loading"><div className="brand-mark"><Sparkles size={18} /></div><span>Préparation de ton espace...</span></div>;
  }

  if (!user) {
    return (
      <main className="app-shell">
        <div className="phone-frame login-frame">
          <AuthView onNotify={showToast} />
          {toast && <div className={`toast toast-${toast.kind}`} role="status" data-testid="status-toast"><span>{toast.message}</span><button type="button" aria-label="Fermer le message" onClick={() => setToast(null)}><X size={15} /></button></div>}
        </div>
      </main>
    );
  }

  if (deviceBlocked) {
    return (
      <main className="app-shell">
        <div className="phone-frame login-frame">
          <DeviceBlockedView
            onRequestReset={async () => {
              if (!authUser) return;
              const ok = await requestDeviceReset(authUser.uid);
              showToast(
                ok
                  ? "Demande envoyée. Contacte le support pour finaliser la réinitialisation."
                  : "Impossible d'envoyer la demande pour le moment.",
                ok ? "success" : "warning",
              );
            }}
            onLogout={handleLogout}
          />
          {toast && <div className={`toast toast-${toast.kind}`} role="status" data-testid="status-toast"><span>{toast.message}</span><button type="button" aria-label="Fermer le message" onClick={() => setToast(null)}><X size={15} /></button></div>}
        </div>
      </main>
    );
  }


  return (
    <main className="app-shell">
      <div className="phone-frame">
        <header className="topbar">
          <button type="button" className="icon-button" data-testid="button-open-menu" aria-label="Ouvrir le menu" aria-expanded={menuOpen} onClick={() => setMenuOpen((open) => !open)}><Menu size={20} /></button>
          <div className="brand-lockup"><span className="brand-mark"><Sparkles size={14} /></span><span>Espace <b>formation</b></span></div>
          <div className="topbar-right">
          <button
            type="button"
            className="coin-chip"
            data-testid="text-coin-balance"
            title="Voir mon portefeuille"
            onClick={() => setActiveNav("portefeuille")}
            style={{ border: 0, cursor: "pointer" }}
          >
            <Coins size={13} /><b>{walletLoading ? "…" : coins}</b>
          </button>
          </div>
        </header>

        <div className="app-content">
          {activeNav === "accueil" && (
            <HomeView firstName={firstName} unlocked={unlocked} onGoToFormations={() => setActiveNav("formations")} onGoToAccesPrive={() => setActiveNav("acces-prive")} />
          )}
          {activeNav === "formations" && (
            <FormationsView
              formations={formations}
              selected={selectedFormations}
              onToggle={toggleFormation}
              onValidate={validateSelection}
              onBack={() => setActiveNav("accueil")}
            />
          )}
          {activeNav === "acces-prive" && (
            <PrivateAccessView unlocked={unlocked} onUnlocked={handleUnlocked} onToast={showToast} />
          )}
          {activeNav === "portefeuille" && (
            <WalletView
              coins={coins}
              referralCode={referralCode}
              onCopyReferral={copyReferralLink}
              onToast={showToast}
            />
          )}
        </div>

        <nav className="bottom-nav" aria-label="Navigation principale">
          {([
            ["accueil", "Accueil", Sparkles],
            ["formations", "Formations", BookOpen],
            ["acces-prive", "Ticket", Ticket],
            ["portefeuille", "Portefeuille", Coins],
          ] as const).map(([id, label, Icon]) => (
            <button type="button" key={id} data-testid={`nav-${id}`} className={activeNav === id ? "active" : ""} onClick={() => setActiveNav(id)}><Icon size={18} /><span>{label}</span></button>
          ))}
        </nav>

        {menuOpen && (
          <div className="menu-layer" role="dialog" aria-label="Menu du compte">
            <button type="button" className="menu-scrim" aria-label="Fermer le menu" onClick={() => setMenuOpen(false)} />
            <aside className="menu-panel">
              <div className="menu-panel-header">
                <div>
                  <p className="eyebrow">TON ESPACE</p>
                  <h2>Menu principal</h2>
                </div>
                <button type="button" className="menu-close" aria-label="Fermer le menu" onClick={() => setMenuOpen(false)}><X size={17} /></button>
              </div>
              <div className="menu-profile">
                <span className="menu-profile-avatar">{user.photoURL ? <img src={user.photoURL} alt="" /> : <UserRound size={18} />}</span>
                <span><b>{user.displayName}</b><small>{user.email}</small></span>
              </div>
              <div className="menu-actions">
                <button type="button" onClick={() => { setMenuOpen(false); setActiveNav("formations"); }}><BookOpen size={17} /><span>Formations</span><ChevronRight size={15} /></button>
                <button type="button" onClick={() => { setMenuOpen(false); setActiveNav("acces-prive"); }}><Ticket size={17} /><span>Ticket d'entrée</span><ChevronRight size={15} /></button>
                <button type="button" onClick={() => { setMenuOpen(false); setActiveNav("portefeuille"); }}><Coins size={17} /><span>Portefeuille</span><ChevronRight size={15} /></button>
                <button type="button" onClick={() => { setMenuOpen(false); showToast("La communauté est prête à t’accueillir.", "info"); }}><MessageCircle size={17} /><span>Communauté</span><ChevronRight size={15} /></button>
                <button type="button" className="menu-logout" data-testid="button-logout" onClick={() => { setMenuOpen(false); handleLogout(); }}><LogOut size={17} /><span>Se déconnecter</span><ChevronRight size={15} /></button>
              </div>
            </aside>
          </div>
        )}
        {toast && <div className={`toast toast-${toast.kind}`} role="status" data-testid="status-toast"><span>{toast.message}</span><button type="button" aria-label="Fermer le message" data-testid="button-close-toast" onClick={() => setToast(null)}><X size={15} /></button></div>}
      </div>
    </main>
  );
}


function HomeView({ firstName, unlocked, onGoToFormations, onGoToAccesPrive }: { firstName: string; unlocked: boolean; onGoToFormations: () => void; onGoToAccesPrive: () => void }) {
  return <div className="view-stack">
    <section className="welcome-block animate-rise"><p className="eyebrow">TON ESPACE, TON RYTHME</p><h1>Bonjour,<br /><em>{firstName}.</em></h1><p>Heureux de te retrouver. Prêt·e à faire avancer ton projet ?</p></section>

    <button type="button" className="progress-card animate-rise" onClick={onGoToFormations} style={{ width: "100%", textAlign: "left", border: 0, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
      <div><p className="eyebrow">ÉTAPE 1</p><h2>Choisis tes formations</h2><p style={{ margin: "7px 0 0", color: "hsl(42 67% 98% / .62)", fontSize: 10 }}>Coche celles qui t'intéressent.</p></div>
      <ArrowRight size={20} color="hsl(var(--accent))" />
    </button>

    <button type="button" className="community-card animate-rise" onClick={onGoToAccesPrive} style={{ width: "100%", textAlign: "left", border: 0, cursor: "pointer" }}>
      <span className="community-icon"><Ticket size={20} /></span>
      <div><p className="eyebrow">ÉTAPE 2 · GROUPE PRIVÉ</p><h3>{unlocked ? "Accès débloqué" : "Payer le ticket d'entrée"}</h3><p>{unlocked ? "Rejoins la communauté à tout moment." : "Un ticket unique : formations + groupe WhatsApp."}</p></div>
      <ArrowRight size={17} />
    </button>
  </div>;
}

function FormationsView({
  formations: list,
  selected,
  onToggle,
  onValidate,
  onBack,
}: {
  formations: Formation[];
  selected: string[];
  onToggle: (id: string) => void;
  onValidate: () => void;
  onBack: () => void;
}) {
  return <div className="view-stack formations-view">
    <div className="page-heading">
      <button type="button" className="back-button" data-testid="button-back-home" onClick={onBack}><ArrowRight size={17} className="rotate-180" /></button>
      <div><p className="eyebrow">ÉTAPE 1 · SÉLECTION</p><h1>Choisis tes formations</h1></div>
    </div>
    <div className="formation-list">
      {list.map((formation) => {
        const checked = selected.includes(formation.id);
        return (
          <label
            key={formation.id}
            data-testid={`card-formation-${formation.id}`}
            className={`module-card module-${formation.tone} module-full`}
            style={{ cursor: "pointer", outline: checked ? "2px solid hsl(var(--primary))" : "none", outlineOffset: 2 }}
          >
            <div className="module-topline">
              <span className="module-number">
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => onToggle(formation.id)}
                  data-testid={`checkbox-formation-${formation.id}`}
                  style={{ width: 18, height: 18, accentColor: "hsl(var(--primary))" }}
                />
              </span>
              {checked && <Check size={17} />}
            </div>
            <div className="module-content">
              <p>{formation.lessons} LEÇONS</p>
              <h3>{formation.title}</h3>
              <span><Clock3 size={12} /> {formation.duration}</span>
            </div>
          </label>
        );
      })}
    </div>
    <button type="button" className="primary-button" data-testid="button-validate-selection" onClick={onValidate}>
      Valider ma sélection ({selected.length}) <ArrowRight size={16} />
    </button>
  </div>;
}

function WalletView({
  coins,
  referralCode,
  onCopyReferral,
  onToast,
}: {
  coins: number;
  referralCode: string | null;
  onCopyReferral: () => void;
  onToast: (message: string, kind?: ToastKind) => void;
}) {
  return <div className="view-stack">
    <div className="page-heading">
      <div><p className="eyebrow">TON PORTEFEUILLE</p><h1>Pièces & parrainage</h1></div>
      <span className="reward-icon"><Trophy size={18} /></span>
    </div>
    <section className="reward-card">
      <Coins size={26} />
      <p>Ton solde de pièces</p>
      <strong data-testid="text-wallet-coin-balance">{coins}</strong>
      <span>Gagne des coins en parrainant tes amis. Retrait possible dès 3000 coins.</span>
      <button type="button" onClick={() => onToast("Le retrait sera disponible prochainement.", "info")}>
        Demander un retrait <ArrowRight size={16} />
      </button>
    </section>
    <section className="reward-card" data-testid="section-referral">
      <Gift size={26} />
      <p>Parraine tes amis</p>
      <strong>+{REFERRAL_REWARD_COINS} coins</strong>
      <span>Par filleul·e qui rejoint l’espace de formation avec ton lien.</span>
      {referralCode ? (
        <button type="button" data-testid="button-copy-referral" onClick={onCopyReferral}>
          <Copy size={15} /> Copier mon lien ({referralCode})
        </button>
      ) : (
        <span style={{ opacity: 0.6, fontSize: 10 }}>Chargement de ton code...</span>
      )}
    </section>
  </div>;
}

function DeviceBlockedView({ onRequestReset, onLogout }: { onRequestReset: () => Promise<void>; onLogout: () => void }) {
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);

  const handleRequest = async () => {
    setBusy(true);
    await onRequestReset();
    setSent(true);
    setBusy(false);
  };

  return (
    <div className="login-view">
      <span className="login-mark brand-mark" style={{ background: "hsl(var(--primary) / .15)", color: "hsl(var(--primary))" }}>
        <AlertTriangle size={18} />
      </span>
      <p className="eyebrow">ACCÈS RESTREINT</p>
      <h1>Ce compte est déjà utilisé sur un autre appareil.</h1>
      <p className="login-lead">
        Pour éviter le partage de compte, l'accès aux formations et au groupe privé est limité à un seul appareil.
        Si tu as changé de téléphone légitimement, demande une réinitialisation ci-dessous.
      </p>
      {sent ? (
        <p className="login-note" style={{ marginTop: 16 }}>
          <ShieldCheck size={13} /> Demande envoyée. Contacte le support pour finaliser.
        </p>
      ) : (
        <button type="button" className="auth-primary" style={{ marginTop: 16 }} onClick={handleRequest} disabled={busy}>
          {busy ? "Envoi..." : "Demander une réinitialisation"}
        </button>
      )}
      <button
        type="button"
        onClick={onLogout}
        style={{ marginTop: 12, border: 0, background: "transparent", color: "hsl(var(--muted-foreground))", fontSize: 12, cursor: "pointer" }}
      >
        Se déconnecter
      </button>
    </div>
  );
}

// Etape 2 : vrai paiement FedaPay Mobile Money, formulaire dans la page
// (pays -> operateur -> telephone), sans redirection externe. Sondage
// automatique du statut (webhook FedaPay met a jour cote serveur en
// quasi temps reel) jusqu'a confirmation, puis affichage du code ticket.
function PrivateAccessView({
  unlocked,
  onUnlocked,
  onToast,
}: {
  unlocked: boolean;
  onUnlocked: () => void;
  onToast: (message: string, kind?: ToastKind) => void;
}) {
  const [step, setStep] = useState<"form" | "waiting" | "redeem" | "done">(unlocked ? "done" : "form");
  const [countryId, setCountryId] = useState(COUNTRIES[0].id);
  const [operatorMode, setOperatorMode] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [transactionId, setTransactionId] = useState<number | null>(null);
  const [ticketCode, setTicketCode] = useState<string | null>(null);
  const [enteredCode, setEnteredCode] = useState("");
  const [busy, setBusy] = useState(false);

  const country = COUNTRIES.find((c) => c.id === countryId) ?? COUNTRIES[0];

  // Sondage automatique pendant l'attente de confirmation du paiement.
  useEffect(() => {
    if (step !== "waiting" || !transactionId) return;

    const interval = window.setInterval(async () => {
      try {
        const result = await checkPaymentStatus(transactionId);
        if (result.status === "approved" && result.ticketCode) {
          setTicketCode(result.ticketCode);
          setStep("redeem");
          onToast("Paiement confirmé ! Voici ton code ticket.", "success");
        } else if (result.status === "declined" || result.status === "canceled") {
          setStep("form");
          onToast("Paiement refusé ou annulé. Réessaie.", "warning");
        }
      } catch {
        // on ignore les erreurs de sondage isolees, on reessaiera au prochain tick
      }
    }, 3000);

    return () => window.clearInterval(interval);
  }, [step, transactionId, onToast]);

  const handleCountryChange = (id: string) => {
    setCountryId(id);
    setOperatorMode("");
    setPhoneNumber("");
  };

  const handlePay = async () => {
    if (!operatorMode) {
      onToast("Choisis ton opérateur mobile money.", "warning");
      return;
    }
    if (phoneNumber.trim().length < 6) {
      onToast("Entre un numéro de téléphone valide.", "warning");
      return;
    }
    setBusy(true);
    try {
      const result = await payMobile(phoneNumber.trim(), country.code, operatorMode);
      setTransactionId(result.transactionId);
      setStep("waiting");
      onToast(result.message ?? "Demande envoyée sur ton téléphone.", "success");
    } catch (err) {
      onToast(err instanceof Error ? err.message : "Une erreur est survenue.", "warning");
    } finally {
      setBusy(false);
    }
  };

  const handleCopyCode = async () => {
    if (!ticketCode) return;
    try {
      await navigator.clipboard.writeText(ticketCode);
      onToast("Code copié !", "success");
    } catch {
      onToast(`Ton code : ${ticketCode}`, "info");
    }
  };

  const handleRedeem = async () => {
    if (enteredCode.trim().length < 4) {
      onToast("Entre le code complet reçu après paiement.", "warning");
      return;
    }
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

  if (step === "done") {
    return <div className="view-stack">
      <div className="page-heading">
        <div><p className="eyebrow">ÉTAPE 2 · TICKET D'ENTRÉE</p><h1>Accès au groupe privé</h1></div>
        <span className="reward-icon"><Ticket size={18} /></span>
      </div>
      <section className="reward-card">
        <ShieldCheck size={26} />
        <p>Accès débloqué</p>
        <strong>✓</strong>
        <span>Tu as accès à toutes les formations et au groupe WhatsApp privé.</span>
      </section>
    </div>;
  }

  return <div className="view-stack">
    <div className="page-heading">
      <div><p className="eyebrow">ÉTAPE 2 · TICKET D'ENTRÉE</p><h1>Accès au groupe privé</h1></div>
      <span className="reward-icon"><Ticket size={18} /></span>
    </div>

    {step === "form" && (
      <section className="steps-card">
        <p className="eyebrow">1. CHOISIS TON PAYS</p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 6, marginTop: 8 }}>
          {COUNTRIES.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => handleCountryChange(c.id)}
              style={{
                display: "flex", flexDirection: "column", alignItems: "center", gap: 2,
                padding: "8px 4px", borderRadius: 10,
                border: countryId === c.id ? "2px solid hsl(var(--primary))" : "1px solid hsl(var(--border))",
                background: "transparent", cursor: "pointer",
              }}
            >
              <span style={{ fontSize: 18 }}>{c.flag}</span>
              <span style={{ fontSize: 9, fontWeight: 600 }}>{c.code.toUpperCase()}</span>
            </button>
          ))}
        </div>

        <p className="eyebrow" style={{ marginTop: 16 }}>2. CHOISIS TON OPÉRATEUR</p>
        <div style={{ display: "grid", gridTemplateColumns: `repeat(${country.operators.length}, 1fr)`, gap: 6, marginTop: 8 }}>
          {country.operators.map((op) => (
            <button
              key={op.mode}
              type="button"
              onClick={() => setOperatorMode(op.mode)}
              style={{
                padding: "10px 4px", borderRadius: 10, fontWeight: 700, fontSize: 12,
                border: operatorMode === op.mode ? `2px solid ${op.color}` : "1px solid hsl(var(--border))",
                background: operatorMode === op.mode ? op.color : "transparent",
                color: operatorMode === op.mode ? "#fff" : "inherit",
                cursor: "pointer",
              }}
            >
              {op.label}
            </button>
          ))}
        </div>

        <p className="eyebrow" style={{ marginTop: 16 }}>3. NUMÉRO DE TÉLÉPHONE</p>
        <div style={{ display: "flex", alignItems: "stretch", marginTop: 8, border: "1px solid hsl(var(--border))", borderRadius: 10, overflow: "hidden" }}>
          <span style={{ display: "flex", alignItems: "center", padding: "0 10px", background: "hsl(var(--muted, 0 0% 96%))", fontSize: 13, fontWeight: 600 }}>
            +{country.dialCode}
          </span>
          <input
            type="tel"
            value={phoneNumber}
            onChange={(e) => setPhoneNumber(e.target.value.replace(/\D/g, ""))}
            placeholder={country.phonePlaceholder}
            style={{ flex: 1, border: 0, padding: "10px 12px", fontSize: 15 }}
          />
        </div>

        <button type="button" className="primary-button" data-testid="button-pay-ticket" onClick={handlePay} disabled={busy} style={{ marginTop: 16 }}>
          {busy ? "Envoi en cours..." : "Payer le ticket"} <ArrowRight size={16} />
        </button>
      </section>
    )}

    {step === "waiting" && (
      <section className="steps-card" style={{ textAlign: "center" }}>
        <p className="eyebrow">PAIEMENT EN ATTENTE</p>
        <h2>Confirme sur ton téléphone</h2>
        <p style={{ marginTop: 8, fontSize: 13, opacity: 0.8 }}>
          Une notification a été envoyée sur ton numéro {country.dialCode ? `+${country.dialCode}` : ""} {phoneNumber}.
          Valide le paiement via ton opérateur mobile money. Cette page se met à jour automatiquement.
        </p>
      </section>
    )}

    {step === "redeem" && (
      <section className="steps-card">
        <p className="eyebrow">VALIDATION</p>
        <h2>Entre ton code ticket</h2>
        {ticketCode && (
          <div
            className="lesson-summary"
            data-testid="text-ticket-code"
            style={{ alignItems: "center", cursor: "pointer" }}
            onClick={handleCopyCode}
          >
            <span style={{ flex: 1 }}><KeyRound size={14} /> <b style={{ letterSpacing: "0.1em" }}>{ticketCode}</b></span>
            <span style={{ display: "flex", alignItems: "center", gap: 4, flex: "0 0 auto" }}>
              <Copy size={13} /> Copier
            </span>
          </div>
        )}
        <input
          type="text"
          value={enteredCode}
          onChange={(event) => setEnteredCode(event.target.value.toUpperCase())}
          placeholder="Ex: A3F7K9"
          maxLength={6}
          data-testid="input-ticket-code"
          style={{
            width: "100%",
            marginTop: 10,
            padding: "10px 12px",
            borderRadius: 10,
            border: "1px solid hsl(var(--border))",
            fontFamily: "var(--font-mono)",
            fontSize: 16,
            letterSpacing: "0.15em",
            textAlign: "center",
          }}
        />
        <button
          type="button"
          className="primary-button"
          data-testid="button-redeem-ticket"
          onClick={handleRedeem}
          disabled={busy}
          style={{ marginTop: 12 }}
        >
          {busy ? "Vérification..." : "Entrer le code et débloquer l'accès"} <ArrowRight size={16} />
        </button>
      </section>
    )}
  </div>;
}

export default App;
