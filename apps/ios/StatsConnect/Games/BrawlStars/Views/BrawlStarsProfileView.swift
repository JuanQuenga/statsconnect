import SwiftUI

struct BrawlStarsProfileView: View {
    let payload: BrawlProfilePayload
    let playerTag: String
    let isRefreshing: Bool
    let errorMessage: String?
    let onRefresh: @MainActor () async -> Void
    @State private var module: GameProfileModule = .overview

    var body: some View {
        VStack(spacing: 0) {
            GameModulePicker(modules: [.overview, .brawlers, .battles], selection: $module)
                .padding(.vertical, 10)
            ScrollView {
            LazyVStack(alignment: .leading, spacing: 22) {
                GameProfileUpdateBanner(
                    isRefreshing: isRefreshing,
                    errorMessage: errorMessage,
                    onRetry: onRefresh
                )

                switch module {
                case .brawlers: BrawlBrawlerRosterSection(brawlers: payload.player.brawlers)
                case .battles: BrawlBattleHistorySection(battles: payload.battleLog.items)
                default: BrawlProfileOverviewSection(player: payload.player, playerTag: playerTag)
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
        .navigationDestination(for: BrawlBattleRoute.self) { route in
            BrawlBattleDetailView(battle: route.battle)
        }
    }
}
