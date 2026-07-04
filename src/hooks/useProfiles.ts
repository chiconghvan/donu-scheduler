import { useState, useCallback, useEffect, useMemo } from "react";
import type { ProfileSummary, ManagerKey } from "../types";
import {
  listGpmProfiles,
  listDonutProfiles,
  listGpmGlobalProfiles,
} from "../api";

export function useProfiles(manager: ManagerKey) {
  const [profiles, setProfiles] = useState<ProfileSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchProfiles = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      let result: ProfileSummary[];
      switch (manager) {
        case "gpm":
          result = await listGpmProfiles();
          break;
        case "gpmglobal":
          result = await listGpmGlobalProfiles();
          break;
        case "donut":
          result = await listDonutProfiles();
          break;
        default:
          result = [];
      }
      setProfiles(result);
    } catch (err: any) {
      setError(String(err));
      setProfiles([]);
    } finally {
      setLoading(false);
    }
  }, [manager]);

  useEffect(() => {
    fetchProfiles();
  }, [fetchProfiles]);

  const groups = useMemo(() => {
    const set = new Set<string>();
    for (const p of profiles) {
      if (p.group_name) set.add(p.group_name);
    }
    return Array.from(set).sort();
  }, [profiles]);

  return { profiles, loading, error, refresh: fetchProfiles, groups };
}
