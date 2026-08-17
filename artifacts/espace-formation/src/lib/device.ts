// Genere (ou recupere) un identifiant unique et persistant pour cet appareil/navigateur.
// Sert a detecter le partage de compte : un compte ne peut etre "actif" que sur
// UN seul appareil apres la premiere activation du ticket.
const DEVICE_ID_KEY = "espace-formation:device-id";

export function getDeviceId(): string {
  let id = window.localStorage.getItem(DEVICE_ID_KEY);
  if (!id) {
    id =
      typeof crypto.randomUUID === "function"
        ? crypto.randomUUID()
        : `dev-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    window.localStorage.setItem(DEVICE_ID_KEY, id);
  }
  return id;
}
