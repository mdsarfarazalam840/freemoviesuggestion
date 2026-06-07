import { syncMovies, syncTrendingMovies } from './services/sync';

export default {
  async scheduled(event: ScheduledEvent, env: any, ctx: ExecutionContext) {
    console.log(`Cron trigger fired at ${event.cron}`);
    
    switch (event.cron) {
      case '0 0 * * *':
        await ctx.waitUntil(runDailySync());
        break;
      default:
        console.log(`No handler for cron trigger: ${event.cron}`);
    }
  },
  
  async fetch(request: Request, env: any, ctx: ExecutionContext) {
    // Optional: API handler if needed
    return new Response('Sync worker is running', { status: 200 });
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
