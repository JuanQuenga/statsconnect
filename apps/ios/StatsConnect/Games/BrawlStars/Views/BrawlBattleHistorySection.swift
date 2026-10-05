import SwiftUI

struct BrawlBattleHistorySection: View {
    let battles: [BrawlBattle]

    var body: some View {
        VStack(alignment: .leading, spacing: 13) {
            GameProfileSectionHeader(
                title: "Battles",
                subtitle: battles.isEmpty ? "No battle history was included." : "Open a match to see its result and players."
            )

            if battles.isEmpty {
                ContentUnavailableView(
                    "Battle history unavailable",
                    systemImage: "flag.checkered",
                    description: Text("Recent battles weren’t returned for this profile.")
                )
                .frame(maxWidth: .infinity)
            } else {
                VStack(spacing: 9) {
                    ForEach(battles.indices, id: \.self) { index in
                        NavigationLink(value: BrawlBattleRoute(index: index, battle: battles[index])) {
                            BrawlBattleRow(battle: battles[index])
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
