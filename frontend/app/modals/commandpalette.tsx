// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import {
    actionIdToLabel,
    closeCommandPalette,
    commandsConfigAtom,
    type CommandPaletteItem,
    executeInTerminal,
    filterItems,
    paletteHistoryAtom,
    parseSearchInput,
    recordCommandUsage,
    sortByRecency,
} from "@/app/store/commandpalette";
import { getActionDefs } from "@/app/store/keymodel";
import { WorkspaceService } from "@/app/store/services";
import { useAtomValue } from "jotai";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import "./commandpalette.scss";

function formatKeybinding(keys: string[]): string {
    if (!keys || keys.length === 0) return "";
    const key = keys[0];
    return key
        .replace(/Cmd/g, "⌘")
        .replace(/Ctrl/g, "⌃")
        .replace(/Shift/g, "⇧")
        .replace(/Alt/g, "⌥")
        .replace(/:/g, "");
}

const categoryHints: Record<string, string> = {
    ">": "App Commands",
    $: "Custom Commands",
    "~": "Workspaces",
};

function getAppCommandItems(): CommandPaletteItem[] {
    const items: CommandPaletteItem[] = [];
    const actionDefs = getActionDefs();

    const hiddenPattern = /^(generic:cancel|block:switchto\d+|tab:switchto\d+)$/;
    for (const action of actionDefs) {
        if (action.id.includes("chord") && action.id !== "block:splitchord") {
            continue;
        }
        if (action.id === "app:commandpalette") {
            continue;
        }
        if (hiddenPattern.test(action.id)) {
            continue;
        }
        const actionHandler = action.handler;
        items.push({
            id: action.id,
            label: actionIdToLabel(action.id),
            category: "app",
            keybinding: formatKeybinding(action.defaultKeys),
            handler: () => {
                actionHandler({} as WaveKeyboardEvent);
            },
        });
    }
    return items;
}

async function fetchWorkspaceItems(): Promise<CommandPaletteItem[]> {
    const workspaceList = await WorkspaceService.ListWorkspaces();
    if (!workspaceList) {
        return [];
    }
    const items: CommandPaletteItem[] = [];
    for (const entry of workspaceList) {
        const workspace = await WorkspaceService.GetWorkspace(entry.workspaceid);
        if (!workspace) {
            continue;
        }
        const name = workspace.name || "Untitled Workspace";
        items.push({
            id: `workspace:${workspace.oid}`,
            label: name,
            category: "workspace",
            handler: () => {
                (window as any).api.switchWorkspace(workspace.oid);
            },
        });
    }
    return items;
}

const CommandPalette = memo(() => {
    const [searchValue, setSearchValue] = useState("");
    const [selectedIndex, setSelectedIndex] = useState(0);
    const inputRef = useRef<HTMLInputElement>(null);
    const resultsRef = useRef<HTMLDivElement>(null);
    const customCommands = useAtomValue(commandsConfigAtom);
    const history = useAtomValue(paletteHistoryAtom);
    const [workspaceItems, setWorkspaceItems] = useState<CommandPaletteItem[]>([]);

    useEffect(() => {
        fetchWorkspaceItems().then(setWorkspaceItems);
    }, []);

    const allItems = useMemo((): CommandPaletteItem[] => {
        const items: CommandPaletteItem[] = [];
        items.push(...getAppCommandItems());
        for (const cmd of customCommands) {
            items.push({
                id: `custom:${cmd.name.toLowerCase().replace(/\s+/g, "-")}`,
                label: cmd.name,
                category: "custom",
                handler: () => {
                    executeInTerminal(cmd.command);
                },
            });
        }
        items.push(...workspaceItems);
        return items;
    }, [customCommands, workspaceItems]);

    const { prefix, query } = parseSearchInput(searchValue);
    const filtered = filterItems(allItems, prefix, query);
    const sorted = sortByRecency(filtered, history);

    useEffect(() => {
        setSelectedIndex(0);
    }, [searchValue]);

    useEffect(() => {
        if (resultsRef.current) {
            const selectedEl = resultsRef.current.querySelector(".command-palette-item.selected");
            selectedEl?.scrollIntoView({ block: "nearest" });
        }
    }, [selectedIndex]);

    useEffect(() => {
        inputRef.current?.focus();
    }, []);

    const handleExecute = useCallback((item: CommandPaletteItem) => {
        recordCommandUsage(item.id);
        closeCommandPalette();
        item.handler();
    }, []);

    const handleKeyDown = useCallback(
        (e: React.KeyboardEvent) => {
            if (e.key === "ArrowDown") {
                e.preventDefault();
                setSelectedIndex((prev) => Math.min(prev + 1, sorted.length - 1));
            } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setSelectedIndex((prev) => Math.max(prev - 1, 0));
            } else if (e.key === "Enter") {
                e.preventDefault();
                if (sorted[selectedIndex]) {
                    handleExecute(sorted[selectedIndex]);
                }
            } else if (e.key === "Escape") {
                e.preventDefault();
                closeCommandPalette();
            }
        },
        [sorted, selectedIndex, handleExecute]
    );

    const handleBackdropClick = useCallback((e: React.MouseEvent) => {
        if ((e.target as Element).classList.contains("command-palette-backdrop")) {
            closeCommandPalette();
        }
    }, []);

    return (
        <div className="command-palette-backdrop" onClick={handleBackdropClick}>
            <div className="command-palette" onKeyDown={handleKeyDown}>
                <div className="command-palette-input-wrapper">
                    {prefix && <span className="command-palette-prefix">{prefix}</span>}
                    <input
                        ref={inputRef}
                        className="command-palette-input"
                        type="text"
                        placeholder="Search commands..."
                        value={searchValue}
                        onChange={(e) => setSearchValue(e.target.value)}
                        autoFocus
                    />
                </div>
                {prefix && categoryHints[prefix] && (
                    <div className="command-palette-hint">{categoryHints[prefix]}</div>
                )}
                <div className="command-palette-results" ref={resultsRef}>
                    {sorted.length === 0 ? (
                        <div className="command-palette-empty">No commands found</div>
                    ) : (
                        sorted.map((item, i) => (
                            <div
                                key={item.id}
                                className={`command-palette-item${i === selectedIndex ? " selected" : ""}`}
                                onClick={() => handleExecute(item)}
                                onMouseEnter={() => setSelectedIndex(i)}
                            >
                                <div className="command-palette-item-icon">
                                    {item.category === "custom" && <i className="fa fa-terminal" />}
                                    {item.category === "workspace" && <i className="fa fa-layer-group" />}
                                    {item.category === "app" && <i className="fa fa-keyboard" />}
                                </div>
                                <span className="command-palette-item-label">{item.label}</span>
                                <span className="command-palette-item-badge">{item.category}</span>
                                {item.keybinding && (
                                    <span className="command-palette-item-keybinding">{item.keybinding}</span>
                                )}
                            </div>
                        ))
                    )}
                </div>
            </div>
        </div>
    );
});

CommandPalette.displayName = "CommandPalette";

export { CommandPalette };
