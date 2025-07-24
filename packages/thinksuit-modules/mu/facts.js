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

    roleSelection: (role, confidence = 1) => ({
        ns,
        type: 'RoleSelection',
        role,
        confidence
    }),

    executionPlan: (strategy, options = {}) => ({
        ns,
        type: 'ExecutionPlan',
        strategy,
        ...options
    }),

    planPrecedence: (precedence) => ({
        ns,
        type: 'PlanPrecedence',
        precedence
    }),

    tokenMultiplier: (value) => ({
        ns,
        type: 'TokenMultiplier',
        value
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

    roleSelection: (role) => (f) =>
        f.ns === MODULE_NS && f.type === 'RoleSelection' &&
        (!role || f.role === role),

    executionPlan: (strategy) => (f) =>
        f.ns === MODULE_NS && f.type === 'ExecutionPlan' &&
        (!strategy || f.strategy === strategy),

    tokenMultiplier: () => (f) =>
        f.ns === MODULE_NS && f.type === 'TokenMultiplier',

    anySignal: () => (f) =>
        f.ns === MODULE_NS && f.type === 'Signal',

    anyRole: () => (f) =>
        f.ns === MODULE_NS && f.type === 'RoleSelection',

    anyPlan: () => (f) =>
        f.ns === MODULE_NS && f.type === 'ExecutionPlan'
};
