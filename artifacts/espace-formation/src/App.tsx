import { useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  BookOpen,
  Check,
  ChevronRight,
  Clock3,
  Coins,
  LogOut,
  Menu,
  MessageCircle,
  Play,
  Sparkles,
  Trophy,
  UserRound,
  X,
} from "lucide-react";

import { AuthView } from "@/components/auth-view";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/lib/supabase";
import { simulatePayment, joinWhatsappGroup } from "@/lib/access-api";

type ToastKind = "success" | "warning" | "info";
type AppUser = { displayName: string; email: string; photoURL?: string | null };
type NavItem = "accueil" | "formations" | "recompenses";

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

const COINS_STORAGE_KEY = "espace-formation:coins";
const WHATSAPP_MODULE_ID = "payment-groups";

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
  {
    id: WHATSAPP_MODULE_ID,
    title: "Relier un paiement à son groupe privé",
    description: "Découvre comment automatiser les paiements et les accès à une communauté WhatsApp ou Telegram.",
    lessons: 10,
    duration: "2 h 20",
    progress: 0,
    reward: 120,
    tone: "violet",
  },
];

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

  useEffect(() => {
    const stored = Number(window.localStorage.getItem(COINS_STORAGE_KEY));
    if (Number.isFinite(stored) && stored > 0) setCoins(stored);
  }, []);

  useEffect(() => {
    window.localStorage.setItem(COINS_STORAGE_KEY, String(coins));
  }, [coins]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 3600);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const visibleModules = useMemo(
    () => modules.map((module) => completed.includes(module.id) ? { ...module, progress: 100 } : module),
    [completed],
  );
  const progress = Math.round(visibleModules.reduce((total, module) => total + module.progress, 0) / visibleModules.length);
  const firstName = user?.displayName?.split(" ")[0] || "apprenant·e";

  // Supabase = base de donnees : le profil est synchronise apres la connexion Firebase.
  useEffect(() => {
    if (!authUser) return;
    void supabase
      .from("profiles")
      .upsert(
        {
          id: authUser.uid,
          email: authUser.email,
          display_name: authUser.displayName ?? null,
          avatar_url: authUser.photoURL ?? null,
        },
        { onConflict: "id" },
      )
      .then(({ error }) => {
        if (error) console.warn("Supabase profile sync:", error.message);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authUser?.uid]);

  const showToast = (message: string, kind: ToastKind = "success") => setToast({ message, kind });

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
      setCoins((balance) => balance + module.reward);
      showToast(`Module terminé. +${module.reward} pièces ajoutées !`);
    } else {
      showToast("Tu peux revoir ce module quand tu veux.", "info");
    }
    setSelectedModule(null);
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
          <span className="coin-chip" data-testid="text-coin-balance" title="Ton solde de pièces"><Coins size={13} /><b>{coins}</b></span>
          <div className="user-bubble" title={user.email ?? undefined}>{user.photoURL ? <img src={user.photoURL} alt="" /> : <UserRound size={17} />}</div>
          </div>
        </header>

        <div className="app-content">
          {activeNav === "accueil" && (
            <HomeView user={user} firstName={firstName} progress={progress} coins={coins} modules={visibleModules} onModule={setSelectedModule} onAllModules={() => setActiveNav("formations")} />
          )}
          {activeNav === "formations" && <FormationsView modules={visibleModules} onModule={setSelectedModule} onBack={() => setActiveNav("accueil")} />}
          {activeNav === "recompenses" && <RewardsView progress={progress} coins={coins} onToast={showToast} />}
        </div>

        <nav className="bottom-nav" aria-label="Navigation principale">
          {([
            ["accueil", "Accueil", Sparkles],
            ["formations", "Formations", BookOpen],
            ["recompenses", "Récompenses", Trophy],
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
                <span className="menu-profile-avatar"><UserRound size={18} /></span>
                <span><b>{user.displayName}</b><small>{user.email}</small></span>
              </div>
              <div className="menu-actions">
                <button type="button" onClick={() => { setMenuOpen(false); showToast("Ton profil est à jour.", "info"); }}><UserRound size={17} /><span>Mon profil</span><ChevronRight size={15} /></button>
                <button type="button" onClick={() => { setMenuOpen(false); showToast("La communauté est prête à t’accueillir.", "info"); }}><MessageCircle size={17} /><span>Communauté</span><ChevronRight size={15} /></button>
                <button type="button" onClick={() => { setMenuOpen(false); setActiveNav("recompenses"); }}><Trophy size={17} /><span>Récompenses</span><ChevronRight size={15} /></button>
                <button type="button" className="menu-logout" data-testid="button-logout" onClick={() => { setMenuOpen(false); handleLogout(); }}><LogOut size={17} /><span>Se déconnecter</span><ChevronRight size={15} /></button>
              </div>
            </aside>
          </div>
        )}
        {selectedModule && (
          <ModuleModal
            module={selectedModule}
            userName={user.displayName}
            onClose={() => setSelectedModule(null)}
            onComplete={completeModule}
            onToast={showToast}
          />
        )}
        {toast && <div className={`toast toast-${toast.kind}`} role="status" data-testid="status-toast"><span>{toast.message}</span><button type="button" aria-label="Fermer le message" data-testid="button-close-toast" onClick={() => setToast(null)}><X size={15} /></button></div>}
      </div>
    </main>
  );
}



function HomeView({ user, firstName, progress, coins, modules: visibleModules, onModule, onAllModules }: { user: AppUser; firstName: string; progress: number; coins: number; modules: Module[]; onModule: (module: Module) => void; onAllModules: () => void }) {
  return <div className="view-stack">
    <section className="welcome-block animate-rise"><p className="eyebrow">TON ESPACE, TON RYTHME</p><h1>Bonjour,<br /><em>{firstName}.</em></h1><p>Heureux de te retrouver. Prêt·e à faire avancer ton projet ?</p><span className="email-chip">{user.email}</span></section>
    <section className="progress-card animate-rise"><div><p className="eyebrow">TON PARCOURS</p><h2>Tu avances bien.</h2><p>Chaque leçon te rapproche de ton prochain objectif.</p></div><strong>{progress}%</strong><div className="progress-track"><span style={{ width: `${progress}%` }} /></div><div className="coin-balance-row"><span><Coins size={13} /> Solde</span><b data-testid="text-home-coin-balance">{coins} pièces</b></div></section>
    <section className="section-block animate-rise"><div className="section-heading"><div><p className="eyebrow">À DÉCOUVRIR</p><h2>Formations pratiques</h2></div><button type="button" className="text-button" data-testid="button-view-all-formations" onClick={onAllModules}>Tout voir <ArrowRight size={14} /></button></div><div className="module-scroller">{visibleModules.slice(0, 2).map((module) => <ModuleCard key={module.id} module={module} onClick={() => onModule(module)} />)}</div></section>
    <section className="community-card animate-rise"><span className="community-icon"><MessageCircle size={20} /></span><div><p className="eyebrow">ON APPREND MIEUX ENSEMBLE</p><h3>Le groupe communauté</h3><p>Échange, pose tes questions, reste motivé.</p></div><ArrowRight size={17} /></section>
  </div>;
}

function FormationsView({ modules: visibleModules, onModule, onBack }: { modules: Module[]; onModule: (module: Module) => void; onBack: () => void }) {
  return <div className="view-stack formations-view"><div className="page-heading"><button type="button" className="back-button" data-testid="button-back-home" onClick={onBack}><ArrowRight size={17} className="rotate-180" /></button><div><p className="eyebrow">BIBLIOTHÈQUE</p><h1>Toutes les formations</h1></div></div><div className="formation-list">{visibleModules.map((module) => <ModuleCard key={module.id} module={module} onClick={() => onModule(module)} full />)}</div></div>;
}

function RewardsView({ progress, coins, onToast }: { progress: number; coins: number; onToast: (message: string, kind?: ToastKind) => void }) {
  const steps = [
    { number: "01", Icon: Play, title: "Apprends", copy: "Suis une leçon jusqu’au bout." },
    { number: "02", Icon: Check, title: "Progresse", copy: "Valide tes étapes." },
    { number: "03", Icon: Coins, title: "Récolte", copy: "Gagne des pièces." },
  ];
  return <div className="view-stack"><div className="page-heading"><div><p className="eyebrow">TON ÉNERGIE</p><h1>Pièces & récompenses</h1></div><span className="reward-icon"><Trophy size={18} /></span></div><section className="reward-card"><Coins size={26} /><p>Ton solde de pièces</p><strong data-testid="text-reward-coin-balance">{coins}</strong><span>Progression globale : {progress}% · chaque effort compte.</span><button type="button" data-testid="button-reward-info" onClick={() => onToast("Les récompenses arrivent avec tes prochaines leçons.", "info")}>Comment ça marche <ArrowRight size={16} /></button></section><section className="steps-card"><p className="eyebrow">TON RITUEL</p><h2>Apprends avec régularité.</h2>{steps.map(({ number, Icon, title, copy }) => <div className="reward-step" key={number}><span>{number}</span><i><Icon size={15} /></i><div><b>{title}</b><small>{copy}</small></div></div>)}</section></div>;
}

function ModuleCard({ module, onClick, full = false }: { module: Module; onClick: () => void; full?: boolean }) {
  return <button type="button" data-testid={`card-module-${module.id}`} className={`module-card module-${module.tone} ${full ? "module-full" : ""}`} onClick={onClick}><div className="module-topline"><span className="module-number">{module.progress === 100 ? <Check size={15} /> : <BookOpen size={15} />}</span><ChevronRight size={17} /></div><div className="module-content"><p>PARCOURS · {module.lessons} LEÇONS</p><h3>{module.title}</h3><span><Clock3 size={12} /> {module.duration}</span></div><div className="card-progress"><span style={{ width: `${module.progress}%` }} /></div><div className="module-bottom"><span>{module.progress === 0 ? "À commencer" : `${module.progress}% terminé`}</span><ArrowRight size={15} /></div></button>;
}

function ModuleModal({
  module,
  userName,
  onClose,
  onComplete,
  onToast,
}: {
  module: Module;
  userName: string;
  onClose: () => void;
  onComplete: (module: Module) => void;
  onToast: (message: string, kind?: ToastKind) => void;
}) {
  const [joining, setJoining] = useState(false);
  const isWhatsappModule = module.id === WHATSAPP_MODULE_ID;

  const handleJoinWhatsapp = async () => {
    setJoining(true);
    try {
      await simulatePayment(userName);
      const { inviteUrl } = await joinWhatsappGroup();
      onToast("Paiement simulé avec succès, ouverture de WhatsApp...", "success");
      window.location.href = inviteUrl;
    } catch (err) {
      onToast(err instanceof Error ? err.message : "Une erreur est survenue.", "warning");
    } finally {
      setJoining(false);
    }
  };

  return <div className="modal-layer"><button type="button" className="modal-scrim" aria-label="Fermer le module" data-testid="button-close-module" onClick={onClose} /><section className={`module-modal module-${module.tone}`} role="dialog" aria-modal="true"><button type="button" className="modal-close" data-testid="button-close-module-inner" onClick={onClose}><X size={17} /></button><p className="eyebrow">FORMATION PRATIQUE</p><h2>{module.title}</h2><p>{module.description}</p><div className="lesson-summary"><span><b>{module.lessons}</b> leçons</span><span><b>{module.duration}</b> à ton rythme</span></div>
    {isWhatsappModule ? (
      <button type="button" className="primary-button" data-testid={`button-start-module-${module.id}`} onClick={handleJoinWhatsapp} disabled={joining}>
        {joining ? "Connexion..." : "Rejoindre le groupe WhatsApp"} <ArrowRight size={16} />
      </button>
    ) : (
      <button type="button" className="primary-button" data-testid={`button-start-module-${module.id}`} onClick={() => onComplete(module)}>{module.progress === 0 ? "Commencer le module" : "Continuer ma leçon"} <ArrowRight size={16} /></button>
    )}
  </section></div>;
}

export default App;
