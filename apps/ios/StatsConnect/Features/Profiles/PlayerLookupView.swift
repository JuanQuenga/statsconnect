import SwiftUI

struct PlayerLookupView: View {
    let game: GameID
    @Bindable var store: SavedProfilesStore
    let client: ProfileClient

    @State private var tagInput = ""
    @State private var lookupState: ProfileLookupState = .idle
    @State private var lookupTask: Task<Void, Never>?
    @State private var requestGeneration = 0
    @State private var saveError: String?
    @FocusState private var tagFieldIsFocused: Bool

    private var canLookup: Bool {
        !tagInput.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && !lookupState.isLoading
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                HStack(spacing: 16) {
                    GameArtworkView(game: game)
                        .frame(width: 76, height: 76)
                        .clipShape(RoundedRectangle(cornerRadius: 20, style: .continuous))

                    VStack(alignment: .leading, spacing: 5) {
                        Text("Player lookup")
                            .font(.title2.weight(.bold))

                        Text(game.displayName)
                            .font(.subheadline.weight(.semibold))
                            .foregroundStyle(BrandStyle.orange)

                        Text("Use a public player tag")
                            .font(.footnote)
                            .foregroundStyle(.secondary)
                    }
                }

                VStack(alignment: .leading, spacing: 14) {
                    Text("Player tag")
                        .font(.headline)

                    TextField("Example: #2PPGL9YL", text: $tagInput)
                        .font(.system(.title3, design: .monospaced))
                        .textInputAutocapitalization(.characters)
                        .autocorrectionDisabled()
                        .keyboardType(.asciiCapable)
                        .submitLabel(.search)
                        .focused($tagFieldIsFocused)
                        .onSubmit(startLookup)
                        .accessibilityLabel("\(game.displayName) player tag")
                        .accessibilityHint("Enter the public player tag, with or without a hash symbol.")
                        .padding(.horizontal, 14)
                        .padding(.vertical, 13)
                        .background(.background, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
                        .overlay {
                            RoundedRectangle(cornerRadius: 14, style: .continuous)
                                .strokeBorder(.quaternary, lineWidth: 1)
                        }

                    Button(action: startLookup) {
                        HStack(spacing: 9) {
                            if lookupState.isLoading {
                                ProgressView()
                                    .tint(.white)
                            } else {
                                Image(systemName: "magnifyingglass")
                                    .accessibilityHidden(true)
                            }

                            Text(lookupState.isLoading ? "Looking up…" : "Find player")
                                .fontWeight(.semibold)
                        }
                        .frame(maxWidth: .infinity, minHeight: 50)
                    }
                    .buttonStyle(.borderedProminent)
                    .tint(BrandStyle.actionOrange)
                    .disabled(!canLookup)
                    .accessibilityHint("Looks up a public profile using this player tag")
                }
                .padding(18)
                .background(.thinMaterial, in: RoundedRectangle(cornerRadius: 22, style: .continuous))

                if lookupState.isLoading && lookupState.result == nil {
                    HStack(spacing: 10) {
                        ProgressView()
                            .tint(BrandStyle.orange)
                        Text("Checking the public profile…")
                            .font(.subheadline)
                            .foregroundStyle(.secondary)
                    }
                    .padding(.horizontal, 4)
                    .accessibilityElement(children: .combine)
                    .accessibilityAddTraits(.updatesFrequently)
                }

                if let message = lookupState.errorMessage {
                    RetryErrorView(message: message, retryAction: startLookup)
                }

                if let result = lookupState.result {
                    ProfileSummaryCard(result: result)
                    NavigationLink(value: GameProfileRoute(game: result.data.game, playerTag: result.data.playerTag)) {
                        Label("Explore player", systemImage: "sparkles")
                            .font(.headline)
                            .frame(maxWidth: .infinity, minHeight: 52)
                    }
                    .buttonStyle(.borderedProminent)
                    .tint(BrandStyle.actionOrange)
                    .accessibilityHint("Opens the native profile with stats, roster, and match details")

                    saveButton(for: result)

                    if let saveError {
                        Text(saveError)
                            .font(.footnote)
                            .foregroundStyle(.red)
                            .accessibilityAddTraits(.updatesFrequently)
                    }
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
        .navigationTitle(game.displayName)
        .navigationBarTitleDisplayMode(.inline)
        .onChange(of: tagInput) { _, _ in
            cancelLookup(resetState: true)
        }
        .onDisappear {
            cancelLookup(resetState: false)
        }
    }

    @ViewBuilder
    private func saveButton(for result: ProfileResult) -> some View {
        let isSaved = store.contains(result.data)

        Button {
            let didSave = store.save(result)
            if didSave || store.contains(result.data) {
                saveError = nil
            } else {
                saveError = store.lastError ?? "This profile couldn’t be saved on this device."
            }
        } label: {
            Label(
                isSaved ? "Saved on this device" : "Save on this device",
                systemImage: isSaved ? "checkmark.circle.fill" : "bookmark"
            )
            .fontWeight(.semibold)
            .frame(maxWidth: .infinity, minHeight: 48)
        }
        .buttonStyle(.bordered)
        .tint(isSaved ? .green : BrandStyle.actionOrange)
        .disabled(isSaved)
        .accessibilityHint(isSaved ? "This profile is saved only on this device" : "Saves this profile only on this device")
    }

    private func startLookup() {
        lookupTask?.cancel()
        requestGeneration &+= 1
        let generation = requestGeneration
        let normalizedTag = tagInput.trimmingCharacters(in: .whitespacesAndNewlines)

        guard !normalizedTag.isEmpty else {
            lookupState = .error(message: "Enter a player tag to search.", previous: nil)
            return
        }

        let playerTag: PlayerTag
        do {
            playerTag = try PlayerTag(normalizedTag)
        } catch {
            lookupState = .error(
                message: "That player tag doesn’t look right. Check it in the game and try again.",
                previous: nil
            )
            return
        }

        saveError = nil
        tagFieldIsFocused = false
        lookupState = .loading(previous: nil)
        let viewerID = store.viewerID

        lookupTask = Task { @MainActor in
            do {
                let result = try await client.preview(game: game, tag: playerTag, viewerID: viewerID)
                try Task.checkCancellation()
                guard generation == requestGeneration else {
                    return
                }
                lookupState = .loaded(result)
            } catch is CancellationError {
                return
            } catch {
                guard !Task.isCancelled, generation == requestGeneration else {
                    return
                }
                lookupState = .error(message: error.localizedDescription, previous: nil)
            }
        }
    }

    private func cancelLookup(resetState: Bool) {
        requestGeneration &+= 1
        lookupTask?.cancel()
        lookupTask = nil

        if resetState {
            lookupState = .idle
            saveError = nil
        }
    }
}
