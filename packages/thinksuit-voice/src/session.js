// Session-lifecycle actions a trigger can be bound to, and the pure mapping from
// a fired action to the session its captured turn targets. Kept pure (no mic, no
// broker) so it's trivially testable.
//
// Two actions for now:
//   converse → continue the current session
//   new      → open a fresh session (null → the broker assigns one)
//
// Deeper navigation ("go back to the session about X") is deliberately out of
// scope: it needs a voice affordance for *naming* a session, which is its own
// design problem (see the session-recall task), not a fixed binding.

export const ACTIONS = ['converse', 'new'];

export function isAction(action) {
    return ACTIONS.includes(action);
}

// The session a wake should target. `new` starts fresh; anything else continues.
export function sessionForAction(action, current = null) {
    return action === 'new' ? null : current;
}
