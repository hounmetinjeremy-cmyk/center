import { useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  BookOpen,
  Check,
  ChevronRight,
  Clock3,
  Coins,
  Copy,
  Gift,
  KeyRound,
  Lock,
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
import { payForTicket, redeemTicketCode } from "@/lib/access-api";

type ToastKind = "success" | "warning" | "info";
type AppUser = { displayName: string; email: string; photoURL?: string | null };
type NavItem = "accueil" | "formations" | "portefeuille" | "acces-prive";

interface Module {
  id: string;
  title: string;
  description: string;
  lessons: number;
  duration: string;
  progress: number;
  reward: number;
  tone: "coral" | "teal" | "violet";
}

const PENDING_REFERRAL_KEY = "espace-formation:pending-referral";
const REFERRAL_REWARD_COINS = 100;

const modules: Module[] = [
  {
    id: "facebook-scores",
    title: "Booster sa visibilité avec les scores en direct",
    description: "Apprends à capter l’attention, générer des vues et créer une audience fidèle avec des contenus qui vivent en temps réel.",
    lessons: 8,
    duration: "1 h 40",
    progress: 68,
    reward: 50,
    tone: "coral",
  },
  {
    id: "onewin-promo",
    title: "Gagner de l’argent avec un code promo",
    description: "Une méthode pratique pour créer, configurer et monétiser ton propre code promo.",
    lessons: 6,
    duration: "1 h 15",
    progress: 24,
    reward: 75,
    tone: "teal",
  },
];

// Récupère le code de parrainage depuis l'URL (?ref=CODE) et le garde en attente
// jusqu'à ce que la personne se connecte, où il sera automatiquement validé.
function capturePendingReferralFromUrl() {
  const params = new URLSearchParams(window.location.search);
  const ref = params.get("ref");
  if (ref) {
    window.localStorage.setItem(PENDING_REFERRAL_KEY, ref.trim().toUpperCase());
    window.history.replaceState({}, "", window.location.pathname);
  }
}

// Cree/met a jour le profil ET renvoie le solde de coins, le code de parrainage
// et si l'acces global (formations + groupe prive) est deja debloque.
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
  const [selectedModule, setSelectedModule] = useState<Module | null>(null);
  const [completed, setCompleted] = useState<string[]>([]);
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

  const visibleModules = useMemo(
    () => modules.map((module) => completed.includes(module.id) ? { ...module, progress: 100 } : module),
    [completed],
  );
  const progress = visibleModules.length
    ? Math.round(visibleModules.reduce((total, module) => total + module.progress, 0) / visibleModules.length)
    : 0;
  const firstName = user?.displayName?.split(" ")[0] || "apprenant·e";

  const showToast = (message: string, kind: ToastKind = "success") => setToast({ message, kind });

  // Supabase = base de donnees : profil, portefeuille de coins, parrainage et
  // etat de deblocage sont synchronises apres la connexion Firebase, via une
  // fonction securisee (RLS classique bloquerait car pas de session Supabase Auth).
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
      setCompleted([]);
      showToast("Tu es déconnecté·e.", "info");
    } catch {
      showToast("Déconnexion impossible pour le moment.", "warning");
    }
  };

  const completeModule = (module: Module) => {
    if (!completed.includes(module.id)) {
      setCompleted((items) => [...items, module.id]);
      showToast(`Module terminé. Continue pour gagner plus de coins !`);
    } else {
      showToast("Tu peux revoir ce module quand tu veux.", "info");
    }
    setSelectedModule(null);
  };

  // Une formation ne s'ouvre que si l'acces global est debloque (ticket paye + code valide).
  // Sinon, on redirige directement vers l'onglet d'achat du ticket.
  const handleModuleClick = (module: Module) => {
    if (!unlocked) {
      setActiveNav("acces-prive");
      showToast("Paye ton ticket d'entrée pour débloquer les formations.", "info");
      return;
    }
    setSelectedModule(module);
  };

  const handleUnlocked = async () => {
    setUnlocked(true);
    if (authUser) await markAccessUnlocked(authUser.uid);
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
          <div className="user-bubble" title={user.email ?? undefined}>{user.photoURL ? <img src={user.photoURL} alt="" /> : <UserRound size={17} />}</div>
          </div>
        </header>

        <div className="app-content">
          {activeNav === "accueil" && (
            <HomeView user={user} firstName={firstName} progress={progress} coins={coins} unlocked={unlocked} modules={visibleModules} onModule={handleModuleClick} onAllModules={() => setActiveNav("formations")} onGoToAccesPrive={() => setActiveNav("acces-prive")} />
          )}
          {activeNav === "formations" && <FormationsView modules={visibleModules} unlocked={unlocked} onModule={handleModuleClick} onBack={() => setActiveNav("accueil")} />}
          {activeNav === "portefeuille" && (
            <WalletView
              coins={coins}
              referralCode={referralCode}
              onCopyReferral={copyReferralLink}
              onToast={showToast}
            />
          )}
          {activeNav === "acces-prive" && (
            <PrivateAccessView userName={user.displayName} unlocked={unlocked} onUnlocked={handleUnlocked} onToast={showToast} />
          )}
        </div>

        <nav className="bottom-nav" aria-label="Navigation principale">
          {([
            ["accueil", "Accueil", Sparkles],
            ["formations", "Formations", BookOpen],
            ["portefeuille", "Portefeuille", Coins],
            ["acces-prive", "Accès privé", Ticket],
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
                <button type="button" onClick={() => { setMenuOpen(false); setActiveNav("portefeuille"); }}><Coins size={17} /><span>Portefeuille</span><ChevronRight size={15} /></button>
                <button type="button" onClick={() => { setMenuOpen(false); setActiveNav("acces-prive"); }}><Ticket size={17} /><span>Accès privé</span><ChevronRight size={15} /></button>
                <button type="button" onClick={() => { setMenuOpen(false); showToast("La communauté est prête à t’accueillir.", "info"); }}><MessageCircle size={17} /><span>Communauté</span><ChevronRight size={15} /></button>
                <button type="button" className="menu-logout" data-testid="button-logout" onClick={() => { setMenuOpen(false); handleLogout(); }}><LogOut size={17} /><span>Se déconnecter</span><ChevronRight size={15} /></button>
              </div>
            </aside>
          </div>
        )}
        {selectedModule && (
          <ModuleModal
            module={selectedModule}
            onClose={() => setSelectedModule(null)}
            onComplete={completeModule}
          />
        )}
        {toast && <div className={`toast toast-${toast.kind}`} role="status" data-testid="status-toast"><span>{toast.message}</span><button type="button" aria-label="Fermer le message" data-testid="button-close-toast" onClick={() => setToast(null)}><X size={15} /></button></div>}
      </div>
    </main>
  );
}



function HomeView({ user, firstName, progress, coins, unlocked, modules: visibleModules, onModule, onAllModules, onGoToAccesPrive }: { user: AppUser; firstName: string; progress: number; coins: number; unlocked: boolean; modules: Module[]; onModule: (module: Module) => void; onAllModules: () => void; onGoToAccesPrive: () => void }) {
  return <div className="view-stack">
    <section className="welcome-block animate-rise"><p className="eyebrow">TON ESPACE, TON RYTHME</p><h1>Bonjour,<br /><em>{firstName}.</em></h1><p>Heureux de te retrouver. Prêt·e à faire avancer ton projet ?</p><span className="email-chip">{user.email}</span></section>
    <section className="progress-card animate-rise"><div><p className="eyebrow">TON PARCOURS</p><h2>Tu avances bien.</h2><p>Chaque leçon te rapproche de ton prochain objectif.</p></div><strong>{progress}%</strong><div className="progress-track"><span style={{ width: `${progress}%` }} /></div><div className="coin-balance-row"><span><Coins size={13} /> Solde</span><b data-testid="text-home-coin-balance">{coins} pièces</b></div></section>
    <section className="section-block animate-rise"><div className="section-heading"><div><p className="eyebrow">À DÉCOUVRIR</p><h2>Formations pratiques</h2></div><button type="button" className="text-button" data-testid="button-view-all-formations" onClick={onAllModules}>Tout voir <ArrowRight size={14} /></button></div><div className="module-scroller">{visibleModules.slice(0, 2).map((module) => <ModuleCard key={module.id} module={module} locked={!unlocked} onClick={() => onModule(module)} />)}</div></section>
    <button type="button" className="community-card animate-rise" onClick={onGoToAccesPrive} style={{ width: "100%", textAlign: "left", border: 0, cursor: "pointer" }}>
      <span className="community-icon"><Ticket size={20} /></span>
      <div><p className="eyebrow">GROUPE PRIVÉ</p><h3>{unlocked ? "Accès débloqué" : "Ton accès WhatsApp"}</h3><p>{unlocked ? "Rejoins la communauté à tout moment." : "Paye ton ticket unique : formations + groupe."}</p></div>
      <ArrowRight size={17} />
    </button>
  </div>;
}

function FormationsView({ modules: visibleModules, unlocked, onModule, onBack }: { modules: Module[]; unlocked: boolean; onModule: (module: Module) => void; onBack: () => void }) {
  return <div className="view-stack formations-view"><div className="page-heading"><button type="button" className="back-button" data-testid="button-back-home" onClick={onBack}><ArrowRight size={17} className="rotate-180" /></button><div><p className="eyebrow">BIBLIOTHÈQUE</p><h1>Toutes les formations</h1></div></div><div className="formation-list">{visibleModules.map((module) => <ModuleCard key={module.id} module={module} locked={!unlocked} onClick={() => onModule(module)} full />)}</div></div>;
}

// Onglet dedie : portefeuille de coins + programme de parrainage.
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
      <span>Gagne des coins en parrainant tes amis. Le seuil de retrait sera annoncé bientôt.</span>
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

// Onglet dedie : achat du ticket unique (formations + groupe prive), puis saisie du code.
function PrivateAccessView({
  userName,
  unlocked,
  onUnlocked,
  onToast,
}: {
  userName: string;
  unlocked: boolean;
  onUnlocked: () => void;
  onToast: (message: string, kind?: ToastKind) => void;
}) {
  const [step, setStep] = useState<"pay" | "redeem" | "done">(unlocked ? "done" : "pay");
  const [ticketCode, setTicketCode] = useState<string | null>(null);
  const [enteredCode, setEnteredCode] = useState("");
  const [busy, setBusy] = useState(false);

  const handlePay = async () => {
    setBusy(true);
    try {
      const result = await payForTicket(userName);
      setTicketCode(result.ticketCode);
      setStep("redeem");
      onToast("Paiement simulé. Voici ton code ticket !", "success");
    } catch (err) {
      onToast(err instanceof Error ? err.message : "Une erreur est survenue.", "warning");
    } finally {
      setBusy(false);
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
      onToast("Code validé ! Formations débloquées, ouverture de WhatsApp...", "success");
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
        <div><p className="eyebrow">TICKET D'ENTRÉE</p><h1>Accès au groupe privé</h1></div>
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
      <div><p className="eyebrow">TICKET D'ENTRÉE</p><h1>Accès au groupe privé</h1></div>
      <span className="reward-icon"><Ticket size={18} /></span>
    </div>

    <section className="steps-card">
      <p className="eyebrow">ÉTAPE 1</p>
      <h2>Paye ton ticket unique</h2>
      <div className="reward-step">
        <span>01</span>
        <i><ShieldCheck size={15} /></i>
        <div><b>Paiement</b><small>{step === "pay" ? "Débloque formations + groupe WhatsApp" : "Payé ✓"}</small></div>
      </div>
      {step === "pay" && (
        <button type="button" className="primary-button" data-testid="button-pay-ticket" onClick={handlePay} disabled={busy}>
          {busy ? "Paiement en cours..." : "Payer le ticket"} <ArrowRight size={16} />
        </button>
      )}
    </section>

    {step !== "pay" && (
      <section className="steps-card">
        <p className="eyebrow">ÉTAPE 2</p>
        <h2>Entre ton code ticket</h2>
        {ticketCode && (
          <div className="lesson-summary" data-testid="text-ticket-code">
            <span><KeyRound size={14} /> <b>{ticketCode}</b></span>
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

function ModuleCard({ module, locked, onClick, full = false }: { module: Module; locked: boolean; onClick: () => void; full?: boolean }) {
  return <button type="button" data-testid={`card-module-${module.id}`} className={`module-card module-${module.tone} ${full ? "module-full" : ""}`} onClick={onClick}>
    <div className="module-topline">
      <span className="module-number">{locked ? <Lock size={15} /> : module.progress === 100 ? <Check size={15} /> : <BookOpen size={15} />}</span>
      <ChevronRight size={17} />
    </div>
    <div className="module-content"><p>PARCOURS · {module.lessons} LEÇONS</p><h3>{module.title}</h3><span><Clock3 size={12} /> {module.duration}</span></div>
    <div className="card-progress"><span style={{ width: `${locked ? 0 : module.progress}%` }} /></div>
    <div className="module-bottom"><span>{locked ? "Ticket requis" : module.progress === 0 ? "À commencer" : `${module.progress}% terminé`}</span><ArrowRight size={15} /></div>
  </button>;
}

function ModuleModal({ module, onClose, onComplete }: { module: Module; onClose: () => void; onComplete: (module: Module) => void }) {
  return <div className="modal-layer"><button type="button" className="modal-scrim" aria-label="Fermer le module" data-testid="button-close-module" onClick={onClose} /><section className={`module-modal module-${module.tone}`} role="dialog" aria-modal="true"><button type="button" className="modal-close" data-testid="button-close-module-inner" onClick={onClose}><X size={17} /></button><p className="eyebrow">FORMATION PRATIQUE</p><h2>{module.title}</h2><p>{module.description}</p><div className="lesson-summary"><span><b>{module.lessons}</b> leçons</span><span><b>{module.duration}</b> à ton rythme</span></div>
    <button type="button" className="primary-button" data-testid={`button-start-module-${module.id}`} onClick={() => onComplete(module)}>{module.progress === 0 ? "Commencer le module" : "Continuer ma leçon"} <ArrowRight size={16} /></button>
  </section></div>;
}

export default App;
