// --------------------------------------
// Programme de parrainage — constantes partagées (module NON « use server »)
// --------------------------------------
// Contrainte Next.js : les fichiers « use server » ne peuvent exporter que des
// fonctions async — toute constante/valeur exportée casse le build. Les
// constantes de parrainage vivent donc dans ce module « client-safe » et sont
// importées par les Server Actions de src/actions/referral.ts.

/**
 * Récompense FIXE (en FCFA) créditée au parrain lors du PREMIER paiement
 * réussi du filleul — indépendante du montant de l'abonnement souscrit.
 */
export const REFERRAL_REWARD_AMOUNT = 10_000;