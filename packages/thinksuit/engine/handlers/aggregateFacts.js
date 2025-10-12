/**
 * aggregateFacts handler - core logic only
 * Pure decision plane - deduplicates and normalizes facts
 */

import { PIPELINE_EVENTS, PROCESSING_EVENTS } from '../constants/events.js';

/**
 * Flatten config object to path notation
 * @param {Object} obj - Object to flatten
 * @param {string} prefix - Path prefix
 * @returns {Array} - Array of { path, value } pairs
 */
function flattenConfig(obj, prefix = '') {
    const results = [];

    for (const [key, value] of Object.entries(obj)) {
        const path = prefix ? `${prefix}.${key}` : key;

        // Skip private keys (starting with _) and functions
        if (key.startsWith('_') || typeof value === 'function') {
            continue;
        }

        // Recursively flatten objects, but not arrays
        if (value && typeof value === 'object' && !Array.isArray(value)) {
            results.push(...flattenConfig(value, path));
        } else {
            results.push({ path, value });
        }
    }

    return results;
}

/**
 * Core fact aggregation logic
 * @param {Object} input - { signals, context }
 * @param {Object} machineContext - Machine context with config and logger
 * @returns {Object} - { facts: Signal[] }
 */
export async function aggregateFactsCore(input, machineContext) {
    const { signals = [], context = {} } = input || {};
    const logger = machineContext.execLogger;
    const config = machineContext?.config || {};
    const dimPolicy = context?.config?.policy?.perception?.dimensions || {};
    const traceId = context?.traceId;
    const sessionId = context?.sessionId;

    // Generate unique boundary ID for this pipeline stage
    const boundaryId = `pipeline-fact_aggregation-${sessionId}-${Date.now()}`;

    logger.info(
        {
            event: PIPELINE_EVENTS.FACT_AGGREGATION_START,
            eventRole: 'boundary_start',
            boundaryType: 'pipeline',
            boundaryId,
            parentBoundaryId: context?.parentBoundaryId || null,
            traceId,
            data: {
                stage: 'fact_aggregation',
                inputFactCount: signals.length,
                dimensionPolicies: Object.keys(dimPolicy).length
            }
        },
        'Starting fact aggregation'
    );

    // Filter by per-dimension gates
    const filtered = signals.filter((s) => {
        const p = dimPolicy[s.dimension] || {};
        const enabled = p.enabled ?? true;
        const min = p.minConfidence ?? 0;
        const passes = enabled && (s.confidence ?? 0) >= min;

        if (!passes) {
            logger.debug(
                {
                    traceId,
                    data: {
                        dimension: s.dimension,
                        signal: s.signal,
                        confidence: s.confidence,
                        enabled,
                        minConfidence: min
                    }
                },
                'Signal filtered by dimension policy'
            );
        }

        return passes;
    });

    // Dedupe by (type, dimension, signal|name) taking highest confidence
    const key = (f) => `${f.type}|${f.dimension}|${f.signal || f.name || ''}`;
    const map = new Map();

    for (const f of filtered) {
        const k = key(f);
        const prev = map.get(k);
        if (!prev || (f.confidence ?? 0) > (prev.confidence ?? 0)) {
            if (prev) {
                logger.trace(
                    {
                        traceId,
                        data: {
                            key: k,
                            previousConfidence: prev.confidence,
                            newConfidence: f.confidence
                        }
                    },
                    'Replacing duplicate with higher confidence'
                );
            }
            map.set(k, f);
        }
    }

    const facts = Array.from(map.values());

    // Add config facts
    const configPairs = flattenConfig(config);
    const configFacts = configPairs.map(({ path, value }) => ({
        type: 'Config',
        name: path,
        data: { value }
    }));

    // Create single ToolAvailability fact with all discovered tools
    const toolFacts = [];
    if (machineContext.discoveredTools && Object.keys(machineContext.discoveredTools).length > 0) {
        toolFacts.push({
            type: 'ToolAvailability',
            data: {
                tools: Object.keys(machineContext.discoveredTools)
                // Don't include metadata - it contains unserializable MCP client objects
            }
        });
    }

    // Add provider capability facts
    const capabilityFacts = [];
    logger.debug({
        event: 'debug.capability_check',
        traceId,
        data: {
            hasProvider: !!config.provider,
            hasModel: !!config.model,
            provider: config.provider,
            model: config.model
        }
    }, 'Checking config for provider capabilities');
    if (config.provider && config.model) {
        try {
            const { createProvider } = await import(/* @vite-ignore */ '../providers/index.js');
            const provider = createProvider(config);
            const capabilities = provider.getCapabilities(config.model);

            // Add capability facts
            if (capabilities.supports) {
                for (const [feature, supported] of Object.entries(capabilities.supports)) {
                    capabilityFacts.push({
                        type: 'Capability',
                        name: `provider.${feature}`,
                        data: { value: supported }
                    });
                }
            }
        } catch (error) {
            logger.warn({ error: error.message }, 'Failed to get provider capabilities');
        }
    }

    // Combine all facts: signals, config, tools, and capabilities
    const allFacts = [...facts, ...configFacts, ...toolFacts, ...capabilityFacts];

    logger.info(
        {
            event: PIPELINE_EVENTS.FACT_AGGREGATION_COMPLETE,
            eventRole: 'boundary_end',
            boundaryType: 'pipeline',
            boundaryId,
            parentBoundaryId: context?.parentBoundaryId || null,
            traceId,
            data: {
                stage: 'fact_aggregation',
                inputCount: signals.length,
                filteredCount: filtered.length,
                deduplicatedCount: facts.length,
                configFactCount: configFacts.length,
                totalFactCount: allFacts.length,
                dimensionsPresent: [...new Set(facts.map((f) => f.dimension).filter(Boolean))],
                aggregatedFacts: allFacts // Include full facts array for UI display
            }
        },
        'Fact aggregation completed'
    );

    // Trace-level logging for aggregated facts
    logger.trace(
        {
            event: PROCESSING_EVENTS.OUTPUT_GENERATED,
            traceId,
            data: {
                handler: 'aggregateFacts',
                facts: allFacts,
                deduplicationMap: Object.fromEntries(map)
            }
        },
        'aggregateFacts output'
    );

    return { facts: allFacts };
}
