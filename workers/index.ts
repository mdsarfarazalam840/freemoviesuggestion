import { syncMovies, syncTrendingMovies } from '../src/services/sync';

interface ScheduledEvent {
  cron: string;
  scheduledTime: number;
}

interface ExecutionContext {
  waitUntil(promise: Promise<any>): void;
  passThroughOnException(): void;
}

function wireEnv(env: Record<string, string>) {
  (globalThis as any).__ENV = env;
  if (typeof (globalThis as any).process === 'undefined') {
    (globalThis as any).process = { env: {} };
  }
  for (const [key, value] of Object.entries(env)) {
    if (typeof value === 'string') {
      (globalThis as any).process.env[key] = value;
    }
  }
}

export default {
  async scheduled(event: ScheduledEvent, env: any, ctx: ExecutionContext) {
    console.log(`Cron trigger fired at ${event.cron}`);
    wireEnv(env);

    switch (event.cron) {
      case '0 0 * * *':
        await ctx.waitUntil(runDailySync());
        break;
      default:
        console.log(`No handler for cron trigger: ${event.cron}`);
    }
  },
  
  async fetch(request: Request, env: any, ctx: ExecutionContext) {
    wireEnv(env);
    const url = new URL(request.url);
    if (url.pathname === '/trigger-sync') {
      ctx.waitUntil(runDailySync());
      return new Response('Sync triggered. Check logs for progress.', { status: 202 });
    }
    return new Response('Sync worker is running. POST /trigger-sync to start a sync.', { status: 200 });
  }
};

async function runDailySync() {
  try {
    console.log('Starting daily sync...');
    await syncTrendingMovies();
    await syncMovies(1000);
    console.log('Daily sync complete.');
  } catch (error) {
    console.error('Daily sync failed:', error);
  }
}
