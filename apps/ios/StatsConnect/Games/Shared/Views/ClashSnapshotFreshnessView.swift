import SwiftUI

struct ClashSnapshotFreshnessView: View {
    let fetchedAt: Double
    let isStale: Bool
    private var fetchedDate: Date? { GameProfileFormat.cacheDate(milliseconds: fetchedAt) }

    private var accessibilitySummary: String {
        guard isStale else {
            return "Fresh snapshot"
        }
        guard let date = fetchedDate else {
            return "Cached snapshot"
        }
        return "Cached snapshot, last updated \(date.formatted(date: .abbreviated, time: .shortened))"
    }

    var body: some View {
        HStack(spacing: 6) {
            Image(systemName: isStale ? "clock.arrow.circlepath" : "checkmark.circle.fill")
                .foregroundStyle(isStale ? BrandStyle.orange : .green)
                .accessibilityHidden(true)

            Text(isStale ? "Cached snapshot" : "Fresh snapshot")
                .fontWeight(.semibold)

            if let date = fetchedDate {
                Text("· Updated")
                Text(date, style: .relative)
            }
        }
        .font(.caption)
        .foregroundStyle(.secondary)
        .frame(maxWidth: .infinity, alignment: .leading)
        .accessibilityElement(children: .combine)
        .accessibilityLabel(accessibilitySummary)
    }
}
