import { createProvider } from './providers/index.js';

/**
 * Provider-instance pool: each provider (and its SDK client / HTTP agent) is
 * created once and lives for the daemon's lifetime. providerConfig is fixed at
 * boot — consistent with the secrets keyring's read-once semantics — so key
 * rotation is a daemon restart, never a hot swap.
 */
export function createProviderPool(providerConfig) {
    const instances = new Map();

    return {
        get(provider) {
            if (!instances.has(provider)) {
                instances.set(provider, createProvider({ provider, providerConfig }));
            }
            return instances.get(provider);
        },
        names() {
            return [...instances.keys()];
        }
    };
}
