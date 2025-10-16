/**
 * detectSignals handler - core logic only
 * Pure decision plane with optional LLM enhancement
 */

import { PIPELINE_EVENTS, SYSTEM_EVENTS, PROCESSING_EVENTS } from '../constants/events.js';
import { DEFAULT_MODULE } from '../constants/defaults.js';
import { callLLM } from '../providers/io.js';

const MIN_CONFIDENCE = 0.6;

/**
 * Core signal detection logic
 * @param {Object} input - { thread, context, profile, budgetMs }
 * @param {Object} machineContext - Machine context with config
 * @returns {Object} - { facts: Signal[] }
 */
export async function detectSignalsCore(input, machineContext) {
    const { thread, context, profile, budgetMs } = input;
    const traceId = context?.traceId;
    const sessionId = context?.sessionId;
    const config = machineContext?.config;
    const logger = machineContext.execLogger;

    const dimensionPolicy = context?.config?.policy?.perception?.dimensions || {};

    // Module must provide classifiers
    const module = machineContext?.module;
    if (!module?.classifiers) {
        logger.error({ traceId }, 'Module does not provide classifiers');
        return { facts: [] };
    }
    const classifiers = module.classifiers;

    const callLLMFn = config?.apiKey ? (params, toolSchemas) => callLLM(machineContext, params, toolSchemas) : null;
    const classifierConfig = callLLMFn
        ? {
            ...config,
            callLLM: callLLMFn
        }
        : config;

    const hasLLM = !!callLLMFn;

    // Generate unique boundary ID for this pipeline stage
    const boundaryId = `pipeline-signal_detection-${sessionId}-${Date.now()}`;

    const parentBoundaryId = context?.parentBoundaryId || null;

    logger.info(
        {
            event: PIPELINE_EVENTS.SIGNAL_DETECTION_START,
            eventRole: 'boundary_start',
            boundaryType: 'pipeline',
            boundaryId,
            parentBoundaryId,
            data: {
                stage: 'signal_detection',
                threadLength: thread?.length,
                mode: hasLLM ? 'llm-enhanced' : 'regex-only',
                usingModuleClassifiers: !!module?.classifiers,
                profile: profile || 'default',
                budgetMs: budgetMs || null,
                dimensionPolicy: dimensionPolicy || null
            }
        },
        'Starting signal detection'
    );

    // Trace-level logging for full thread content
    logger.trace(
        {
            event: PROCESSING_EVENTS.INPUT_RECEIVED,
            traceId,
            boundaryType: 'pipeline',
            boundaryId,
            parentBoundaryId,
            data: {
                handler: 'detectSignals',
                thread,
                context,
                module: module?.name
            }
        },
        'detectSignals input'
    );

    if (!thread || thread.length === 0) {
        logger.warn({ traceId }, 'Empty thread provided to detectSignals');
        return { facts: [] };
    }

    try {
        // Run all classifiers in parallel for performance
        const startTime = Date.now();
        const classifierPromises = Object.entries(classifiers).map(
            async ([dimension, classifier]) => {
                const dimensionStart = Date.now();
                try {
                    // Pass IO config and logger to classifier for optional LLM enhancement
                    // Note: profile is a hint only - modules control implementation
                    const signals = await classifier(thread, classifierConfig, logger);
                    const duration = Date.now() - dimensionStart;

                    // Warn if classifier exceeds 2000ms budget
                    if (duration > 2000) {
                        logger.warn(
                            {
                                traceId,
                                event: SYSTEM_EVENTS.PERFORMANCE_WARNING,
                                boundaryType: 'pipeline',
                                boundaryId,
                                parentBoundaryId,
                                data: {
                                    component: 'classifier',
                                    dimension,
                                    duration,
                                    budget: 2000
                                }
                            },
                            'Classifier exceeded 2000ms budget'
                        );
                    }

                    return { dimension, signals, duration };
                } catch (error) {
                    logger.error(
                        {
                            event: PROCESSING_EVENTS.CLASSIFIER_FAILED,
                            traceId,
                            boundaryType: 'pipeline',
                            boundaryId,
                            parentBoundaryId,
                            data: {
                                dimension,
                                error: error.message
                            }
                        },
                        'Classifier failed'
                    );
                    return { dimension, signals: [], duration: Date.now() - dimensionStart };
                }
            }
        );

        const classifierResults = await Promise.all(classifierPromises);
        const totalDuration = Date.now() - startTime;

        logger.debug(
            {
                event: PROCESSING_EVENTS.CLASSIFIER_COMPLETE,
                traceId,
                data: {
                    totalDuration
                }
            },
            'All classifiers completed'
        );

        // Transform classifier outputs to Signal facts with provenance
        const facts = [];
        const moduleNs = module?.namespace && module?.name
            ? `${module.namespace}/${module.name}`
            : DEFAULT_MODULE;

        for (const { dimension, signals, duration } of classifierResults) {
            for (const { signal, confidence } of signals) {
                // Apply confidence threshold
                if (confidence >= MIN_CONFIDENCE) {
                    facts.push({
                        ns: moduleNs,
                        type: 'Signal',
                        dimension,
                        signal,
                        confidence,
                        provenance: {
                            source: 'classifier',
                            producer: dimension,
                            profile: profile || null,
                            durationMs: duration
                        }
                    });
                }
            }
        }

        logger.info(
            {
                traceId,
                event: PIPELINE_EVENTS.SIGNAL_DETECTION_COMPLETE,
                eventRole: 'boundary_end',
                boundaryType: 'pipeline',
                boundaryId,
                parentBoundaryId,
                data: {
                    stage: 'signal_detection',
                    factCount: facts.length,
                    dimensions: [...new Set(facts.map((f) => f.dimension))],
                    duration: totalDuration,
                    mode: hasLLM ? 'llm-enhanced' : 'regex-only',
                    signals: facts // Include the full signal array
                }
            },
            'Signal detection completed'
        );

        // Trace-level logging for detected signals
        logger.trace(
            {
                event: PROCESSING_EVENTS.OUTPUT_GENERATED,
                traceId,
                boundaryType: 'pipeline',
                boundaryId,
                parentBoundaryId,
                data: {
                    handler: 'detectSignals',
                    facts,
                    classifierResults,
                    duration: totalDuration
                }
            },
            'detectSignals output'
        );

        return { facts };
    } catch (error) {
        logger.error(
            {
                event: PIPELINE_EVENTS.SIGNAL_DETECTION_FAILED,
                traceId,
                boundaryType: 'pipeline',
                boundaryId,
                parentBoundaryId,
                data: {
                    error: error.message
                }
            },
            'Signal detection failed'
        );
        return { facts: [] };
    }
}
