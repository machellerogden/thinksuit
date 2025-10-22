/**
 * Rules for Core Thinking Companion Module
 * Defines role selection, orchestration patterns, and behavioral adaptations
 */

import { createFact } from './facts.js';

const DEFAULT_TIMEOUT_MS = 1000 * 60 * 60 * 12; // Setting to 12 hours while we're testing...

const rules = [
    // Contract-based role selection rules (highest priority)
    {
        name: 'respect-ack-or-capture',
        salience: 100,
        conditions: {
            any: [
                {
                    type: 'Signal',
                    test: (s) =>
                        s.dimension === 'contract' &&
                        s.signal === 'ack-only' &&
                        s.confidence >= 0.75
                },
                {
                    type: 'Signal',
                    test: (s) =>
                        s.dimension === 'contract' &&
                        s.signal === 'capture-only' &&
                        s.confidence >= 0.75
                }
            ]
        },
        action: (facts, engine) => {
            engine.addFact(createFact.roleSelection('assistant', 0.95));
            engine.addFact(createFact.executionPlan('direct', { name: "ack-only-direct" }));
            engine.addFact(createFact.tokenMultiplier(0.5));
        }
    },

    {
        name: 'analysis-contract-trigger',
        salience: 60,
        conditions: {
            all: [
                {
                    type: 'Signal',
                    test: (s) =>
                        s.dimension === 'contract' && s.signal === 'analyze' && s.confidence >= 0.7
                }
            ]
        },
        action: (facts, engine) => {
            engine.addFact(createFact.roleSelection('analyzer', 0.9));
            engine.addFact(createFact.executionPlan('task', {
                name: 'analyze-task',
                role: 'analyzer',
                tools: ['list_directory', 'read_file', 'search'],
                resolution: {
                    maxCycles: 8,
                    maxTokens: 15000,
                    maxToolCalls: 20,
                    timeoutMs: DEFAULT_TIMEOUT_MS
                }
            }));
        }
    },

    {
        name: 'exploration-contract-trigger',
        salience: 60,
        conditions: {
            all: [
                {
                    type: 'Signal',
                    test: (s) =>
                        s.dimension === 'contract' && s.signal === 'explore' && s.confidence >= 0.7
                }
            ]
        },
        action: (facts, engine) => {
            engine.addFact(createFact.roleSelection('explorer', 0.9));
            engine.addFact(createFact.executionPlan('task', {
                name: 'explore-task',
                role: 'explorer',
                tools: ['list_directory', 'read_file', 'search'],
                resolution: {
                    maxCycles: 10,
                    maxTokens: 20000,
                    maxToolCalls: 25,
                    timeoutMs: DEFAULT_TIMEOUT_MS
                }
            }));
        }
    },

    // Orchestration patterns
    {
        name: 'explore-and-analyze-sequential',
        salience: 65,
        conditions: {
            all: [
                {
                    type: 'Signal',
                    test: (s) =>
                        s.dimension === 'contract' && s.signal === 'explore' && s.confidence >= 0.7
                },
                {
                    type: 'Signal',
                    test: (s) =>
                        s.dimension === 'contract' && s.signal === 'analyze' && s.confidence >= 0.7
                }
            ]
        },
        action: (facts, engine) => {
            engine.addFact(createFact.executionPlan('sequential', {
                name: 'explore-analyze-seq',
                sequence: [
                    { role: 'explorer', strategy: 'task', tools: ['list_directory', 'read_file', 'search'] },
                    { role: 'analyzer', strategy: 'direct' }
                ],
                resultStrategy: 'last',
                buildThread: true, // So analyzer sees explorer's output
                rationale: 'Breadth first, then structure.',
                coverage: ['contract.explore','contract.analyze'],
                latency: 'medium',
                cost: 'medium',
                risks: ['dependency-chain'],
                assumptions: ['User intent ambiguous; exploration will inform analysis'],
                data: {
                    id: 'explore_analyze_seq',
                    origin: 'explore-and-analyze-sequential'
                }
            }));
        }
    },
    {
        name: 'explore-and-analyze-parallel',
        salience: 65,
        conditions: {
            all: [
                {
                    type: 'Signal',
                    test: (s) =>
                        s.dimension === 'contract' && s.signal === 'explore' && s.confidence >= 0.7
                },
                {
                    type: 'Signal',
                    test: (s) =>
                        s.dimension === 'contract' && s.signal === 'analyze' && s.confidence >= 0.7
                },
                {
                    type: 'Signal',
                    test: (s) =>
                        s.dimension === 'intent' && s.signal === 'parallel-execution' && s.confidence >= 0.7
                }
            ]
        },
        action: (facts, engine) => {
            engine.addFact(createFact.executionPlan('parallel', {
                name: 'explore-analyze-par',
                roles: [
                    { role: 'explorer', strategy: 'task', tools: ['list_directory', 'read_file', 'search'] },
                    { role: 'analyzer', strategy: 'task', tools: ['list_directory', 'read_file', 'search'] }
                ],
                resultStrategy: 'label',
                rationale: 'Simultaneous breadth + structure when latency matters more than dependency chaining',
                coverage: ['contract.explore','contract.analyze'],
                latency: 'low',
                cost: 'medium',
                risks: ['fanout'],
                assumptions: ['Outputs can be read side-by-side without dependence'],
                data: {
                    id: 'explore_analyze_par',
                    origin: 'explore-and-analyze-sequential'
                }
            }));
        }
    },

    {
        name: 'explore-then-analyze',
        salience: 50,
        conditions: {
            all: [
                {
                    type: 'Signal',
                    test: (s) =>
                        s.dimension === 'contract' && s.signal === 'explore' && s.confidence >= 0.7
                },
                {
                    type: 'Signal',
                    test: (s) =>
                        s.dimension === 'claim' &&
                        s.signal === 'high-quantifier' &&
                        s.confidence >= 0.6
                }
            ]
        },
        action: (facts, engine) => {
            engine.addFact(createFact.executionPlan('sequential', {
                name: 'explore-analyze-fallback',
                sequence: [
                    { role: 'explorer', strategy: 'task', tools: ['list_directory', 'read_file', 'search'] },
                    { role: 'analyzer', strategy: 'direct' }
                ],
                resultStrategy: 'last'
            }));
        }
    },

    {
        name: 'critic-for-universal-claims',
        salience: 55,
        conditions: {
            all: [
                {
                    type: 'Signal',
                    test: (s) =>
                        s.dimension === 'claim' && s.signal === 'universal' && s.confidence >= 0.7
                }
            ]
        },
        action: (facts, engine) => {
            engine.addFact(createFact.roleSelection('critic', 0.85));
        }
    },

    // Test-specified orchestration patterns
    {
        name: 'explore-with-high-quantifier',
        salience: 62,
        conditions: {
            all: [
                {
                    type: 'Signal',
                    test: (s) =>
                        s.dimension === 'contract' && s.signal === 'explore' && s.confidence >= 0.75
                },
                {
                    type: 'Signal',
                    test: (s) =>
                        s.dimension === 'claim' && s.signal === 'high-quantifier' && s.confidence >= 0.65
                }
            ]
        },
        action: (facts, engine) => {
            engine.addFact(createFact.executionPlan('sequential', {
                name: 'explore-high-quantifier',
                sequence: [
                    { role: 'explorer', strategy: 'task', tools: ['list_directory', 'read_file', 'search'] },
                    { role: 'analyzer', strategy: 'direct' }
                ],
                confidence: 0.85,
                resultStrategy: 'last',
                rationale: 'Explore broadly for high-quantifier claims, then analyze findings'
            }));
        }
    },

    {
        name: 'complex-analysis-suite',
        salience: 63,
        conditions: {
            all: [
                {
                    type: 'Signal',
                    test: (s) =>
                        s.dimension === 'contract' && s.signal === 'analyze' && s.confidence >= 0.85
                },
                {
                    type: 'Signal',
                    test: (s) =>
                        s.dimension === 'claim' && s.signal === 'universal' && s.confidence >= 0.65
                },
                {
                    type: 'Signal',
                    test: (s) =>
                        s.dimension === 'support' && s.signal === 'source-cited' && s.confidence >= 0.7
                }
            ]
        },
        action: (facts, engine) => {
            engine.addFact(createFact.executionPlan('sequential', {
                sequence: [
                    { role: 'analyzer', strategy: 'task', tools: ['list_directory', 'read_file', 'search'] },
                    { role: 'critic', strategy: 'direct' },
                    { role: 'synthesizer', strategy: 'direct' }
                ],
                confidence: 0.9,
                resultStrategy: 'last',
                rationale: 'Complex analysis with universal claims needs analysis, critique, and synthesis'
            }));
        }
    },

    {
        name: 'tool-result-optimization-flow',
        salience: 64,
        conditions: {
            all: [
                {
                    type: 'Signal',
                    test: (s) =>
                        s.dimension === 'contract' && s.signal === 'analyze' && s.confidence >= 0.75
                },
                {
                    type: 'Signal',
                    test: (s) =>
                        s.dimension === 'support' && s.signal === 'tool-result-attached' && s.confidence >= 0.8
                }
            ]
        },
        action: (facts, engine) => {
            engine.addFact(createFact.executionPlan('sequential', {
                sequence: [
                    { role: 'analyzer', strategy: 'task' },
                    { role: 'optimizer', strategy: 'direct' }
                ],
                confidence: 0.85,
                resultStrategy: 'last',
                rationale: 'Analyze tool results then optimize based on findings'
            }));
        }
    },

    {
        name: 'complex-exploration-parallel',
        salience: 61,
        conditions: {
            all: [
                {
                    type: 'Signal',
                    test: (s) =>
                        s.dimension === 'contract' && s.signal === 'explore' && s.confidence >= 0.7
                },
                {
                    type: 'Signal',
                    test: (s) =>
                        s.dimension === 'claim' && s.signal === 'forecast' && s.confidence >= 0.65
                },
                {
                    type: 'Signal',
                    test: (s) =>
                        s.dimension === 'claim' && s.signal === 'normative' && s.confidence >= 0.7
                }
            ]
        },
        action: (facts, engine) => {
            engine.addFact(createFact.executionPlan('parallel', {
                roles: ['planner', 'reflector', 'integrator'],
                confidence: 0.8,
                resultStrategy: 'label',
                rationale: 'Multi-faceted exploration benefits from parallel perspectives'
            }));
        }
    },

    {
        name: 'planner-for-forecast',
        salience: 55,
        conditions: {
            all: [
                {
                    type: 'Signal',
                    test: (s) =>
                        s.dimension === 'claim' && s.signal === 'forecast' && s.confidence >= 0.7
                }
            ]
        },
        action: (facts, engine) => {
            engine.addFact(createFact.roleSelection('planner', 0.85));
        }
    },

    {
        name: 'reflector-for-normative',
        salience: 55,
        conditions: {
            all: [
                {
                    type: 'Signal',
                    test: (s) =>
                        s.dimension === 'claim' && s.signal === 'normative' && s.confidence >= 0.7
                }
            ]
        },
        action: (facts, engine) => {
            engine.addFact(createFact.roleSelection('reflector', 0.85));
        }
    },

    // Support-based adaptations
    {
        name: 'synthesizer-for-source-cited',
        salience: 45,
        conditions: {
            all: [
                {
                    type: 'Signal',
                    test: (s) =>
                        s.dimension === 'support' &&
                        s.signal === 'source-cited' &&
                        s.confidence >= 0.7
                }
            ]
        },
        action: (facts, engine) => {
            engine.addFact(createFact.roleSelection('synthesizer', 0.8));
        }
    },

    {
        name: 'analyzer-for-tool-results',
        salience: 45,
        conditions: {
            all: [
                {
                    type: 'Signal',
                    test: (s) =>
                        s.dimension === 'support' &&
                        s.signal === 'tool-result-attached' &&
                        s.confidence >= 0.7
                }
            ]
        },
        action: (facts, engine) => {
            engine.addFact(createFact.roleSelection('analyzer', 0.8));
        }
    },

    // Calibration-based modifications
    {
        name: 'critic-for-high-certainty',
        salience: 40,
        conditions: {
            all: [
                {
                    type: 'Signal',
                    test: (s) =>
                        s.dimension === 'calibration' &&
                        s.signal === 'high-certainty' &&
                        s.confidence >= 0.7
                },
                {
                    type: 'Signal',
                    test: (s) =>
                        s.dimension === 'support' && s.signal === 'none' && s.confidence >= 0.7
                }
            ]
        },
        action: (facts, engine) => {
            engine.addFact(createFact.roleSelection('critic', 0.9));
            engine.addFact(createFact.tokenMultiplier(0.8));
        }
    },

    {
        name: 'explorer-for-hedged',
        salience: 40,
        conditions: {
            all: [
                {
                    type: 'Signal',
                    test: (s) =>
                        s.dimension === 'calibration' &&
                        s.signal === 'hedged' &&
                        s.confidence >= 0.7
                }
            ]
        },
        action: (facts, engine) => {
            engine.addFact(createFact.roleSelection('explorer', 0.75));
        }
    },

    // Temporal adaptations
    {
        name: 'analyzer-for-time-specified',
        salience: 35,
        conditions: {
            all: [
                {
                    type: 'Signal',
                    test: (s) =>
                        s.dimension === 'temporal' &&
                        s.signal === 'time-specified' &&
                        s.confidence >= 0.7
                }
            ]
        },
        action: (facts, engine) => {
            engine.addFact(createFact.adaptation('temporal-context', { signal: 'temporal-context', priority: 0.8 }));
        }
    },

    // Complex orchestration patterns
    {
        name: 'full-analysis-suite',
        salience: 30,
        conditions: {
            all: [
                {
                    type: 'Signal',
                    test: (s) =>
                        s.dimension === 'contract' && s.signal === 'analyze' && s.confidence >= 0.8
                },
                {
                    type: 'Signal',
                    test: (s) =>
                        s.dimension === 'claim' && s.signal === 'universal' && s.confidence >= 0.6
                },
                {
                    type: 'Signal',
                    test: (s) =>
                        s.dimension === 'support' &&
                        s.signal === 'source-cited' &&
                        s.confidence >= 0.6
                }
            ]
        },
        action: (facts, engine) => {
            engine.addFact(createFact.executionPlan('sequential', {
                name: 'analyze-critique-synth',
                sequence: [
                    { role: 'analyzer', strategy: 'task' },
                    { role: 'critic', strategy: 'direct' },
                    { role: 'synthesizer', strategy: 'direct' }
                ], resultStrategy: 'label' }));
        }
    },

    {
        name: 'optimization-flow',
        salience: 35,
        conditions: {
            all: [
                {
                    type: 'Signal',
                    test: (s) =>
                        s.dimension === 'contract' && s.signal === 'analyze' && s.confidence >= 0.7
                },
                {
                    type: 'Signal',
                    test: (s) =>
                        s.dimension === 'support' &&
                        s.signal === 'tool-result-attached' &&
                        s.confidence >= 0.7
                }
            ]
        },
        action: (facts, engine) => {
            engine.addFact(createFact.executionPlan('sequential', {
                name: 'analyze-optimize',
                sequence: [
                    { role: 'analyzer', strategy: 'task' },
                    { role: 'optimizer', strategy: 'direct' }
                ], resultStrategy: 'last' }));
        }
    },

    {
        name: 'integration-for-complex',
        salience: 25,
        conditions: {
            all: [
                {
                    type: 'Signal',
                    test: (s) =>
                        s.dimension === 'contract' && s.signal === 'explore' && s.confidence >= 0.6
                },
                {
                    type: 'Signal',
                    test: (s) =>
                        s.dimension === 'claim' && s.signal === 'forecast' && s.confidence >= 0.6
                },
                {
                    type: 'Signal',
                    test: (s) =>
                        s.dimension === 'claim' && s.signal === 'normative' && s.confidence >= 0.6
                }
            ]
        },
        action: (facts, engine) => {
            engine.addFact(createFact.executionPlan('parallel', {
                name: 'plan-reflect-integrate',
                roles: ['planner', 'reflector', 'integrator'], resultStrategy: 'label' }));
        }
    },


    // Default fallback - uses top-level beta test to check for absence of facts
    {
        name: 'default-assistant',
        salience: 0, // Lowest possible salience ensures this fires last
        conditions: {
            test: (facts) => {
                // This is a beta test that checks if no RoleSelection exists
                const hasRoleSelection = facts.some((f) => f.type === 'RoleSelection');
                const hasExecutionPlan = facts.some((f) => f.type === 'ExecutionPlan');
                return !hasRoleSelection && !hasExecutionPlan;
            }
        },
        action: (facts, engine) => {
            engine.addFact(createFact.roleSelection('assistant', 0.7));
            engine.addFact(createFact.executionPlan('task', {
                name: 'default-task',
                role: 'assistant',
                tools: ['list_directory', 'read_file', 'search'],
                resolution: {
                    maxCycles: 5,
                    maxTokens: 10000,
                    maxToolCalls: 15,
                    timeoutMs: DEFAULT_TIMEOUT_MS
                }
            }));
        }
    },

    /* === v0 Additions: plan & rule set A === */

    /**
     * TRIAGE when the ask is uncertain and unsupported:
     *  - Start with analysis to expose unknowns
     *  - Explore options
     *  - Synthesize a stance
     */
    {
        name: 'triage-hedged-unsupported',
        salience: 58,
        conditions: {
            all: [
                {
                    type: 'Signal',
                    test: (s) =>
                        s.dimension === 'calibration' &&
                        s.signal === 'hedged' &&
                        s.confidence >= 0.7
                },
                {
                    type: 'Signal',
                    test: (s) =>
                        s.dimension === 'support' && s.signal === 'none' && s.confidence >= 0.7
                }
            ]
        },
        action: (facts, engine) => {
            engine.addFact(createFact.executionPlan('sequential', { buildThread: true, sequence: [
                    { role: 'analyzer', adaptations: ['initial_analysis'] },
                    { role: 'explorer' },
                    { role: 'synthesizer' }
                ], resultStrategy: 'last', rationale: 'Uncertain and unsupported input benefits from analyze→explore→synthesize' }));
            engine.addFact(createFact.tokenMultiplier(1.15)); // modest budget for breadth + synthesis
        }
    },

    /**
     * RED TEAM forecasts stated with high confidence:
     *  - Run planner and critic in parallel to stress the plan and reveal risks.
     */
    {
        name: 'red-team-forecast',
        salience: 57,
        conditions: {
            all: [
                {
                    type: 'Signal',
                    test: (s) =>
                        s.dimension === 'claim' && s.signal === 'forecast' && s.confidence >= 0.7
                },
                {
                    type: 'Signal',
                    test: (s) =>
                        s.dimension === 'calibration' &&
                        s.signal === 'high-certainty' &&
                        s.confidence >= 0.7
                }
            ]
        },
        action: (facts, engine) => {
            engine.addFact(createFact.executionPlan('parallel', {
                roles: [
                    { role: 'planner', strategy: 'direct' },
                    { role: 'critic', strategy: 'direct' }
                ],
                resultStrategy: 'label', rationale: 'High-confidence forecast should be stress-tested against planning constraints and critique' }));
            engine.addFact(createFact.tokenMultiplier(1.1));
        }
    },

    /**
     * NORMATIVE without support:
     *  - Reflect on values, critique weaknesses, then plan concrete moves.
     */
    {
        name: 'normative-without-support',
        salience: 54,
        conditions: {
            all: [
                {
                    type: 'Signal',
                    test: (s) =>
                        s.dimension === 'claim' && s.signal === 'normative' && s.confidence >= 0.7
                },
                {
                    type: 'Signal',
                    test: (s) =>
                        s.dimension === 'support' && s.signal === 'none' && s.confidence >= 0.7
                }
            ]
        },
        action: (facts, engine) => {
            engine.addFact(createFact.executionPlan('sequential', {
                sequence: [
                    { role: 'reflector', strategy: 'direct' },
                    { role: 'critic', strategy: 'direct' },
                    { role: 'planner', strategy: 'direct' }
                ],
                resultStrategy: 'label',
                rationale: 'Surface values → challenge weak points → translate into steps',
                coverage: ['claim.normative','support.none'],
                latency: 'high',
                cost: 'high',
                risks: ['depth'],
                assumptions: ['Stakeholder accepts reflective framing before planning'],
                data: {
                    id: 'norm_no_support_seq',
                    origin: 'normative-without-support'
                }
            }));
            // Cheaper probe: a single reflective pass that may elicit values before heavier orchestration
            engine.addFact(createFact.executionPlan('direct', {
                name: 'norm-no-support-probe',
                role: 'reflector',
                rationale: 'Low-cost values elicitation before committing to multi-step critique and planning',
                coverage: ['claim.normative','support.none'],
                latency: 'low',
                cost: 'low',
                risks: ['insufficient depth'],
                data: {
                    id: 'norm_no_support_probe',
                    origin: 'normative-without-support'
                }
            }));
        }
    },

    /**
     * QUANTIFICATION DEMAND:
     *  - Strong quantifiers with no evidence → analyze numbers & ask for specifics.
     */
    {
        name: 'quantification-needed',
        salience: 52,
        conditions: {
            all: [
                {
                    type: 'Signal',
                    test: (s) =>
                        s.dimension === 'claim' &&
                        s.signal === 'high-quantifier' &&
                        s.confidence >= 0.7
                },
                {
                    type: 'Signal',
                    test: (s) =>
                        s.dimension === 'support' && s.signal === 'none' && s.confidence >= 0.65
                }
            ]
        },
        action: (facts, engine) => {
            engine.addFact(createFact.roleSelection('analyzer', 0.85));
            engine.addFact(createFact.adaptation('quantification-request', { signal: 'quantification-request', priority: 0.9 }));
            engine.addFact(createFact.executionPlan('task', {
                role: 'analyzer',
                tools: ['list_directory', 'read_file', 'search'], resolution: {
                    maxCycles: 6,
                    maxTokens: 12000,
                    maxToolCalls: 18,
                    timeoutMs: DEFAULT_TIMEOUT_MS
                } }));
        }
    },

    /**
     * FORECAST without dates:
     *  - Ask for a timeframe and force explicit temporal assumptions.
     */
    {
        name: 'forecast-missing-timeframe',
        salience: 50,
        conditions: {
            all: [
                {
                    type: 'Signal',
                    test: (s) =>
                        s.dimension === 'claim' && s.signal === 'forecast' && s.confidence >= 0.7
                },
                {
                    type: 'Signal',
                    test: (s) =>
                        s.dimension === 'temporal' && s.signal === 'no-date' && s.confidence >= 0.7
                }
            ]
        },
        action: (facts, engine) => {
            engine.addFact(createFact.adaptation('temporal-assumption-request', {
                directive: 'temporal-assumption-request',
                priority: 0.9
            }));
            engine.addFact(createFact.executionPlan('direct', {
                role: 'planner',
                rationale: 'Request timeframe and clarify temporal assumptions for forecast'
            }));
            engine.addFact(createFact.tokenMultiplier(0.95)); // keep it tight until timeframe is clarified
        }
    },

    /**
     * UNIVERSAL claim with sources cited:
     *  - Critic checks overreach, then synthesizer reconciles what the sources actually support.
     */
    {
        name: 'universal-with-sources',
        salience: 49,
        conditions: {
            all: [
                {
                    type: 'Signal',
                    test: (s) =>
                        s.dimension === 'claim' && s.signal === 'universal' && s.confidence >= 0.7
                },
                {
                    type: 'Signal',
                    test: (s) =>
                        s.dimension === 'support' &&
                        s.signal === 'source-cited' &&
                        s.confidence >= 0.7
                }
            ]
        },
        action: (facts, engine) => {
            engine.addFact(createFact.executionPlan('sequential', {
                name: 'critique-synthesize',
                sequence: [
                    { role: 'critic', strategy: 'direct' },
                    { role: 'synthesizer', strategy: 'direct' }
                ],
                resultStrategy: 'concat',
                rationale: 'Trim overreach then integrate cited evidence into a coherent, bounded claim' }));
        }
    },

    /**
     * TOOL RESULTS without explicit "analyze" signal:
     *  - Interpret results then optimize implications.
     */
    {
        name: 'tool-result-interpret-optimize',
        salience: 47,
        conditions: {
            all: [
                {
                    type: 'Signal',
                    test: (s) =>
                        s.dimension === 'support' &&
                        s.signal === 'tool-result-attached' &&
                        s.confidence >= 0.7
                }
            ]
        },
        action: (facts, engine) => {
            engine.addFact(createFact.executionPlan('sequential', {
                name: 'tool-analyze-optimize',
                sequence: [
                    { role: 'analyzer', strategy: 'task' },
                    { role: 'optimizer', strategy: 'direct' }
                ],
                resultStrategy: 'last',
                rationale: 'Interpret tool outputs then refine for efficiency/effect' }));
        }
    },

    /**
     * INNER/OUTER debate extended to an action plan:
     *  - Use existing inner/outer exchange, then convert convergence into a plan.
     */
    {
        name: 'inner-outer-to-plan',
        salience: 46,
        conditions: {
            all: [
                {
                    type: 'Signal',
                    test: (s) =>
                        s.dimension === 'claim' &&
                        (s.signal === 'normative' || s.signal === 'universal') &&
                        s.confidence >= 0.7
                },
                {
                    type: 'Signal',
                    test: (s) =>
                        s.dimension === 'calibration' &&
                        s.signal === 'hedged' &&
                        s.confidence >= 0.6
                }
            ]
        },
        action: (facts, engine) => {
            engine.addFact(createFact.executionPlan('sequential', {
                name: 'inner-outer-to-plan',
                buildThread: true,
                sequence: [
                    { role: 'outer_voice', adaptations: ['outer_voice_opening'] },
                    { role: 'inner_voice', adaptations: ['inner_voice_response'] },
                    { role: 'outer_voice', adaptations: ['outer_voice_challenge'] },
                    { role: 'reflector', adaptations: ['convergence_synthesis'] },
                    { role: 'planner', adaptations: ['planning_synthesis'] }
                ],
                resultStrategy: 'last',
                rationale: 'Debate to surface tensions → reflect → turn into a concrete plan',
                coverage: ['claim.normative','calibration.hedged'],
                latency: 'high',
                cost: 'high',
                risks: ['variance-high','depth'],
                data: {
                    id: 'inner_outer_to_plan',
                    origin: 'inner-outer-to-plan',
                    notes: ['Threaded conversation increases context length overhead']
                }
            }));
            engine.addFact(createFact.tokenMultiplier(1.2)); // multi-step convergence needs a bit more room
        }
    },

    // Composite adaptations
    {
        name: 'high-certainty-no-date-composite',
        salience: 20,
        conditions: {
            all: [
                {
                    type: 'Signal',
                    test: (s) =>
                        s.dimension === 'calibration' &&
                        s.signal === 'high-certainty' &&
                        s.confidence >= 0.7
                },
                {
                    type: 'Signal',
                    test: (s) =>
                        s.dimension === 'temporal' && s.signal === 'no-date' && s.confidence >= 0.7
                }
            ]
        },
        action: (facts, engine) => {
            engine.addFact({
                type: 'Derived',
                name: 'temporal-certainty-mismatch',
                directive:
                    'Qualify confidence with dated evidence or reduce certainty; explicitly note the missing temporal context.'
            });
        }
    },

    {
        name: 'anecdote-universal-composite',
        salience: 20,
        conditions: {
            all: [
                {
                    type: 'Signal',
                    test: (s) =>
                        s.dimension === 'support' && s.signal === 'anecdote' && s.confidence >= 0.7
                },
                {
                    type: 'Signal',
                    test: (s) =>
                        s.dimension === 'claim' && s.signal === 'universal' && s.confidence >= 0.7
                }
            ]
        },
        action: (facts, engine) => {
            engine.addFact(createFact.derived('anecdotal-overgeneralization', {
                directive:
                    'Strongly caveat universal claims based on anecdotal evidence; suggest systematic investigation needed.'
            }));
            engine.addFact(createFact.roleSelection('critic', 0.95));
        }
    },

    // Token adjustment rules
    {
        name: 'reduce-tokens-for-brief',
        salience: 15,
        conditions: {
            any: [
                {
                    type: 'Signal',
                    test: (s) =>
                        s.dimension === 'contract' && s.signal === 'ack-only' && s.confidence >= 0.8
                },
                {
                    type: 'Signal',
                    test: (s) =>
                        s.dimension === 'contract' &&
                        s.signal === 'capture-only' &&
                        s.confidence >= 0.8
                }
            ]
        },
        action: (facts, engine) => {
            engine.addFact(createFact.tokenMultiplier(0.4));
        }
    },

    {
        name: 'increase-tokens-for-explore',
        salience: 15,
        conditions: {
            all: [
                {
                    type: 'Signal',
                    test: (s) =>
                        s.dimension === 'contract' && s.signal === 'explore' && s.confidence >= 0.8
                }
            ]
        },
        action: (facts, engine) => {
            engine.addFact(createFact.tokenMultiplier(1.3));
        }
    },

    // Synthesis patterns
    {
        name: 'exploratory-synthesis',
        salience: 38,
        conditions: {
            all: [
                {
                    type: 'Signal',
                    test: (s) =>
                        s.dimension === 'contract' && s.signal === 'explore' && s.confidence >= 0.7
                },
                {
                    type: 'Signal',
                    test: (s) =>
                        s.dimension === 'support' &&
                        s.signal === 'source-cited' &&
                        s.confidence >= 0.7
                }
            ]
        },
        action: (facts, engine) => {
            // Explore then synthesize, showing both steps merged
            engine.addFact(createFact.executionPlan('sequential', {
                name: 'explore-synthesize',
                sequence: [
                    { role: 'explorer', strategy: 'task', tools: ['list_directory', 'read_file', 'search'] },
                    { role: 'synthesizer', strategy: 'direct' }
                ],
                resultStrategy: 'concat',
                rationale: 'Explore sources then synthesize findings into unified narrative' }));
        }
    },

    // Multi-perspective exploration
    {
        name: 'diverse-viewpoints-collection',
        salience: 35,
        conditions: {
            all: [
                {
                    type: 'Signal',
                    test: (s) =>
                        s.dimension === 'contract' && s.signal === 'explore' && s.confidence >= 0.8
                },
                {
                    type: 'Signal',
                    test: (s) =>
                        s.dimension === 'claim' && s.signal === 'normative' && s.confidence >= 0.7
                }
            ]
        },
        action: (facts, engine) => {
            // Collect diverse perspectives without combining them
            engine.addFact(createFact.executionPlan('parallel', {
                name: 'normative-perspectives',
                roles: ['explorer', 'critic', 'reflector'], resultStrategy: 'label', rationale: 'Collect multiple uncombined perspectives for normative exploration' }));
        }
    },

    // Iteration contract rules for sequential strategy with adaptations
    {
        name: 'inner-outer-debate',
        salience: 45,
        conditions: {
            all: [
                {
                    type: 'Signal',
                    test: (s) =>
                        s.dimension === 'claim' &&
                        (s.signal === 'normative' || s.signal === 'universal') &&
                        s.confidence >= 0.7
                },
                {
                    type: 'Signal',
                    test: (s) =>
                        s.dimension === 'calibration' &&
                        s.signal === 'hedged' &&
                        s.confidence >= 0.6
                }
            ]
        },
        action: (facts, engine) => {
            // When we detect normative/universal claims with hedging,
            // trigger an inner/outer voice debate to explore the tension
            engine.addFact(createFact.executionPlan('sequential', {
                name: 'inner-outer-debate',
                buildThread: true,
                resultStrategy: 'last',
                sequence: [
                    { role: 'outer_voice', adaptations: ['outer_voice_opening'] },
                    { role: 'inner_voice', adaptations: ['inner_voice_response'] },
                    { role: 'outer_voice', adaptations: ['outer_voice_challenge'] },
                    { role: 'reflector', adaptations: ['convergence_synthesis'] }
                ],
                rationale: 'Inner/outer dialogue to explore tensions in hedged universal claims'
            }));
        }
    },

    {
        name: 'critical-analysis-iterations',
        salience: 40,
        conditions: {
            all: [
                {
                    type: 'Signal',
                    test: (s) =>
                        s.dimension === 'contract' && s.signal === 'analyze' && s.confidence >= 0.8
                },
                {
                    type: 'Signal',
                    test: (s) =>
                        s.dimension === 'support' && s.signal === 'none' && s.confidence >= 0.7
                }
            ]
        },
        action: (facts, engine) => {
            // For analysis requests without supporting evidence,
            // use iterative refinement to build up the analysis
            engine.addFact(createFact.executionPlan('sequential', {
                name: 'iterative-refinement',
                buildThread: true,
                resultStrategy: 'last',
                sequence: [
                    { role: 'analyzer', adaptations: ['initial_analysis'] },
                    { role: 'analyzer', adaptations: ['deeper_investigation'] },
                    { role: 'analyzer', adaptations: ['final_assessment'] }
                ],
                rationale: 'Iterative analysis to compensate for lack of initial evidence'
            }));
        }
    },

    // Tools are now specified directly in each rule that creates ExecutionPlans
    // - Single-role task executions: tools at top level
    // - Multi-step sequences/parallel: tools on each step that needs them
    // This provides more granular control and explicit tool requirements

    // Plan precedence rule - declares the ordering of execution plans
    {
        name: 'declare-plan-precedence',
        salience: -20, // Run after all plans are created
        conditions: {
            exists: {
                type: 'ExecutionPlan'
            }
        },
        action: (facts, engine) => {
            // Define precedence order from highest to lowest priority
            engine.addFact(createFact.planPrecedence([
                // High-priority special patterns
                'ack-only-direct',
                'inner-outer-to-plan',
                'inner-outer-debate',
                'iterative-refinement',

                // Parallel combinations (prioritized for testing)
                'explore-analyze-par',
                // Sequential combinations (prioritized for testing)
                'explore-analyze-seq',
                // Task-based exploration and analysis
                'explore-task',
                'analyze-task',
                'quantify-analyze-task',
                'forecast-planning-task',
                'layered-analysis',
                'norm-no-support-seq',
                'analyze-critique-synth',
                'critique-synthesize',
                'explore-synthesize',
                'tool-analyze-optimize',
                'analyze-optimize',

                // Parallel combinations
                'explore-analyze-par',
                'forecast-plan-critique',
                'plan-reflect-integrate',
                'normative-perspectives',

                // Direct/probe patterns
                'norm-no-support-probe',

                // Fallbacks
                'explore-analyze-fallback',
                'default-task'
            ]));
        }
    }
];

export default rules;
