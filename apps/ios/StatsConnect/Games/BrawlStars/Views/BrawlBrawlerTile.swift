import SwiftUI

struct BrawlBrawlerTile: View {
    let brawler: BrawlBrawler

    var body: some View {
        VStack(spacing: 8) {
            AsyncImage(url: brawler.portraitURL) { phase in
                if let image = phase.image {
                    image
                        .resizable()
                        .scaledToFit()
                } else if phase.error != nil || brawler.portraitURL == nil {
                    Image(systemName: "person.crop.square.fill")
                        .resizable()
                        .scaledToFit()
                        .foregroundStyle(BrandStyle.orange.opacity(0.65))
                        .padding(16)
                } else {
                    ZStack {
                        RoundedRectangle(cornerRadius: 16, style: .continuous)
                            .fill(BrandStyle.orange.opacity(0.09))
                        ProgressView()
                            .tint(BrandStyle.orange)
                    }
                }
            }
            .frame(height: 94)
            .frame(maxWidth: .infinity)
            .accessibilityHidden(true)

            Text(brawler.name)
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(.primary)
                .lineLimit(2)
                .multilineTextAlignment(.center)
                .frame(maxWidth: .infinity, minHeight: 34, alignment: .center)

            HStack(spacing: 5) {
                Label("\(brawler.power)", systemImage: "bolt.fill")
                Text("·")
                Text("R\(brawler.rank)")
            }
            .font(.caption.weight(.medium))
            .foregroundStyle(.secondary)
            .lineLimit(1)

            Label(brawler.trophies.formatted(.number), systemImage: "trophy.fill")
                .font(.caption.weight(.semibold))
                .foregroundStyle(BrandStyle.actionOrange)
                .lineLimit(1)
        }
        .padding(10)
        .frame(maxWidth: .infinity)
        .background(.background, in: RoundedRectangle(cornerRadius: 19, style: .continuous))
        .overlay {
            RoundedRectangle(cornerRadius: 19, style: .continuous)
                .strokeBorder(.quaternary, lineWidth: 1)
        }
        .contentShape(RoundedRectangle(cornerRadius: 19, style: .continuous))
    }
}
