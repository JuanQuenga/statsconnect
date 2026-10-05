import SwiftUI

struct ClashCardCollectionSection: View {
    let playerSnapshot: ClashSnapshot<ClashPlayer>

    @State private var searchText = ""
    @State private var sortOrder: ClashCardSortOrder = .name
    @State private var selectedCard: ClashCard?
    @FocusState private var searchIsFocused: Bool

    private let columns = [GridItem(.adaptive(minimum: 112, maximum: 170), spacing: 11)]

    private var cards: [ClashCard]? {
        let player = playerSnapshot.data
        guard player.cards != nil || player.supportCards != nil else { return nil }
        var seen: Set<Int> = []
        return ((player.cards ?? []) + (player.supportCards ?? [])).filter { seen.insert($0.id).inserted }
    }

    private var visibleCards: [ClashCard] {
        let filtered = (cards ?? []).filter { card in
            searchText.isEmpty
                || card.name.localizedStandardContains(searchText)
                || (card.rarity?.localizedStandardContains(searchText) ?? false)
        }

        switch sortOrder {
        case .name:
            return filtered.sorted { $0.name.localizedStandardCompare($1.name) == .orderedAscending }
        case .level:
            return filtered.sorted {
                let leftLevel = $0.displayLevel ?? -1
                let rightLevel = $1.displayLevel ?? -1
                return leftLevel == rightLevel
                    ? $0.name.localizedStandardCompare($1.name) == .orderedAscending
                    : leftLevel > rightLevel
            }
        case .elixir:
            return filtered.sorted {
                let leftCost = $0.elixirCost ?? Int.max
                let rightCost = $1.elixirCost ?? Int.max
                return leftCost == rightCost
                    ? $0.name.localizedStandardCompare($1.name) == .orderedAscending
                    : leftCost < rightCost
            }
        case .rarity:
            return filtered.sorted {
                let leftRarity = $0.rarity ?? ""
                let rightRarity = $1.rarity ?? ""
                let comparison = leftRarity.localizedStandardCompare(rightRarity)
                return comparison == .orderedSame
                    ? $0.name.localizedStandardCompare($1.name) == .orderedAscending
                    : comparison == .orderedAscending
            }
        }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            GameProfileSectionHeader(
                title: "Cards & tower troops",
                subtitle: playerSnapshot.data.cards == nil ? "The full collection wasn’t included." : "Search and sort the collection, then tap a card."
            )

            ClashSnapshotFreshnessView(fetchedAt: playerSnapshot.fetchedAt, isStale: playerSnapshot.stale)

            if let cards {
                if cards.isEmpty {
                    ContentUnavailableView(
                        "No cards available",
                        systemImage: "rectangle.portrait",
                        description: Text("This profile returned an empty card collection.")
                    )
                    .frame(maxWidth: .infinity)
                } else {
                    HStack(spacing: 10) {
                        TextField("Search cards", text: $searchText)
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
                            .accessibilityLabel("Search cards")
                            .accessibilityHint("Filters the card collection by name or rarity")

                        Menu {
                            Picker("Sort cards", selection: $sortOrder) {
                                ForEach(ClashCardSortOrder.allCases) { order in
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
                        .accessibilityLabel("Sort cards")
                        .accessibilityValue(sortOrder.title)
                    }

                    Text("\(visibleCards.count) of \(cards.count) cards")
                        .font(.caption.weight(.medium))
                        .foregroundStyle(.secondary)

                    if visibleCards.isEmpty {
                        ContentUnavailableView(
                            "No cards match",
                            systemImage: "magnifyingglass",
                            description: Text("Try a different card name or rarity.")
                        )
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 8)
                    } else {
                        LazyVGrid(columns: columns, spacing: 11) {
                            ForEach(visibleCards) { card in
                                Button {
                                    selectedCard = card
                                } label: {
                                    ClashCardTile(card: card, compact: false)
                                }
                                .buttonStyle(.plain)
                                .accessibilityLabel(card.accessibilitySummary)
                                .accessibilityHint("Shows card level and details")
                            }
                        }
                    }
                }
            } else {
                ContentUnavailableView(
                    "Collection unavailable",
                    systemImage: "rectangle.stack.badge.questionmark",
                    description: Text("The profile response didn’t include the full card collection.")
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
        .sheet(item: $selectedCard) { card in
            NavigationStack {
                ClashCardDetailView(card: card)
            }
            .presentationDetents([.large])
            .presentationDragIndicator(.visible)
        }
    }
}
