"use client";

import * as React from "react";
import { CheckIcon, Loader2Icon, PencilIcon, PlusIcon, Trash2Icon } from "lucide-react";

import type { ProductCategoryDTO } from "@/actions/pos";
import {
  deleteProductCategoryAction,
  saveProductCategoryAction,
} from "@/actions/pos";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * Dialogue « Gérer les catégories » du catalogue caisse : l'organisation
 * ajoute, renomme ou supprime ses propres catégories de produits/services.
 * Aucune catégorie système figée — tout est personnalisé et dynamique.
 */
export function CategoryManagerDialog({
  open,
  onOpenChange,
  categories,
  onChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  categories: ProductCategoryDTO[];
  onChange: (categories: ProductCategoryDTO[]) => void;
}) {
  const [newName, setNewName] = React.useState("");
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [editName, setEditName] = React.useState("");
  const [pendingId, setPendingId] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [isSaving, setIsaving] = React.useState(false);

  const resetLocal = () => {
    setNewName("");
    setEditingId(null);
    setEditName("");
    setError(null);
  };

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) resetLocal();
    onOpenChange(nextOpen);
  };

  const handleAdd = async () => {
    const name = newName.trim();
    if (name.length < 2) {
      setError("Le libellé doit contenir au moins 2 caractères.");
      return;
    }
    setError(null);
    setIsaving(true);
    setPendingId("__new__");
    try {
      const result = await saveProductCategoryAction({ name });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      onChange([...categories, result.category]);
      setNewName("");
    } catch {
      setError("Impossible de créer la catégorie.");
    } finally {
      setIsaving(false);
      setPendingId(null);
    }
  };

  const handleRename = async (id: string) => {
    const name = editName.trim();
    if (name.length < 2) {
      setError("Le libellé doit contenir au moins 2 caractères.");
      return;
    }
    setError(null);
    setIsaving(true);
    setPendingId(id);
    try {
      const result = await saveProductCategoryAction({ id, name });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      onChange(
        categories.map((category) =>
          category.id === id ? result.category : category
        )
      );
      setEditingId(null);
      setEditName("");
    } catch {
      setError("Impossible de renommer la catégorie.");
    } finally {
      setIsaving(false);
      setPendingId(null);
    }
  };

  const handleDelete = async (id: string, name: string) => {
    const confirmed = window.confirm(
      `Supprimer la catégorie « ${name} » ?

Les articles rattachés deviendront « sans catégorie » (ils ne sont pas supprimés).`
    );
    if (!confirmed) return;
    setError(null);
    setIsaving(true);
    setPendingId(id);
    try {
      const result = await deleteProductCategoryAction(id);
      if (!result.ok) {
        setError(result.message);
        return;
      }
      onChange(categories.filter((category) => category.id !== id));
    } catch {
      setError("Impossible de supprimer la catégorie.");
    } finally {
      setIsaving(false);
      setPendingId(null);
    }
  };
  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Gérer les catégories</DialogTitle>
          <DialogDescription>
            Ajoutez, renommez ou supprimez vos catégories de produits. Le champ
            catégorie est optionnel lors de la création d’un article.
          </DialogDescription>
        </DialogHeader>

        {error ? (
          <p className="text-sm text-destructive">{error}</p>
        ) : null}

        {/* Ajout */}
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void handleAdd();
          }}
          className="flex items-end gap-2"
        >
          <div className="grid w-full">
            <Label htmlFor="cat-new">Nouvelle catégorie</Label>
            <Input
              id="cat-new"
              placeholder="Ex: Livres & Fascicules"
              value={newName}
              onChange={(event) => setNewName(event.target.value)}
              disabled={isSaving}
            />
          </div>
          <Button
            type="submit"
            size="sm"
            disabled={isSaving || newName.trim().length < 2}
          >
            <PlusIcon />
          </Button>
        </form>

        {/* Liste */}
        {categories.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Aucune catégorie. Créez-en une ci-dessus.
          </p>
        ) : (
          <ul className="space-y-2">
            {categories.map((category) => {
              const isPending =
                pendingId === category.id || pendingId === "__new__";
              const isEditing = editingId === category.id;
              return (
                <li key={category.id} className="flex items-center gap-2">
                  {isEditing ? (
                    <Input
                      value={editName}
                      onChange={(event) => setEditName(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          event.preventDefault();
                          void handleRename(category.id);
                        }
                      }}
                      autoFocus
                    />
                  ) : (
                    <span className="flex-1">{category.name}</span>
                  )}
                  {isEditing ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => void handleRename(category.id)}
                      disabled={isSaving}
                    >
                      <CheckIcon />
                    </Button>
                  ) : (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => {
                        setEditingId(category.id);
                        setEditName(category.name);
                      }}
                      disabled={isSaving}
                    >
                      <PencilIcon />
                    </Button>
                  )}
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    onClick={() =>
                      void handleDelete(category.id, category.name)
                    }
                    disabled={isSaving || isPending}
                  >
                    {isPending ? (
                      <Loader2Icon className="animate-spin" />
                    ) : (
                      <Trash2Icon />
                    )}
                  </Button>
                </li>
              );
            })}
          </ul>
        )}

        <DialogFooter />
      </DialogContent>
    </Dialog>
  );
}
