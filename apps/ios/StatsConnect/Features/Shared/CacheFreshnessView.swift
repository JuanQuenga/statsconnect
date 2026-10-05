import SwiftUI

struct CacheFreshnessView: View {
    let metadata: CacheMetadata

    var body: some View {
        HStack(alignment: .top, spacing: 10) {
            Image(systemName: metadata.isStale ? "clock.arrow.circlepath" : "checkmark.circle.fill")
                .font(.body.weight(.semibold))
                .foregroundStyle(metadata.isStale ? BrandStyle.orange : .green)
                .accessibilityHidden(true)

            VStack(alignment: .leading, spacing: 3) {
                Text(metadata.isStale ? "Stale cached data" : "Up to date")
                    .font(.footnote.weight(.semibold))
                    .foregroundStyle(.primary)

                HStack(spacing: 4) {
                    Text("Updated")
                    Text(metadata.fetchedDate, style: .relative)
                }
                .font(.caption)
                .foregroundStyle(.secondary)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .accessibilityElement(children: .combine)
        .accessibilityLabel(Text(
            "\(metadata.isStale ? "Stale cached data" : "Profile data is up to date") \(metadata.fetchedDate.formatted(date: .abbreviated, time: .shortened))"
        ))
    }
}
