import { useEffect, useMemo, useState, type Dispatch, type KeyboardEvent, type SetStateAction } from "react";
import type { ManagerKey, ProfileSummary, SelectedJobProfile } from "../../types";
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
        browser_type: p.browser_type,
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

  const toggleVisible = <T extends { id: string }>(items: T[], setIds: Dispatch<SetStateAction<Set<string>>>) => {
    const ids = items.map((p) => p.id);
    if (ids.length === 0) return;
    setIds((prev) => {
      const allSelected = ids.every((id) => prev.has(id));
      const next = new Set(prev);
      ids.forEach((id) => allSelected ? next.delete(id) : next.add(id));
      return next;
    });
  };

  const selectVisible = <T extends { id: string }>(e: KeyboardEvent<HTMLDivElement>, items: T[], setIds: Dispatch<SetStateAction<Set<string>>>) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "a") {
      e.preventDefault();
      setIds((prev) => new Set([...prev, ...items.map((p) => p.id)]));
    }
  };

  const renderProfileRows = <T extends ProfileSummary | SelectedJobProfile>(items: T[], selectedIds: Set<string>, multi: ReturnType<typeof useMultiSelect<T>>) => items.map((p, i) => (
    <tr
      key={`${"manager" in p ? p.manager : leftTab}:${p.id}`}
      className={selectedIds.has(p.id) ? "table-row--selected" : ""}
      onMouseDown={(e) => multi.handleRowMouseDown(e, i)}
      onMouseMove={(e) => multi.handleRowMouseMove(e, i)}
      onMouseUp={(e) => multi.handleRowMouseUp(e, i)}
    >
      <td className="profile-table__index">{i + 1}</td>
      <td>{p.name}</td>
      <td>{p.group_name || "-"}</td>
      <td>{p.browser_type || "-"}</td>
    </tr>
  ));

  if (!open) return null;

  return (
    <div className="dialog-backdrop" onClick={onCancel}>
      <div
        className="dialog profile-picker-dialog"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="dialog__header">
          Choose Profiles ({draft.length} selected)
        </div>

        <div className="profile-picker-dialog__body">
          {/* Available column */}
          <div className="profile-picker-dialog__column">
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

            <div className="profile-filter-row">
              <div className="search-input profile-filter-row__search" style={{ position: "relative" }}>
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
                  className="select profile-filter-row__group"
                  value={leftGroup}
                  onChange={(e) => setLeftGroup(e.target.value)}
                >
                  <option value="all">All Groups</option>
                  {leftGroups.map((g) => (
                    <option key={g} value={g}>{g}</option>
                  ))}
                </select>
              )}
            </div>

            <div className="profile-picker-dialog__table-wrap" tabIndex={0} onKeyDown={(e) => selectVisible(e, availableProfiles, setLeftSelectedIds)}>
              {leftLoading && <div className="empty-inline">Loading...</div>}
              <table className="table profile-table"><thead><tr><th className="profile-table__index" onClick={() => toggleVisible(availableProfiles, setLeftSelectedIds)}>#</th><th>Name</th><th>Group</th><th>Browser Type</th></tr></thead><tbody>{renderProfileRows(availableProfiles, leftSelectedIds, leftMulti)}</tbody></table>
              {!leftLoading && availableProfiles.length === 0 && (
                <div className="empty-inline">No profiles</div>
              )}
            </div>
          </div>

          {/* Middle buttons */}
          <div className="profile-picker-dialog__actions">
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
          <div className="profile-picker-dialog__column">
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

            <div className="search-input profile-filter-row__search" style={{ position: "relative" }}>
              <Search size={14} className="search-input__icon" />
              <input
                className="input"
                placeholder="Search selected..."
                value={rightSearch}
                onChange={(e) => setRightSearch(e.target.value)}
              />
            </div>

            <div className="profile-picker-dialog__table-wrap" tabIndex={0} onKeyDown={(e) => selectVisible(e, selectedProfiles, setRightSelectedIds)}>
              <table className="table profile-table"><thead><tr><th className="profile-table__index" onClick={() => toggleVisible(selectedProfiles, setRightSelectedIds)}>#</th><th>Name</th><th>Group</th><th>Browser Type</th></tr></thead><tbody>{renderProfileRows(selectedProfiles, rightSelectedIds, rightMulti)}</tbody></table>
              {selectedProfiles.length === 0 && (
                <div className="empty-inline">No selected profiles</div>
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
