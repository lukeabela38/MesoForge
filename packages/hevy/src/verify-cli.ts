import { createHevyClient } from './client';
import {
  createGetOnlyFetch,
  formatVerificationFailure,
  verifyReadOnlyHevy,
} from './read-only-verifier';

interface VerificationProcess {
  readonly env: Record<string, string | undefined>;
  readonly stdout: { write(value: string): void };
  readonly stderr: { write(value: string): void };
  exitCode?: number;
}

const runtimeProcess = (globalThis as typeof globalThis & { readonly process: VerificationProcess })
  .process;
const apiKey = runtimeProcess.env['HEVY_API_KEY'];

if (apiKey === undefined || apiKey.trim().length === 0) {
  runtimeProcess.stderr.write(
    `${JSON.stringify({
      status: 'failed',
      error: { name: 'ConfigurationError', code: 'missing_api_key' },
    })}\n`,
  );
  runtimeProcess.exitCode = 1;
} else {
  const client = createHevyClient({
    apiKey,
    fetch: createGetOnlyFetch(globalThis.fetch),
  });

  try {
    const result = await verifyReadOnlyHevy(client);
    runtimeProcess.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } catch (error: unknown) {
    runtimeProcess.stderr.write(`${JSON.stringify(formatVerificationFailure(error), null, 2)}\n`);
    runtimeProcess.exitCode = 1;
  }
}
