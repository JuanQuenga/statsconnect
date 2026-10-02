import SwiftUI

struct BrawlBrawlerDetailView: View {
    let brawler: BrawlBrawler

    @Environment(\.dismiss) private var dismiss

    private let columns = [GridItem(.adaptive(minimum: 132), spacing: 10)]

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                VStack(spacing: 10) {
                    AsyncImage(url: brawler.portraitURL) { phase in
                        if let image = phase.image {
                            image.resizable().scaledToFit()
                        } else {
                            Image(systemName: "person.crop.square.fill")
                                .resizable()
                                .scaledToFit()
                                .foregroundStyle(BrandStyle.orange.opacity(0.7))
                                .padding(30)
                        }
                    }
                    .frame(height: 170)
                    .accessibilityHidden(true)

                    Text(brawler.name)
                        .font(.largeTitle.weight(.bold))
                        .multilineTextAlignment(.center)
                }
                .frame(maxWidth: .infinity)

                LazyVGrid(columns: columns, spacing: 10) {
                    GameProfileStatCard(title: "Power", value: GameProfileFormat.number(brawler.power), symbol: "bolt.fill")
                    GameProfileStatCard(title: "Rank", value: GameProfileFormat.number(brawler.rank), symbol: "medal.fill")
                    GameProfileStatCard(title: "Trophies", value: GameProfileFormat.number(brawler.trophies), symbol: "trophy.fill")
                    GameProfileStatCard(title: "Personal best", value: GameProfileFormat.number(brawler.highestTrophies), symbol: "trophy")
                }

                abilitySection("Gadgets", symbol: "wrench.and.screwdriver.fill", abilities: brawler.gadgets)
                abilitySection("Star powers", symbol: "sparkles", abilities: brawler.starPowers)
                abilitySection("Gears", symbol: "gearshape.fill", abilities: brawler.gears)
                abilitySection("Hypercharges", symbol: "bolt.circle.fill", abilities: brawler.hyperCharges)
            }
            .padding(20)
            .frame(maxWidth: 700, alignment: .leading)
            .frame(maxWidth: .infinity)
        }
        .background(Color(uiColor: .systemGroupedBackground))
        .navigationTitle("Brawler details")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button("Done") { dismiss() }
            }
        }
    }

    @ViewBuilder
    private func abilitySection(_ title: String, symbol: String, abilities: [BrawlAbility]) -> some View {
        if !abilities.isEmpty {
            VStack(alignment: .leading, spacing: 10) {
                GameProfileSectionHeader(title: title)

                ForEach(abilities) { ability in
                    HStack(spacing: 11) {
                        Image(systemName: symbol)
                            .font(.body.weight(.semibold))
                            .foregroundStyle(BrandStyle.orange)
                            .frame(width: 38, height: 38)
                            .background(BrandStyle.orange.opacity(0.12), in: RoundedRectangle(cornerRadius: 12, style: .continuous))
                            .accessibilityHidden(true)

                        VStack(alignment: .leading, spacing: 3) {
                            Text(ability.name)
                                .font(.subheadline.weight(.semibold))
                            if let level = ability.level {
                                Text("Level \(level)")
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                            }
                        }
                        Spacer(minLength: 0)
                    }
                    .padding(12)
                    .background(.background, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
                    .overlay {
                        RoundedRectangle(cornerRadius: 16, style: .continuous)
                            .strokeBorder(.quaternary, lineWidth: 1)
                    }
                    .accessibilityElement(children: .combine)
                }
            }
        }
    }
}
