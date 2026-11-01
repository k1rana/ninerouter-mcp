export function toPrettyJson(value: unknown): string {
    return JSON.stringify(value, null, 2);
}

/**
 * Attach notes about what was changed on the way to the provider, so a caller
 * can tell an applied filter from a dropped one.
 */
export function attachWarnings(payload: unknown, warnings: string[]): unknown {
    if (warnings.length === 0) {
        return payload;
    }
    if (typeof payload === 'object' && payload !== null && !Array.isArray(payload)) {
        return { ...(payload as Record<string, unknown>), warnings };
    }
    return { result: payload, warnings };
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
