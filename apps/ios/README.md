# StatsConnect iOS

Native SwiftUI profiles for public Brawl Stars and Clash Royale player tags. Jump between Overview, Brawlers/Cards, Deck, Battles, and Chests. Search and sort collections, open ability/card sheets, inspect match participants, and view tower troops and chest cycles without leaving the app. Saved summaries have no account sync or app-imposed count limit; lookup requires no login or paywall. The app uses StatsConnect’s existing backend and game artwork services, so fresh data needs a network connection.

The Xcode app and tests use iOS 26 and Swift 6 with no third-party dependencies. `Games/BrawlStars`, `Games/ClashRoyale`, and `Games/Shared` keep each module’s data and views separate. `StatsConnectBackendURL` in the app Info.plist selects the backend, defaulting to `https://capable-guineapig-391.convex.cloud`.

## Simulator checks

Open `StatsConnect.xcodeproj` in Xcode 26+, choose the `StatsConnect` scheme and an available iPhone Simulator, then verify:

- Hub lookup and native Explore player flow for both games.
- Brawl Stars overview, brawler search/sort and ability sheet, plus battle and participant details.
- Clash Royale overview and stale markers, deck/card search/sort and card sheets, battle participants/cards, and chest cycle.
- Save a profile, reopen it from Saved, Explore natively, refresh, and remove it.
- VoiceOver labels, larger Dynamic Type, and refresh/retry behavior with unavailable network access.

List installed simulator destinations with `xcrun simctl list devices available`. Run the iOS test suite with:

```sh
xcodebuild -project apps/ios/StatsConnect.xcodeproj -scheme StatsConnect -destination 'platform=iOS Simulator,name=iPhone 17 Pro' test
```

## OpenCode

OpenCode V2 uses `/ios-zai` for Z.ai `glm-5.3-flash`, `/ios-go` for OpenCode Go `gpt-6-luna` at `max`, and `/ios-review` for a Go Luna review at `max`. `opencode.json` allows builder tool actions without OpenCode approval prompts; reviewer permissions remain read-only. The separate host/Codex execution sandbox still applies. Keep provider credentials in local setup outside the repository.
