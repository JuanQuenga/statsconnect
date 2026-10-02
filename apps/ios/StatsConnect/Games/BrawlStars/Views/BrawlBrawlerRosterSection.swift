import SwiftUI

struct BrawlBrawlerRosterSection: View {
    let brawlers: [BrawlBrawler]

    @State private var searchText = ""
    @State private var sortOrder: BrawlBrawlerSortOrder = .trophies
    @State private var selectedBrawler: BrawlBrawler?
    @FocusState private var searchIsFocused: Bool

    private let columns = [GridItem(.adaptive(minimum: 112), spacing: 11)]

    private var visibleBrawlers: [BrawlBrawler] {
        let filtered = brawlers.filter { brawler in
            searchText.isEmpty || brawler.name.localizedStandardContains(searchText)
        }

        switch sortOrder {
        case .trophies:
            return filtered.sorted {
                $0.trophies == $1.trophies
                    ? $0.name.localizedStandardCompare($1.name) == .orderedAscending
                    : $0.trophies > $1.trophies
            }
        case .rank:
            return filtered.sorted {
                $0.rank == $1.rank
                    ? $0.name.localizedStandardCompare($1.name) == .orderedAscending
                    : $0.rank > $1.rank
            }
        case .power:
            return filtered.sorted {
                $0.power == $1.power
                    ? $0.name.localizedStandardCompare($1.name) == .orderedAscending
                    : $0.power > $1.power
            }
        case .name:
            return filtered.sorted { $0.name.localizedStandardCompare($1.name) == .orderedAscending }
        }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            GameProfileSectionHeader(
                title: "Brawlers",
                subtitle: brawlers.isEmpty ? "Brawler details weren’t included." : "Search, sort, and tap a brawler to see abilities."
            )

            if !brawlers.isEmpty {
                HStack(spacing: 10) {
                    TextField("Search brawlers", text: $searchText)
                        .autocorrectionDisabled()
                        .textInputAutocapitalization(.never)
                        .submitLabel(.done)
                        .focused($searchIsFocused)
                        .onSubmit { searchIsFocused = false }
                        .textFieldStyle(.plain)
                        .padding(.horizontal, 13)
                        .padding(.vertical, 11)
                        .background(.background, in: RoundedRectangle(cornerRadius: 13, style: .continuous))
                        .overlay {
                            RoundedRectangle(cornerRadius: 13, style: .continuous)
                                .strokeBorder(.quaternary, lineWidth: 1)
                        }
                        .accessibilityLabel("Search brawlers")
                        .accessibilityHint("Filters the brawler grid by name")

                    Menu {
                        Picker("Sort brawlers", selection: $sortOrder) {
                            ForEach(BrawlBrawlerSortOrder.allCases) { order in
                                Text(order.title).tag(order)
                            }
                        }
                    } label: {
                        Label("Sort", systemImage: "arrow.up.arrow.down")
                            .labelStyle(.iconOnly)
                            .font(.body.weight(.semibold))
                            .frame(width: 44, height: 44)
                            .background(.background, in: RoundedRectangle(cornerRadius: 13, style: .continuous))
                    }
                    .accessibilityLabel("Sort brawlers")
                    .accessibilityValue(sortOrder.title)
                }

                if visibleBrawlers.isEmpty {
                    ContentUnavailableView(
                        "No brawlers match",
                        systemImage: "magnifyingglass",
                        description: Text("Try a different search.")
                    )
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 10)
                } else {
                    Text("\(visibleBrawlers.count) of \(brawlers.count) brawlers")
                        .font(.caption.weight(.medium))
                        .foregroundStyle(.secondary)

                    LazyVGrid(columns: columns, spacing: 11) {
                        ForEach(visibleBrawlers) { brawler in
                            Button {
                                selectedBrawler = brawler
                            } label: {
                                BrawlBrawlerTile(brawler: brawler)
                            }
                            .buttonStyle(.plain)
                            .accessibilityLabel(
                                "\(brawler.name), power \(brawler.power), rank \(brawler.rank), \(brawler.trophies) trophies"
                            )
                            .accessibilityHint("Shows this brawler’s abilities and stats")
                        }
                    }
                }
            } else {
                ContentUnavailableView(
                    "No brawlers available",
                    systemImage: "person.crop.square",
                    description: Text("This profile didn’t include a brawler roster.")
                )
                .frame(maxWidth: .infinity)
            }
        }
        .padding(18)
        .background(.thinMaterial, in: RoundedRectangle(cornerRadius: 24, style: .continuous))
        .overlay {
            RoundedRectangle(cornerRadius: 24, style: .continuous)
                .strokeBorder(.quaternary, lineWidth: 1)
        }
        .sheet(item: $selectedBrawler) { brawler in
            NavigationStack {
                BrawlBrawlerDetailView(brawler: brawler)
            }
            .presentationDetents([.large])
            .presentationDragIndicator(.visible)
        }
    }
}
