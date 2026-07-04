import type { ProfileSummary, ProfileSnapshot, SelectedJobProfile, ManagerKey } from "../types";

export function buildProfileSnapshots(
  profileIds: string[],
  profiles: ProfileSummary[],
  manager: ManagerKey
): ProfileSnapshot[] {
  return profileIds.map((profileId) => {
    const profile = profiles.find((p) => p.id === profileId);
    return {
      profile_id: profileId,
      profile_name: profile?.name || profileId,
      manager,
      group_name: profile?.group_name || null,
    };
  });
}

export function parseSelectedProfiles(json: string): SelectedJobProfile[] {
  try {
    const parsed = JSON.parse(json || "[]");
    if (!Array.isArray(parsed)) return [];
    return parsed.map((p) => ({
      id: String(p.id),
      manager: p.manager,
      name: String(p.name || p.id),
      group_name: p.group_name || null,
      browser_type: p.browser_type || null,
    }));
  } catch {
    return [];
  }
}

export function getManagerLabel(manager: string): string {
  switch (manager) {
    case "gpm":
      return "GPM";
    case "gpmglobal":
      return "GPM Global";
    case "donut":
      return "Donut";
    default:
      return manager;
  }
}
