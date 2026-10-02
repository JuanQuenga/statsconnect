import SwiftUI

struct ClashBattleHistorySection: View {
    let snapshot: ClashSnapshot<[ClashBattle]>
    let playerTag: String

    var body: some View {
        VStack(alignment: .leading, spacing: 13) {
            GameProfileSectionHeader(
                title: "Battles",
                subtitle: snapshot.data.isEmpty ? "No battle history was included." : "Open a match to see both teams and their cards."
            )

            ClashSnapshotFreshnessView(fetchedAt: snapshot.fetchedAt, isStale: snapshot.stale)

            if snapshot.data.isEmpty {
                ContentUnavailableView(
                    "Battle history unavailable",
                    systemImage: "flag.checkered",
                    description: Text("Recent battles weren’t returned for this profile.")
                )
                .frame(maxWidth: .infinity)
            } else {
                VStack(spacing: 9) {
                    ForEach(snapshot.data.indices, id: \.self) { index in
                        NavigationLink(
                            value: ClashBattleRoute(
                                index: index,
                                battle: snapshot.data[index],
                                fetchedAt: snapshot.fetchedAt,
                                isStale: snapshot.stale,
                                playerTag: playerTag
                            )
                        ) {
                            ClashBattleRow(battle: snapshot.data[index], playerTag: playerTag)
                        }
                        .buttonStyle(.plain)
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
    }
}
