// --------------------------------------
// Catalogue des permissions des rôles personnalisés
// --------------------------------------
//
// Matrice de cases à cocher simples pour les rôles créés par l'administrateur
// (ex : « Secrétaire Adjoint »). Chaque permission est une clé stable stockée
// dans `CustomRole.permissions` (String[] PostgreSQL) et affichée sous un
// libellé français clair.

export interface RolePermission {
  /** Clé stockée en base et transmise au formulaire. */
  key: string;
  /** Libellé court affiché dans la matrice (ex : « Accès Finance »). */
  label: string;
  /** Description courte expliquant la portée de la permission. */
  description: string;
}

/** Liste exhaustive des permissions proposées (ordre = ordre d'affichage). */
export const ROLE_PERMISSIONS: readonly RolePermission[] = [
  {
    key: "finance",
    label: "Accès Finance",
    description: "Consulte les paiements, impayés et la trésorerie.",
  },
  {
    key: "registration",
    label: "Inscription",
    description: "Crée et met à jour des étudiants.",
  },
  {
    key: "delete",
    label: "Suppression",
    description: "Autorise la suppression d'étudiants, cours et autres.",
  },
  {
    key: "pos",
    label: "Caisse / POS",
    description: "Accès aux ventes comptoir et à l'encaissement.",
  },
  {
    key: "travel",
    label: "Procédures voyage",
    description: "Gère les dossiers de mobilité et les logements.",
  },
  {
    key: "evaluations",
    label: "Évaluations",
    description: "Crée des sessions et saisit les notes.",
  },
  {
    key: "attendance",
    label: "Présences",
    description: "Prend et consulte les émargements.",
  },
  {
    key: "expenses",
    label: "Dépenses",
    description: "Enregistre et gère les dépenses.",
  },
  {
    key: "settings",
    label: "Paramètres",
    description: "Accès aux paramètres et aux rôles.",
  },
];

/** Résout le libellé d'une permission à partir de sa clé. */
export function getPermissionLabel(key: string): string {
  return (
    ROLE_PERMISSIONS.find((permission) => permission.key === key)?.label ??
    key
  );
}