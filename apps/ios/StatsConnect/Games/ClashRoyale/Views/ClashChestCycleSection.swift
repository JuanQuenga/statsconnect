import SwiftUI

struct ClashChestCycleSection: View {
    let snapshot: ClashSnapshot<ClashChests>

    private let columns = [GridItem(.adaptive(minimum: 140), spacing: 11)]

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            GameProfileSectionHeader(
                title: "Chest cycle",
                subtitle: snapshot.data.items.isEmpty ? "No chest cycle was included." : "Upcoming chests returned for this player."
            )

            ClashSnapshotFreshnessView(fetchedAt: snapshot.fetchedAt, isStale: snapshot.stale)

            if snapshot.data.items.isEmpty {
                ContentUnavailableView(
                    "Chest cycle unavailable",
                    systemImage: "shippingbox",
                    description: Text("Chest cycle data wasn’t returned for this profile.")
                )
                .frame(maxWidth: .infinity)
            } else {
                LazyVGrid(columns: columns, spacing: 11) {
                    ForEach(snapshot.data.items.indices, id: \.self) { index in
                        let chest = snapshot.data.items[index]
                        let chestName = chest.name.flatMap { $0.isEmpty ? nil : $0 } ?? "Name unavailable"
                        VStack(alignment: .leading, spacing: 10) {
                            Image(systemName: "shippingbox.fill")
                                .font(.title2)
                                .foregroundStyle(BrandStyle.actionOrange)
                                .frame(width: 46, height: 46)
                                .background(BrandStyle.orange.opacity(0.12), in: RoundedRectangle(cornerRadius: 15, style: .continuous))
                                .accessibilityHidden(true)

                            Text(chestName)
                                .font(.subheadline.weight(.semibold))
                                .foregroundStyle(.primary)
                                .fixedSize(horizontal: false, vertical: true)

                            if let position = chest.index {
                                Text("Cycle position \(position)")
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                            }
                        }
                        .frame(maxWidth: .infinity, minHeight: 112, alignment: .leading)
                        .padding(13)
                        .background(.background, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
                        .overlay {
                            RoundedRectangle(cornerRadius: 18, style: .continuous)
                                .strokeBorder(.quaternary, lineWidth: 1)
                        }
                        .accessibilityElement(children: .combine)
                    }
                }
            }
        }
        .padding(18)
        .background(.thinMaterial, in: RoundedRectangle(cornerRadius: 24, style: .continuous))
        .overlay {
            RoundedRectangle(cornerRadius: 24, style: .continuous)
                .strokeBorder(.quaternary, lineWidth: 1)
        }
    }
}
