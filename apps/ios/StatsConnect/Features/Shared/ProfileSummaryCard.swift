import SwiftUI

struct ProfileSummaryCard: View {
    let result: ProfileResult

    var body: some View {
        VStack(alignment: .leading, spacing: 18) {
            HStack(alignment: .center, spacing: 14) {
                ProfileAvatarView(imageURL: result.data.display.avatarUrl)

                VStack(alignment: .leading, spacing: 5) {
                    Text(result.data.display.name)
                        .font(.title3.weight(.bold))
                        .foregroundStyle(.primary)
                        .fixedSize(horizontal: false, vertical: true)

                    Text(result.data.game.displayName)
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(BrandStyle.orange)

                    Text(GameProfileTagFormat.hashPrefixed(result.data.playerTag))
                        .font(.system(.caption, design: .monospaced))
                        .foregroundStyle(.secondary)
                        .textSelection(.enabled)
                }

                Spacer(minLength: 0)
            }

            if let headline = result.data.display.headline {
                HStack(spacing: 13) {
                    Image(systemName: "trophy.fill")
                        .font(.title2)
                        .foregroundStyle(BrandStyle.orange)
                        .frame(width: 42, height: 42)
                        .background(BrandStyle.orange.opacity(0.12), in: RoundedRectangle(cornerRadius: 13))
                        .accessibilityHidden(true)

                    VStack(alignment: .leading, spacing: 3) {
                        Text(headline.label)
                            .font(.subheadline)
                            .foregroundStyle(.secondary)

                        Text(headline.value, format: .number.precision(.fractionLength(0)))
                            .font(.title2.weight(.bold))
                            .monospacedDigit()
                            .foregroundStyle(.primary)
                    }

                    Spacer(minLength: 0)
                }
                .accessibilityElement(children: .combine)
            } else {
                Label("Trophy total unavailable", systemImage: "trophy")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
            }

            if let affiliation = result.data.display.affiliation {
                VStack(alignment: .leading, spacing: 3) {
                    Text(affiliation.name)
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(.primary)

                    if let tag = affiliation.tag, !tag.isEmpty {
                        Text(GameProfileTagFormat.hashPrefixed(tag))
                            .font(.system(.caption, design: .monospaced))
                            .foregroundStyle(.secondary)
                            .textSelection(.enabled)
                    }
                }
                .padding(.leading, 2)
                .accessibilityElement(children: .combine)
                .accessibilityLabel(Text(
                    affiliation.tag.map { "Affiliation, \(affiliation.name), \(GameProfileTagFormat.hashPrefixed($0))" }
                        ?? "Affiliation, \(affiliation.name)"
                ))
            }

            Divider()

            CacheFreshnessView(metadata: result.cache)
        }
        .padding(20)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(.background, in: RoundedRectangle(cornerRadius: 24, style: .continuous))
        .overlay {
            RoundedRectangle(cornerRadius: 24, style: .continuous)
                .strokeBorder(.quaternary, lineWidth: 1)
        }
    }
}
