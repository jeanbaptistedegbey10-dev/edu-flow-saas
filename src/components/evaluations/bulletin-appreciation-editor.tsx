"use client";

import * as React from "react";
import {
  Loader2Icon,
  PencilIcon,
  RotateCcwIcon,
  SaveIcon,
  XIcon,
} from "lucide-react";

import { saveBulletinAppreciation } from "@/actions/evaluations";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { MAX_APPRECIATION_LENGTH } from "@/lib/premium-report";
import { cn } from "@/lib/utils";

/**
 * Éditeur de l'appréciation d'un bulletin (bouton « Modifier l'appréciation »).
 *
 * Le texte affiché par défaut est celui généré automatiquement à partir des
 * résultats (« 3 modules validés sur 4… »). Le professeur / l'administrateur
 * peut le remplacer par un texte libre : celui-ci est PERSISTÉ côté serveur
 * (`BulletinAppreciation`) et s'affiche ensuite sur le bulletin, à
 * l'impression et dans le document téléchargé.
 *
 * Un texte vide enregistré = suppression du texte personnalisé : le bulletin
 * redevient automatiquement généré.
 *
 * Le composant est rendu HORS de `#print-area` et porte l'attribut
 * `data-print-hide` : il ne sort JAMAIS sur l'imprimante.
 */
export function BulletinAppreciationEditor({
  studentId,
  scope,
  /** Texte actuellement affiché sur le bulletin (auto ou personnalisé). */
  value,
  /** Texte généré automatiquement (repli / bouton « Texte automatique »). */
  automaticText,
  /** `true` si `value` est un texte personnalisé (badge « Personnalisée »). */
  isCustom,
  /** Classe archivée : le bulletin est figé (lecture seule). */
  readOnly = false,
  /** Rappel du contexte affiché au-dessus du champ. */
  label = "Appréciation de l'enseignant",
  /** Appliqué dès l'enregistrement : le bulletin est re-rendu. */
  onSaved,
}: {
  studentId: string;
  /** Portée `exam:<evaluationId>` ou `recap:<classId>`. */
  scope: string;
  value: string;
  automaticText: string;
  isCustom: boolean;
  readOnly?: boolean;
  label?: string;
  onSaved: (text: string, message: string) => void;
}): React.ReactElement {
  const [editing, setEditing] = React.useState(false);
  const [draft, setDraft] = React.useState(value);
  const [draftSource, setDraftSource] = React.useState(value);
  const [saving, setSaving] = React.useState(false);
  const [feedback, setFeedback] = React.useState<{
    kind: "success" | "error";
    message: string;
  } | null>(null);

  // Le brouillon est réinitialisé quand le texte affiché change ET que
  // l'éditeur n'est pas ouvert (pattern React « adjusting state when a prop
  // changes », évite un effet en cascade).
  if (!editing && draftSource !== value) {
    setDraftSource(value);
    setDraft(value);
  }

  const persist = React.useCallback(
    async (nextText: string) => {
      setSaving(true);
      setFeedback(null);
      try {
        const result = await saveBulletinAppreciation({
          studentId,
          scope,
          text: nextText,
        });

        if (!result.ok) {
          setFeedback({ kind: "error", message: result.message });
          return;
        }

        onSaved(result.text, result.message);
        setEditing(false);
        setFeedback({ kind: "success", message: result.message });
      } catch (error) {
        setFeedback({
          kind: "error",
          message:
            error instanceof Error
              ? error.message
              : "Impossible d'enregistrer l'appréciation.",
        });
      } finally {
        setSaving(false);
      }
    },
    [onSaved, scope, studentId]
  );

  return (
    <section
      data-print-hide="true"
      className="rounded-xl border border-dashed border-indigo-300 bg-indigo-50/50 p-3 print:hidden"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Label className="text-xs font-bold tracking-wider text-muted-foreground uppercase">
            {label}
          </Label>
          <span
            className={cn(
              "rounded-full px-2 py-0.5 text-[10px] font-extrabold uppercase",
              isCustom
                ? "bg-indigo-600 text-white"
                : "bg-slate-200 text-muted-foreground"
            )}
          >
            {isCustom ? "Personnalisée" : "Texte automatique"}
          </span>
        </div>

        {!editing ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={readOnly}
            onClick={() => {
              setDraftSource(value);
              setDraft(value);
              setEditing(true);
              setFeedback(null);
            }}
            title={
              readOnly
                ? "Classe archivée : l'appréciation est figée (lecture seule)."
                : "Remplacer le texte automatique par un commentaire personnalisé"
            }
          >
            <PencilIcon data-icon="inline-start" />
            Modifier l&apos;appréciation
          </Button>
        ) : null}
      </div>

      {!editing ? (
        <p className="mt-2 text-xs leading-relaxed whitespace-pre-wrap text-foreground">
          {value}
        </p>
      ) : (
        <div className="mt-2 space-y-2">
          <Textarea
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            rows={4}
            maxLength={MAX_APPRECIATION_LENGTH}
            aria-label={label}
            placeholder="Ex : Excellent trimestre, l'élève est très attentif et progresse rapidement."
          />
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-[11px] text-muted-foreground">
              {draft.length} / {MAX_APPRECIATION_LENGTH} caractères — vide = revenir au
              texte automatique.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                size="sm"
                disabled={saving}
                onClick={() => void persist(draft)}
              >
                {saving ? (
                  <Loader2Icon data-icon="inline-start" className="animate-spin" />
                ) : (
                  <SaveIcon data-icon="inline-start" />
                )}
                Enregistrer
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={saving || draft === automaticText}
                onClick={() => setDraft(automaticText)}
                title="Remplir le champ avec le texte généré automatiquement"
              >
                <RotateCcwIcon data-icon="inline-start" />
                Texte automatique
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={saving}
                onClick={() => {
                  setDraftSource(value);
                  setDraft(value);
                  setEditing(false);
                  setFeedback(null);
                }}
              >
                <XIcon data-icon="inline-start" />
                Annuler
              </Button>
            </div>
          </div>
        </div>
      )}

      {isCustom && !editing ? (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="mt-2"
          disabled={readOnly || saving}
          onClick={() => void persist("")}
        >
          <RotateCcwIcon data-icon="inline-start" />
          Supprimer le texte personnalisé
        </Button>
      ) : null}

      {feedback ? (
        <p
          role="status"
          className={cn(
            "mt-2 rounded-md px-3 py-2 text-xs",
            feedback.kind === "success"
              ? "bg-emerald-50 text-emerald-700"
              : "bg-destructive/10 text-destructive"
          )}
        >
          {feedback.message}
        </p>
      ) : null}
    </section>
  );
}