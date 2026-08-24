import { auth } from "@/auth";
import {
  getNotificationPreferences,
  getUserProfile,
} from "@/actions/settings";
import { SettingsView } from "@/components/settings/settings-view";

export const metadata = {
  title: "Paramètres | EduFlow",
  description:
    "Gérez votre profil utilisateur et vos préférences de notification.",
};

export default async function SettingsPage() {
  const session = await auth();

  // Requêtes indépendantes exécutées en parallèle pour minimiser la latence.
  const [profile, preferences] = await Promise.all([
    getUserProfile(),
    getNotificationPreferences(),
  ]);

  return (
    <SettingsView
      profile={profile}
      emailNotifications={preferences.emailNotifications}
      role={session?.user?.role ?? "STAFF"}
    />
  );
}