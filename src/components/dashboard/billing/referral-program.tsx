"use client";

import * as React from "react";
import { useEffect } from "react";
import {
  CheckIcon,
  CopyIcon,
  GiftIcon,
  LinkIcon,
  TrendingUpIcon,
  UsersIcon,
} from "lucide-react";

import { ensureReferralCode, getReferralStats } from "@/actions/referral";
import { Button } from "@/components/ui/button";

type ReferralDTO = {
  id: string;
  referredId: string;
  referredName: string;
  referredEmail: string;
  status: string;
  rewardAmount: number;
  createdAt: Date;
};

type ReferralStats = {
  referralCode: string;
  referralLink: string;
  totalReferrals: number;
  convertedReferrals: number;
  pendingReferrals: number;
  totalRewards: number;
  referrals: ReferralDTO[];
};

export function ReferralProgram({ baseUrl }: { baseUrl: string }) {
  const [stats, setStats] = React.useState<ReferralStats | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [copied, setCopied] = React.useState(false);
  const [activating, setActivating] = React.useState(false);

  useEffect(() => {
    let active = true;
    async function load() {
      setLoading(true);
      try {
        const data = await getReferralStats(baseUrl);
        if (active && data) setStats(data);
      } catch {
        // ignore
      } finally {
        if (active) setLoading(false);
      }
    }
    load();
    return () => { active = false; };
  }, [baseUrl]);

  const handleActivate = async () => {
    setActivating(true);
    try {
      await ensureReferralCode();
      const data = await getReferralStats(baseUrl);
      if (data) setStats(data);
    } catch {
      // ignore
    } finally {
      setActivating(false);
    }
  };

  const handleCopy = async () => {
    if (!stats?.referralLink) return;
    try {
      await navigator.clipboard.writeText(stats.referralLink);
    } catch {
      const input = document.createElement("input");
      input.value = stats.referralLink;
      document.body.appendChild(input);
      input.select();
      document.execCommand("copy");
      document.body.removeChild(input);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (loading) {
    return (
      <section className="rounded-xl border bg-background p-5 shadow-sm">
        <div className="flex items-center gap-2 mb-4">
          <GiftIcon className="size-5 text-brand" />
          <h2 className="font-semibold tracking-tight">Programme de Parrainage</h2>
        </div>
        <div className="flex items-center justify-center py-8">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-brand border-t-transparent" />
        </div>
      </section>
    );
  }

  if (!stats || !stats.referralCode) {
    return (
      <section className="rounded-xl border bg-background p-5 shadow-sm">
        <div className="flex items-center gap-2 mb-4">
          <GiftIcon className="size-5 text-brand" />
          <h2 className="font-semibold tracking-tight">Programme de Parrainage</h2>
        </div>
        <p className="text-sm text-muted-foreground">
          Activez votre code de parrainage pour commencer a gagner des recompenses.
        </p>
        <Button type="button" onClick={handleActivate} disabled={activating} className="mt-4">
          {activating ? "Activation..." : "Activer mon code"}
        </Button>
      </section>
    );
  }

  return (
    <section className="rounded-xl border bg-background p-5 shadow-sm">
      <div className="flex items-center gap-2 mb-4">
        <GiftIcon className="size-5 text-brand" />
        <h2 className="font-semibold tracking-tight">Programme de Parrainage</h2>
      </div>
      <div className="space-y-2 mb-5">
        <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Votre lien unique</label>
        <div className="flex items-center gap-2">
          <div className="flex-1 rounded-lg border bg-muted/40 px-3 py-2 text-sm font-mono text-foreground truncate">{stats.referralLink}</div>
          <Button type="button" variant="outline" size="sm" onClick={handleCopy} className="shrink-0">
            {copied ? <CheckIcon className="size-4" /> : <CopyIcon className="size-4" />}
            {copied ? "Copie !" : "Copier le lien"}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground flex items-center gap-1">
          <LinkIcon className="size-3" /> Code : <span className="font-mono font-semibold">{stats.referralCode}</span>
        </p>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
        <div className="rounded-lg border bg-muted/30 p-3 text-center">
          <UsersIcon className="size-4 mx-auto mb-1 text-muted-foreground" />
          <p className="text-lg font-bold">{stats.totalReferrals}</p>
          <p className="text-xs text-muted-foreground">Parrainages</p>
        </div>
        <div className="rounded-lg border bg-muted/30 p-3 text-center">
          <TrendingUpIcon className="size-4 mx-auto mb-1 text-emerald-500" />
          <p className="text-lg font-bold text-emerald-600">{stats.convertedReferrals}</p>
          <p className="text-xs text-muted-foreground">Convertis</p>
        </div>
        <div className="rounded-lg border bg-muted/30 p-3 text-center">
          <GiftIcon className="size-4 mx-auto mb-1 text-amber-500" />
          <p className="text-lg font-bold text-amber-600">{stats.pendingReferrals}</p>
          <p className="text-xs text-muted-foreground">En attente</p>
        </div>
        <div className="rounded-lg border bg-muted/30 p-3 text-center">
          <span className="text-base mx-auto mb-1 block text-emerald-500 font-bold">F</span>
          <p className="text-lg font-bold text-emerald-600">{stats.totalRewards.toLocaleString("fr-FR")}</p>
          <p className="text-xs text-muted-foreground">FCFA gagnes</p>
        </div>
      </div>
      {stats.referrals.length > 0 ? (
        <div className="space-y-2">
          <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Derniers filleuls</h3>
          <div className="max-h-40 overflow-y-auto space-y-1.5">
            {stats.referrals.map((ref) => (
              <div key={ref.id} className="flex items-center justify-between rounded-md border bg-muted/20 px-3 py-2 text-xs">
                <span className="truncate font-medium">{ref.referredName}</span>
                <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${ref.status === "CONVERTED" ? "bg-emerald-500/10 text-emerald-600" : "bg-amber-500/10 text-amber-600"}`}>
                  {ref.status === "CONVERTED" ? "Converti" : "En attente"}
                  {ref.rewardAmount > 0 && ` - ${ref.rewardAmount.toLocaleString("fr-FR")} F`}
                </span>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground italic">
          Partagez votre lien pour parrainer d&apos;autres centres et gagner 10 000 FCFA fixes sur leur premier abonnement.
        </p>
      )}
    </section>
  );
}