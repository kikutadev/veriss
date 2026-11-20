export function rationalNumber(value) {
    const [numerator, denominator = '1'] = String(value ?? '0').split('/');
    return Number(numerator) / Number(denominator);
}
export function evaluateAffine(value, width, height) {
    return rationalNumber(value.constant) + width * rationalNumber(value.coefficient) + height * rationalNumber(value.heightCoefficient);
}
// An array length is a recorded finite-state choice, not an arbitrary prop.
export function repeatedItems(value) {
    if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0)
        throw new Error('Expected a finite nonnegative repeat count');
    return Array.from({ length: value }, (_, i) => i);
}
