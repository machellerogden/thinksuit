/**
 * evaluateRules handler - core logic only
 * Pure decision plane - applies rules to signals to derive facts
 */

import { RulesEngine } from 'the-rules-engine';
import { PIPELINE_EVENTS, PROCESSING_EVENTS } from '../constants/events.js';
import { generatePolicyRules } from '../policy/generatePolicyRules.js';
import { systemEnforcementRules } from '../policy/systemEnforcementRules.js';
import { systemPlanSelectionRule } from '../policy/systemPlanSelectionRule.js';
import { systemValidationRules } from '../policy/systemValidationRules.js';

const MAX_CYCLES = 32; // Blueprint-specified hard cap

/**
 * Creates an empty fact map with system-reserved fact types
 */
function createEmptyFactMap() {
    return {
        ExecutionPlan: [],
        RoleSelection: [],
        Signal: [],
        Derived: [],
        Adaptation: [],
        TokenMultiplier: [],
        Capability: [],
        SelectedPlan: []
    };
}

/**
 * Queries the rules engine for system-reserved fact types
 * @param {RulesEngine} engine - The rules engine instance
 * @returns {Object} Structured map of facts by type
 */
function querySystemFacts(engine) {
    return {
        ExecutionPlan: engine
            .query('ExecutionPlan')
            .execute()
            .map((f) => f.data)
            .sort((a,b) => (b.confidence || 0) - (a.confidence || 0)),

        RoleSelection: engine
            .query('RoleSelection')
            .execute()
            .map((f) => f.data)
            .sort((a, b) => (b.confidence || 0) - (a.confidence || 0)),

        Signal: engine
            .query('Signal')
            .execute()
            .map((f) => f.data),
        Derived: engine
            .query('Derived')
            .execute()
            .map((f) => f.data),
        Adaptation: engine
            .query('Adaptation')
            .execute()
            .map((f) => f.data),
        TokenMultiplier: engine
            .query('TokenMultiplier')
            .execute()
            .map((f) => f.data),
        Capability: engine
            .query('Capability')
            .execute()
            .map((f) => f.data),
        SelectedPlan: engine
            .query('SelectedPlan')
            .execute()
            .map((f) => f.data)
    };
}

/**
 * Core rule evaluation logic
 * @param {Object} input - { signals, rules, context }
 * @param {Object} ctx - Enhanced context from middleware
 * @returns {Object} - { factMap: Object, metrics: Object }
 */
export async function evaluateRulesCore(input, machineContext) {
    // Handle null/undefined inputs gracefully
    if (!input) {
        return {
            factMap: createEmptyFactMap(),
            metrics: { error: 'No input provided' }
        };
    }

    const { facts = [], context = {} } = input;

    // load rules from module
    const moduleRules = machineContext.module?.rules || [];

    // Generate policy rules from config
    const policy = context?.config?.policy || machineContext.config?.policy || {};
    const policyRules = generatePolicyRules(policy);

    // Combine all rules: module rules, then policy rules, then system enforcement, then validation, then plan selection
    const rules = [...moduleRules, ...policyRules, ...systemEnforcementRules, ...systemValidationRules, systemPlanSelectionRule];

    const { traceId, sessionId } = context;
    const startTime = Date.now();
    const logger = machineContext.execLogger;

    // Generate unique boundary ID for this pipeline stage
    const boundaryId = `pipeline-rule_evaluation-${sessionId}-${Date.now()}`;

    logger.info(
        {
            event: PIPELINE_EVENTS.RULE_EVALUATION_START,
            eventRole: 'boundary_start',
            boundaryType: 'pipeline',
            boundaryId,
            parentBoundaryId: context?.parentBoundaryId || null,
            traceId,

            data: {
                stage: 'rule_evaluation',
                signalCount: facts.length,
                ruleCount: rules.length,
                moduleRuleCount: moduleRules.length,
                policyRuleCount: policyRules.length,
                systemRuleCount: systemEnforcementRules.length
            }
        },
        'Starting rule evaluation'
    );

    // Extract initial facts from signals
    const initialFacts = facts;

    // If no rules provided, just return the initial facts as a factMap
    if (rules.length === 0) {
        logger.debug({ traceId }, 'No rules provided, returning initial facts');
        const factMap = createEmptyFactMap();
        factMap.Signal = initialFacts.filter((f) => f.type === 'Signal');
        return {
            factMap,
            metrics: {
                duration: Date.now() - startTime
            }
        };
    }

    try {
        // Initialize The Rules Engine with max cycles from blueprint
        // Enable rules engine tracing if ThinkSuit tracing is active
        const engine = new RulesEngine({
            maxCycles: MAX_CYCLES,
            trace: machineContext.config?.trace === true
        });

        // Add initial facts to the engine
        initialFacts.forEach((fact) => {
            try {
                engine.addFact(fact);
            } catch (error) {
                logger.warn(
                    {
                        traceId,

                        data: {
                            fact,
                            error: error.message
                        }
                    },
                    'Failed to add initial fact'
                );
            }
        });

        // Add rules to the engine with error handling
        rules.forEach((rule) => {
            try {
                // Validate rule structure
                if (!rule || typeof rule.action !== 'function') {
                    logger.warn(
                        {
                            traceId,
                            data: {
                                ruleName: rule?.name
                            }
                        },
                        'Skipping malformed rule'
                    );
                    return;
                }

                // Wrap the rule action to inject provenance
                const originalAction = rule.action;
                const wrappedRule = {
                    ...rule,
                    salience: rule.salience ?? 0, // Default salience if not provided
                    action: (facts, engine, bindings) => {
                        // Monkey-patch engine.addFact to inject/merge provenance
                        const originalAddFact = engine.addFact.bind(engine);
                        engine.addFact = (fact) => {
                            // Merge with existing provenance, auto-injected fields take precedence
                            fact.provenance = {
                                ...fact.provenance,  // Keep module-provided fields
                                source: 'rule',      // Always set source
                                producer: rule.name || 'unnamed'  // Always set producer
                            };
                            originalAddFact(fact);
                        };

                        // Execute original action with bindings passed through
                        originalAction(facts, engine, bindings);
                    }
                };

                engine.addRule(wrappedRule);
            } catch (error) {
                logger.error(
                    {
                        traceId,

                        data: {
                            ruleName: rule?.name,
                            error: error.message
                        }
                    },
                    'Failed to add rule'
                );
            }
        });

        // Run the rules engine
        let factMap;
        try {

            logger.debug(
                {
                    event: PROCESSING_EVENTS.RULES_START,
                    traceId
                },
                'Starting rules engine'
            );

            engine.run();

            // Log execution trace if tracing is enabled
            if (machineContext.config?.trace === true) {
                const executionTrace = engine.getExecutionTrace();
                if (executionTrace && executionTrace.length > 0) {
                    logger.debug(
                        {
                            traceId,
                            event: PIPELINE_EVENTS.RULE_EXECUTION_TRACE,

                            data: {
                                executionTrace,
                                traceEntryCount: executionTrace.length
                            }
                        },
                        'Rules engine execution trace'
                    );
                }
            }

            // Query for specific fact types we need (not all facts)
            factMap = querySystemFacts(engine);

            // Count total facts for logging
            const totalFactCount =
                factMap.ExecutionPlan.length +
                factMap.RoleSelection.length +
                factMap.Signal.length +
                factMap.Derived.length +
                factMap.Adaptation.length +
                factMap.TokenMultiplier.length;

            logger.debug(
                {
                    event: PROCESSING_EVENTS.RULES_COMPLETE,
                    traceId,

                    data: {
                        factCount: totalFactCount,
                        duration: Date.now() - startTime
                    }
                },
                'Rules engine completed'
            );
        } catch (error) {
            // Log execution trace on error if tracing is enabled
            if (machineContext.config?.trace === true) {
                const executionTrace = engine.getExecutionTrace();
                if (executionTrace && executionTrace.length > 0) {
                    logger.debug(
                        {
                            traceId,
                            event: PIPELINE_EVENTS.RULE_EXECUTION_TRACE,

                            data: {
                                executionTrace,
                                traceEntryCount: executionTrace.length,
                                errorMessage: error.message
                            }
                        },
                        'Rules engine execution trace (error path)'
                    );
                }
            }

            // The Rules Engine throws when it hits max cycles (we set it to 32)
            if (error.message && error.message.includes(`Max cycles (${MAX_CYCLES})`)) {

                // Still try to get the facts that were created before the loop
                try {
                    factMap = querySystemFacts(engine);
                } catch {
                    logger.error({ traceId }, 'Failed to query facts after loop detection');
                    factMap = createEmptyFactMap();
                    factMap.Signal = initialFacts.filter((f) => f.type === 'Signal');
                }

                logger.warn(
                    {
                        traceId,
                        data: {
                            error: error.message
                        }
                    },
                    'Rules engine detected infinite loop'
                );

                const loopMetrics = {
                    error: `Loop detected: ${error.message}`,
                    duration: Date.now() - startTime,
                    loopDetected: true,
                    iterations: MAX_CYCLES
                };

                const loopFactCount =
                    factMap.ExecutionPlan.length +
                    factMap.RoleSelection.length +
                    factMap.Signal.length +
                    factMap.Derived.length +
                    factMap.Adaptation.length +
                    factMap.TokenMultiplier.length;

                logger.info(
                    {
                        event: PIPELINE_EVENTS.RULE_EVALUATION_COMPLETE,
                        eventRole: 'boundary_end',
                        boundaryType: 'pipeline',
                        boundaryId,
                        parentBoundaryId: context?.parentBoundaryId || null,
                        traceId,
                        data: {
                            stage: 'rule_evaluation',
                            metrics: loopMetrics,
                            inputFactCount: facts.length,
                            finalFactCount: loopFactCount,
                            ruleCount: rules.length,
                            moduleRuleCount: moduleRules.length,
                            policyRuleCount: policyRules.length,
                            systemRuleCount: systemEnforcementRules.length,
                            factTypes: Object.keys(factMap).filter(
                                (k) =>
                                    factMap[k] &&
                                    (Array.isArray(factMap[k]) ? factMap[k].length > 0 : true)
                            ),
                            factMap: factMap,
                            loopDetected: true,
                            hasError: true
                        }
                    },
                    'Rule evaluation completed with loop detection'
                );

                return { factMap, metrics: loopMetrics };
            } else {
                // Some other error occurred
                logger.error(
                    {
                        traceId,

                        data: {
                            error: error.message,
                            stack: error.stack
                        }
                    },
                    'Rules engine error'
                );


                // Try to return whatever facts we have
                try {
                    factMap = querySystemFacts(engine);
                } catch {
                    // If we can't query, return the initial facts at least
                    factMap = createEmptyFactMap();
                    factMap.Signal = initialFacts.filter((f) => f.type === 'Signal');
                }

                const errorMetrics = {
                    error: `Engine error: ${error.message}`,
                    duration: Date.now() - startTime
                };

                const errorFactCount =
                    factMap.ExecutionPlan.length +
                    factMap.RoleSelection.length +
                    factMap.Signal.length +
                    factMap.Derived.length +
                    factMap.Adaptation.length +
                    factMap.TokenMultiplier.length;

                logger.info(
                    {
                        event: PIPELINE_EVENTS.RULE_EVALUATION_COMPLETE,
                        eventRole: 'boundary_end',
                        boundaryType: 'pipeline',
                        boundaryId,
                        parentBoundaryId: context?.parentBoundaryId || null,
                        traceId,
                        data: {
                            stage: 'rule_evaluation',
                            metrics: errorMetrics,
                            inputFactCount: facts.length,
                            finalFactCount: errorFactCount,
                            ruleCount: rules.length,
                            moduleRuleCount: moduleRules.length,
                            policyRuleCount: policyRules.length,
                            systemRuleCount: systemEnforcementRules.length,
                            factTypes: Object.keys(factMap).filter(
                                (k) =>
                                    factMap[k] &&
                                    (Array.isArray(factMap[k]) ? factMap[k].length > 0 : true)
                            ),
                            factMap: factMap,
                            hasError: true
                        }
                    },
                    'Rule evaluation completed with error'
                );

                return { factMap, metrics: errorMetrics };
            }
        }

        // Calculate final duration
        const duration = Date.now() - startTime;

        // Warn if evaluation exceeded 100ms budget
        if (duration > 100) {
            const totalFactCount =
                factMap.executionPlans.length +
                factMap.roleSelections.length +
                factMap.signals.length +
                factMap.derived.length +
                factMap.adaptations.length +
                factMap.tokenMultipliers.length;

            logger.warn(
                {
                    traceId,

                    data: {
                        duration,
                        ruleCount: rules.length,
                        factCount: totalFactCount
                    }
                },
                'Rule evaluation exceeded 100ms budget'
            );
        }

        const finalFactCount =
            factMap.ExecutionPlan.length +
            factMap.RoleSelection.length +
            factMap.Signal.length +
            factMap.Derived.length +
            factMap.Adaptation.length +
            factMap.TokenMultiplier.length;

        logger.info(
            {
                event: PIPELINE_EVENTS.RULE_EVALUATION_COMPLETE,
                eventRole: 'boundary_end',
                boundaryType: 'pipeline',
                boundaryId,
                parentBoundaryId: context?.parentBoundaryId || null,
                traceId,

                data: {
                    stage: 'rule_evaluation',
                    metrics: { duration },
                    inputFactCount: facts.length,
                    finalFactCount,
                    ruleCount: rules.length,
                    moduleRuleCount: moduleRules.length,
                    policyRuleCount: policyRules.length,
                    systemRuleCount: systemEnforcementRules.length,
                    factTypes: Object.keys(factMap).filter(
                        (k) =>
                            factMap[k] && (Array.isArray(factMap[k]) ? factMap[k].length > 0 : true)
                    ),
                    factMap: factMap, // Include the full factMap for detailed display
                    hasError: false
                }
            },
            'Rule evaluation completed'
        );

        return { factMap, metrics: { duration } };
    } catch (error) {
        logger.error(
            {
                traceId,
                data: {
                    error: error.message,
                    stack: error.stack
                }
            },
            'Rule evaluation failed'
        );

        // Return initial facts on complete failure
        const fallbackFactMap = createEmptyFactMap();
        fallbackFactMap.Signal = initialFacts.filter((f) => f.type === 'Signal');

        return {
            factMap: fallbackFactMap,
            metrics: {
                error: error.message,
                duration: Date.now() - startTime
            }
        };
    }
}
