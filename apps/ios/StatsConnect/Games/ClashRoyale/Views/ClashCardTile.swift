import SwiftUI

struct ClashCardTile: View {
    let card: ClashCard
    let compact: Bool

    var body: some View {
        VStack(spacing: compact ? 5 : 8) {
            AsyncImage(url: card.imageURL) { phase in
                if let image = phase.image {
                    image
                        .resizable()
                        .scaledToFit()
                } else {
                    ZStack {
                        RoundedRectangle(cornerRadius: 13, style: .continuous)
                            .fill(BrandStyle.orange.opacity(0.1))
                        if phase.error == nil, card.imageURL != nil {
                            ProgressView()
                                .tint(BrandStyle.orange)
                        } else {
                            Image(systemName: "rectangle.portrait.fill")
                                .font(.title2)
                                .foregroundStyle(BrandStyle.orange.opacity(0.6))
                        }
                    }
                }
            }
            .frame(height: compact ? 82 : 128)
            .frame(maxWidth: .infinity)
            .accessibilityHidden(true)

            Text(card.name)
                .font(compact ? .caption.weight(.semibold) : .subheadline.weight(.semibold))
                .foregroundStyle(.primary)
                .lineLimit(2)
                .multilineTextAlignment(.center)
                .frame(maxWidth: .infinity, minHeight: compact ? 30 : 36, alignment: .center)

            HStack(spacing: 5) {
                if let level = card.displayLevel {
                    Text("Lv. \(level)")
                }
                if let cost = card.elixirCost {
                    if card.displayLevel != nil { Text("·") }
                    Label("\(cost)", systemImage: "drop.fill")
                }
            }
            .font(.caption.weight(.medium))
            .foregroundStyle(.secondary)
            .lineLimit(1)
            .minimumScaleFactor(0.8)
        }
        .padding(compact ? 7 : 10)
        .frame(maxWidth: .infinity)
        .background(.background, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
        .overlay {
            RoundedRectangle(cornerRadius: 18, style: .continuous)
                .strokeBorder(.quaternary, lineWidth: 1)
        }
        .contentShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
    }
}
