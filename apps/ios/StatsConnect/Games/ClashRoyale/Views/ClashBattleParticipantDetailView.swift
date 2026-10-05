import SwiftUI

struct ClashBattleParticipantDetailView: View {
    let participant: ClashBattleParticipant

    @Environment(\.dismiss) private var dismiss
    @State private var selectedCard: ClashCard?

    private let columns = [GridItem(.adaptive(minimum: 82, maximum: 128), spacing: 9)]

    private var title: String {
        participant.name ?? "Player"
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 17) {
                VStack(spacing: 8) {
                    Image(systemName: "person.crop.circle.fill")
                        .font(.system(size: 62))
                        .foregroundStyle(BrandStyle.orange)
                        .accessibilityHidden(true)
                    Text(title)
                        .font(.largeTitle.weight(.bold))
                        .multilineTextAlignment(.center)
                    if let tag = participant.tag, !tag.isEmpty {
                        Text(GameProfileTagFormat.hashPrefixed(tag))
                            .font(.system(.subheadline, design: .monospaced))
                            .foregroundStyle(.secondary)
                            .textSelection(.enabled)
                    }
                }
                .frame(maxWidth: .infinity)

                LazyVGrid(columns: [GridItem(.adaptive(minimum: 132), spacing: 10)], spacing: 10) {
                    GameProfileStatCard(title: "Crowns", value: GameProfileFormat.number(participant.crowns), symbol: "crown.fill")
                    GameProfileStatCard(title: "Trophy change", value: GameProfileFormat.trophyChange(participant.trophyChange), symbol: "trophy.fill")
                    GameProfileStatCard(title: "Starting trophies", value: GameProfileFormat.number(participant.startingTrophies), symbol: "flag.fill")
                }

                GameProfileSectionHeader(
                    title: "Battle cards",
                    subtitle: participant.cards.isEmpty ? "Cards weren’t included for this player." : "Tap a card to inspect it."
                )

                if participant.cards.isEmpty {
                    ContentUnavailableView(
                        "Cards unavailable",
                        systemImage: "rectangle.portrait",
                        description: Text("This battle response didn’t include the participant’s cards.")
                    )
                    .frame(maxWidth: .infinity)
                } else {
                    LazyVGrid(columns: columns, spacing: 9) {
                        ForEach(participant.cards) { card in
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
            }
            .padding(20)
            .frame(maxWidth: 760, alignment: .leading)
            .frame(maxWidth: .infinity)
        }
        .background(Color(uiColor: .systemGroupedBackground))
        .navigationTitle("Player details")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button("Done") { dismiss() }
            }
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
