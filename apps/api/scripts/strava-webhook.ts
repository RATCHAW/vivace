// Manage the application's one Strava push subscription.
//
//   pnpm --filter @repo/api webhook view
//   pnpm --filter @repo/api webhook subscribe https://api.example.com/api/strava/webhook
//   pnpm --filter @repo/api webhook delete 123456
//
// Strava allows exactly one subscription per application, and it validates the
// callback *during* the subscribe call — so the API has to already be running
// and publicly reachable at that URL before this will succeed. In development
// that means a tunnel (`cloudflared tunnel --url http://localhost:3000`, ngrok,
// or similar) and the tunnel's address here.
import "dotenv/config";
import {
  createSubscription,
  deleteSubscription,
  verifyToken,
  viewSubscriptions,
  WEBHOOK_PATH,
} from "../src/webhook.js";

const [command, argument] = process.argv.slice(2);

function usage(): never {
  console.error(
    [
      "Usage:",
      "  webhook view",
      "  webhook subscribe <public callback url>",
      "  webhook delete <subscription id>",
      "",
      `The callback path is ${WEBHOOK_PATH}.`,
    ].join("\n"),
  );
  process.exit(1);
}

switch (command) {
  case "view": {
    const subscriptions = await viewSubscriptions();
    console.log(
      subscriptions.length === 0
        ? "No subscription. Create one with `webhook subscribe <url>`."
        : JSON.stringify(subscriptions, null, 2),
    );
    break;
  }

  case "subscribe": {
    if (!argument) usage();
    const token = verifyToken();
    if (!token) {
      console.error(
        "STRAVA_WEBHOOK_VERIFY_TOKEN is not set. Put a random string in " +
          "apps/api/.env — the running API has to answer Strava's challenge " +
          "with the same one.",
      );
      process.exit(1);
    }
    if (!argument.startsWith("https://")) {
      // Strava will refuse it anyway; saying so here is faster than a 400.
      console.error("The callback URL must be https and publicly reachable.");
      process.exit(1);
    }

    const subscription = await createSubscription(argument, token);
    console.log(`Subscribed. id=${subscription.id} callback=${argument}`);
    break;
  }

  case "delete": {
    if (!argument) usage();
    await deleteSubscription(Number(argument));
    console.log(`Deleted subscription ${argument}.`);
    break;
  }

  default:
    usage();
}
