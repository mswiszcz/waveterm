// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { FocusManager } from "@/app/store/focusManager";
import { atoms, createBlock, getBlockComponentModel, globalStore } from "@/app/store/global";
import { modalsModel } from "@/app/store/modalmodel";
import { RpcApi } from "@/app/store/wshclientapi";
import { TabRpcClient } from "@/app/store/wshrpcutil";
import { getLayoutModelForStaticTab } from "@/layout/index";
import { stringToBase64 } from "@/util/util";
import { atom } from "jotai";
import type { PrimitiveAtom } from "jotai";

// --- Types ---

export type CommandPaletteItem = {
    id: string;
    label: string;
    category: "app" | "custom" | "workspace";
    keybinding?: string;
    handler: () => void;
};

type ParsedInput = {
    prefix: string | null;
    query: string;
};

// --- Label Conversion ---

export function actionIdToLabel(actionId: string): string {
    const [namespace, action] = actionId.split(":");
    if (!action) return namespace;
    // Insert spaces:
    // 1. Before uppercase letters that follow lowercase letters (camelCase boundary)
    // 2. Before sequences of uppercase letters followed by lowercase (e.g. "AIPanel" -> "AI Panel")
    // 3. Before digits that follow letters
    const spaced = action
        .replace(/([a-z])([A-Z])/g, "$1 $2")
        .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
        .replace(/([a-zA-Z])(\d)/g, "$1 $2")
        .replace(/([a-z])([A-Z])/g, "$1 $2"); // re-run to catch any new boundaries
    // Handle "switchto" -> "Switch To" by treating known compound lowercase words
    const withSwitchTo = spaced.replace(/\bswitchto\b/gi, "Switch To");
    // Capitalize first letter of each word
    const capitalized = withSwitchTo.replace(/\b\w/g, (c) => c.toUpperCase());
    const ns = namespace.charAt(0).toUpperCase() + namespace.slice(1);
    return `${ns}: ${capitalized}`;
}

// --- Search Parsing ---

export function parseSearchInput(input: string): ParsedInput {
    const trimmed = input;
    if (trimmed.startsWith(">")) {
        return { prefix: ">", query: trimmed.slice(1).trim() };
    }
    if (trimmed.startsWith("$")) {
        return { prefix: "$", query: trimmed.slice(1).trim() };
    }
    if (trimmed.startsWith("~")) {
        return { prefix: "~", query: trimmed.slice(1).trim() };
    }
    return { prefix: null, query: trimmed.trim() };
}

// --- Filtering ---

const prefixCategoryMap: Record<string, CommandPaletteItem["category"]> = {
    ">": "app",
    $: "custom",
    "~": "workspace",
};

export function filterItems(
    items: CommandPaletteItem[],
    prefix: string | null,
    query: string
): CommandPaletteItem[] {
    let filtered = items;
    if (prefix && prefixCategoryMap[prefix]) {
        filtered = filtered.filter((item) => item.category === prefixCategoryMap[prefix]);
    }
    if (query) {
        const lowerQuery = query.toLowerCase();
        filtered = filtered.filter((item) => item.label.toLowerCase().includes(lowerQuery));
    }
    return filtered;
}

// --- Sorting ---

export function sortByRecency(
    items: CommandPaletteItem[],
    history: Record<string, number>
): CommandPaletteItem[] {
    return [...items].sort((a, b) => {
        const aTime = history[a.id] ?? 0;
        const bTime = history[b.id] ?? 0;
        if (aTime !== bTime) {
            return bTime - aTime; // more recent first
        }
        return a.label.localeCompare(b.label);
    });
}

// --- Atoms ---

export const commandsConfigAtom = atom((get) => {
    const fullConfig = get(atoms.fullConfigAtom);
    if (!fullConfig?.commands) return [];
    try {
        const raw = fullConfig.commands;
        const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
        return Array.isArray(parsed) ? (parsed as { name: string; command: string; icon?: string }[]) : [];
    } catch {
        console.warn("Failed to parse commands.json");
        return [];
    }
});

export const paletteHistoryAtom = atom<Record<string, number>>({}) as PrimitiveAtom<Record<string, number>>;

let historyWriteTimeout: ReturnType<typeof setTimeout> | null = null;

export function recordCommandUsage(commandId: string): void {
    const history = { ...globalStore.get(paletteHistoryAtom) };
    history[commandId] = Date.now();
    globalStore.set(paletteHistoryAtom, history);
    writePaletteHistory();
}

function writePaletteHistory(): void {
    if (historyWriteTimeout) {
        clearTimeout(historyWriteTimeout);
    }
    historyWriteTimeout = setTimeout(() => {
        try {
            const history = globalStore.get(paletteHistoryAtom);
            const content = JSON.stringify(history, null, 2);
            RpcApi.FileWriteCommand(TabRpcClient, {
                info: { path: "~/.config/waveterm/commandpalette-history.json" },
                data64: stringToBase64(content),
            }).catch(() => {});
        } catch {
            // no-op
        }
        historyWriteTimeout = null;
    }, 300);
}

export function loadPaletteHistory(): void {
    RpcApi.FileReadCommand(TabRpcClient, { info: { path: "~/.config/waveterm/commandpalette-history.json" } })
        .then((resp) => {
            if (resp?.data64) {
                try {
                    const text = atob(resp.data64);
                    const data = JSON.parse(text);
                    if (data && typeof data === "object") {
                        globalStore.set(paletteHistoryAtom, data);
                    }
                } catch {
                    // malformed
                }
            }
        })
        .catch(() => {
            // file doesn't exist
        });
}

// --- Terminal Execution ---

export function executeInTerminal(command: string): void {
    const blockId = findTerminalBlockId();
    if (blockId) {
        sendCommandToTerminal(blockId, command);
    } else {
        const blockDef = { meta: { view: "term" } };
        createBlock(blockDef).then((newBlockId: string) => {
            setTimeout(() => {
                sendCommandToTerminal(newBlockId, command);
            }, 500);
        });
    }
}

function findTerminalBlockId(): string | null {
    try {
        const layoutModel = getLayoutModelForStaticTab();
        const focusedNode = globalStore.get(layoutModel.focusedNode);
        const focusedBlockId = focusedNode?.data?.blockId;
        if (focusedBlockId) {
            const bcm = getBlockComponentModel(focusedBlockId);
            if (bcm?.viewModel?.viewType === "term") {
                return focusedBlockId;
            }
        }
    } catch {}

    try {
        const layoutModel = getLayoutModelForStaticTab();
        const leafOrder = globalStore.get(layoutModel.leafOrder);
        for (const leaf of leafOrder) {
            const blockId = leaf.blockid;
            if (!blockId) continue;
            try {
                const bcm = getBlockComponentModel(blockId);
                if (bcm?.viewModel?.viewType === "term") {
                    return blockId;
                }
            } catch {
                continue;
            }
        }
    } catch {}

    return null;
}

function sendCommandToTerminal(blockId: string, command: string): void {
    const data = command + "\n";
    const b64data = stringToBase64(data);
    RpcApi.ControllerInputCommand(TabRpcClient, { blockid: blockId, inputdata64: b64data });
}

// --- Palette Open/Close ---

export function openCommandPalette(): void {
    modalsModel.pushModal("CommandPalette");
}

export function closeCommandPalette(): void {
    modalsModel.popModal(() => {
        FocusManager.getInstance().refocusNode();
    });
}
