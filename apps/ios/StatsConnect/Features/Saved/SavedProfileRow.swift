import SwiftUI

struct SavedProfileRow: View {
    let result: ProfileResult

    var body: some View {
        HStack(spacing: 14) {
            ProfileAvatarView(imageURL: result.data.display.avatarUrl, size: 54)

            VStack(alignment: .leading, spacing: 5) {
                Text(result.data.display.name)
                    .font(.headline)
                    .foregroundStyle(.primary)
                    .fixedSize(horizontal: false, vertical: true)

                Text(result.data.game.displayName)
                    .font(.subheadline.weight(.medium))
                    .foregroundStyle(BrandStyle.orange)

                Text(GameProfileTagFormat.hashPrefixed(result.data.playerTag))
                    .font(.system(.caption, design: .monospaced))
                    .foregroundStyle(.secondary)
                    .textSelection(.enabled)
            }

            Spacer(minLength: 4)

            Image(systemName: "chevron.right")
                .font(.footnote.weight(.semibold))
                .foregroundStyle(.tertiary)
                .accessibilityHidden(true)
        }
        .padding(.vertical, 8)
        .contentShape(Rectangle())
        .accessibilityElement(children: .combine)
        .accessibilityLabel("\(result.data.display.name), \(result.data.game.displayName), player tag \(result.data.playerTag)")
        .accessibilityHint("Opens the saved profile details")
    }
}
