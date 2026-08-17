import { useEffect, useState } from "react";
import { Loader2, ShieldCheck, Sparkles } from "lucide-react";
import {
  GoogleAuthProvider,
  getRedirectResult,
  signInWithPopup,
  signInWithRedirect,
} from "firebase/auth";

import { auth } from "@/lib/firebase";

const googleProvider = new GoogleAuthProvider();
// Force l'ecran de selection de compte : l'utilisateur choisit son Gmail.
googleProvider.setCustomParameters({ prompt: "select_account" });

function readableError(code: string, fallback: string) {
  switch (code) {
    case "auth/popup-closed-by-user":
    case "auth/cancelled-popup-request":
      return "Connexion Google annulee.";
    case "auth/popup-blocked":
      return "La fenetre Google a ete bloquee par le navigateur.";
    case "auth/account-exists-with-different-credential":
      return "Un compte existe deja avec cet e-mail via une autre methode.";
    case "auth/unauthorized-domain":
      return "Ce domaine n'est pas autorise dans la console Firebase.";
    case "auth/network-request-failed":
      return "Connexion impossible. Verifie ton reseau.";
    default:
      return fallback;
  }
}

function messageFrom(error: unknown) {
  const err = error as { code?: string; message?: string };
  return readableError(err?.code ?? "", err?.message ?? "Une erreur est survenue.");
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9 3.6l6.7-6.7C35.6 2.6 30.2.5 24 .5 14.6.5 6.5 5.9 2.6 13.7l7.8 6.1C12.3 13.6 17.6 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 3-2.3 5.5-4.9 7.2l7.6 5.9c4.4-4.1 7.1-10.2 7.1-17.6z" />
      <path fill="#FBBC05" d="M10.4 28.4a14.5 14.5 0 0 1 0-8.6l-7.8-6.1a23.5 23.5 0 0 0 0 20.8l7.8-6.1z" />
      <path fill="#34A853" d="M24 47.5c6.2 0 11.5-2 15.4-5.5l-7.6-5.9c-2.1 1.4-4.8 2.3-7.8 2.3-6.4 0-11.7-4.1-13.6-9.9l-7.8 6.1C6.5 42.1 14.6 47.5 24 47.5z" />
    </svg>
  );
}

export function AuthView({ onNotify }: { onNotify: (message: string, kind?: "success" | "warning" | "info") => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getRedirectResult(auth)
      .then((credential) => {
        if (credential?.user) {
          onNotify(`Bienvenue ${credential.user.displayName ?? ""}`.trim() + " !");
        }
      })
      .catch((err) => setError(messageFrom(err)));
  }, [onNotify]);

  const signInWithGoogle = async () => {
    setError(null);
    setBusy(true);
    try {
      const credential = await signInWithPopup(auth, googleProvider);
      onNotify(`Bienvenue ${credential.user.displayName ?? ""}`.trim() + " !");
    } catch (err) {
      const code = (err as { code?: string })?.code ?? "";
      if (code === "auth/popup-blocked" || code === "auth/operation-not-supported-in-this-environment") {
        try {
          await signInWithRedirect(auth, googleProvider);
          return;
        } catch (redirectError) {
          setError(messageFrom(redirectError));
        }
      } else {
        setError(messageFrom(err));
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="login-view auth-view">
      <span className="brand-mark login-mark"><Sparkles size={18} /></span>
      <p className="eyebrow">BIENVENUE</p>
      <h1>Espace <em>formation</em></h1>

      <div className="auth-form">
        <p className="login-lead">Connecte-toi en un clic avec ton compte Google.</p>
        <button
          type="button"
          className="auth-google"
          onClick={signInWithGoogle}
          disabled={busy}
          data-testid="button-google-sign-in"
        >
          {busy ? <Loader2 className="auth-spin" size={16} /> : <GoogleIcon />}
          <span>{busy ? "Connexion..." : "Continuer avec Google"}</span>
        </button>
        {error && <p className="auth-error" role="alert">{error}</p>}
      </div>

      <p className="login-note"><ShieldCheck size={13} /> Connexion securisee par Google</p>
    </div>
  );
}
