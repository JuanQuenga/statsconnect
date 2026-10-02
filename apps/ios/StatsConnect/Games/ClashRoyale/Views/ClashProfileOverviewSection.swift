import SwiftUI

struct ClashProfileOverviewSection: View {
    let snapshot: ClashSnapshot<ClashPlayer>
    let playerTag: String

    private let columns = [GridItem(.adaptive(minimum: 138), spacing: 10)]

    var body: some View {
        let player = snapshot.data

        VStack(alignment: .leading, spacing: 15) {
            HStack(spacing: 14) {
                Image(systemName: "crown.fill")
                    .font(.title2.weight(.bold))
                    .foregroundStyle(.white)
                    .frame(width: 58, height: 58)
                    .background(LinearGradient(colors: [.orange, .pink], startPoint: .topLeading, endPoint: .bottomTrailing), in: RoundedRectangle(cornerRadius: 19, style: .continuous))
                    .accessibilityHidden(true)

                VStack(alignment: .leading, spacing: 4) {
                    Text(player.name)
                        .font(.title2.weight(.bold))
                        .foregroundStyle(.primary)
                        .fixedSize(horizontal: false, vertical: true)

                    Text(GameProfileTagFormat.hashPrefixed(player.tag.isEmpty ? playerTag : player.tag))
                        .font(.system(.caption, design: .monospaced))
                        .foregroundStyle(.secondary)
                        .textSelection(.enabled)
                }
                Spacer(minLength: 0)
            }
            .accessibilityElement(children: .combine)

            LazyVGrid(columns: columns, spacing: 10) {
                GameProfileStatCard(title: "Trophies", value: GameProfileFormat.number(player.trophies), symbol: "trophy.fill")
                GameProfileStatCard(title: "Best trophies", value: GameProfileFormat.number(player.bestTrophies), symbol: "trophy")
                GameProfileStatCard(title: "Experience level", value: GameProfileFormat.number(player.expLevel), symbol: "sparkles")
                GameProfileStatCard(title: "Wins", value: GameProfileFormat.number(player.wins), symbol: "checkmark.seal.fill")
                GameProfileStatCard(title: "Losses", value: GameProfileFormat.number(player.losses), symbol: "xmark.seal.fill")
                GameProfileStatCard(title: "Battles", value: GameProfileFormat.number(player.battleCount), symbol: "flag.checkered")
                GameProfileStatCard(title: "Three-crown wins", value: GameProfileFormat.number(player.threeCrownWins), symbol: "crown.fill")
                GameProfileStatCard(title: "Donations", value: GameProfileFormat.number(player.donations), symbol: "gift.fill")
                GameProfileStatCard(title: "Donations received", value: GameProfileFormat.number(player.donationsReceived), symbol: "arrow.down.to.line")
            }

            if let arena = player.arena, let name = arena.name, !name.isEmpty {
                Label(name, systemImage: "building.2.fill")
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(BrandStyle.actionOrange)
                    .padding(.horizontal, 13)
                    .padding(.vertical, 9)
                    .background(BrandStyle.orange.opacity(0.12), in: Capsule())
            }

            if let clan = player.clan, let name = clan.name, !name.isEmpty {
                HStack(spacing: 8) {
                    Image(systemName: "person.3.fill")
                        .foregroundStyle(BrandStyle.orange)
                        .accessibilityHidden(true)
                    VStack(alignment: .leading, spacing: 2) {
                        Text(name)
                            .font(.subheadline.weight(.semibold))
                        if let tag = clan.tag, !tag.isEmpty {
                            Text(GameProfileTagFormat.hashPrefixed(tag))
                                .font(.system(.caption, design: .monospaced))
                                .foregroundStyle(.secondary)
                        }
                    }
                    Spacer(minLength: 0)
                }
                .padding(12)
                .background(.background, in: RoundedRectangle(cornerRadius: 15, style: .continuous))
                .accessibilityElement(children: .combine)
                .accessibilityLabel("Clan, \(name)\(clan.tag.map { ", \(GameProfileTagFormat.hashPrefixed($0))" } ?? "")")
            }

            ClashSnapshotFreshnessView(fetchedAt: snapshot.fetchedAt, isStale: snapshot.stale)
        }
        .padding(18)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(.thinMaterial, in: RoundedRectangle(cornerRadius: 24, style: .continuous))
        .overlay {
            RoundedRectangle(cornerRadius: 24, style: .continuous)
                .strokeBorder(.quaternary, lineWidth: 1)
        }
    }
}
