import SwiftUI

struct SavedProfilesView: View {
    @Bindable var store: SavedProfilesStore
    let client: ProfileClient
    @Binding var selectedTab: AppTab

    @State private var profileToRemove: ProfileSummary?
    @State private var removalError: String?

    var body: some View {
        List {
            if store.savedProfiles.isEmpty {
                ContentUnavailableView {
                    Label("No saved profiles", systemImage: "bookmark")
                } description: {
                    Text("Choose a game in Hub, enter a player tag, then tap Save on this device to keep it handy here.")
                } actions: {
                    Button("Explore games", systemImage: "gamecontroller.fill") {
                        selectedTab = .hub
                    }
                    .buttonStyle(.borderedProminent)
                    .tint(BrandStyle.actionOrange)
                }
                .listRowSeparator(.hidden)
                .listRowBackground(Color.clear)
            } else {
                Section("Saved on this device") {
                    ForEach(store.savedProfiles) { result in
                        NavigationLink(value: SavedProfileRoute(result: result)) {
                            SavedProfileRow(result: result)
                        }
                        .listRowSeparator(.hidden)
                        .swipeActions(edge: .trailing, allowsFullSwipe: false) {
                            Button("Remove", systemImage: "trash", role: .destructive) {
                                profileToRemove = result.data
                            }
                        }
                    }
                }

                Section {
                    DeviceOnlyNoticeView()
                        .listRowInsets(EdgeInsets(top: 8, leading: 16, bottom: 8, trailing: 16))
                        .listRowSeparator(.hidden)
                        .listRowBackground(Color.clear)
                }
            }
        }
        .listStyle(.insetGrouped)
        .scrollContentBackground(.hidden)
        .background(Color(uiColor: .systemGroupedBackground))
        .navigationTitle("Saved")
        .navigationBarTitleDisplayMode(.large)
        .navigationDestination(for: SavedProfileRoute.self) { route in
            SavedProfileDetailView(initialResult: route.result, store: store, client: client)
        }
        .navigationDestination(for: GameProfileRoute.self) { route in
            GameProfileView(game: route.game, playerTag: route.playerTag)
        }
        .confirmationDialog(
            "Remove saved profile?",
            isPresented: Binding(
                get: { profileToRemove != nil },
                set: { isPresented in
                    if !isPresented {
                        profileToRemove = nil
                    }
                }
            ),
            titleVisibility: .visible,
            presenting: profileToRemove
        ) { profile in
            Button("Remove profile", systemImage: "trash", role: .destructive) {
                remove(profile)
            }
            Button("Cancel", role: .cancel) {
                profileToRemove = nil
            }
        } message: { profile in
            Text("\(profile.display.name) will be removed from Saved on this device.")
        }
        .alert(
            "Couldn’t remove profile",
            isPresented: Binding(
                get: { removalError != nil },
                set: { isPresented in
                    if !isPresented {
                        removalError = nil
                    }
                }
            )
        ) {
            Button("OK", role: .cancel) {
                removalError = nil
            }
        } message: {
            Text(removalError ?? "Try again later.")
        }
    }

    private func remove(_ profile: ProfileSummary) {
        let removed = store.remove(id: profile.id)
        if !removed, store.savedProfiles.contains(where: { $0.data.id == profile.id }) {
            removalError = store.lastError ?? "This profile couldn’t be removed from this device."
        }
        profileToRemove = nil
    }
}
