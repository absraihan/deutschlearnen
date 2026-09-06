import os from 'node:os';
import { buildApp } from './app';
import { getEnv } from './env';

/**
 * Server entry point.
 *
 * Prints the LAN address on boot, because the single most common setup step for
 * this app is pointing the phone at the laptop running this process.
 */
async function main(): Promise<void> {
  const env = getEnv();
  const app = await buildApp({ env });

  try {
    await app.listen({ port: env.PORT, host: env.HOST });
  } catch (error) {
    app.log.error(error, 'failed to start');
    process.exit(1);
  }

  for (const address of lanAddresses()) {
    app.log.info(`Reachable from your phone at http://${address}:${env.PORT}`);
  }
  app.log.info(
    `AI provider: ${env.AI_PROVIDER}, STT: ${env.STT_PROVIDER}, TTS: ${env.TTS_PROVIDER}`,
  );

  const shutdown = async (signal: string): Promise<void> => {
    app.log.info(`${signal} received, shutting down`);
    await app.close();
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

function lanAddresses(): string[] {
  return Object.values(os.networkInterfaces())
    .flat()
    .filter(
      (iface): iface is NonNullable<typeof iface> =>
        Boolean(iface) && iface!.family === 'IPv4' && !iface!.internal,
    )
    .map((iface) => iface.address);
}

void main();
