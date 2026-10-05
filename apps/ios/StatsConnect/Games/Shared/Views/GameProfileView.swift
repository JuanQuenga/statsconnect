import SwiftUI

struct GameProfileView: View {
    let game: GameID
    let playerTag: String

    @State private var model: GameProfileModel

    init(game: GameID, playerTag: String) {
        self.game = game
        self.playerTag = playerTag
        _model = State(initialValue: GameProfileModel(game: game, playerTag: playerTag))
    }

    private var profileTitle: String {
        switch game {
        case .brawlStars:
            model.brawlPayload?.player.name ?? game.displayName
        case .clashRoyale:
            model.clashPayload?.player.data.name ?? game.displayName
        }
    }

    var body: some View {
        Group {
            switch game {
            case .brawlStars:
                if let payload = model.brawlPayload {
                    BrawlStarsProfileView(
                        payload: payload,
                        playerTag: model.displayTag,
                        isRefreshing: model.isLoading,
                        errorMessage: model.errorMessage,
                        onRefresh: { await model.refresh() }
                    )
                } else {
                    GameProfileLoadStateView(
                        game: game,
                        playerTag: model.displayTag,
                        isLoading: model.isLoading,
                        errorMessage: model.errorMessage,
                        onRetry: { await model.refresh() }
                    )
                }
            case .clashRoyale:
                if let payload = model.clashPayload {
                    ClashRoyaleProfileView(
                        payload: payload,
                        playerTag: model.displayTag,
                        isRefreshing: model.isLoading,
                        errorMessage: model.errorMessage,
                        onRefresh: { await model.refresh() }
                    )
                } else {
                    GameProfileLoadStateView(
                        game: game,
                        playerTag: model.displayTag,
                        isLoading: model.isLoading,
                        errorMessage: model.errorMessage,
                        onRetry: { await model.refresh() }
                    )
                }
            }
        }
        .navigationTitle(profileTitle)
        .navigationBarTitleDisplayMode(.inline)
        .task {
            await model.loadIfNeeded()
        }
    }
}
