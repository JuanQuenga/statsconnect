import SwiftUI

struct BrawlBattleDetailView: View {
    let battle: BrawlBattle

    @State private var selectedParticipant: BrawlParticipant?
    @State private var showingParticipant = false

    private var title: String {
        battle.event.mode ?? battle.battle.mode ?? battle.battle.type ?? "Battle"
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                VStack(alignment: .leading, spacing: 8) {
                    Text(title)
                        .font(.largeTitle.weight(.bold))
                        .fixedSize(horizontal: false, vertical: true)

                    if let map = battle.event.map, !map.isEmpty {
                        Label(map, systemImage: "map.fill")
                            .font(.subheadline)
                            .foregroundStyle(.secondary)
                    }

                    if let date = GameProfileFormat.battleDate(battle.battleTime) {
                        Label(date, systemImage: "calendar")
                            .font(.subheadline)
                            .foregroundStyle(.secondary)
                    }
                }

                HStack(spacing: 9) {
                    if let result = battle.battle.result, !result.isEmpty {
                        Label(result, systemImage: "flag.checkered")
                            .font(.subheadline.weight(.semibold))
                            .padding(.horizontal, 12)
                            .padding(.vertical, 9)
                            .background(BrandStyle.orange.opacity(0.13), in: Capsule())
                    }

                    if let change = GameProfileFormat.trophyChange(battle.battle.trophyChange) {
                        Label("\(change) trophies", systemImage: "trophy.fill")
                            .font(.subheadline.weight(.semibold))
                            .padding(.horizontal, 12)
                            .padding(.vertical, 9)
                            .background(.thinMaterial, in: Capsule())
                    }

                    if let rank = battle.battle.rank {
                        Label("Rank \(rank)", systemImage: "medal.fill")
                            .font(.subheadline.weight(.semibold))
                            .padding(.horizontal, 12)
                            .padding(.vertical, 9)
                            .background(.thinMaterial, in: Capsule())
                    }
                }

                if let teams = battle.battle.teams, !teams.isEmpty {
                    ForEach(teams.indices, id: \.self) { teamIndex in
                        VStack(alignment: .leading, spacing: 10) {
                            GameProfileSectionHeader(title: "Team \(teamIndex + 1)")
                            if teams[teamIndex].isEmpty {
                                Text("Participant details unavailable.")
                                    .font(.subheadline)
                                    .foregroundStyle(.secondary)
                            } else {
                                ForEach(teams[teamIndex].indices, id: \.self) { participantIndex in
                                    let participant = teams[teamIndex][participantIndex]
                                    BrawlParticipantRow(participant: participant) {
                                        present(participant)
                                    }
                                }
                            }
                        }
                    }
                } else if let players = battle.battle.players, !players.isEmpty {
                    VStack(alignment: .leading, spacing: 10) {
                        GameProfileSectionHeader(title: "Players")
                        ForEach(players.indices, id: \.self) { index in
                            let participant = players[index]
                            BrawlParticipantRow(participant: participant) {
                                present(participant)
                            }
                        }
                    }
                } else {
                    ContentUnavailableView(
                        "Players unavailable",
                        systemImage: "person.2",
                        description: Text("This match didn’t include participant details.")
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
                    BrawlParticipantDetailView(participant: participant)
                }
                .presentationDetents([.medium, .large])
                .presentationDragIndicator(.visible)
            }
        }
    }

    private func present(_ participant: BrawlParticipant) {
        selectedParticipant = participant
        showingParticipant = true
    }
}
