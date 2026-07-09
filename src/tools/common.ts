export function pickModel(model?: string, provider?: string): string {
    const selected = model ?? provider;
    if (!selected) {
        throw new Error("Provide either model or provider.");
    }

    return selected;
}

export function toPrettyJson(value: unknown): string {
    return JSON.stringify(value, null, 2);
}