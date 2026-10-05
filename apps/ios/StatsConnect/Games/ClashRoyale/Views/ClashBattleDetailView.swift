import SwiftUI

struct ClashBattleDetailView: View {
    let battle: ClashBattle
    let fetchedAt: Double
    let isStale: Bool
    let playerTag: String

    @State private var selectedParticipant: ClashBattleParticipant?
    @State private var showingParticipant = false

    private var title: String {
        battle.gameMode?.name ?? battle.type ?? "Battle"
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                VStack(alignment: .leading, spacing: 8) {
                    Text(title)
                        .font(.largeTitle.weight(.bold))
                        .fixedSize(horizontal: false, vertical: true)

                    if let date = GameProfileFormat.battleDate(battle.battleTime) {
                        Label(date, systemImage: "calendar")
                            .font(.subheadline)
                            .foregroundStyle(.secondary)
                    }

                    if let type = battle.type, !type.isEmpty {
                        Label(type, systemImage: "flag.fill")
                            .font(.subheadline)
                            .foregroundStyle(.secondary)
                    }
                }

                ClashSnapshotFreshnessView(fetchedAt: fetchedAt, isStale: isStale)

                if !battle.team.isEmpty || !battle.opponent.isEmpty {
                    if let sides = battle.sides(for: playerTag) {
                        participantSection("Player’s team", participants: sides.player)
                        participantSection("Opponent", participants: sides.other)
                    } else {
                        participantSection("Team 1", participants: battle.team)
                        participantSection("Team 2", participants: battle.opponent)
                    }
                } else {
                    ContentUnavailableView(
                        "Participants unavailable",
                        systemImage: "person.2",
                        description: Text("This match didn’t include player or card details.")
                    )
                }
            }
            .padding(20)
            .frame(maxWidth: 760, alignment: .leading)
            .frame(maxWidth: .infinity)
        }
        .background(Color(uiColor: .systemGroupedBackground))
        .navigationTitle("Battle details")
        .navigationBarTitleDisplayMode(.inline)
        .sheet(isPresented: $showingParticipant, onDismiss: { selectedParticipant = nil }) {
            if let participant = selectedParticipant {
                NavigationStack {
                    ClashBattleParticipantDetailView(participant: participant)
                }
                .presentationDetents([.medium, .large])
                .presentationDragIndicator(.visible)
            }
        }
    }

    @ViewBuilder
    private func participantSection(_ title: String, participants: [ClashBattleParticipant]) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            GameProfileSectionHeader(title: title)
            if participants.isEmpty {
                Text("Participant details unavailable.")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
            } else {
                ForEach(participants.indices, id: \.self) { index in
                    let participant = participants[index]
                    ClashBattleParticipantRow(participant: participant) {
                        present(participant)
                    }
                }
            }
        }
    }

    private func present(_ participant: ClashBattleParticipant) {
        selectedParticipant = participant
        showingParticipant = true
    }
}
