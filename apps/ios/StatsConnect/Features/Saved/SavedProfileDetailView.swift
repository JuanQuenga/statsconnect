import SwiftUI

struct SavedProfileDetailView: View {
    let initialResult: ProfileResult
    @Bindable var store: SavedProfilesStore
    let client: ProfileClient

    @Environment(\.dismiss) private var dismiss
    @State private var requestState: ProfileLookupState
    @State private var refreshTask: Task<Void, Never>?
    @State private var requestGeneration = 0
    @State private var showingRemovalConfirmation = false
    @State private var actionError: String?

    init(initialResult: ProfileResult, store: SavedProfilesStore, client: ProfileClient) {
        self.initialResult = initialResult
        self.store = store
        self.client = client
        _requestState = State(initialValue: .loaded(initialResult))
    }

    private var displayedResult: ProfileResult {
        requestState.result ?? initialResult
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                ProfileSummaryCard(result: displayedResult)

                if requestState.isLoading {
                    HStack(spacing: 10) {
                        ProgressView()
                            .tint(BrandStyle.orange)
                        Text("Refreshing the public profile…")
                            .font(.subheadline)
                            .foregroundStyle(.secondary)
                    }
                    .padding(.horizontal, 4)
                    .accessibilityElement(children: .combine)
                    .accessibilityAddTraits(.updatesFrequently)
                }

                if let message = requestState.errorMessage {
                    RetryErrorView(
                        message: "The saved snapshot is still available. \(message)",
                        retryAction: refresh
                    )
                }

                NavigationLink(value: GameProfileRoute(game: displayedResult.data.game, playerTag: displayedResult.data.playerTag)) {
                    Label("Explore player", systemImage: "sparkles")
                        .font(.headline)
                        .frame(maxWidth: .infinity, minHeight: 52)
                }
                .buttonStyle(.borderedProminent)
                .tint(BrandStyle.actionOrange)
                .accessibilityHint("Opens this player’s native stats, roster, and match details")

                Button(action: refresh) {
                    HStack(spacing: 8) {
                        if requestState.isLoading {
                            ProgressView()
                                .tint(BrandStyle.orange)
                        } else {
                            Image(systemName: "arrow.clockwise")
                                .accessibilityHidden(true)
                        }
                        Text(requestState.isLoading ? "Refreshing…" : "Refresh profile")
                            .fontWeight(.semibold)
                    }
                    .frame(maxWidth: .infinity, minHeight: 48)
                }
                .buttonStyle(.bordered)
                .tint(BrandStyle.actionOrange)
                .disabled(requestState.isLoading)

                if let actionError {
                    Text(actionError)
                        .font(.footnote)
                        .foregroundStyle(.red)
                        .accessibilityAddTraits(.updatesFrequently)
                }

                DeviceOnlyNoticeView()
            }
            .padding(.horizontal, 20)
            .padding(.top, 16)
            .padding(.bottom, 28)
            .frame(maxWidth: 720, alignment: .leading)
            .frame(maxWidth: .infinity)
        }
        .background(Color(uiColor: .systemGroupedBackground))
        .navigationTitle(displayedResult.data.display.name)
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Menu {
                    Button("Refresh profile", systemImage: "arrow.clockwise", action: refresh)
                        .disabled(requestState.isLoading)

                    Button("Remove from Saved", systemImage: "trash", role: .destructive) {
                        showingRemovalConfirmation = true
                    }
                } label: {
                    Image(systemName: "ellipsis.circle")
                        .font(.title3)
                }
                .accessibilityLabel("Profile actions")
            }
        }
        .confirmationDialog(
            "Remove saved profile?",
            isPresented: $showingRemovalConfirmation,
            titleVisibility: .visible
        ) {
            Button("Remove profile", systemImage: "trash", role: .destructive, action: removeProfile)
            Button("Cancel", role: .cancel) {}
        } message: {
            Text("\(displayedResult.data.display.name) will be removed from Saved on this device.")
        }
        .onDisappear(perform: cancelRefresh)
    }

    private func refresh() {
        refreshTask?.cancel()
        requestGeneration &+= 1
        let generation = requestGeneration
        let previous = requestState.result ?? initialResult

        let playerTag: PlayerTag
        do {
            playerTag = try PlayerTag(previous.data.playerTag)
        } catch {
            requestState = .error(
                message: "The saved player tag is no longer valid. Remove this profile and look it up again.",
                previous: previous
            )
            return
        }

        requestState = .loading(previous: previous)
        actionError = nil
        let viewerID = store.viewerID

        refreshTask = Task { @MainActor in
            do {
                let updated = try await client.preview(
                    game: previous.data.game,
                    tag: playerTag,
                    viewerID: viewerID
                )
                try Task.checkCancellation()
                guard generation == requestGeneration else {
                    return
                }

                guard store.save(updated) else {
                    requestState = .error(
                        message: store.lastError ?? "The refreshed profile could not be saved on this device.",
                        previous: previous
                    )
                    return
                }

                requestState = .loaded(updated)
            } catch is CancellationError {
                return
            } catch {
                guard !Task.isCancelled, generation == requestGeneration else {
                    return
                }
                requestState = .error(message: error.localizedDescription, previous: previous)
            }
        }
    }

    private func removeProfile() {
        if store.remove(id: displayedResult.data.id) {
            dismiss()
        } else {
            actionError = store.lastError ?? "This profile couldn’t be removed from this device."
        }
    }

    private func cancelRefresh() {
        requestGeneration &+= 1
        refreshTask?.cancel()
        refreshTask = nil
    }
}
