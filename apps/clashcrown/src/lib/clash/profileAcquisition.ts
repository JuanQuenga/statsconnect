import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAction } from "convex/react";
import type { Clan, Player } from "@/lib/clash/domain";
import { mapClanBundle, mapPlayerBundle } from "@/lib/clash/mappers";
import { profileIdentity, type ProfileAcquisitionKind, type ProfileIdentity } from "@/lib/clash/profileIdentity";
import { errorMessage } from "@/lib/convex";
import { clashBackend } from "@/lib/platformBackend";

export { profileIdentity } from "@/lib/clash/profileIdentity";

type ResolvedProfileIdentity = {
  identity: ProfileIdentity;
  error: unknown | null;
};

function resolveIdentity(kind: ProfileAcquisitionKind, input: string): ResolvedProfileIdentity {
  try {
    return { identity: profileIdentity(kind, input), error: null };
  } catch (error) {
    const fallback = input.trim().toUpperCase();
    return {
      identity: { kind, tag: fallback, cacheKey: ["clash-profile", kind, fallback] } satisfies ProfileIdentity,
      error,
    };
  }
}

type AcquisitionResult<T> = {
  data: T | undefined;
  isLoading: boolean;
  isRefreshing: boolean;
  errorMessage: string | null;
  refresh: () => void;
};

export function usePlayerAcquisition(tag: string, options: { enabled?: boolean } = {}): AcquisitionResult<Player> {
  const getPlayer = useAction(clashBackend.profiles.player);
  const queryClient = useQueryClient();
  const resolved = resolveIdentity("player", tag);
  const enabled = (options.enabled ?? true) && Boolean(tag);
  const query = useQuery({
    queryKey: resolved.identity.cacheKey,
    queryFn: async () => {
      if (resolved.error) throw resolved.error;
      return mapPlayerBundle(await getPlayer({ tag: resolved.identity.tag }));
    },
    enabled,
    retry: false,
  });
  const refresh = useMutation({
    mutationFn: async (request: ResolvedProfileIdentity) => {
      if (request.error) throw request.error;
      return mapPlayerBundle(await getPlayer({ tag: request.identity.tag, force: true }));
    },
    onSuccess: (player, request) => queryClient.setQueryData(request.identity.cacheKey, player),
  });
  const refreshMatches = refresh.variables?.identity.kind === resolved.identity.kind
    && refresh.variables.identity.tag === resolved.identity.tag;
  const visibleError = query.error ?? (refreshMatches ? refresh.error : null);

  return {
    data: query.data,
    isLoading: query.isLoading,
    isRefreshing: query.isFetching || refresh.isPending,
    errorMessage: visibleError ? errorMessage(visibleError) : null,
    refresh: () => refresh.mutate(resolved),
  };
}

export function useClanAcquisition(tag: string, options: { enabled?: boolean } = {}): AcquisitionResult<Clan> {
  const getClan = useAction(clashBackend.profiles.clan);
  const queryClient = useQueryClient();
  const resolved = resolveIdentity("clan", tag);
  const enabled = (options.enabled ?? true) && Boolean(tag);
  const query = useQuery({
    queryKey: resolved.identity.cacheKey,
    queryFn: async () => {
      if (resolved.error) throw resolved.error;
      return mapClanBundle(await getClan({ tag: resolved.identity.tag }));
    },
    enabled,
    retry: false,
  });
  const refresh = useMutation({
    mutationFn: async (request: ResolvedProfileIdentity) => {
      if (request.error) throw request.error;
      return mapClanBundle(await getClan({ tag: request.identity.tag, force: true }));
    },
    onSuccess: (clan, request) => queryClient.setQueryData(request.identity.cacheKey, clan),
  });
  const refreshMatches = refresh.variables?.identity.kind === resolved.identity.kind
    && refresh.variables.identity.tag === resolved.identity.tag;
  const visibleError = query.error ?? (refreshMatches ? refresh.error : null);

  return {
    data: query.data,
    isLoading: query.isLoading,
    isRefreshing: query.isFetching || refresh.isPending,
    errorMessage: visibleError ? errorMessage(visibleError) : null,
    refresh: () => refresh.mutate(resolved),
  };
}
