import {
  getArchiveYears,
  getArchivedClassesOverview,
} from "@/actions/archives";
import { ArchivesView } from "@/components/archives/archives-view";

export const metadata = {
  title: "Archives | EduFlow",
  description:
    "Classes clôturées par année académique : effectifs d'époque, financiers scellés et recherche globale.",
};

export default async function ArchivesPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string }>;
}) {
  const [years, params] = await Promise.all([getArchiveYears(), searchParams]);
  const selectedYear =
    params.year && years.includes(params.year) ? params.year : (years[0] ?? null);
  const classes = selectedYear ? await getArchivedClassesOverview(selectedYear) : [];

  return (
    <ArchivesView years={years} initialYear={selectedYear} initialClasses={classes} />
  );
}
