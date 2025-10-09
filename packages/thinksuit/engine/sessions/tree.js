/**
 * Session tree builder - pure functions for constructing hierarchical session views
 * Browser-compatible - no Node.js dependencies
 */

/**
 * Build a hierarchical tree structure from session events
 * Uses boundary metadata to construct parent-child relationships
 * @param {Array} events - Raw session events with boundary metadata
 * @returns {Object} Root object with children array
 */
export function buildSessionTree(events) {
    // Step 1: Find all boundary pairs
    const boundaries = findBoundaryPairs(events);

    // Step 2: Build hierarchy based on parent relationships
    const hierarchy = buildBoundaryHierarchy(boundaries);

    // Step 3: Convert to tree nodes - return root object with children
    return {
        type: 'root',
        children: hierarchy.map(boundary => boundaryToTreeNode(boundary, events))
    };
}

/**
 * Find matching boundary start/end pairs using semantic metadata
 */
function findBoundaryPairs(events) {
    const starts = new Map();
    const pairs = [];

    events.forEach((event, index) => {
        if (event.eventRole === 'boundary_start' && event.boundaryId) {
            starts.set(event.boundaryId, { event, index });
        } else if (event.eventRole === 'boundary_end' && event.boundaryId) {
            const start = starts.get(event.boundaryId);
            if (start) {
                pairs.push({
                    id: event.boundaryId,
                    type: event.boundaryType,
                    parentId: start.event.parentBoundaryId,
                    startEvent: start.event,
                    endEvent: event,
                    startIndex: start.index,
                    endIndex: index,
                    events: events.slice(start.index, index + 1)
                });
                starts.delete(event.boundaryId);
            }
        }
    });

    // Handle unclosed boundaries
    starts.forEach((start, boundaryId) => {
        pairs.push({
            id: boundaryId,
            type: start.event.boundaryType,
            parentId: start.event.parentBoundaryId,
            startEvent: start.event,
            endEvent: null,
            startIndex: start.index,
            endIndex: events.length - 1,
            events: events.slice(start.index),
            unclosed: true
        });
    });

    return pairs;
}

/**
 * Build hierarchy from boundaries using parent-child relationships
 */
function buildBoundaryHierarchy(boundaries) {
    const boundaryMap = new Map(boundaries.map(b => [b.id, b]));
    const roots = [];

    // Build parent-child relationships
    boundaries.forEach(boundary => {
        if (boundary.parentId && boundaryMap.has(boundary.parentId)) {
            const parent = boundaryMap.get(boundary.parentId);
            if (!parent.children) parent.children = [];
            parent.children.push(boundary);
        } else {
            // No parent = root boundary
            roots.push(boundary);
        }
    });

    return roots;
}

/**
 * Convert boundary to tree node recursively
 * Generic transformation - uses boundary metadata without knowing specific types
 */
function boundaryToTreeNode(boundary, allEvents) {
    // Create node with generic properties from boundary metadata
    const node = {
        type: boundary.type,
        boundaryType: boundary.type,
        boundaryId: boundary.id,
        eventId: boundary.startEvent?.eventId,
        startTime: boundary.startEvent?.time,
        endTime: boundary.endEvent?.time,
        status: boundary.unclosed ? 'incomplete' : 'complete',
        // Copy all data from start event, add endEvent data separately
        metadata: {
            ...(boundary.startEvent?.data || {}),
            // Include execution fields from top-level of start event
            ...(boundary.startEvent?.cycle !== undefined && { cycle: boundary.startEvent.cycle }),
            ...(boundary.startEvent?.step !== undefined && { step: boundary.startEvent.step }),
            ...(boundary.startEvent?.branch !== undefined && { branch: boundary.startEvent.branch }),
            ...(boundary.startEvent?.role !== undefined && { role: boundary.startEvent.role }),
            ...(boundary.startEvent?.depth !== undefined && { depth: boundary.startEvent.depth }),
            ...(boundary.startEvent?.operation !== undefined && { operation: boundary.startEvent.operation }),
            ...(boundary.startEvent?.maxCycles !== undefined && { maxCycles: boundary.startEvent.maxCycles }),
            ...(boundary.startEvent?.totalSteps !== undefined && { totalSteps: boundary.startEvent.totalSteps }),
            ...(boundary.startEvent?.remainingTokens !== undefined && { remainingTokens: boundary.startEvent.remainingTokens }),
            ...(boundary.startEvent?.forced !== undefined && { forced: boundary.startEvent.forced }),
            // Add completion data if available
            completion: boundary.endEvent?.data || null
        }
    };

    // Process children - interleave events and nested boundaries in chronological order
    const directEvents = extractDirectEvents(boundary);

    const nestedBoundaries = boundary.children
        ? boundary.children.map(child => boundaryToTreeNode(child, allEvents))
        : [];

    // Merge and sort chronologically
    const children = [...directEvents, ...nestedBoundaries];
    children.sort((a, b) => {
        const aTime = new Date(a.timestamp || a.startTime || 0);
        const bTime = new Date(b.timestamp || b.startTime || 0);
        return aTime - bTime;
    });

    node.children = children;

    return node;
}

/**
 * Extract direct events from a boundary (not nested boundaries)
 * Uses semantic metadata (parentBoundaryId) when available,
 * falls back to time ranges for events without explicit parent
 */
function extractDirectEvents(boundary) {
    const events = [];

    // Build nested boundary time ranges for legacy events without parentBoundaryId
    const nestedRanges = (boundary.children || []).map(child => ({
        start: child.startIndex,
        end: child.endIndex
    }));

    boundary.events.forEach((event, index) => {
        const eventIndex = boundary.startIndex + index;

        // Skip boundary metadata events - they're represented as boundary nodes
        if (event.eventRole === 'boundary_start' || event.eventRole === 'boundary_end') {
            return;
        }

        // Events with explicit parentBoundaryId: use semantic metadata
        if (event.parentBoundaryId) {
            if (event.parentBoundaryId !== boundary.id) {
                return;
            }
        } else {
            // Events without parentBoundaryId: use time ranges to prevent duplication
            const isInsideNested = nestedRanges.some(range =>
                eventIndex >= range.start && eventIndex <= range.end
            );
            if (isInsideNested) {
                return;
            }
        }

        events.push({
            type: 'event',
            eventType: event.event,
            timestamp: event.time,
            data: {
                ...(event.data || {}),
                // Include execution fields from top-level
                ...(event.cycle !== undefined && { cycle: event.cycle }),
                ...(event.step !== undefined && { step: event.step }),
                ...(event.branch !== undefined && { branch: event.branch }),
                ...(event.role !== undefined && { role: event.role }),
                ...(event.depth !== undefined && { depth: event.depth }),
                ...(event.operation !== undefined && { operation: event.operation }),
                ...(event.maxCycles !== undefined && { maxCycles: event.maxCycles }),
                ...(event.totalSteps !== undefined && { totalSteps: event.totalSteps }),
                ...(event.remainingTokens !== undefined && { remainingTokens: event.remainingTokens }),
                ...(event.forced !== undefined && { forced: event.forced })
            },
            msg: event.msg,
            eventId: event.eventId
        });
    });

    return events;
}
