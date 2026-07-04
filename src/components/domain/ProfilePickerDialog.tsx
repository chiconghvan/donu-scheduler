import { useEffect, useMemo, useState } from "react";
import type { ManagerKey, SelectedJobProfile } from "../../types";
import { useProfiles } from "../../hooks/useProfiles";
import { useMultiSelect } from "../../hooks/useMultiSelect";
import { Search } from "lucide-react";

const managers: { key: ManagerKey; label: string }[] = [
  { key: "gpm", label: "GPM" },
  { key: "donut", label: "Donut" },
  { key: "gpmglobal", label: "GPM Global" },
];

interface Props {
  open: boolean;
  selected: SelectedJobProfile[];
  onDone: (selected: SelectedJobProfile[]) => void;
  onCancel: () => void;
}

export default function ProfilePickerDialog({
  open,
  selected,
  onDone,
  onCancel,
}: Props) {
  const [leftTab, setLeftTab] = useState<ManagerKey>("gpm");
  const [rightTab, setRightTab] = useState<ManagerKey>("gpm");
  const [draft, setDraft] = useState<SelectedJobProfile[]>(selected);
  const [leftSearch, setLeftSearch] = useState("");
  const [rightSearch, setRightSearch] = useState("");
  const [leftGroup, setLeftGroup] = useState("all");
  const [leftSelectedIds, setLeftSelectedIds] = useState<Set<string>>(new Set());
  const [rightSelectedIds, setRightSelectedIds] = useState<Set<string>>(new Set());

  const {
    profiles: leftProfiles,
    loading: leftLoading,
    groups: leftGroups,
  } = useProfiles(leftTab);

  // Reset state when dialog opens
  useEffect(() => {
    if (!open) return;
    setDraft(selected);
    setLeftSelectedIds(new Set());
    setRightSelectedIds(new Set());
    setLeftSearch("");
    setRightSearch("");
    setLeftGroup("all");
  }, [open, selected]);

  // Build selected keys for dedup
  const selectedKeys = useMemo(
    () => new Set(draft.map((p) => `${p.manager}:${p.id}`)),
    [draft],
  );

  // Filter available (left) profiles
  const availableProfiles = useMemo(() => {
    const search = leftSearch.trim().toLowerCase();
    return leftProfiles
      .filter((p) => !selectedKeys.has(`${leftTab}:${p.id}`))
      .filter(
        (p) => leftGroup === "all" || p.group_name === leftGroup,
      )
      .filter(
        (p) =>
          !search ||
          [p.name, p.group_name]
            .filter(Boolean)
            .join(" ")
            .toLowerCase()
            .includes(search),
      );
  }, [leftProfiles, selectedKeys, leftTab, leftGroup, leftSearch]);

  // Filter selected (right) profiles
  const selectedProfiles = useMemo(() => {
    const search = rightSearch.trim().toLowerCase();
    return draft
      .filter((p) => p.manager === rightTab)
      .filter(
        (p) =>
          !search ||
          [p.name, p.group_name]
            .filter(Boolean)
            .join(" ")
            .toLowerCase()
            .includes(search),
      );
  }, [draft, rightTab, rightSearch]);

  // Multi-select hooks
  const leftMulti = useMultiSelect(availableProfiles, leftSelectedIds, setLeftSelectedIds);
  const rightMulti = useMultiSelect(selectedProfiles, rightSelectedIds, setRightSelectedIds);

  const addProfiles = () => {
    const adding = availableProfiles
      .filter((p) => leftSelectedIds.has(p.id))
      .map((p) => ({
        id: p.id,
        manager: leftTab,
        name: p.name,
        group_name: p.group_name,
      }));
    if (adding.length === 0) return;
    setDraft((prev) => [...prev, ...adding]);
    setLeftSelectedIds(new Set());
  };

  const removeProfiles = () => {
    if (rightSelectedIds.size === 0) return;
    setDraft((prev) =>
      prev.filter((p) => p.manager !== rightTab || !rightSelectedIds.has(p.id)),
    );
    setRightSelectedIds(new Set());
  };

  if (!open) return null;

  return (
    <div className="dialog-backdrop" onClick={onCancel}>
      <div
        className="dialog"
        style={{ maxWidth: 1100, width: "95vw" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="dialog__header">
          Choose Profiles ({draft.length} selected)
        </div>

        <div style={{ display: "flex", gap: 12, padding: "12px 0", minHeight: 400 }}>
          {/* Available column */}
          <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 8 }}>
            <div className="tabs">
              {managers.map((m) => (
                <button
                  key={m.key}
                  className={`tab${leftTab === m.key ? " tab--active" : ""}`}
                  onClick={() => {
                    setLeftTab(m.key);
                    setLeftSelectedIds(new Set());
                    setLeftGroup("all");
                  }}
                >
                  {m.label}
                </button>
              ))}
            </div>

            <div className="search-input" style={{ position: "relative" }}>
              <Search size={14} className="search-input__icon" />
              <input
                className="input"
                placeholder="Search available..."
                value={leftSearch}
                onChange={(e) => setLeftSearch(e.target.value)}
              />
            </div>

            {leftGroups.length > 0 && (
              <select
                className="select"
                value={leftGroup}
                onChange={(e) => setLeftGroup(e.target.value)}
              >
                <option value="all">All Groups</option>
                {leftGroups.map((g) => (
                  <option key={g} value={g}>{g}</option>
                ))}
              </select>
            )}

            <div className="table" style={{ flex: 1, overflow: "auto" }}>
              {leftLoading && <div style={{ padding: 8 }}>Loading...</div>}
              {availableProfiles.map((p, i) => (
                <div
                  key={p.id}
                  className={`profile-item${leftSelectedIds.has(p.id) ? " profile-item--selected" : ""}`}
                  onMouseDown={(e) => leftMulti.handleRowMouseDown(e, i)}
                  onMouseMove={(e) => leftMulti.handleRowMouseMove(e, i)}
                  onMouseUp={(e) => leftMulti.handleRowMouseUp(e, i)}
                  style={{ userSelect: "none", cursor: "pointer" }}
                >
                  <span className="profile-item__name">{p.name}</span>
                  {p.group_name && (
                    <span className="profile-item__group">{p.group_name}</span>
                  )}
                </div>
              ))}
              {!leftLoading && availableProfiles.length === 0 && (
                <div style={{ padding: 8, opacity: 0.5 }}>No profiles</div>
              )}
            </div>
          </div>

          {/* Middle buttons */}
          <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", gap: 8 }}>
            <button
              className="btn btn--primary"
              onClick={addProfiles}
              disabled={leftSelectedIds.size === 0}
            >
              Add &rarr;
            </button>
            <button
              className="btn btn--secondary"
              onClick={removeProfiles}
              disabled={rightSelectedIds.size === 0}
            >
              &larr; Remove
            </button>
          </div>

          {/* Selected column */}
          <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 8 }}>
            <div className="tabs">
              {managers.map((m) => {
                const count = draft.filter((p) => p.manager === m.key).length;
                return (
                  <button
                    key={m.key}
                    className={`tab${rightTab === m.key ? " tab--active" : ""}`}
                    onClick={() => {
                      setRightTab(m.key);
                      setRightSelectedIds(new Set());
                    }}
                  >
                    {m.label} ({count})
                  </button>
                );
              })}
            </div>

            <div className="search-input" style={{ position: "relative" }}>
              <Search size={14} className="search-input__icon" />
              <input
                className="input"
                placeholder="Search selected..."
                value={rightSearch}
                onChange={(e) => setRightSearch(e.target.value)}
              />
            </div>

            <div className="table" style={{ flex: 1, overflow: "auto" }}>
              {selectedProfiles.map((p, i) => (
                <div
                  key={p.id}
                  className={`profile-item${rightSelectedIds.has(p.id) ? " profile-item--selected" : ""}`}
                  onMouseDown={(e) => rightMulti.handleRowMouseDown(e, i)}
                  onMouseMove={(e) => rightMulti.handleRowMouseMove(e, i)}
                  onMouseUp={(e) => rightMulti.handleRowMouseUp(e, i)}
                  style={{ userSelect: "none", cursor: "pointer" }}
                >
                  <span className="profile-item__name">{p.name}</span>
                  {p.group_name && (
                    <span className="profile-item__group">{p.group_name}</span>
                  )}
                </div>
              ))}
              {selectedProfiles.length === 0 && (
                <div style={{ padding: 8, opacity: 0.5 }}>No selected profiles</div>
              )}
            </div>
          </div>
        </div>

        <div className="dialog__footer">
          <button className="btn btn--secondary" onClick={onCancel}>
            Cancel
          </button>
          <button className="btn btn--primary" onClick={() => onDone(draft)}>
            Done ({draft.length})
          </button>
        </div>
      </div>
    </div>
  );
}
