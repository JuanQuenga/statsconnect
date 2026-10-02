import SwiftUI

struct GameProfileLoadStateView: View {
    let game: GameID
    let playerTag: String
    let isLoading: Bool
    let errorMessage: String?
    let onRetry: @MainActor () async -> Void

    @State private var retryTask: Task<Void, Never>?

    var body: some View {
        ScrollView {
            VStack(spacing: 18) {
                Image(systemName: game.fallbackSymbolName)
                    .font(.system(size: 42, weight: .semibold))
                    .foregroundStyle(BrandStyle.orange)
                    .frame(width: 88, height: 88)
                    .background(BrandStyle.orange.opacity(0.12), in: RoundedRectangle(cornerRadius: 26, style: .continuous))
                    .accessibilityHidden(true)

                VStack(spacing: 6) {
                    Text(game.displayName)
                        .font(.title2.weight(.bold))
                    Text(GameProfileTagFormat.hashPrefixed(playerTag))
                        .font(.system(.subheadline, design: .monospaced))
                        .foregroundStyle(.secondary)
                        .textSelection(.enabled)
                }

                if isLoading || errorMessage == nil {
                    ProgressView("Loading player profile…")
                        .tint(BrandStyle.orange)
                        .accessibilityAddTraits(.updatesFrequently)
                } else {
                    ContentUnavailableView {
                        Label("Profile unavailable", systemImage: "wifi.exclamationmark")
                    } description: {
                        Text(errorMessage ?? "The profile couldn’t be loaded. Please try again.")
                    } actions: {
                        Button {
                            startRetry()
                        } label: {
                            Label(isLoading ? "Trying again…" : "Try again", systemImage: "arrow.clockwise")
                        }
                        .buttonStyle(.borderedProminent)
                        .tint(BrandStyle.actionOrange)
                        .disabled(isLoading || retryTask != nil)
                    }
                }
            }
            .padding(24)
            .frame(maxWidth: 560, minHeight: 420)
            .frame(maxWidth: .infinity)
        }
        .background(Color(uiColor: .systemGroupedBackground))
        .refreshable {
            await onRetry()
        }
        .onDisappear(perform: cancelRetry)
    }

    private func startRetry() {
        guard !isLoading, retryTask == nil else {
            return
        }
        retryTask = Task { @MainActor in
            await onRetry()
            retryTask = nil
        }
    }

    private func cancelRetry() {
        retryTask?.cancel()
        retryTask = nil
    }
}
