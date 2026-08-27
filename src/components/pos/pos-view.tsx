"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  BookOpenIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  CopyIcon,
  HistoryIcon,
  LanguagesIcon,
  Loader2Icon,
  MinusIcon,
  PlusIcon,
  PrinterIcon,
  ReceiptTextIcon,
  RefreshCwIcon,
  ShoppingCartIcon,
  Trash2Icon,
  UserRoundIcon,
  UserRoundXIcon,
  WalletIcon,
} from "lucide-react";

import type { OrganizationProfileDTO } from "@/actions/payments";
import {
  createSaleAction,
  getSaleReceiptData,
  getSalesHistory,
  type PosClientOption,
  type PosStatsDTO,
  type ProductServiceDTO,
  type SaleHistoryDTO,
  type SaleReceiptData,
  type SalesHistoryPageDTO,
} from "@/actions/pos";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { SaleReceiptDialog } from "@/components/pos/sale-receipt-dialog";
import { getPaymentMethodLabel } from "@/lib/payment-status";

const amountFormatter = new Intl.NumberFormat("fr-FR", {
  maximumFractionDigits: 0,
});

// Formatage déterministe (locale + fuseau fixes) pour éviter tout écart
// d'hydratation.
const dateTimeFormatter = new Intl.DateTimeFormat("fr-FR", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "UTC",
});

/** Nombre de lignes par page dans l'historique des ventes. */
const SALES_HISTORY_PAGE_SIZE = 10;

const PAYMENT_METHOD_OPTIONS = [
  "CASH",
  "MOBILE_MONEY",
  "BANK_TRANSFER",
  "CREDIT_CARD",
  "CHECK",
] as const;

const CATEGORY_FILTERS = [
  { value: "ALL", label: "Tout" },
  { value: "BOOK", label: "Livres" },
  { value: "TRANSLATION", label: "Traduction" },
  { value: "COPY_SERVICE", label: "Photocopie" },
] as const;

type CategoryFilter = (typeof CATEGORY_FILTERS)[number]["value"];

/** Métadonnées d'affichage par catégorie de produit. */
const CATEGORY_META: Record<
  ProductServiceDTO["category"],
  { label: string; icon: React.ComponentType<{ className?: string }>; classes: string }
> = {
  BOOK: {
    label: "Livre",
    icon: BookOpenIcon,
    classes:
      "border-indigo-200/60 bg-indigo-50 text-indigo-700 dark:border-indigo-500/20 dark:bg-indigo-500/10 dark:text-indigo-400",
  },
  TRANSLATION: {
    label: "Traduction",
    icon: LanguagesIcon,
    classes:
      "border-sky-200/60 bg-sky-50 text-sky-700 dark:border-sky-500/20 dark:bg-sky-500/10 dark:text-sky-400",
  },
  COPY_SERVICE: {
    label: "Photocopie",
    icon: CopyIcon,
    classes:
      "border-slate-200/60 bg-slate-50 text-slate-700 dark:border-slate-500/20 dark:bg-slate-500/10 dark:text-slate-400",
  },
};

type CartLine = {
  id: string;
  name: string;
  unitPrice: number;
  quantity: number;
};

function StatCard({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string | number;
}) {
  return (
    <div className="rounded-xl border border-slate-200/80 bg-gradient-to-b from-white to-slate-50/40 p-4 shadow-sm transition-all duration-200 hover:shadow-md dark:border-slate-800 dark:from-card dark:to-card">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">{label}</p>
        <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <Icon className="size-4.5" />
        </div>
      </div>
      <p className="mt-1 text-2xl font-bold tracking-tight tabular-nums">
        {value}
      </p>
    </div>
  );
}

// --------------------------------------
// Onglet : Historique des ventes
// --------------------------------------

/**
 * Panneau « Historique des ventes » : tableau paginé des ventes de
 * l'organisation avec réimpression de la facturette d'origine.
 *
 * Le panneau est monté à chaque ouverture de l'onglet (contenu Radix Tabs
 * non forcé) : les données sont donc toujours fraîches, y compris après une
 * vente venant d'être encaissée.
 */
function SalesHistoryPanel({
  organization,
}: {
  organization: OrganizationProfileDTO;
}) {
  const [page, setPage] = React.useState(1);
  const [data, setData] = React.useState<SalesHistoryPageDTO | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [reprintingId, setReprintingId] = React.useState<string | null>(null);
  const [receiptSale, setReceiptSale] = React.useState<SaleReceiptData | null>(
    null
  );

  /**
   * Charge une page donnée de l'historique.
   *
   * Aucun setState synchrone : indispensable car la fonction est invoquée
   * depuis un effet au montage de l'onglet (règle react-hooks
   * set-state-in-effect). Le retour visuel « chargement » est déclenché par
   * les handlers utilisateurs via `beginLoad`.
   */
  const loadPage = React.useCallback(async (targetPage: number) => {
    try {
      const result = await getSalesHistory(targetPage, SALES_HISTORY_PAGE_SIZE);
      setData(result);
      setPage(result.page);
      setError(null);
    } catch {
      setError(
        "Impossible de charger l'historique des ventes pour le moment."
      );
    } finally {
      setIsLoading(false);
    }
  }, []);

  /** Déclenche un chargement avec retour visuel immédiat (clic utilisateur). */
  const beginLoad = (targetPage: number) => {
    setIsLoading(true);
    void loadPage(targetPage);
  };

  React.useEffect(() => {
    // Chargement initial à l'ouverture de l'onglet : motif légitime de
    // synchronisation avec un système externe (server action). Tous les
    // setState n'interviennent qu'APRÈS la résolution de la promesse ;
    // la règle est désactivée car l'analyseur statique ne remonte pas
    // au-delà de l'appel de fonction asynchrone.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadPage(1);
  }, [loadPage]);

  /** Recharge les données complètes d'une vente puis ouvre la facturette. */
  const handleReprint = async (sale: SaleHistoryDTO) => {
    setError(null);
    setReprintingId(sale.id);

    try {
      const result = await getSaleReceiptData(sale.id);

      if (!result.ok) {
        setError(result.message);
        return;
      }

      setReceiptSale(result.sale);
    } finally {
      setReprintingId(null);
    }
  };

  const sales = data?.sales ?? [];
  const total = data?.total ?? 0;
  const totalPages = data?.totalPages ?? 1;
  const hasSales = total > 0;

  return (
    <section
      aria-label="Historique des ventes"
      className="rounded-xl border border-slate-200/80 bg-card text-card-foreground shadow-sm transition-all duration-200 dark:border-slate-800"
    >
      <div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3">
        <div>
          <h3 className="text-sm font-semibold">Historique des ventes</h3>
          <p className="text-xs text-muted-foreground">
            Toutes les ventes comptoir, de la plus récente à la plus ancienne.
          </p>
        </div>
        {hasSales ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={isLoading}
            onClick={() => beginLoad(page)}
          >
            <RefreshCwIcon data-icon="inline-start" />
            Actualiser
          </Button>
        ) : null}
      </div>

      {error ? (
        <p
          role="alert"
          className="mx-4 mt-3 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          {error}
        </p>
      ) : null}

      {!hasSales && !isLoading && !error ? (
        <div className="flex flex-col items-center justify-center gap-2 px-6 py-16 text-center">
          <div className="flex size-12 items-center justify-center rounded-full bg-muted">
            <HistoryIcon className="size-6 text-muted-foreground" />
          </div>
          <p className="font-medium">Aucune vente enregistrée</p>
          <p className="max-w-sm text-sm text-muted-foreground">
            Les ventes réalisées depuis l’onglet « Nouvelle vente » apparaîtront
            ici avec leur facturette réimprimable.
          </p>
        </div>
      ) : (
        <>
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Référence</TableHead>
                <TableHead>Date & heure</TableHead>
                <TableHead>Client / Étudiant</TableHead>
                <TableHead>Caissier</TableHead>
                <TableHead className="text-right">Total FCFA</TableHead>
                <TableHead>Mode de paiement</TableHead>
                <TableHead className="text-right">
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={7} className="py-10 text-center text-sm text-muted-foreground">
                    Chargement de l’historique...
                  </TableCell>
                </TableRow>
              ) : (
                sales.map((sale) => (
                  <TableRow key={sale.id}>
                    <TableCell className="font-mono text-xs font-medium tracking-wide">
                      {sale.reference}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-muted-foreground tabular-nums">
                      {dateTimeFormatter.format(sale.createdAt)}
                    </TableCell>
                    <TableCell className="font-medium">
                      {sale.clientName}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {sale.cashierName}
                    </TableCell>
                    <TableCell className="text-right font-semibold tabular-nums">
                      {amountFormatter.format(sale.netAmount)}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {sale.paymentMethod
                        ? getPaymentMethodLabel(sale.paymentMethod)
                        : "—"}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={reprintingId !== null}
                        onClick={() => void handleReprint(sale)}
                        title={`Réimprimer la facturette ${sale.reference}`}
                      >
                        {reprintingId === sale.id ? (
                          <Loader2Icon data-icon="inline-start" className="animate-spin" />
                        ) : (
                          <PrinterIcon data-icon="inline-start" />
                        )}
                        Réimprimer facturette
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>

          {/* Pagination */}
          <div className="flex flex-wrap items-center justify-between gap-2 border-t px-4 py-3 text-xs text-muted-foreground">
            <span>
              {amountFormatter.format(total)} vente{total > 1 ? "s" : ""} au
              total
            </span>
            <div className="flex items-center gap-2">
              <span className="tabular-nums">
                Page {data?.page ?? page} sur {totalPages}
              </span>
              <Button
                type="button"
                variant="outline"
                size="icon-sm"
                aria-label="Page précédente"
                disabled={(data?.page ?? page) <= 1 || isLoading}
                onClick={() => beginLoad((data?.page ?? page) - 1)}
              >
                <ChevronLeftIcon />
              </Button>
              <Button
                type="button"
                variant="outline"
                size="icon-sm"
                aria-label="Page suivante"
                disabled={(data?.page ?? page) >= totalPages || isLoading}
                onClick={() => beginLoad((data?.page ?? page) + 1)}
              >
                <ChevronRightIcon />
              </Button>
            </div>
          </div>
        </>
      )}

      {/* Facturette de réimpression (même document que l'original) */}
      <SaleReceiptDialog
        sale={receiptSale}
        organization={organization}
        open={receiptSale !== null}
        onOpenChange={(open) => {
          if (!open) setReceiptSale(null);
        }}
        title="Réimpression — Facturette"
        description="Aperçu strictement identique au ticket d’origine. Imprimez-le ou enregistrez-le en PDF via la fenêtre d’impression du navigateur."
      />
    </section>
  );
}

// --------------------------------------
// Vue principale
// --------------------------------------

export function PosView({
  products,
  clients,
  stats,
  organization,
}: {
  products: ProductServiceDTO[];
  clients: PosClientOption[];
  stats: PosStatsDTO;
  organization: OrganizationProfileDTO;
}) {
  const router = useRouter();

  const [categoryFilter, setCategoryFilter] =
    React.useState<CategoryFilter>("ALL");
  const [cart, setCart] = React.useState<CartLine[]>([]);
  const [clientValue, setClientValue] = React.useState("walk-in");
  const [discountRaw, setDiscountRaw] = React.useState("");
  const [paymentMethod, setPaymentMethod] = React.useState<string>("CASH");
  const [isCheckingOut, setIsCheckingOut] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [lastSale, setLastSale] = React.useState<SaleReceiptData | null>(null);
  const [receiptOpen, setReceiptOpen] = React.useState(false);

  /** Articles filtrés par catégorie sélectionnée. */
  const filteredProducts = React.useMemo(() => {
    if (categoryFilter === "ALL") return products;
    return products.filter((product) => product.category === categoryFilter);
  }, [products, categoryFilter]);

  /** Regroupement des clients pour le Select (étudiants / candidats voyage). */
  const studentClients = React.useMemo(
    () => clients.filter((client) => client.kind === "STUDENT"),
    [clients]
  );
  const candidateClients = React.useMemo(
    () => clients.filter((client) => client.kind === "TRAVEL_CANDIDATE"),
    [clients]
  );

  // Totaux du panier.
  const subtotal = cart.reduce(
    (sum, line) => sum + line.unitPrice * line.quantity,
    0
  );
  const discount = Math.min(
    Math.max(Number(discountRaw.replace(",", ".")) || 0, 0),
    subtotal
  );
  const total = subtotal - discount;

  /** Ajoute un article au panier (ou incrémente sa quantité). */
  const addToCart = (product: ProductServiceDTO) => {
    setError(null);
    setCart((prev) => {
      const existing = prev.find((line) => line.id === product.id);

      if (existing) {
        return prev.map((line) =>
          line.id === product.id
            ? { ...line, quantity: line.quantity + 1 }
            : line
        );
      }

      return [
        ...prev,
        {
          id: product.id,
          name: product.name,
          unitPrice: product.unitPrice,
          quantity: 1,
        },
      ];
    });
  };

  const changeQuantity = (id: string, delta: number) => {
    setCart((prev) =>
      prev
        .map((line) =>
          line.id === id
            ? { ...line, quantity: line.quantity + delta }
            : line
        )
        .filter((line) => line.quantity > 0)
    );
  };

  const removeLine = (id: string) => {
    setCart((prev) => prev.filter((line) => line.id !== id));
  };

  const clearCart = () => {
    setCart([]);
    setDiscountRaw("");
    setClientValue("walk-in");
    setPaymentMethod("CASH");
  };

  /** Encaisse la vente puis ouvre la facturette. */
  const handleCheckout = async () => {
    if (cart.length === 0) return;

    setError(null);
    setIsCheckingOut(true);

    try {
      let clientKind: "WALK_IN" | "STUDENT" | "TRAVEL_CANDIDATE" = "WALK_IN";
      let clientId: string | null = null;

      if (clientValue.startsWith("student:")) {
        clientKind = "STUDENT";
        clientId = clientValue.slice("student:".length);
      } else if (clientValue.startsWith("candidate:")) {
        clientKind = "TRAVEL_CANDIDATE";
        clientId = clientValue.slice("candidate:".length);
      }

      const result = await createSaleAction({
        clientKind,
        clientId,
        items: cart.map((line) => ({
          productServiceId: line.id,
          quantity: line.quantity,
        })),
        discount,
        paymentMethod,
      });

      if (!result.ok) {
        setError(result.message);
        return;
      }

      setLastSale(result.sale);
      setReceiptOpen(true);
      clearCart();
      router.refresh();
    } finally {
      setIsCheckingOut(false);
    }
  };

  return (
    <div className="flex flex-1 flex-col gap-4 p-4 md:gap-6 md:p-6">
      {/* En-tête */}
      <div>
        <h2 className="text-2xl font-semibold tracking-tight">Caisse / POS</h2>
        <p className="text-base text-muted-foreground">
          Ventes rapides au comptoir : livres, traductions assermentées,
          photocopies et services annexes.
        </p>
      </div>

      {/* Onglets : Nouvelle vente / Historique des ventes */}
      <Tabs defaultValue="new-sale" className="gap-4 md:gap-6">
        <TabsList aria-label="Sections de la caisse">
          <TabsTrigger value="new-sale">
            <ShoppingCartIcon />
            Nouvelle vente
          </TabsTrigger>
          <TabsTrigger value="sales-history">
            <HistoryIcon />
            Historique des ventes
          </TabsTrigger>
        </TabsList>

        <TabsContent
          value="new-sale"
          className="flex flex-col gap-4 data-[state=inactive]:hidden md:gap-6"
        >
      {/* Indicateurs caisse */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          icon={ShoppingCartIcon}
          label="Ventes aujourd'hui"
          value={stats.todaySalesCount}
        />
        <StatCard
          icon={WalletIcon}
          label="Encaissé aujourd'hui"
          value={`${amountFormatter.format(stats.todayRevenue)} F`}
        />
        <StatCard
          icon={ReceiptTextIcon}
          label="Encaissé ce mois"
          value={`${amountFormatter.format(stats.monthRevenue)} F`}
        />
        <StatCard
          icon={BookOpenIcon}
          label="Articles au catalogue"
          value={stats.activeProductsCount}
        />
      </div>

      {/* Interface POS : grille articles + panier */}
      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_400px]">
        {/* Grille des articles */}
        <section aria-label="Catalogue" className="flex flex-col gap-3">
          <div
            role="group"
            aria-label="Filtrer par catégorie"
            className="flex w-fit flex-wrap items-center gap-1 rounded-lg border p-1"
          >
            {CATEGORY_FILTERS.map((filter) => (
              <Button
                key={filter.value}
                type="button"
                variant={categoryFilter === filter.value ? "secondary" : "ghost"}
                size="sm"
                aria-pressed={categoryFilter === filter.value}
                onClick={() => setCategoryFilter(filter.value)}
              >
                {filter.label}
              </Button>
            ))}
          </div>

          {filteredProducts.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed px-6 py-12 text-center">
              <BookOpenIcon className="size-8 text-muted-foreground/50" />
              <p className="font-medium">Aucun article dans cette catégorie</p>
              <p className="max-w-sm text-sm text-muted-foreground">
                Les produits et services sont gérés depuis le catalogue de
                l’organisation.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3 2xl:grid-cols-4">
              {filteredProducts.map((product) => {
                const meta = CATEGORY_META[product.category];

                return (
                  <button
                    key={product.id}
                    type="button"
                    onClick={() => addToCart(product)}
                    className="group flex flex-col items-start gap-2 rounded-xl border border-slate-200/80 bg-gradient-to-b from-white to-slate-50/40 p-3 text-left shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md focus-visible:ring-2 focus-visible:ring-primary dark:border-slate-800 dark:from-card dark:to-card"
                    aria-label={`Ajouter ${product.name} au panier`}
                  >
                    <div className="flex w-full items-start justify-between gap-2">
                      <span className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide">
                        <meta.icon className="size-3" />
                        {meta.label}
                      </span>
                      <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary opacity-60 transition-opacity group-hover:opacity-100">
                        <PlusIcon className="size-3.5" />
                      </span>
                    </div>

                    <span className="text-sm font-semibold leading-snug">
                      {product.name}
                    </span>
                    {product.description ? (
                      <span className="line-clamp-2 text-xs text-muted-foreground">
                        {product.description}
                      </span>
                    ) : null}

                    <span className="mt-auto pt-1 text-sm font-bold tabular-nums">
                      {amountFormatter.format(product.unitPrice)} FCFA
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </section>

        {/* Panier */}
        <aside
          aria-label="Panier de vente"
          className="sticky top-4 flex flex-col gap-3 rounded-xl border bg-card p-4 shadow-sm"
        >
          <header className="flex items-center justify-between gap-2">
            <h3 className="flex items-center gap-1.5 font-semibold">
              <ShoppingCartIcon className="size-4 text-primary" />
              Panier
              {cart.length > 0 ? (
                <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium tabular-nums text-primary">
                  {cart.reduce((sum, line) => sum + line.quantity, 0)}
                </span>
              ) : null}
            </h3>
            {cart.length > 0 ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={clearCart}
                className="text-destructive hover:text-destructive"
              >
                <Trash2Icon data-icon="inline-start" />
                Vider
              </Button>
            ) : null}
          </header>

          {/* Sélection du client */}
          <div className="grid gap-1.5">
            <Label htmlFor="pos-client" className="text-xs">
              Client
            </Label>
            <Select value={clientValue} onValueChange={setClientValue}>
              <SelectTrigger id="pos-client" className="w-full">
                <SelectValue placeholder="Sélectionner un client" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="walk-in">
                  Client de passage (comptoir)
                </SelectItem>
                {studentClients.length > 0 ? (
                  <SelectGroup>
                    <SelectLabel>Étudiants inscrits</SelectLabel>
                    {studentClients.map((client) => (
                      <SelectItem key={`s-${client.id}`} value={`student:${client.id}`}>
                        {client.label}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                ) : null}
                {candidateClients.length > 0 ? (
                  <SelectGroup>
                    <SelectLabel>Candidats voyage</SelectLabel>
                    {candidateClients.map((client) => (
                      <SelectItem
                        key={`c-${client.id}`}
                        value={`candidate:${client.id}`}
                      >
                        {client.label}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                ) : null}
              </SelectContent>
            </Select>
            <p className="flex items-center gap-1 text-[11px] text-muted-foreground">
              {clientValue === "walk-in" ? (
                <>
                  <UserRoundXIcon className="size-3" />
                  Vente anonyme rattachée à la recette globale
                </>
              ) : (
                <>
                  <UserRoundIcon className="size-3" />
                  Vente rattachée au compte du client
                </>
              )}
            </p>
          </div>

          <Separator />

          {/* Lignes du panier */}
          {cart.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Cliquez sur un article pour l’ajouter au panier.
            </p>
          ) : (
            <ul className="flex max-h-72 flex-col gap-2 overflow-y-auto pr-1">
              {cart.map((line) => (
                <li
                  key={line.id}
                  className="flex items-center gap-2 rounded-lg border bg-muted/30 p-2"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{line.name}</p>
                    <p className="text-xs text-muted-foreground tabular-nums">
                      {amountFormatter.format(line.unitPrice)} FCFA ×{" "}
                      {line.quantity} ={" "}
                      <strong className="text-foreground">
                        {amountFormatter.format(line.unitPrice * line.quantity)}
                      </strong>
                    </p>
                  </div>

                  <div
                    role="group"
                    aria-label={`Quantité de ${line.name}`}
                    className="flex shrink-0 items-center gap-0.5"
                  >
                    <Button
                      type="button"
                      variant="outline"
                      size="icon-sm"
                      aria-label="Diminuer la quantité"
                      onClick={() => changeQuantity(line.id, -1)}
                    >
                      <MinusIcon className="size-3.5" />
                    </Button>
                    <span className="w-7 text-center text-sm font-semibold tabular-nums">
                      {line.quantity}
                    </span>
                    <Button
                      type="button"
                      variant="outline"
                      size="icon-sm"
                      aria-label="Augmenter la quantité"
                      onClick={() => changeQuantity(line.id, 1)}
                    >
                      <PlusIcon className="size-3.5" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      className="text-destructive hover:text-destructive"
                      aria-label={`Retirer ${line.name}`}
                      onClick={() => removeLine(line.id)}
                    >
                      <Trash2Icon className="size-3.5" />
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}

          <Separator />

          {/* Remise + moyen de paiement */}
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="pos-discount" className="text-xs">
                Remise (FCFA)
              </Label>
              <Input
                id="pos-discount"
                inputMode="numeric"
                placeholder="0"
                value={discountRaw}
                onChange={(event) => setDiscountRaw(event.target.value)}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="pos-method" className="text-xs">
                Règlement
              </Label>
              <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                <SelectTrigger id="pos-method" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PAYMENT_METHOD_OPTIONS.map((option) => (
                    <SelectItem key={option} value={option}>
                      {getPaymentMethodLabel(option)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Totaux */}
          <dl className="space-y-1 rounded-lg bg-muted/40 p-3 text-sm">
            <div className="flex items-center justify-between">
              <dt className="text-muted-foreground">Sous-total</dt>
              <dd className="tabular-nums">{amountFormatter.format(subtotal)} FCFA</dd>
            </div>
            {discount > 0 ? (
              <div className="flex items-center justify-between">
                <dt className="text-muted-foreground">Remise</dt>
                <dd className="tabular-nums text-amber-600 dark:text-amber-400">
                  − {amountFormatter.format(discount)} FCFA
                </dd>
              </div>
            ) : null}
            <div className="flex items-center justify-between border-t pt-1.5">
              <dt className="font-semibold">NET À PAYER</dt>
              <dd className="text-lg font-bold tabular-nums">
                {amountFormatter.format(total)} FCFA
              </dd>
            </div>
          </dl>

          {error ? (
            <p
              role="alert"
              className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive"
            >
              {error}
            </p>
          ) : null}

          <Button
            type="button"
            size="lg"
            disabled={cart.length === 0 || isCheckingOut}
            onClick={handleCheckout}
          >
            {isCheckingOut ? (
              <Loader2Icon data-icon="inline-start" className="animate-spin" />
            ) : (
              <WalletIcon data-icon="inline-start" />
            )}
            {isCheckingOut ? "Encaissement..." : "Encaisser & imprimer"}
          </Button>
        </aside>
      </div>

        </TabsContent>

        <TabsContent value="sales-history">
          <SalesHistoryPanel organization={organization} />
        </TabsContent>
      </Tabs>

      {/* Facturette après encaissement */}
      <SaleReceiptDialog
        sale={lastSale}
        organization={organization}
        open={receiptOpen}
        onOpenChange={(open) => {
          setReceiptOpen(open);
          if (!open) setLastSale(null);
        }}
      />
    </div>
  );
}
