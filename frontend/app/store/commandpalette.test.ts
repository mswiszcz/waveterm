import { describe, expect, it } from "vitest";
import {
    actionIdToLabel,
    parseSearchInput,
    filterItems,
    sortByRecency,
    CommandPaletteItem,
} from "./commandpalette";

describe("actionIdToLabel", () => {
    it("converts simple action id", () => {
        expect(actionIdToLabel("tab:new")).toBe("Tab: New");
    });

    it("converts camelCase action id", () => {
        expect(actionIdToLabel("block:splitRight")).toBe("Block: Split Right");
    });

    it("converts multi-word action id", () => {
        expect(actionIdToLabel("app:toggleAIPanel")).toBe("App: Toggle AI Panel");
    });

    it("handles switchto pattern", () => {
        expect(actionIdToLabel("tab:switchto1")).toBe("Tab: Switch To 1");
    });
});

describe("parseSearchInput", () => {
    it("returns no prefix for plain text", () => {
        expect(parseSearchInput("hello")).toEqual({ prefix: null, query: "hello" });
    });

    it("detects > prefix", () => {
        expect(parseSearchInput(">search")).toEqual({ prefix: ">", query: "search" });
    });

    it("detects $ prefix", () => {
        expect(parseSearchInput("$deploy")).toEqual({ prefix: "$", query: "deploy" });
    });

    it("detects ~ prefix", () => {
        expect(parseSearchInput("~work")).toEqual({ prefix: "~", query: "work" });
    });

    it("handles prefix with no query", () => {
        expect(parseSearchInput(">")).toEqual({ prefix: ">", query: "" });
    });

    it("trims whitespace from query", () => {
        expect(parseSearchInput("> search ")).toEqual({ prefix: ">", query: "search" });
    });
});

describe("filterItems", () => {
    const items: CommandPaletteItem[] = [
        { id: "tab:new", label: "Tab: New", category: "app", keybinding: "⌘T", handler: () => {} },
        { id: "block:close", label: "Block: Close", category: "app", keybinding: "⌘W", handler: () => {} },
        { id: "custom:deploy", label: "Deploy staging", category: "custom", handler: () => {} },
        { id: "workspace:default", label: "default", category: "workspace", handler: () => {} },
    ];

    it("returns all items with empty query and no prefix", () => {
        expect(filterItems(items, null, "")).toHaveLength(4);
    });

    it("filters by substring match", () => {
        const result = filterItems(items, null, "tab");
        expect(result).toHaveLength(1);
        expect(result[0].id).toBe("tab:new");
    });

    it("is case insensitive", () => {
        const result = filterItems(items, null, "DEPLOY");
        expect(result).toHaveLength(1);
        expect(result[0].id).toBe("custom:deploy");
    });

    it("filters by > prefix to app category", () => {
        const result = filterItems(items, ">", "");
        expect(result.every((i) => i.category === "app")).toBe(true);
        expect(result).toHaveLength(2);
    });

    it("filters by $ prefix to custom category", () => {
        const result = filterItems(items, "$", "");
        expect(result.every((i) => i.category === "custom")).toBe(true);
    });

    it("filters by ~ prefix to workspace category", () => {
        const result = filterItems(items, "~", "");
        expect(result.every((i) => i.category === "workspace")).toBe(true);
    });

    it("combines prefix and query filtering", () => {
        const result = filterItems(items, ">", "close");
        expect(result).toHaveLength(1);
        expect(result[0].id).toBe("block:close");
    });
});

describe("sortByRecency", () => {
    const items: CommandPaletteItem[] = [
        { id: "a", label: "Alpha", category: "app", handler: () => {} },
        { id: "b", label: "Beta", category: "app", handler: () => {} },
        { id: "c", label: "Charlie", category: "app", handler: () => {} },
    ];

    it("sorts recently used items first", () => {
        const history: Record<string, number> = { c: 1000, a: 500 };
        const result = sortByRecency(items, history);
        expect(result[0].id).toBe("c");
        expect(result[1].id).toBe("a");
        expect(result[2].id).toBe("b");
    });

    it("sorts alphabetically when no history", () => {
        const result = sortByRecency(items, {});
        expect(result[0].id).toBe("a");
        expect(result[1].id).toBe("b");
        expect(result[2].id).toBe("c");
    });

    it("sorts unused items alphabetically after recent ones", () => {
        const history: Record<string, number> = { b: 1000 };
        const result = sortByRecency(items, history);
        expect(result[0].id).toBe("b");
        expect(result[1].id).toBe("a");
        expect(result[2].id).toBe("c");
    });
});
