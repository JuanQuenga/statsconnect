import SwiftUI

struct ClashRoyaleProfileView: View {
    let payload: ClashProfilePayload
    let playerTag: String
    let isRefreshing: Bool
    let errorMessage: String?
    let onRefresh: @MainActor () async -> Void
    @State private var module: GameProfileModule = .overview

    var body: some View {
        VStack(spacing: 0) {
            GameModulePicker(modules: [.overview, .deck, .cards, .battles, .chests], selection: $module)
                .padding(.vertical, 10)
            ScrollView {
            LazyVStack(alignment: .leading, spacing: 22) {
                GameProfileUpdateBanner(
                    isRefreshing: isRefreshing,
                    errorMessage: errorMessage,
                    onRetry: onRefresh
                )

                switch module {
                case .deck: ClashCurrentDeckSection(playerSnapshot: payload.player)
                case .cards: ClashCardCollectionSection(playerSnapshot: payload.player)
                case .battles: ClashBattleHistorySection(snapshot: payload.battles, playerTag: playerTag)
                case .chests: ClashChestCycleSection(snapshot: payload.chests)
                default: ClashProfileOverviewSection(snapshot: payload.player, playerTag: playerTag)
                }
            }
            .padding(.horizontal, 18)
            .padding(.top, 16)
            .padding(.bottom, 32)
            .frame(maxWidth: 900, alignment: .leading)
            .frame(maxWidth: .infinity)
            }
            .id(module)
            .refreshable { await onRefresh() }
        }
        .background(Color(uiColor: .systemGroupedBackground))
        .navigationDestination(for: ClashBattleRoute.self) { route in
            ClashBattleDetailView(battle: route.battle, fetchedAt: route.fetchedAt, isStale: route.isStale, playerTag: route.playerTag)
        }
    }
}
