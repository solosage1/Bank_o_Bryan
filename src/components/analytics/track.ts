type EventName =
  | 'family_created' | 'child_added' | 'deposit_created' | 'withdrawal_created' | 'tiers_updated'
  | 'projection_viewed' | 'playground_opened' | 'playground_sim_run' | 'playground_preset_used' | 'playground_convert_clicked'
  | 'goal_created' | 'reward_marked';

export function track(event: EventName, props: Record<string, unknown> = {}) {
  if (process.env.NODE_ENV !== 'production') {
    // dev stub
    // eslint-disable-next-line no-console
    console.log('[analytics]', event, props);
    return;
  }
  try {
    // send to your analytics provider here
    // navigator.sendBeacon('/analytics', JSON.stringify({ event, props }));
  } catch {
    // noop
  }
}


