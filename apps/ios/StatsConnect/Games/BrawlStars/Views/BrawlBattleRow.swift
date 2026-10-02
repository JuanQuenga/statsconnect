import SwiftUI

struct BrawlBattleRow: View {
    let battle: BrawlBattle

    private var title: String {
        battle.event.mode ?? battle.battle.mode ?? battle.battle.type ?? "Battle"
    }

    var body: some View {
        HStack(spacing: 12) {
            Image(systemName: "flag.checkered")
                .font(.body.weight(.semibold))
                .foregroundStyle(BrandStyle.actionOrange)
                .frame(width: 42, height: 42)
                .background(BrandStyle.orange.opacity(0.12), in: RoundedRectangle(cornerRadius: 14, style: .continuous))
                .accessibilityHidden(true)

            VStack(alignment: .leading, spacing: 4) {
                Text(title)
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(.primary)
                    .lineLimit(1)

                if let map = battle.event.map, !map.isEmpty {
                    Text(map)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .lineLimit(1)
                }

                if let date = GameProfileFormat.battleDate(battle.battleTime) {
                    Text(date)
                        .font(.caption)
                        .foregroundStyle(.tertiary)
                }
            }

            Spacer(minLength: 6)

            VStack(alignment: .trailing, spacing: 5) {
                if let result = battle.battle.result, !result.isEmpty {
                    Text(result)
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(.primary)
                        .lineLimit(1)
                }
                if let change = GameProfileFormat.trophyChange(battle.battle.trophyChange) {
                    Text("\(change) trophies")
                        .font(.caption.weight(.semibold))
                        .foregroundStyle((battle.battle.trophyChange ?? 0) >= 0 ? .green : .red)
                        .lineLimit(1)
                } else if let rank = battle.battle.rank {
                    Text("Rank \(rank)")
                        .font(.caption.weight(.medium))
                        .foregroundStyle(.secondary)
                }
            }
            .multilineTextAlignment(.trailing)

            Image(systemName: "chevron.right")
                .font(.caption.weight(.bold))
                .foregroundStyle(.tertiary)
                .accessibilityHidden(true)
        }
        .padding(12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(.background, in: RoundedRectangle(cornerRadius: 17, style: .continuous))
        .overlay {
            RoundedRectangle(cornerRadius: 17, style: .continuous)
                .strokeBorder(.quaternary, lineWidth: 1)
        }
        .contentShape(RoundedRectangle(cornerRadius: 17, style: .continuous))
        .accessibilityElement(children: .combine)
    }
}
