"use client";

import * as React from "react";

import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import type { TeacherGradeTrendStudentDTO } from "@/actions/dashboard";

const numberFormatter = new Intl.NumberFormat("fr-FR", {
  maximumFractionDigits: 1,
});

/** Palette de couleurs par ligne d'étudiant. */
const LINE_COLORS = [
  "#6366f1",
  "#10b981",
  "#f59e0b",
  "#ec4899",
  "#06b6d4",
  "#8b5cf6",
  "#ef4444",
  "#84cc16",
];

const TOOLTIP_CONTENT_STYLE: React.CSSProperties = {
  borderRadius: 8,
  border: "1px solid var(--border)",
  background: "var(--card)",
  color: "var(--card-foreground)",
  fontSize: 12,
};

/**
 * Courbe d'évolution des notes (moyenne /100) par élève, au fil des
 * évaluations. Chaque étudiant est une ligne suivie sur l'axe des évaluations.
 */
export function TeacherGradeTrendChart({
  students,
}: {
  students: TeacherGradeTrendStudentDTO[];
}) {
  const chartData = React.useMemo(() => {
    // Catégories (évaluations) unifiées dans leur ordre d'apparition.
    const categories: string[] = [];
    for (const student of students) {
      for (const point of student.points) {
        if (!categories.includes(point.evaluationTitle)) {
          categories.push(point.evaluationTitle);
        }
      }
    }

    return categories.map((title) => {
      const row: Record<string, string | number> = { evaluationTitle: title };
      for (const student of students) {
        const point = student.points.find(
          (p) => p.evaluationTitle === title
        );
        if (point) row[student.studentId] = point.score;
      }
      return row;
    });
  }, [students]);

  if (students.length === 0 || chartData.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-12 text-center">
        <p className="text-sm font-medium">Aucune note à suivre</p>
        <p className="max-w-sm text-sm text-muted-foreground">
          Saisissez des notes depuis « Évaluations &amp; Examens » pour
          visualiser l&apos;évolution de chaque élève.
        </p>
      </div>
    );
  }

  return (
    <div className="h-[300px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={chartData} margin={{ top: 12, right: 24, bottom: 8, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
          <XAxis
            dataKey="evaluationTitle"
            tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
            axisLine={{ stroke: "var(--border)" }}
            tickLine={{ stroke: "var(--border)" }}
            interval={0}
            angle={-18}
            textAnchor="end"
            height={64}
          />
          <YAxis
            domain={[0, 100]}
            tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
            axisLine={{ stroke: "var(--border)" }}
            tickLine={{ stroke: "var(--border)" }}
            width={38}
            tickFormatter={(value) => `${value}`}
          />
          <Tooltip
            contentStyle={TOOLTIP_CONTENT_STYLE}
            formatter={(value) => `${numberFormatter.format(Number(value))} / 100`}
          />
          <Legend wrapperStyle={{ fontSize: 12, color: "var(--muted-foreground)" }} />
          {students.map((student, index) => (
            <Line
              key={student.studentId}
              type="monotone"
              dataKey={student.studentId}
              name={`${student.studentName}${
                student.className ? ` (${student.className})` : ""
              }`}
              stroke={LINE_COLORS[index % LINE_COLORS.length]}
              strokeWidth={2}
              dot={{ r: 3 }}
              connectNulls
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
