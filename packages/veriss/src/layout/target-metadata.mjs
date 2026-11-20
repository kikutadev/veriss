/** Validate only producer identity metadata; no contract predicates are inputs. */
export function validateTargetMetadata(box) {
    if (!box || typeof box !== 'object')
        throw new TypeError('Invalid box target metadata');
    if ('targets' in box && box.targets !== undefined && (!Array.isArray(box.targets) || box.targets.length > 32 || box.targets.some(id => typeof id !== 'string' || !id || id.length > 256 || /[\x00-\x1f]/.test(id)) || new Set(box.targets).size !== box.targets.length))
        throw new TypeError('Invalid box target IDs');
    if ('targetIdentity' in box && box.targetIdentity !== undefined && box.targetIdentity !== 'stable' && box.targetIdentity !== 'unknown')
        throw new TypeError('Invalid box target identity');
}
