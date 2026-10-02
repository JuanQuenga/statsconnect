import SwiftUI

@main
@MainActor
struct StatsConnectApp: App {
    @State private var savedProfilesStore: SavedProfilesStore
    private let profileClient: ProfileClient

    init() {
        _savedProfilesStore = State(initialValue: SavedProfilesStore())
        profileClient = ProfileClient(baseURL: AppConfiguration.backendURL)
    }

    var body: some Scene {
        WindowGroup {
            StatsConnectRootView(store: savedProfilesStore, client: profileClient)
                .tint(BrandStyle.orange)
        }
    }
}
