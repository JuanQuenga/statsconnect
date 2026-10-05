import SwiftUI

struct HubView: View {
    @Bindable var store: SavedProfilesStore
    let client: ProfileClient

    private let columns = [GridItem(.adaptive(minimum: 260), spacing: 16)]

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 24) {
                BrandHeaderView()

                VStack(alignment: .leading, spacing: 6) {
                    Text("Explore your game stats")
                        .font(.title2.weight(.bold))

                    Text("Open a native player profile with overviews, searchable rosters, match details, decks, and chest cycles.")
                        .font(.body)
                        .foregroundStyle(.secondary)
                        .fixedSize(horizontal: false, vertical: true)
                }

                LazyVGrid(columns: columns, spacing: 16) {
                    ForEach(GameID.allCases) { game in
                        NavigationLink(value: game) {
                            GameDiscoveryTile(game: game)
                        }
                        .buttonStyle(.plain)
                        .accessibilityHint("Opens native player lookup and game features")
                    }
                }

                DeviceOnlyNoticeView()
            }
            .padding(.horizontal, 20)
            .padding(.top, 12)
            .padding(.bottom, 28)
            .frame(maxWidth: 1_000, alignment: .leading)
            .frame(maxWidth: .infinity)
        }
        .background(Color(uiColor: .systemGroupedBackground))
        .navigationTitle("Hub")
        .navigationBarTitleDisplayMode(.large)
        .navigationDestination(for: GameProfileRoute.self) { route in
            GameProfileView(game: route.game, playerTag: route.playerTag)
        }
        .navigationDestination(for: GameID.self) { game in
            PlayerLookupView(game: game, store: store, client: client)
        }
    }
}
