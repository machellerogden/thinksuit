const MODULE_NS = 'thinksuit/mu';

export const factFactory = (ns = MODULE_NS) => ({
    signal: (dimension, signal, confidence, provenance) => ({
        ns,
        type: 'Signal',
        dimension,
        signal,
        confidence,
        provenance
    }),

    executionPlan: (plan) => ({
        ns,
        type: 'ExecutionPlan',
        ...plan
    }),

    planPrecedence: (precedence) => ({
        ns,
        type: 'PlanPrecedence',
        precedence
    }),

    adaptation: (name, data) => ({
        ns,
        type: 'Adaptation',
        name,
        ...data
    }),

    derived: (name, data) => ({
        ns,
        type: 'Derived',
        name,
        ...data
    })
});

export const createFact = factFactory();

export const match = {
    signal: (dimension, signal) => (f) =>
        f.ns === MODULE_NS && f.type === 'Signal' &&
        f.dimension === dimension && f.signal === signal,

    signalDimension: (dimension) => (f) =>
        f.ns === MODULE_NS && f.type === 'Signal' && f.dimension === dimension,

    executionPlan: (strategy) => (f) =>
        f.ns === MODULE_NS && f.type === 'ExecutionPlan' &&
        (!strategy || f.strategy === strategy),

    adaptation: (name) => (f) =>
        f.ns === MODULE_NS && f.type === 'Adaptation' &&
        (!name || f.name === name),

    anySignal: () => (f) =>
        f.ns === MODULE_NS && f.type === 'Signal',

    anyPlan: () => (f) =>
        f.ns === MODULE_NS && f.type === 'ExecutionPlan'
};
