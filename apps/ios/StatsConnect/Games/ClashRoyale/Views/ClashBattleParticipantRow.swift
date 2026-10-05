import SwiftUI

struct ClashBattleParticipantRow: View {
    let participant: ClashBattleParticipant
    let action: () -> Void

    private var title: String {
        participant.name ?? "Player"
    }

    var body: some View {
        Button(action: action) {
            HStack(spacing: 11) {
                Image(systemName: "person.fill")
                    .font(.body.weight(.semibold))
                    .foregroundStyle(BrandStyle.orange)
                    .frame(width: 40, height: 40)
                    .background(BrandStyle.orange.opacity(0.12), in: Circle())
                    .accessibilityHidden(true)

                VStack(alignment: .leading, spacing: 4) {
                    Text(title)
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(.primary)

                    if let tag = participant.tag, !tag.isEmpty {
                        Text(GameProfileTagFormat.hashPrefixed(tag))
                            .font(.system(.caption, design: .monospaced))
                            .foregroundStyle(.tertiary)
                    }

                    HStack(spacing: 8) {
                        if let crowns = participant.crowns {
                            Label("\(crowns)", systemImage: "crown.fill")
                        }
                        if let change = GameProfileFormat.trophyChange(participant.trophyChange) {
                            Label(change, systemImage: "trophy.fill")
                        }
                        if !participant.cards.isEmpty {
                            Text("\(participant.cards.count) cards")
                        }
                    }
                    .font(.caption.weight(.medium))
                    .foregroundStyle(.secondary)
                }

                Spacer(minLength: 4)

                Image(systemName: "chevron.right")
                    .font(.caption.weight(.bold))
                    .foregroundStyle(.tertiary)
                    .accessibilityHidden(true)
            }
            .padding(11)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(.background, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
            .overlay {
                RoundedRectangle(cornerRadius: 16, style: .continuous)
                    .strokeBorder(.quaternary, lineWidth: 1)
            }
            .contentShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
        }
        .buttonStyle(.plain)
        .accessibilityLabel(accessibilitySummary)
        .accessibilityHint("Shows this participant’s match stats and cards")
    }

    private var accessibilitySummary: String {
        var parts = [title]
        if let tag = participant.tag, !tag.isEmpty {
            parts.append(GameProfileTagFormat.hashPrefixed(tag))
        }
        if let crowns = participant.crowns {
            parts.append("\(crowns) crowns")
        }
        if let change = GameProfileFormat.trophyChange(participant.trophyChange) {
            parts.append("\(change) trophies")
        }
        parts.append("\(participant.cards.count) cards")
        return parts.joined(separator: ", ")
    }
}
