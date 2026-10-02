import Foundation
import Observation

@MainActor
@Observable
final class GameProfileModel {
    let game: GameID
    let displayTag: String

    private(set) var brawlPayload: BrawlProfilePayload?
    private(set) var clashPayload: ClashProfilePayload?
    private(set) var isLoading = false
    private(set) var errorMessage: String?

    private let playerTag: PlayerTag?
    private let brawlClient: BrawlStarsClient
    private let clashClient: ClashRoyaleClient
    @ObservationIgnored
    private var hasAttemptedLoad = false

    init(game: GameID, playerTag: String) {
        self.game = game
        let normalizedTag = try? PlayerTag(playerTag)
        self.playerTag = normalizedTag
        self.displayTag = normalizedTag?.rawValue ?? playerTag.trimmingCharacters(in: .whitespacesAndNewlines)
        self.brawlClient = BrawlStarsClient()
        self.clashClient = ClashRoyaleClient()
    }

    func loadIfNeeded() async {
        guard !hasAttemptedLoad, !isLoading else {
            return
        }
        await refresh()
    }

    func refresh() async {
        guard !isLoading else {
            return
        }

        isLoading = true
        errorMessage = nil
        defer { isLoading = false }

        guard let playerTag else {
            errorMessage = "That player tag doesn’t look right. Return to lookup and check the tag."
            hasAttemptedLoad = true
            return
        }

        do {
            switch game {
            case .brawlStars:
                let payload = try await brawlClient.profile(tag: playerTag)
                try Task.checkCancellation()
                brawlPayload = payload
            case .clashRoyale:
                let payload = try await clashClient.profile(tag: playerTag)
                try Task.checkCancellation()
                clashPayload = payload
            }
            errorMessage = nil
            hasAttemptedLoad = true
        } catch is CancellationError {
            return
        } catch let error as URLError where error.code == .cancelled {
            return
        } catch {
            guard !Task.isCancelled else {
                return
            }
            errorMessage = error.localizedDescription
            hasAttemptedLoad = true
        }
    }
}
