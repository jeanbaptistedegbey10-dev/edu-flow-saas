"use client";

import * as React from "react";
import { Loader2Icon, PlusIcon } from "lucide-react";

import type {
  CreateProductServiceInput,
  CreatedProductDTO,
  ProductCategoryDTO,
} from "@/actions/pos";
import {
  createProductServiceAction,
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

/**
 * Sentinelle Radix : le select n'accepte pas de valeur vide, on utilise donc
 * "__none__" pour représenter « aucune catégorie » (produit sans catégorie).
 */
const NONE_CATEGORY = "__none__";

/** Formulaire vierge (article disponible par défaut, catégorie facultative). */
const EMPTY_FORM = {
  name: "",
  categoryId: NONE_CATEGORY,
  price: "",
  isActive: true,
};

/** Article créé par la modale (contrat d'appel avec la vue POS). */
export type CreatedProduct = CreatedProductDTO;

/**
 * Modale de création d'un article du catalogue de la caisse (POS).
 *
 * Permet à l'administrateur d'ajouter un produit/service (nom, prix en FCFA,
 * catégorie OPTIONNELLE, disponibilité). La catégorie est dynamique : elle
 * peut être choisie parmi les catégories de l'organisation, créée à la volée
 * dans cette même modale, ou tout simplement omise (le produit apparaîtra sous
 * le filtre « Sans catégorie » du POS).
 */
export function CreateProductDialog({
  open,
  onOpenChange,
  onCreated,
  categories,
  onCategoryCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Appelé après création réussie (avec l'article persisté). */
  onCreated: (product: CreatedProduct) => void;
  /** Catégories personnalisées disponibles (fournies par la vue POS). */
  categories: ProductCategoryDTO[];
  /** Notifie la vue parente qu'une catégorie a été créée à la volée. */
  onCategoryCreated: (category: ProductCategoryDTO) => void;
}) {
  const [form, setForm] = React.useState(EMPTY_FORM);
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  // Création rapide d'une catégorie à la volée (inline, dans la modale).
  const [quickCategory, setQuickCategory] = React.useState("");
  const [isCreatingCategory, setIsCreatingCategory] = React.useState(false);

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) {
      setForm(EMPTY_FORM);
      setQuickCategory("");
      setError(null);
    }
    onOpenChange(nextOpen);
  };

  const handleCreateCategory = async () => {
    const name = quickCategory.trim();
    if (name.length < 2) {
      setError("Le libellé de la catégorie doit contenir au moins 2 caractères.");
      return;
    }
    setError(null);
    setIsCreatingCategory(true);

    try {
      const result = await saveProductCategoryAction({ name });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      onCategoryCreated(result.category);
      setForm((prev) => ({ ...prev, categoryId: result.category.id }));
      setQuickCategory("");
    } catch {
      setError("Impossible de créer la catégorie pour le moment.");
    } finally {
      setIsCreatingCategory(false);
    }
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      const input: CreateProductServiceInput = {
        name: form.name,
        categoryId:
          form.categoryId === NONE_CATEGORY ? null : form.categoryId,
        unitPrice: Number(form.price.replace(",", ".")),
        isActive: form.isActive,
      };

      const result = await createProductServiceAction(input);

      if (!result.ok) {
        setError(result.message);
        return;
      }

      onCreated(result.product);
      handleOpenChange(false);
    } catch {
      setError(
        "Impossible de créer l'article pour le moment. Réessayez plus tard."
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Ajouter un article au catalogue</DialogTitle>
          <DialogDescription>
            Créez un produit ou un service vendu au comptoir (livre,
            traduction, photocopie…) pour pouvoir l’encaisser immédiatement
            dans la caisse.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <div className="grid gap-1.5">
            <Label htmlFor="create-product-name">Nom de l’article *</Label>
            <Input
              id="create-product-name"
              name="name"
              placeholder="Ex : Livre d'apprentissage B1"
              value={form.name}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, name: event.target.value }))
              }
              maxLength={120}
              required
              autoFocus
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="create-product-price">Prix (FCFA) *</Label>
              <Input
                id="create-product-price"
                name="unitPrice"
                inputMode="decimal"
                placeholder="Ex : 12000"
                value={form.price}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, price: event.target.value }))
                }
                required
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="create-product-category">Catégorie</Label>
              <Select
                value={form.categoryId}
                onValueChange={(value) =>
                  setForm((prev) => ({ ...prev, categoryId: value }))
                }
              >
                <SelectTrigger id="create-product-category" className="w-full">
                  <SelectValue placeholder="Aucune catégorie" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE_CATEGORY}>Sans catégorie</SelectItem>
                  {categories.map((category) => (
                    <SelectItem key={category.id} value={category.id}>
                      {category.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Création rapide d'une catégorie à la volée */}
          <div className="grid gap-1.5 rounded-md border bg-muted/30 p-3">
            <Label htmlFor="create-product-quick-category" className="text-xs">
              Ou créez une catégorie à la volée
            </Label>
            <div className="flex items-center gap-2">
              <Input
                id="create-product-quick-category"
                placeholder="Nouvelle catégorie…"
                value={quickCategory}
                onChange={(event) => setQuickCategory(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    void handleCreateCategory();
                  }
                }}
              />
              <Button
                type="button"
                variant="secondary"
                size="sm"
                disabled={isCreatingCategory || quickCategory.trim().length < 2}
                onClick={() => void handleCreateCategory()}
              >
                {isCreatingCategory ? (
                  <Loader2Icon className="size-4 animate-spin" />
                ) : (
                  <PlusIcon className="size-4" />
                )}
                <span className="sr-only sm:not-sr-only">Ajouter</span>
              </Button>
            </div>
          </div>

          {/* Disponibilité à la vente (catalogue actif) */}
          <label
            htmlFor="create-product-active"
            className="flex cursor-pointer items-center gap-2 rounded-md border bg-muted/30 px-3 py-2.5 text-sm"
          >
            <input
              id="create-product-active"
              type="checkbox"
              checked={form.isActive}
              onChange={(event) =>
                setForm((prev) => ({
                  ...prev,
                  isActive: event.target.checked,
                }))
              }
              className="size-4 shrink-0 rounded border-input accent-primary"
            />
            <span>
              Article disponible à la vente
              <span className="block text-xs text-muted-foreground">
                Un article indisponible n’apparaît plus dans la grille du POS.
              </span>
            </span>
          </label>

          {error ? (
            <p
              role="alert"
              className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive"
            >
              {error}
            </p>
          ) : null}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={isSubmitting}
              onClick={() => handleOpenChange(false)}
            >
              Annuler
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? (
                <Loader2Icon data-icon="inline-start" className="animate-spin" />
              ) : (
                <PlusIcon data-icon="inline-start" />
              )}
              {isSubmitting ? "Création..." : "Créer l'article"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}