import SwiftUI

struct BrawlProfileOverviewSection: View {
    let player: BrawlPlayer
    let playerTag: String

    private let columns = [GridItem(.adaptive(minimum: 138), spacing: 10)]

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            HStack(spacing: 14) {
                Image(systemName: "star.fill")
                    .font(.title2.weight(.bold))
                    .foregroundStyle(.white)
                    .frame(width: 58, height: 58)
                    .background(BrandStyle.actionOrange.gradient, in: RoundedRectangle(cornerRadius: 19, style: .continuous))
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

            if let club = player.club, let clubName = club.name, !clubName.isEmpty {
                HStack(spacing: 8) {
                    Image(systemName: "person.3.fill")
                        .foregroundStyle(BrandStyle.orange)
                        .accessibilityHidden(true)
                    VStack(alignment: .leading, spacing: 2) {
                        Text(clubName)
                            .font(.subheadline.weight(.semibold))
                        if let tag = club.tag, !tag.isEmpty {
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
                .accessibilityLabel("Club, \(clubName)\(club.tag.map { ", \(GameProfileTagFormat.hashPrefixed($0))" } ?? "")")
            }

            LazyVGrid(columns: columns, spacing: 10) {
                GameProfileStatCard(title: "Trophies", value: GameProfileFormat.number(player.trophies), symbol: "trophy.fill")
                GameProfileStatCard(title: "Highest trophies", value: GameProfileFormat.number(player.highestTrophies), symbol: "trophy")
                GameProfileStatCard(title: "Experience level", value: GameProfileFormat.number(player.expLevel), symbol: "sparkles")
                GameProfileStatCard(title: "3v3 victories", value: GameProfileFormat.number(player.threeVsThreeVictories), symbol: "person.3.fill")
                GameProfileStatCard(title: "Solo victories", value: GameProfileFormat.number(player.soloVictories), symbol: "person.fill")
                GameProfileStatCard(title: "Duo victories", value: GameProfileFormat.number(player.duoVictories), symbol: "person.2.fill")
            }

            if let rank = player.rankedRankName, !rank.isEmpty {
                Label("Ranked · \(rank)", systemImage: "medal.fill")
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(BrandStyle.actionOrange)
                    .padding(.horizontal, 13)
                    .padding(.vertical, 9)
                    .background(BrandStyle.orange.opacity(0.12), in: Capsule())
            }

            if let rank = player.highestAllTimeRankedRankName, !rank.isEmpty {
                Label("Best ranked · \(rank)", systemImage: "medal")
                    .font(.subheadline.weight(.medium))
                    .foregroundStyle(.secondary)
            }
        }
        .padding(18)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(.thinMaterial, in: RoundedRectangle(cornerRadius: 24, style: .continuous))
        .overlay {
            RoundedRectangle(cornerRadius: 24, style: .continuous)
                .strokeBorder(.quaternary, lineWidth: 1)
        }
        .accessibilityElement(children: .contain)
    }
}
