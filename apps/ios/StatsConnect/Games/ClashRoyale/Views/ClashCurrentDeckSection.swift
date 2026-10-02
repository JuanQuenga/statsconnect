import SwiftUI

struct ClashCurrentDeckSection: View {
    let playerSnapshot: ClashSnapshot<ClashPlayer>

    @State private var selectedCard: ClashCard?

    private let columns = [GridItem(.adaptive(minimum: 76, maximum: 118), spacing: 9)]

    private var knownCosts: [Int] {
        playerSnapshot.data.currentDeck.compactMap(\.elixirCost).filter { $0 > 0 }
    }

    var body: some View {
        let deck = playerSnapshot.data.currentDeck

        VStack(alignment: .leading, spacing: 13) {
            GameProfileSectionHeader(
                title: "Current deck",
                subtitle: deck.isEmpty ? "No current deck was included." : "Tap a card to see its details."
            )

            ClashSnapshotFreshnessView(fetchedAt: playerSnapshot.fetchedAt, isStale: playerSnapshot.stale)

            if !knownCosts.isEmpty {
                let average = Double(knownCosts.reduce(0, +)) / Double(knownCosts.count)
                Label("Average elixir \(average.formatted(.number.precision(.fractionLength(1))))", systemImage: "drop.fill")
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(.purple)
                if knownCosts.count != deck.count {
                    Text("Based on \(knownCosts.count) of \(deck.count) cards with known cost.")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }

            if deck.isEmpty {
                ContentUnavailableView(
                    "Deck unavailable",
                    systemImage: "rectangle.stack",
                    description: Text("The current deck wasn’t returned with this profile.")
                )
                .frame(maxWidth: .infinity)
            } else {
                LazyVGrid(columns: columns, spacing: 9) {
                    ForEach(deck) { card in
                        Button {
                            selectedCard = card
                        } label: {
                            ClashCardTile(card: card, compact: true)
                        }
                        .buttonStyle(.plain)
                        .accessibilityLabel(card.accessibilitySummary)
                        .accessibilityHint("Shows card level and details")
                    }
                }
            }

            if let support = playerSnapshot.data.currentDeckSupportCards, !support.isEmpty {
                GameProfileSectionHeader(title: "Tower troops")
                LazyVGrid(columns: columns, spacing: 9) {
                    ForEach(support) { card in
                        Button { selectedCard = card } label: {
                            ClashCardTile(card: card, compact: true)
                        }
                        .buttonStyle(.plain)
                        .accessibilityLabel(card.accessibilitySummary)
                    }
                }
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
