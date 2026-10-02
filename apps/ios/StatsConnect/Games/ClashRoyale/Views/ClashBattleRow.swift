import SwiftUI

struct ClashBattleRow: View {
    let battle: ClashBattle
    let playerTag: String

    private var title: String {
        battle.gameMode?.name ?? battle.type ?? "Battle"
    }

    private var crownScore: String? {
        guard let score = battle.crownScore(for: playerTag) else { return nil }
        return "\(score.player) – \(score.other) crowns"
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

                if let date = GameProfileFormat.battleDate(battle.battleTime) {
                    Text(date)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }

                if let crownScore {
                    Text(crownScore)
                        .font(.caption.weight(.medium))
                        .foregroundStyle(.secondary)
                }
            }

            Spacer(minLength: 6)

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
