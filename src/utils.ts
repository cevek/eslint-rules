import path from "node:path";

/**
 * PascalCase: starts with uppercase, has at least one lowercase letter,
 * NOT ALL_CAPS_SNAKE like MAX_COUNT
 */
export function isPascalCase(name: string): boolean {
    // Fast path: must start with A-Z
    const c0 = name.charCodeAt(0);
    if (c0 < 65 || c0 > 90) return false;
    // Reject ALL_CAPS_SNAKE — at least one a-z must be present
    for (let i = 1; i < name.length; i++) {
        const c = name.charCodeAt(i);
        if (c >= 97 && c <= 122) return true; // found lowercase
        // allow A-Z, 0-9
        if (
            (c >= 65 && c <= 90) ||
            (c >= 48 && c <= 57)
        )
            continue;
        // anything else (underscore, etc.) — not pascal
        return false;
    }
    return false;
}

/**
 * Custom hook: starts with "use" + uppercase letter
 */
export function isHookName(name: string): boolean {
    if (name.length < 4) return false;
    return (
        name.charCodeAt(0) === 117 && // 'u'
        name.charCodeAt(1) === 115 && // 's'
        name.charCodeAt(2) === 101 && // 'e'
        name.charCodeAt(3) >= 65 &&
        name.charCodeAt(3) <= 90
    );
}

/**
 * Check if a file is a component file: .tsx extension, basename starts with uppercase
 */
export function isComponentFile(filename: string): boolean {
    const basename = path.basename(filename);
    if (!basename.endsWith(".tsx")) return false;
    const c0 = basename.charCodeAt(0);
    return c0 >= 65 && c0 <= 90;
}

/**
 * Get component name from filename: "Foo.tsx" -> "Foo"
 */
export function getComponentNameFromFile(filename: string): string {
    return path.basename(filename, ".tsx");
}
