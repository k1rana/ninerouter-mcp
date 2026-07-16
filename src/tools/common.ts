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

    const errorSummary = errors.map((e) => `${e.model}: ${e.error}`).join('; ');
    throw new Error(`All models failed. Errors: ${errorSummary}`);
}
