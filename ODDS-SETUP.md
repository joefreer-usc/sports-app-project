# Odds & Props setup

The NBA Odds & Props page uses SportsGameOdds. The app does not contain a shared key.

1. Create an Amateur API key at https://sportsgameodds.com.
2. Open Sports Hub and select **Odds & Props** from the top menu.
3. Paste the key and select **Connect props**.

The key is stored only in that browser. Current NBA props are cached for ten minutes to reduce API usage. Use the three-dot button on the Odds & Props page to remove or replace the saved key.

The free provider plan has usage limits. This version requests at most 15 upcoming NBA events per refresh and excludes alternate lines. For a larger public release, move the provider request to a server-side cache so all visitors share one refresh.

The **Research score** combines recent finalized player results, sportsbook coverage, and current pricing. Historical form is refreshed at most once per day to conserve the free allowance. It is not a prediction or guaranteed pick.
