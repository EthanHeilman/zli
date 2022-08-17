

// These are wrapper functions we use in shell-utils that we can spy on or mock
// the implementation of during system-tests. If they are defined in the same
// module as shell-utils then they cannot be spy'd on with jest.
// https://stackoverflow.com/questions/45111198/how-to-mock-functions-in-the-same-module-using-jest

export function pushToStdOut(output: Uint8Array) {
    process.stdout.write(output);
}

export function pushToStdErr(output: Uint8Array) {
    process.stderr.write(output);
}