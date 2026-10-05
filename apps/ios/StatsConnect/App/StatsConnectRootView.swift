import SwiftUI

struct StatsConnectRootView: View {
    @Bindable var store: SavedProfilesStore
    let client: ProfileClient
    @State private var selectedTab: AppTab = .hub

    var body: some View {
        TabView(selection: $selectedTab) {
            Tab("Hub", systemImage: "sparkle.magnifyingglass", value: .hub) {
                NavigationStack {
                    HubView(store: store, client: client)
                }
            }

            Tab("Saved", systemImage: "bookmark", value: .saved) {
                NavigationStack {
                    SavedProfilesView(store: store, client: client, selectedTab: $selectedTab)
                }
            }
        }
        .tint(BrandStyle.orange)
    }
}
