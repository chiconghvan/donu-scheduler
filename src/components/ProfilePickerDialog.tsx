import { useEffect, useRef, useState } from "react";
import type { ManagerKey, ProfileSummary, SelectedJobProfile } from "../types";
import * as api from "../api";
import { FloatingInput } from "./FloatingField";

const managers: { key: ManagerKey; label: string }[] = [
  { key: "gpm", label: "GPMLogin" },
  { key: "gpmglobal", label: "GPMGlobal" },
  { key: "donut", label: "Donut Browser" },
];

interface Props {
  open: boolean;
  selected: SelectedJobProfile[];
  onDone: (profiles: SelectedJobProfile[]) => void;
  onCancel: () => void;
}

export default function ProfilePickerDialog({ open, selected, onDone, onCancel }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [leftTab, setLeftTab] = useState<ManagerKey>("gpm");
  const [rightTab, setRightTab] = useState<ManagerKey>("gpm");
  const [profilesByManager, setProfilesByManager] = useState<Record<ManagerKey, ProfileSummary[]>>({
    gpm: [],
    gpmglobal: [],
    donut: [],
  });
  const [draft, setDraft] = useState<SelectedJobProfile[]>(selected);
  const [leftSelection, setLeftSelection] = useState<Set<string>>(new Set());
  const [rightSelection, setRightSelection] = useState<Set<string>>(new Set());
  const [loadingProfiles, setLoadingProfiles] = useState(false);
  const [leftSearch, setLeftSearch] = useState("");
  const [rightSearch, setRightSearch] = useState("");
  const [managerStatus, setManagerStatus] = useState({
    gpm: { online: true, error: "" },
    gpmglobal: { online: true, error: "" },
    donut: { online: true, error: "" },
  });

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    setDraft(selected);
    setLeftSelection(new Set());
    setRightSelection(new Set());
    loadAllProfiles();
  }, [open, selected]);

  const loadProfiles = async (manager: ManagerKey) => {
    setLoadingProfiles(true);
    try {
      if (manager === "gpm") {
        const profiles = await api.listGpmProfiles();
        setProfilesByManager((prev) => ({ ...prev, gpm: profiles }));
        setManagerStatus((prev) => ({ ...prev, gpm: { online: true, error: "" } }));
      } else if (manager === "gpmglobal") {
        const profiles = await api.listGpmGlobalProfiles();
        setProfilesByManager((prev) => ({ ...prev, gpmglobal: profiles }));
        setManagerStatus((prev) => ({ ...prev, gpmglobal: { online: true, error: "" } }));
      } else {
        const profiles = await api.listDonutProfiles();
        setProfilesByManager((prev) => ({ ...prev, donut: profiles }));
        setManagerStatus((prev) => ({ ...prev, donut: { online: true, error: "" } }));
      }
    } catch (e: unknown) {
      setProfilesByManager((prev) => ({ ...prev, [manager]: [] }));
      setManagerStatus((prev) => ({
        ...prev,
        [manager]: { online: false, error: String(e) },
      }));
    }
    setLoadingProfiles(false);
  };

  const loadAllProfiles = async () => {
    await Promise.all([
      loadProfiles("gpm"),
      loadProfiles("gpmglobal"),
      loadProfiles("donut"),
    ]);
  };

  const selectedKey = (manager: ManagerKey, id: string) => `${manager}:${id}`;
  const selectedKeys = new Set(draft.map((p) => selectedKey(p.manager, p.id)));
  const leftProfiles = profilesByManager[leftTab].filter((p) =>
    !selectedKeys.has(selectedKey(leftTab, p.id)) &&
    [p.name, p.group_name].filter(Boolean).join(" ").toLowerCase().includes(leftSearch.trim().toLowerCase())
  );
  const rightProfiles = draft.filter((p) =>
    p.manager === rightTab &&
    [p.name, p.group_name].filter(Boolean).join(" ").toLowerCase().includes(rightSearch.trim().toLowerCase())
  );
  const leftStatus = managerStatus[leftTab];
  const rightStatus = managerStatus[rightTab];

  const addProfiles = () => {
    const adding = leftProfiles
      .filter((p) => leftSelection.has(p.id))
      .map((p) => ({
        id: p.id,
        manager: leftTab,
        name: p.name,
        group_name: p.group_name,
      }));
    if (adding.length === 0) return;
    setDraft((prev) => [...prev, ...adding]);
    setLeftSelection(new Set());
  };

  const removeProfiles = () => {
    if (rightSelection.size === 0) return;
    setDraft((prev) =>
      prev.filter((p) => p.manager !== rightTab || !rightSelection.has(p.id))
    );
    setRightSelection(new Set());
  };

  return (
    <dialog ref={dialogRef} className="profile-picker-dialog" onCancel={onCancel}>
      <div className="profile-picker-panel">
        <div className="profile-picker-header">
          <div>
            <h2>Choose Profiles</h2>
            <p className="text-muted">{draft.length} profiles selected for this job</p>
          </div>
          <button className="btn btn-secondary btn-sm" onClick={loadAllProfiles} disabled={loadingProfiles}>
            {loadingProfiles ? "Loading..." : "Refresh All"}
          </button>
        </div>

        <div className="profile-picker-grid">
          <div className="profile-picker-column">
            <h3>Available Profiles</h3>
            <ManagerTabs value={leftTab} status={managerStatus} onChange={(tab) => { setLeftTab(tab); setLeftSelection(new Set()); loadProfiles(tab); }} />
            <FloatingInput label="Search available profiles" value={leftSearch} onChange={(e) => setLeftSearch(e.target.value)} placeholder="Search available profiles" />
            <div className="flex-row mb-8">
              <button className="btn btn-secondary btn-sm" onClick={() => loadProfiles(leftTab)} disabled={loadingProfiles}>
                {loadingProfiles ? "Loading..." : "Refresh Profiles"}
              </button>
              <span className="text-muted">{profilesByManager[leftTab].length} profiles loaded</span>
              {!leftStatus.online && (
                <span className="text-muted" style={{ color: "#e9a45d" }}>
                  Offline{leftStatus.error ? `: ${leftStatus.error}` : ""}
                </span>
              )}
            </div>
            <ProfileTable
              profiles={leftProfiles}
              selectedIds={leftSelection}
              onSelectionChange={setLeftSelection}
              emptyMessage={leftStatus.online ? "No profiles loaded." : `${leftTab} offline. Check API URL or start manager app.`}
            />
          </div>

          <div className="profile-picker-actions-mid">
            <button
              className="btn btn-primary profile-picker-icon-btn"
              onClick={addProfiles}
              disabled={leftSelection.size === 0}
              title="Add selected profiles"
              aria-label="Add selected profiles"
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M12 5v14M5 12h14" />
              </svg>
            </button>
            <button
              className="btn btn-secondary profile-picker-icon-btn"
              onClick={removeProfiles}
              disabled={rightSelection.size === 0}
              title="Remove selected profiles"
              aria-label="Remove selected profiles"
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M6 6l12 12M18 6L6 18" />
              </svg>
            </button>
          </div>

          <div className="profile-picker-column">
            <h3>Job Profiles</h3>
            <ManagerTabs value={rightTab} status={managerStatus} onChange={(tab) => { setRightTab(tab); setRightSelection(new Set()); }} />
            <FloatingInput label="Search selected profiles" value={rightSearch} onChange={(e) => setRightSearch(e.target.value)} placeholder="Search selected profiles" />
            <div className="flex-row mb-8">
              <span className="text-muted">{rightProfiles.length} selected in this manager</span>
              {!rightStatus.online && (
                <span className="text-muted" style={{ color: "#e9a45d" }}>
                  Offline{rightStatus.error ? `: ${rightStatus.error}` : ""}
                </span>
              )}
            </div>
            <ProfileTable
              profiles={rightProfiles}
              selectedIds={rightSelection}
              onSelectionChange={setRightSelection}
              emptyMessage="No selected profiles."
            />
          </div>
        </div>

        <p className="text-muted" style={{ marginTop: 8 }}>
          Click to select. Ctrl+Click to toggle. Shift+Click or drag to select range.
        </p>

        <div className="profile-picker-footer">
          <button className="btn btn-secondary" onClick={onCancel}>Cancel</button>
          <button className="btn btn-primary" onClick={() => onDone(draft)}>Done</button>
        </div>
      </div>
    </dialog>
  );
}

function ManagerTabs({
  value,
  status,
  onChange,
}: {
  value: ManagerKey;
  status: Record<ManagerKey, { online: boolean; error: string }>;
  onChange: (value: ManagerKey) => void;
}) {
  return (
    <div className="tabs">
      {managers.map((manager) => (
        <button
          key={manager.key}
          className={value === manager.key ? "active" : ""}
          onClick={() => onChange(manager.key)}
        >
          {manager.label}
          <span className={`manager-badge ${status[manager.key].online ? "manager-online" : "manager-offline"}`} style={{ marginLeft: 8 }}>
            {status[manager.key].online ? "Online" : "Offline"}
          </span>
        </button>
      ))}
    </div>
  );
}

function ProfileTable({
  profiles,
  selectedIds,
  onSelectionChange,
  emptyMessage,
}: {
  profiles: { id: string; name: string; group_name: string | null }[];
  selectedIds: Set<string>;
  onSelectionChange: (value: Set<string>) => void;
  emptyMessage: string;
}) {
  const [groupFilter, setGroupFilter] = useState("all");
  const lastClickedIndex = useRef<number | null>(null);
  const isMouseDown = useRef(false);
  const isDragging = useRef(false);
  const dragStartIndex = useRef<number | null>(null);
  const groupNames = Array.from(new Set(profiles.map((p) => p.group_name).filter(Boolean))).sort() as string[];
  const filteredProfiles = groupFilter === "all" ? profiles : profiles.filter((p) => p.group_name === groupFilter);

  const selectRange = (fromIndex: number, toIndex: number) => {
    const start = Math.min(fromIndex, toIndex);
    const end = Math.max(fromIndex, toIndex);
    const next = new Set(selectedIds);
    for (let i = start; i <= end; i++) next.add(filteredProfiles[i].id);
    onSelectionChange(next);
  };

  const handleMouseDown = (index: number) => {
    isMouseDown.current = true;
    isDragging.current = false;
    dragStartIndex.current = index;
  };

  const handleMouseMove = (index: number) => {
    if (!isMouseDown.current) return;
    if (dragStartIndex.current !== index) isDragging.current = true;
    if (isDragging.current && dragStartIndex.current !== null) selectRange(dragStartIndex.current, index);
  };

  const handleMouseUp = (e: React.MouseEvent, index: number) => {
    if (!isMouseDown.current) return;
    isMouseDown.current = false;
    const profile = filteredProfiles[index];

    if (!isDragging.current) {
      if (e.shiftKey && lastClickedIndex.current !== null) {
        selectRange(lastClickedIndex.current, index);
      } else if (e.ctrlKey || e.metaKey) {
        const next = new Set(selectedIds);
        if (next.has(profile.id)) next.delete(profile.id);
        else next.add(profile.id);
        onSelectionChange(next);
      } else {
        onSelectionChange(selectedIds.has(profile.id) && selectedIds.size === 1 ? new Set() : new Set([profile.id]));
      }
    }

    lastClickedIndex.current = index;
    isDragging.current = false;
    dragStartIndex.current = null;
  };

  return (
    <div
      className="profile-picker-table-wrap"
      onMouseLeave={() => {
        isMouseDown.current = false;
        isDragging.current = false;
      }}
    >
      <table style={{ userSelect: "none" }}>
        <thead>
          <tr>
            <th style={{ width: 44, textAlign: "center" }}>STT</th>
            <th>Tên profile</th>
            <th>
              <span style={{ position: "relative", display: "inline-block" }}>
                Group Name ▾
                <select
                  value={groupFilter}
                  onChange={(e) => setGroupFilter(e.target.value)}
                  style={{ position: "absolute", inset: 0, opacity: 0, cursor: "pointer" }}
                >
                  <option value="all">All</option>
                  {groupNames.map((group) => (
                    <option key={group} value={group}>{group}</option>
                  ))}
                </select>
              </span>
            </th>
          </tr>
        </thead>
        <tbody>
          {filteredProfiles.map((profile, index) => (
            <tr
              key={profile.id}
              onMouseDown={() => handleMouseDown(index)}
              onMouseMove={() => handleMouseMove(index)}
              onMouseUp={(e) => handleMouseUp(e, index)}
              style={{
                backgroundColor: selectedIds.has(profile.id) ? "rgba(93, 233, 93, 0.1)" : undefined,
                cursor: "pointer",
              }}
            >
              <td style={{ textAlign: "center", color: "#8899b0" }}>{index + 1}</td>
              <td>{profile.name}</td>
              <td>{profile.group_name || "-"}</td>
            </tr>
          ))}
          {filteredProfiles.length === 0 && (
            <tr>
              <td colSpan={3} className="text-muted">{emptyMessage}</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
