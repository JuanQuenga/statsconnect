import SwiftUI

struct BrawlParticipantRow: View {
    let participant: BrawlParticipant
    let action: () -> Void

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
                    Text(participant.name)
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(.primary)
                    Text("\(participant.brawler?.name ?? "Brawler unavailable") · Power \(participant.brawler?.power.map { $0.formatted() } ?? "Unavailable")")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                    Text(GameProfileTagFormat.hashPrefixed(participant.tag))
                        .font(.system(.caption, design: .monospaced))
                        .foregroundStyle(.tertiary)
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
        .accessibilityLabel(
            "\(participant.name), playing \(participant.brawler?.name ?? "unknown brawler"), power \(participant.brawler?.power.map { $0.formatted() } ?? "unavailable")"
        )
        .accessibilityHint("Shows the player and brawler details")
    }
}
