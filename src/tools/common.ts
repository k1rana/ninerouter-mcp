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

type ModelFallbackError = {
    model: string;
    error: string;
};

export async function tryModelsWithFallback<T>(
    models: string[],
    operation: (model: string) => Promise<T>,
): Promise<T> {
    const errors: ModelFallbackError[] = [];

    for (const model of models) {
        try {
            return await operation(model);
        } catch (error) {
            errors.push({
                model,
                error: error instanceof Error ? error.message : String(error),
            });
        }
    }

    const errorSummary = errors.map((e) => `${e.model}: ${e.error}`).join("; ");
    throw new Error(`All models failed. Errors: ${errorSummary}`);
}