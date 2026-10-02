import SwiftUI

struct BrawlParticipantDetailView: View {
    let participant: BrawlParticipant

    @Environment(\.dismiss) private var dismiss

    private let columns = [GridItem(.adaptive(minimum: 138), spacing: 10)]

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                VStack(spacing: 8) {
                    Image(systemName: "person.crop.circle.fill")
                        .font(.system(size: 64))
                        .foregroundStyle(BrandStyle.orange)
                        .accessibilityHidden(true)
                    Text(participant.name)
                        .font(.largeTitle.weight(.bold))
                        .multilineTextAlignment(.center)
                    Text(GameProfileTagFormat.hashPrefixed(participant.tag))
                        .font(.system(.subheadline, design: .monospaced))
                        .foregroundStyle(.secondary)
                        .textSelection(.enabled)
                }
                .frame(maxWidth: .infinity)

                GameProfileSectionHeader(title: "Battle brawler")
                HStack(spacing: 12) {
                    Image(systemName: "star.fill")
                        .font(.title2)
                        .foregroundStyle(BrandStyle.orange)
                        .frame(width: 52, height: 52)
                        .background(BrandStyle.orange.opacity(0.12), in: RoundedRectangle(cornerRadius: 17, style: .continuous))
                        .accessibilityHidden(true)
                    VStack(alignment: .leading, spacing: 4) {
                        Text(participant.brawler?.name ?? "Brawler unavailable")
                            .font(.headline)
                        if let power = participant.brawler?.power {
                            Text("Power \(power)")
                                .font(.subheadline)
                                .foregroundStyle(.secondary)
                        }
                    }
                    Spacer()
                }
                .padding(14)
                .background(.background, in: RoundedRectangle(cornerRadius: 18, style: .continuous))

                LazyVGrid(columns: columns, spacing: 10) {
                    GameProfileStatCard(title: "Power", value: GameProfileFormat.number(participant.brawler?.power), symbol: "bolt.fill")
                    GameProfileStatCard(title: "Brawler trophies", value: GameProfileFormat.number(participant.brawler?.trophies), symbol: "trophy.fill")
                }
            }
            .padding(20)
            .frame(maxWidth: 620, alignment: .leading)
            .frame(maxWidth: .infinity)
        }
        .background(Color(uiColor: .systemGroupedBackground))
        .navigationTitle("Player details")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button("Done") { dismiss() }
            }
        }
    }
}
