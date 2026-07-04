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
    return JSON.parse(json || "[]");
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
