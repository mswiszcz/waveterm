// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

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
