import { describe, expect, it } from "vitest";
import { escapePathForShell } from "./termutil";

describe("escapePathForShell", () => {
    it("wraps a simple path in single quotes", () => {
        expect(escapePathForShell("/Users/me/photo.png")).toBe("'/Users/me/photo.png'");
    });

    it("handles paths with spaces", () => {
        expect(escapePathForShell("/Users/me/my file.png")).toBe("'/Users/me/my file.png'");
    });

    it("escapes embedded single quotes", () => {
        expect(escapePathForShell("/Users/me/it's a file.png")).toBe("'/Users/me/it'\\''s a file.png'");
    });

    it("handles paths with multiple single quotes", () => {
        expect(escapePathForShell("/tmp/it's a 'test'.txt")).toBe("'/tmp/it'\\''s a '\\''test'\\''.txt'");
    });

    it("handles paths with special shell characters", () => {
        expect(escapePathForShell("/tmp/file with $vars & pipes|here")).toBe(
            "'/tmp/file with $vars & pipes|here'"
        );
    });

    it("handles a simple filename with no special characters", () => {
        expect(escapePathForShell("/tmp/file.txt")).toBe("'/tmp/file.txt'");
    });
});
