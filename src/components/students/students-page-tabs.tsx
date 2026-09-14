"use client";

import * as React from "react";
import { UsersRoundIcon, GitBranchIcon } from "lucide-react";

import type { StudentDTO } from "@/actions/students";
import type { ClassOptionDTO } from "@/actions/classes";
import { ProspectPipeline } from "@/components/crm/prospect-pipeline";
import { ConvertProspectDialog } from "@/components/crm/convert-prospect-dialog";
import { updateLeadStage, type CrmMutationResult } from "@/lib/actions/crm";
import { StudentsView } from "@/components/students/students-view";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ToastNotification } from "@/components/ui/toast";
import type { LeadStage } from "@prisma/client";

type ProspectStudent = StudentDTO & {
  leadStage: LeadStage | null;
  leadSource: string | null;
};

export function StudentsPageTabs({
  students,
  classes,
  registrationFee,
}: {
  students: StudentDTO[];
  classes: ClassOptionDTO[];
  registrationFee: number;
}) {
  const [activeTab, setActiveTab] = React.useState("students");
  const [toast, setToast] = React.useState<string | null>(null);
  const [convertingStudent, setConvertingStudent] = React.useState<StudentDTO | null>(null);

  // Enrichir les données étudiants avec les champs CRM
  const studentsWithCRM: ProspectStudent[] = students.map((s) => ({
    ...s,
    leadStage: (s as unknown as { leadStage: LeadStage | null }).leadStage,
    leadSource: (s as unknown as { leadSource: string | null }).leadSource,
  }));

  const prospects = studentsWithCRM.filter(
    (s) => s.leadStage !== null && s.leadStage !== undefined
  );

  const handleStageChange = async (
    studentId: string,
    stage: LeadStage
  ): Promise<CrmMutationResult> => {
    // For LOST stage, we'd need a reason - use a default or prompt
    // For simplicity, we'll use NO_RESPONSE as default when dragging to LOST
    const result = await updateLeadStage(
      studentId,
      stage,
      stage === "LOST" ? "NO_RESPONSE" : undefined
    );
    if (result.ok) {
      setToast(result.message || "Étape mise à jour.");
    } else {
      setToast(result.message);
    }
    return result;
  };

  const handleConvert = (studentId: string) => {
    const student = students.find((s) => s.id === studentId);
    if (student) setConvertingStudent(student);
  };

  return (
    <>
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList>
          <TabsTrigger value="students" className="gap-2">
            <UsersRoundIcon className="size-4" />
            Étudiants
          </TabsTrigger>
          <TabsTrigger value="prospects" className="gap-2">
            <GitBranchIcon className="size-4" />
            Pipeline Prospects
          </TabsTrigger>
        </TabsList>

        <TabsContent value="students" className="space-y-4">
          <StudentsView
            students={students}
            classes={classes}
            registrationFee={registrationFee}
          />
        </TabsContent>

        <TabsContent value="prospects" className="space-y-4">
          {prospects.length > 0 ? (
            <ProspectPipeline
              prospects={prospects}
              onStageChange={handleStageChange}
              onConvert={handleConvert}
            />
          ) : (
            <div className="flex flex-col items-center justify-center gap-2 px-6 py-16 text-center">
              <div className="flex size-12 items-center justify-center rounded-full bg-muted">
                <GitBranchIcon className="size-6 text-muted-foreground" />
              </div>
              <p className="font-medium">Aucun prospect dans le pipeline</p>
              <p className="max-w-sm text-sm text-muted-foreground">
                Les prospects avec une étape CRM définie apparaîtront ici.
                Passez un étudiant en statut « Prospect » et définissez son étape.
              </p>
            </div>
          )}
        </TabsContent>
      </Tabs>

      <ConvertProspectDialog
        student={convertingStudent}
        classes={classes}
        open={convertingStudent !== null}
        onOpenChange={(open) => {
          if (!open) setConvertingStudent(null);
        }}
      />

      <ToastNotification message={toast} onClose={() => setToast(null)} />
    </>
  );
}
