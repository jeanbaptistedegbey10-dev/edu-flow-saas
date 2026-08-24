import { getCalendarEvents } from "@/actions/calendar";
import { CalendarView } from "@/components/calendar/calendar-view";

export const metadata = {
  title: "Calendrier | EduFlow",
  description:
    "Vue d'ensemble des échéances des tâches et événements de votre organisation.",
};

export default async function CalendarPage() {
  const events = await getCalendarEvents();

  return <CalendarView events={events} />;
}