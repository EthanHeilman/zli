
/**
 * Removes a trailing slash from a url if it exists
 */
export function stripTrailingSlash(url: string) {
    return url.replace(/\/$/, '');
}

export async function checkAllSettledPromise<T>(allSettledPromise: Promise<PromiseSettledResult<T>[]>) : Promise<void> {
    const failedPromiseResults = (await allSettledPromise).find(p => p.status === 'rejected');

    if(failedPromiseResults) {
        console.log((failedPromiseResults as PromiseRejectedResult).reason);
        throw((failedPromiseResults as PromiseRejectedResult).reason);
    }
}

/**
 * Either runs or skips a test conditionally
 * @param condition boolean to indicate if test should be skipped
 * @param args args to pass through to test case
 */
export async function testIf(condition: boolean, ...args: any[]) {
    // @ts-ignore
    condition ? it(...args) : it.skip(...args);
}

/**
 * Convert a map to an array of tuples where the first element is the key and
 * the second element is the value
 * @param map Map to convert
 */
export function mapToArrayTuples<K,V>(map: Map<K,V>): [K, V][] {
    return Array.from(map.keys()).reduce<[K, V][]>((acc, el) => {
        acc.push([el, map.get(el)]);
        return acc;
    }, []);
}