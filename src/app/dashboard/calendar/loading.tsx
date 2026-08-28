import {
  PageHeaderSkeleton,
  SkeletonCalendar,
} from "@/components/dashboard/loading-skeletons";

/** État de chargement instantané du calendrier (tâches & événements). */
export default function Loading() {
  return (
    <div className="grid gap-6">
      <PageHeaderSkeleton />
      <SkeletonCalendar />
    </div>
  );
}
