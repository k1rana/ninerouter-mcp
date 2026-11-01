/**
 * Web provider id resolution: 9Router publishes catalog ids like `tavily/search`,
 * but `/v1/search` wants the provider and rejects the catalog id outright.
 */

export type WebAction = 'search' | 'fetch';

export type ResolvedWebModel = {
    /** Id to send to 9Router: the provider alias, without the action suffix. */
    id: string;
    /** Action the catalog id named, when it carried one. */
    action?: WebAction;
};

const WEB_ACTIONS: readonly string[] = ['search', 'fetch'];

export function resolveWebModelId(requested: string): ResolvedWebModel {
    const trimmed = requested.trim();
    const separator = trimmed.lastIndexOf('/');
    if (separator > 0) {
        const suffix = trimmed.slice(separator + 1).toLowerCase();
        if (WEB_ACTIONS.includes(suffix)) {
            return { id: trimmed.slice(0, separator), action: suffix as WebAction };
        }
    }
    return { id: trimmed };
}
